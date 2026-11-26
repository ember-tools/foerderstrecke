import {computed, ref, shallowRef, watch} from 'vue'
import {fetchProfile, type ElevationFailure} from '../api/elevation'
import {calculateLine, suggestStations} from '../hydraulics/line'
import {heightAt, profileThrough, type ProfileSample} from '../hydraulics/profile'
import {pumpType} from '../hydraulics/pumps'
import {type LatLng, vertexDistances} from './geo'
import {correctedProfile} from './heights'
import {emptyPlan, lineInput, orderedPumps, type Plan, pumpId, readPlan} from './model'

const STORAGE_KEY = 'foerderstrecke.plan'
const SAVE_DELAY = 400
const PROFILE_DELAY = 300

/** Where the heights along the route stand. */
export type ElevationState =
    | {state: 'none'}
    | {state: 'loading', previous: ProfileSample[] | null}
    | {state: 'ready', samples: ProfileSample[]}
    | {state: 'failed', reason: ElevationFailure}

/**
 * The plan being edited, kept in this browser, with its heights and its calculation derived from
 * it. One store per page: the planner is the only view that edits a plan.
 */
export function createPlanStore(initial?: Plan) {
    const plan = ref<Plan>(initial ?? load())
    const elevation = shallowRef<ElevationState>({state: 'none'})
    const distances = computed(() => vertexDistances(plan.value.route))
    const length = computed(() => distances.value.at(-1) ?? 0)
    const modelHeights = computed(() => {
        if (elevation.value.state !== 'ready') return distances.value.map(() => null)
        const model = profileThrough(elevation.value.samples)
        return distances.value.map(at => heightAt(model, at))
    })
    const samples = computed(() => {
        const current = elevation.value
        if (current.state === 'ready') return current.samples
        return current.state === 'loading' && current.previous ? current.previous : []
    })
    const heightsPending = computed(() => elevation.value.state === 'loading')
    const profile = computed(() => correctedProfile(samples.value, distances.value, plan.value.corrections))
    const input = computed(() => lineInput(plan.value, profile.value))
    const result = computed(() => plan.value.route.length >= 2 ? calculateLine(input.value) : null)
    const pumps = computed(() => orderedPumps(plan.value))

    let saveTimer: ReturnType<typeof setTimeout> | undefined
    watch(plan, value => {
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => save(value), SAVE_DELAY)
    }, {deep: true})

    /** Save a pending edit at once, as when the page is left. */
    function flush() {
        clearTimeout(saveTimer)
        save(plan.value)
    }

    let profileTimer: ReturnType<typeof setTimeout> | undefined
    let request: AbortController | undefined
    watch(() => JSON.stringify(plan.value.route), () => {
        clearTimeout(profileTimer)
        request?.abort()
        if (plan.value.route.length < 2) {
            elevation.value = {state: 'none'}
            return
        }
        elevation.value = {state: 'loading', previous: samples.value.length ? samples.value : null}
        profileTimer = setTimeout(async () => {
            const controller = new AbortController()
            request = controller
            try {
                const answer = await fetchProfile(plan.value.route, controller.signal)
                elevation.value = answer.ok ? {state: 'ready', samples: answer.profile.samples} : {state: 'failed', reason: answer.reason}
            } catch {
                if (!controller.signal.aborted) elevation.value = {state: 'failed', reason: 'offline'}
            }
        }, PROFILE_DELAY)
    }, {immediate: true})

    /** Add a vertex at the end of the route. */
    function appendVertex(position: LatLng) {
        plan.value.route.push(position)
        plan.value.corrections.push(null)
    }

    /** Insert a vertex after the given one, keeping pumps within the route. */
    function insertVertex(after: number, position: LatLng) {
        plan.value.route.splice(after + 1, 0, position)
        plan.value.corrections.splice(after + 1, 0, null)
        clampPumps()
    }

    /** Move a vertex; pumps keep their distance from the source, within the route. */
    function moveVertex(index: number, position: LatLng) {
        plan.value.route[index] = position
        clampPumps()
    }

    /** Remove a vertex and the correction entered for it. */
    function removeVertex(index: number) {
        plan.value.route.splice(index, 1)
        plan.value.corrections.splice(index, 1)
        clampPumps()
    }

    /** Remove the whole route and every pump on it. */
    function clearRoute() {
        plan.value.route = []
        plan.value.corrections = []
        plan.value.pumps = []
    }

    /** Turn the route around, so source and end swap; pumps keep their place on the ground. */
    function reverseRoute() {
        const total = length.value
        plan.value.route.reverse()
        plan.value.corrections.reverse()
        plan.value.pumps = plan.value.pumps.map(pump => ({...pump, at: Math.max(0, total - pump.at)}))
    }

    /** Keep pumps within the route after it got shorter. */
    function clampPumps() {
        const total = vertexDistances(plan.value.route).at(-1) ?? 0
        plan.value.pumps = plan.value.pumps.map(pump => ({...pump, at: Math.min(pump.at, total)}))
    }

    /** Replace the pumps by a suggestion along the line; return it to report problems. */
    function suggestPumps() {
        const suggestion = suggestStations(input.value, pumpType(plan.value.pumpType))
        plan.value.pumps = suggestion.stations.map(at => ({
            id: pumpId(), at: Math.round(at), type: plan.value.pumpType, discharge: null, mode: null,
        }))
        return suggestion
    }

    /** Add a pump in the middle of the longest section, or at the source when there is none. */
    function addPump() {
        const ordered = orderedPumps(plan.value)
        const stops = [...ordered.map(pump => pump.at), length.value]
        let at = 0
        if (ordered.length) {
            let longest = 0
            for (let index = 0; index < stops.length - 1; index++) {
                const gap = stops[index + 1]! - stops[index]!
                if (gap > longest) {
                    longest = gap
                    at = stops[index]! + gap / 2
                }
            }
        }
        plan.value.pumps.push({id: pumpId(), at: Math.round(at), type: plan.value.pumpType, discharge: null, mode: null})
    }

    /** Remove a pump. */
    function removePump(id: string) {
        plan.value.pumps = plan.value.pumps.filter(pump => pump.id !== id)
    }

    /** Move a pump to a distance along the line. */
    function movePump(id: string, at: number) {
        const pump = plan.value.pumps.find(candidate => candidate.id === id)
        if (pump) pump.at = Math.round(Math.min(Math.max(at, 0), length.value))
    }

    /** Start over with an empty plan. */
    function reset() {
        plan.value = emptyPlan()
    }

    return {
        plan, elevation, heightsPending, distances, length, modelHeights, profile, result, pumps, flush,
        appendVertex, insertVertex, moveVertex, removeVertex, clearRoute, reverseRoute,
        suggestPumps, addPump, removePump, movePump, reset,
    }
}

/** The store of the planner page. */
export type PlanStore = ReturnType<typeof createPlanStore>

/** The plan kept in this browser, or an empty one. */
function load(): Plan {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        return (stored && readPlan(JSON.parse(stored))) || emptyPlan()
    } catch {
        return emptyPlan()
    }
}

/** Keep a plan in this browser; a full or blocked storage keeps nothing, and the plan lives on in the page. */
function save(plan: Plan) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
    } catch {
        return
    }
}
