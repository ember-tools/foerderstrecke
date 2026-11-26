import {computed, type ComputedRef, ref, type Ref, shallowRef, watch} from 'vue'
import {fetchProfile, type ElevationFailure} from '../api/elevation'
import {calculateLine, type LineInput, suggestStations} from '../hydraulics/line'
import {heightAt, profileThrough, type ProfileSample} from '../hydraulics/profile'
import {pumpType} from '../hydraulics/pumps'
import {type LatLng, vertexDistances} from './geo'
import {correctedProfile} from './heights'
import {materialFor} from './material'
import {emptyPlan, lineInput, orderedPumps, type Plan, pumpId, readPlan} from './model'
import {namedSections} from './sections'

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
    const distances = computed(() => vertexDistances(plan.value.route))
    const length = computed(() => distances.value.at(-1) ?? 0)
    const heights = trackHeights(plan, distances)
    const profile = computed(() => correctedProfile(heights.samples.value, distances.value, plan.value.corrections))
    const input = computed(() => lineInput(plan.value, profile.value))
    const result = computed(() => plan.value.route.length >= 2 ? calculateLine(input.value) : null)
    return {
        plan, distances, length, profile, result,
        ...heights,
        pumps: computed(() => orderedPumps(plan.value)),
        material: computed(() => result.value ? materialFor(plan.value, result.value) : null),
        sections: computed(() => result.value ? namedSections(result.value) : []),
        flush: keepInBrowser(plan),
        ...routeEdits(plan, length),
        ...pumpEdits(plan, length, input),
    }
}

/** The store of the planner page. */
export type PlanStore = ReturnType<typeof createPlanStore>

/** Save the plan a moment after every edit; the returned function saves a pending edit at once. */
function keepInBrowser(plan: Ref<Plan>): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined
    watch(plan, value => {
        clearTimeout(timer)
        timer = setTimeout(() => save(value), SAVE_DELAY)
    }, {deep: true})
    return () => {
        clearTimeout(timer)
        save(plan.value)
    }
}

/**
 * The heights along the route: asked from the server a moment after the route changes, the
 * previous ones kept while new ones load, none when the plan's heights are entered by hand.
 */
function trackHeights(plan: Ref<Plan>, distances: ComputedRef<number[]>) {
    const elevation = shallowRef<ElevationState>({state: 'none'})
    const samples = computed(() => {
        if (plan.value.heightSource === 'manual') return []
        const current = elevation.value
        if (current.state === 'ready') return current.samples
        return current.state === 'loading' && current.previous ? current.previous : []
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    let request: AbortController | undefined
    watch(() => [JSON.stringify(plan.value.route), plan.value.heightSource], () => {
        clearTimeout(timer)
        request?.abort()
        if (plan.value.route.length < 2 || plan.value.heightSource === 'manual') {
            elevation.value = {state: 'none'}
            return
        }
        elevation.value = {state: 'loading', previous: samples.value.length ? samples.value : null}
        timer = setTimeout(async () => {
            request = new AbortController()
            elevation.value = await loadHeights(plan.value.route, request.signal) ?? elevation.value
        }, PROFILE_DELAY)
    }, {immediate: true})
    const modelHeights = computed(() => {
        if (elevation.value.state !== 'ready') return distances.value.map(() => null)
        const model = profileThrough(elevation.value.samples)
        return distances.value.map(at => heightAt(model, at))
    })
    return {elevation, samples, modelHeights, heightsPending: computed(() => elevation.value.state === 'loading')}
}

/** Ask the server for the heights along a route; null when the request was given up for a newer one. */
async function loadHeights(route: readonly LatLng[], signal: AbortSignal): Promise<ElevationState | null> {
    try {
        const answer = await fetchProfile(route, signal)
        if (signal.aborted) return null
        return answer.ok ? {state: 'ready', samples: answer.profile.samples} : {state: 'failed', reason: answer.reason}
    } catch {
        return signal.aborted ? null : {state: 'failed', reason: 'offline'}
    }
}

/** Editing the route: vertices with their corrections, keeping pumps within the route. */
function routeEdits(plan: Ref<Plan>, length: ComputedRef<number>) {
    /** Keep pumps within the route after it got shorter. */
    function clampPumps() {
        const total = vertexDistances(plan.value.route).at(-1) ?? 0
        plan.value.pumps = plan.value.pumps.map(pump => ({...pump, at: Math.min(pump.at, total)}))
    }

    return {
        /** Add a vertex at the end of the route. */
        appendVertex(position: LatLng) {
            plan.value.route.push(position)
            plan.value.corrections.push(null)
        },
        /** Insert a vertex after the given one. */
        insertVertex(after: number, position: LatLng) {
            plan.value.route.splice(after + 1, 0, position)
            plan.value.corrections.splice(after + 1, 0, null)
            clampPumps()
        },
        /** Move a vertex; pumps keep their distance from the source. */
        moveVertex(index: number, position: LatLng) {
            plan.value.route[index] = position
            clampPumps()
        },
        /** Remove a vertex and the correction entered for it. */
        removeVertex(index: number) {
            plan.value.route.splice(index, 1)
            plan.value.corrections.splice(index, 1)
            clampPumps()
        },
        /** Remove the whole route and every pump on it. */
        clearRoute() {
            plan.value.route = []
            plan.value.corrections = []
            plan.value.pumps = []
        },
        /** Turn the route around, so source and end swap; pumps keep their place on the ground. */
        reverseRoute() {
            const total = length.value
            plan.value.route.reverse()
            plan.value.corrections.reverse()
            plan.value.pumps = plan.value.pumps.map(pump => ({...pump, at: Math.max(0, total - pump.at)}))
        },
        /** Remember the part of the map last shown. */
        setView(center: LatLng, zoom: number) {
            plan.value.view = {center, zoom}
        },
    }
}

/** Editing the pumps: suggesting, adding, removing and moving them along the line. */
function pumpEdits(plan: Ref<Plan>, length: ComputedRef<number>, input: ComputedRef<LineInput>) {
    return {
        /** Replace the pumps by a suggestion along the line; return it to report problems. */
        suggestPumps() {
            const suggestion = suggestStations(input.value, pumpType(plan.value.pumpType))
            plan.value.pumps = suggestion.stations.map(at => ({
                id: pumpId(), at: Math.round(at), type: plan.value.pumpType, discharge: null, mode: null,
            }))
            return suggestion
        },
        /** Add a pump in the middle of the longest section, or at the source when there is none. */
        addPump() {
            const at = middleOfLongestGap(orderedPumps(plan.value).map(pump => pump.at), length.value)
            plan.value.pumps.push({id: pumpId(), at: Math.round(at), type: plan.value.pumpType, discharge: null, mode: null})
        },
        /** Remove a pump. */
        removePump(id: string) {
            plan.value.pumps = plan.value.pumps.filter(pump => pump.id !== id)
        },
        /** Move a pump to a distance along the line. */
        movePump(id: string, at: number) {
            const pump = plan.value.pumps.find(candidate => candidate.id === id)
            if (pump) pump.at = Math.round(Math.min(Math.max(at, 0), length.value))
        },
    }
}

/** The middle of the longest gap between ordered stations and the end, or the source without any. */
function middleOfLongestGap(stations: readonly number[], end: number): number {
    if (!stations.length) return 0
    const stops = [...stations, end]
    let best = {gap: 0, at: 0}
    for (let index = 0; index < stops.length - 1; index++) {
        const gap = stops[index + 1]! - stops[index]!
        if (gap > best.gap) best = {gap, at: stops[index]! + gap / 2}
    }
    return best.at
}

/** The plan kept in this browser, or an empty one. */
function load(): Plan {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        return (stored && readPlan(JSON.parse(stored))) || emptyPlan()
    } catch {
        return emptyPlan()
    }
}

/** Whether this browser keeps a plan with a drawn line. */
export function hasStoredPlan(): boolean {
    return load().route.length > 0
}

/** Keep a plan in this browser as the one the planner opens; tell whether the storage took it. */
export function storePlan(plan: Plan): boolean {
    return save(plan)
}

/** Keep a plan in this browser and tell whether that worked; a full or blocked storage keeps
 * nothing, and an edited plan lives on in the page. */
function save(plan: Plan): boolean {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
        return true
    } catch {
        return false
    }
}
