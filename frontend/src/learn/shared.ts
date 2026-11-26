import {FRICTION_TABLES, type FrictionTableId} from '../hydraulics/friction'
import {heightAt, type Profile} from '../hydraulics/profile'
import {vertexDistances} from '../plan/geo'
import {type Plan, readPlan} from '../plan/model'
import type {Question, Stretch, Task} from './task'

const QUESTIONS: readonly Question[] = ['needed', 'pumps', 'spacing', 'hoses', 'discharge']
const MAX_STRETCHES = 50

/**
 * Join the segments of a line into stretches that each only rise, only fall or run level, so a
 * line drawn with many points reads as a few slopes. More than `MAX_STRETCHES` slopes become one
 * stretch over the whole line, which keeps its length and net rise, all the textbook rules use.
 */
export function joinStretches(segments: readonly Stretch[]): Stretch[] {
    const joined: Stretch[] = []
    for (const segment of segments) {
        const last = joined.at(-1)
        if (last && Math.sign(last.rise) === Math.sign(segment.rise)) {
            last.length += segment.length
            last.rise += segment.rise
        } else {
            joined.push({...segment})
        }
    }
    const rounded = joined.map(stretch => ({length: Math.round(stretch.length), rise: Math.round(stretch.rise)}))
        .filter(stretch => stretch.length > 0)
    if (rounded.length <= MAX_STRETCHES) return rounded
    return [{
        length: rounded.reduce((sum, stretch) => sum + stretch.length, 0),
        rise: rounded.reduce((sum, stretch) => sum + stretch.rise, 0),
    }]
}

/**
 * A planned line as a task for a group: its slopes as stretches with the rise the profile gives,
 * and the line's flow, hose, pumps' discharge and end requirement. Asked are the total pressure
 * needed, the pumps and the hoses.
 */
export function planAsTask(edited: Plan, profile: Profile): Task {
    const plan = readPlan(edited)!
    const distances = vertexDistances(plan.route)
    const segments = distances.slice(1).map((at, index) => ({
        length: at - distances[index]!,
        rise: heightAt(profile, at) - heightAt(profile, distances[index]!),
    }))
    return {
        id: 'shared:new',
        source: plan.title || null,
        stretches: joinStretches(segments),
        flow: plan.flow,
        table: plan.table,
        lines: plan.lines,
        discharge: plan.discharge,
        firstDischarges: [],
        endRequirement: plan.end.requirement,
        givenPumps: null,
        asked: ['needed', 'pumps', 'hoses'],
    }
}

function finite(value: unknown, min: number, max: number): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null
}

/**
 * A task read from a shared link, every field checked; null for anything that is not a complete,
 * sensible task. A shared task gets the id `shared:<token>`.
 */
export function readTask(raw: unknown, token: string): Task | null {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const data = raw as Record<string, unknown>
    const stretches = Array.isArray(data.stretches) ? data.stretches.slice(0, MAX_STRETCHES).map(entry => {
        const stretch = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {}
        const length = finite(stretch.length, 1, 1_000_000)
        const rise = finite(stretch.rise, -10_000, 10_000)
        return length === null || rise === null ? null : {length, rise}
    }) : []
    if (!stretches.length || stretches.some(stretch => stretch === null)) return null
    const flow = finite(data.flow, 1, 10_000)
    const discharge = finite(data.discharge, 1, 20)
    const endRequirement = finite(data.endRequirement, 0, 20)
    const table = Object.keys(FRICTION_TABLES).includes(data.table as string) ? data.table as FrictionTableId : null
    const asked = Array.isArray(data.asked)
        ? QUESTIONS.filter(question => (data.asked as unknown[]).includes(question)) : []
    const firstDischarges = Array.isArray(data.firstDischarges)
        ? data.firstDischarges.map(value => finite(value, 1, 20)).filter((value): value is number => value !== null).slice(0, 10)
        : []
    const givenPumps = data.givenPumps === null || data.givenPumps === undefined
        ? null : finite(data.givenPumps, 1, 50)
    if (flow === null || discharge === null || endRequirement === null || table === null || !asked.length) return null
    if (asked.includes('discharge') !== (givenPumps !== null)) return null
    return {
        id: `shared:${token}`,
        source: typeof data.source === 'string' ? data.source.slice(0, 120) : null,
        stretches: stretches as Stretch[],
        flow,
        table,
        lines: data.lines === 2 ? 2 : 1,
        discharge,
        firstDischarges,
        endRequirement,
        givenPumps: givenPumps === null ? null : Math.round(givenPumps),
        asked,
    }
}
