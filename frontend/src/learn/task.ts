import {FRICTION_TABLES, type FrictionTableId, linePer100} from '../hydraulics/friction'
import {countHoses} from '../hydraulics/line'
import {MIN_INLET, PUMP_TYPES, type PumpType} from '../hydraulics/pumps'
import {solveTextbook, type TextbookSolution} from '../hydraulics/textbook'

/** What a task asks for. */
export type Question = 'needed' | 'pumps' | 'spacing' | 'hoses' | 'discharge'

/** One stretch of a task's line: its length and how much it rises (negative: falls), in metres. */
export interface Stretch {
    length: number
    rise: number
}

/** A relay task as the teaching material poses it: an even closed line of equal pumps. */
export interface Task {
    /** Stable identifier: `fixed:<name>`, `<stage>:<table>:<seed>` or `shared:<token>`. */
    id: string
    /** Where a fixed task comes from, as cited in the hydraulics documentation. */
    source: string | null
    stretches: Stretch[]
    flow: number
    table: FrictionTableId
    lines: 1 | 2
    /** Discharge pressure of every pump, unless `firstDischarges` sets the first ones. */
    discharge: number
    firstDischarges: number[]
    endRequirement: number
    /** Pumps given in the task, for the question about their discharge pressure. */
    givenPumps: number | null
    asked: Question[]
}

/** The total length and net rise of a task's line. */
export function taskLine(task: Task): {length: number, rise: number} {
    return {
        length: task.stretches.reduce((sum, stretch) => sum + stretch.length, 0),
        rise: task.stretches.reduce((sum, stretch) => sum + stretch.rise, 0),
    }
}

/** The friction loss per 100 m of one of the task's hoses, read from its table. */
export function taskLossPer100(task: Task): number {
    return linePer100(FRICTION_TABLES[task.table], task.flow, task.lines)
}

/** Everything a task's answers are checked against. */
export interface TaskSolution {
    textbook: TextbookSolution
    lossPer100: number
    /** Hoses of the line's size: whole hoses for the length, times the lines, plus the reserve. */
    hoses: number
    hosesForLength: number
    reserve: number
    /** The discharge pressure `givenPumps` equal pumps need, when the task gives them. */
    discharge: number | null
}

/**
 * Solve a task with the textbook rules of the hydraulics documentation; for a given number of
 * pumps n, each running at p, the pressure budget p + (n − 1)(p − 1.5) must cover the total loss.
 */
export function solveTask(task: Task): TaskSolution {
    const {length, rise} = taskLine(task)
    const lossPer100 = taskLossPer100(task)
    const textbook = solveTextbook({
        length, rise, lossPer100, discharge: task.discharge, endRequirement: task.endRequirement,
        pumpDischarges: task.firstDischarges,
    })
    const hoses = countHoses([length], task.lines)
    const discharge = task.givenPumps === null
        ? null
        : (textbook.needed + (task.givenPumps - 1) * MIN_INLET) / task.givenPumps
    return {textbook, lossPer100, hoses: hoses.total, hosesForLength: hoses.sections[0]!, reserve: hoses.reserve, discharge}
}

/**
 * The pump type a task's pumps are: the smallest 10 bar pump that carries the flow, or the 15 bar
 * pump where the task sets a pressure above 10 bar.
 */
export function taskPump(task: Task, index = 0): PumpType {
    const discharge = task.firstDischarges[index] ?? task.discharge
    if (discharge > 10) return PUMP_TYPES.find(type => type.nominalPressure === 15)!
    const fitting = PUMP_TYPES
        .filter(type => type.nominalPressure === 10 && type.nominalFlow >= task.flow && !type.id.startsWith('pfpn'))
        .sort((a, b) => a.nominalFlow - b.nominalFlow)
    return fitting[0] ?? PUMP_TYPES.find(type => type.id === 'fpn-10-2000')!
}
