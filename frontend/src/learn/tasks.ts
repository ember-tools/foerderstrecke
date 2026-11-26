import type {FrictionTableId} from '../hydraulics/friction'
import {t} from '../i18n'
import {solveTask, type Question, type Stretch, type Task} from './task'

/**
 * The tasks of the teaching material, the reference cases of the hydraulics documentation. Each
 * keeps the source's own figures; the loss of 1.7 bar per 100 m at 1000 l/min and 1.1 bar at
 * 800 l/min is what the Berlin/NRW table gives.
 */
export const FIXED_TASKS: readonly Task[] = [
    {
        id: 'fixed:cgdis-short', source: t('learn.fixedTasks.cgdisShort'),
        stretches: [{length: 640, rise: 30}], flow: 1000, table: 'b-berlin-nrw', lines: 1,
        discharge: 10, firstDischarges: [], endRequirement: 4.5, givenPumps: null, asked: ['needed', 'pumps', 'hoses'],
    },
    {
        id: 'fixed:wup-long', source: t('learn.fixedTasks.wupLong'),
        stretches: [{length: 3600, rise: 65}], flow: 1000, table: 'b-berlin-nrw', lines: 1,
        discharge: 8, firstDischarges: [], endRequirement: 5, givenPumps: null,
        asked: ['needed', 'pumps', 'spacing', 'hoses'],
    },
    {
        id: 'fixed:wup-spacing', source: t('learn.fixedTasks.wupSpacing'),
        stretches: [{length: 1000, rise: 30}], flow: 800, table: 'b-berlin-nrw', lines: 1,
        discharge: 8, firstDischarges: [], endRequirement: 5, givenPumps: null, asked: ['spacing'],
    },
    {
        id: 'fixed:cgdis-mixed', source: t('learn.fixedTasks.cgdisMixed'),
        stretches: [{length: 1000, rise: 57}, {length: 460, rise: -3}], flow: 1000, table: 'b-berlin-nrw', lines: 1,
        discharge: 10, firstDischarges: [10, 15], endRequirement: 4.5, givenPumps: null, asked: ['needed', 'pumps'],
    },
    ...([['2.1', 1700, 80], ['2.2', 2500, 70], ['2.3', 2000, 50]] as const).map(([name, length, rise]): Task => ({
        id: `fixed:cgdis-${name}`, source: t('learn.fixedTasks.cgdisSeries', {name}),
        stretches: [{length, rise}], flow: 1000, table: 'b-berlin-nrw', lines: 1,
        discharge: 10, firstDischarges: [], endRequirement: 4.5, givenPumps: null, asked: ['needed', 'pumps', 'hoses'],
    })),
]

/** The stages random tasks come in, from an even line to the pressure the pumps must run at. */
export const STAGES = ['flat', 'uphill', 'downhill', 'mixed', 'double', 'discharge'] as const

/** A stage of random tasks. */
export type Stage = typeof STAGES[number]

const ASKED: Record<Stage, Question[]> = {
    flat: ['needed', 'pumps'],
    uphill: ['needed', 'pumps', 'spacing', 'hoses'],
    downhill: ['needed', 'pumps', 'hoses'],
    mixed: ['needed', 'pumps', 'hoses'],
    double: ['needed', 'pumps', 'spacing', 'hoses'],
    discharge: ['needed', 'discharge'],
}

const FLOWS_PER_LINE: Record<FrictionTableId, number[]> = {
    'b-berlin-nrw': [400, 500, 600, 800, 1000, 1200],
    'b-hessen': [400, 600, 800, 1000, 1200],
    'a': [1000, 1200, 1500, 2000],
}

/** The most a task's pumps carry: the largest flow of the pump types on offer. */
const MOST_FLOW = 2000
const END_REQUIREMENTS = [6, 6, 6, 7]
const MOST_PUMPS = 12

/** A small seeded random generator (mulberry32), so a task can be made again from its seed. */
export function random(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let value = state
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
}

function pick<T>(next: () => number, options: readonly T[]): T {
    return options[Math.floor(next() * options.length)]!
}

function between(next: () => number, low: number, high: number, step: number): number {
    return low + Math.floor(next() * ((high - low) / step + 1)) * step
}

function stretchesFor(stage: Stage, next: () => number): Stretch[] {
    const length = between(next, 600, 3000, 100)
    if (stage === 'flat') return [{length, rise: 0}]
    if (stage === 'downhill') return [{length, rise: -between(next, 10, 60, 5)}]
    if (stage === 'mixed') {
        const first = between(next, 300, Math.max(300, length - 300), 100)
        return [{length: first, rise: between(next, 10, 60, 5)}, {length: length - first, rise: -between(next, 5, 40, 5)}]
    }
    if (stage === 'double' && next() < 0.5) return [{length, rise: 0}]
    return [{length, rise: between(next, 10, 80, 5)}]
}

/**
 * A random task of a stage, made from a seed. Values stay on the points of the friction table so
 * the loss can be read straight off it and one pump type on offer carries the flow, and a task that
 * would need more than twelve pumps or no relay at all is drawn again from the next seed. Should
 * that never succeed, the short reference task stands in, asked the way the stage asks.
 */
export function generateTask(stage: Stage, seed: number, table: FrictionTableId = 'b-berlin-nrw'): Task {
    for (let attempt = 0; attempt < 50; attempt++) {
        const next = random(seed + attempt * 7919)
        const lines = stage === 'double' ? 2 : 1
        const flow = pick(next, FLOWS_PER_LINE[table].filter(perLine => perLine * lines <= MOST_FLOW)) * lines
        const task: Task = {
            id: `${stage}:${table}:${seed}`,
            source: null,
            stretches: stretchesFor(stage, next),
            flow,
            table,
            lines,
            discharge: pick(next, [8, 8, 10]),
            firstDischarges: [],
            endRequirement: pick(next, END_REQUIREMENTS),
            givenPumps: null,
            asked: ASKED[stage],
        }
        const solution = solveTask(task)
        const pumps = solution.textbook.pumps
        if (pumps === null || pumps > MOST_PUMPS) continue
        if (stage === 'discharge') {
            if (pumps < 2) continue
            const given = pumps + (next() < 0.5 ? 1 : 0)
            const withGiven = {...task, givenPumps: given}
            const discharge = solveTask(withGiven).discharge!
            if (discharge > 10 || discharge < task.endRequirement) continue
            return withGiven
        }
        if (stage !== 'flat' && stage !== 'downhill' && pumps < 2) continue
        return task
    }
    return {
        ...FIXED_TASKS[0]!, id: `${stage}:${table}:${seed}`, source: null, asked: ASKED[stage],
        givenPumps: stage === 'discharge' ? 3 : null,
    }
}
