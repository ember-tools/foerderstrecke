import {HOSE_LENGTH} from './line'
import {MIN_INLET} from './pumps'
import {EPSILON} from './tolerance'

/** A relay task as the teaching material states it: an even line, closed relay. */
export interface TextbookTask {
    /** Line length in metres. */
    length: number
    /** Net rise from source to end in metres, negative for a net fall. */
    rise: number
    /** Friction loss per 100 m of the line in bar, as read from the task's table. */
    lossPer100: number
    /** Discharge pressure of every pump in bar. */
    discharge: number
    /** Pressure needed at the end in bar. */
    endRequirement: number
    /**
     * Discharge pressures of the first pumps where they differ from `discharge`, in order from
     * the source; the rest run at `discharge`.
     */
    pumpDischarges?: readonly number[]
}

/** The textbook solution of a task: every quantity the teaching material asks for. */
export interface TextbookSolution {
    friction: number
    height: number
    /** Total loss the pumps must cover: friction, height and the end requirement, in bar. */
    needed: number
    /** Pumps by the pressure budget; null when the line cannot be relayed: boosters add nothing
     * while the first pump falls short, or the end cannot be reached (see `endUnreachable`). */
    pumps: number | null
    /** Whether the last pump's discharge is below the end requirement on a line that loses
     * pressure, so no number of pumps delivers it. */
    endUnreachable: boolean
    /** Height loss per 100 m in bar, negative downhill. */
    heightPer100: number
    /** Booster spacing in metres before and after rounding down to whole hoses; null when no
     * booster is needed because the ground falls steeply enough. */
    boosterSpacing: {exact: number, hoses: number} | null
    /** Longest last section in metres, before and after rounding down to whole hoses. */
    lastSection: {exact: number, hoses: number} | null
}

/** Round a distance down to whole hoses. */
export function toWholeHoses(distance: number): number {
    return Math.floor(distance / HOSE_LENGTH + EPSILON) * HOSE_LENGTH
}

/**
 * The pumps needed to cover a total loss: the first pump delivers its discharge pressure in full,
 * each booster adds its discharge pressure less the 1.5 bar it receives (CGDIS 49–50). Returns null
 * when a booster would add nothing while pressure is still missing, or after `limit` pumps.
 */
export function pumpsByBudget(needed: number, discharges: (index: number) => number, limit = 1000): number | null {
    let covered = discharges(0)
    let pumps = 1
    while (covered < needed - EPSILON) {
        const gain = discharges(pumps) - MIN_INLET
        if (gain <= 0 || pumps >= limit) return null
        covered += gain
        pumps += 1
    }
    return pumps
}

/** Solve a task the way the teaching material does. */
export function solveTextbook(task: TextbookTask): TextbookSolution {
    const friction = task.lossPer100 * task.length / 100
    const height = task.rise / 10
    const needed = friction + height + task.endRequirement
    const dischargeOf = (index: number) => task.pumpDischarges?.[index] ?? task.discharge
    const heightPer100 = task.length > 0 ? height * 100 / task.length : 0
    const slope = task.lossPer100 + heightPer100
    const endUnreachable = slope > 0 && task.discharge < task.endRequirement - EPSILON
    const pumps = endUnreachable ? null : pumpsByBudget(needed, dischargeOf)
    const spacing = (budget: number) => {
        const exact = budget / slope * 100
        return {exact, hoses: toWholeHoses(exact)}
    }
    return {
        friction, height, needed, pumps, endUnreachable, heightPer100,
        boosterSpacing: slope > 0 && task.discharge > MIN_INLET ? spacing(task.discharge - MIN_INLET) : null,
        lastSection: slope > 0 && !endUnreachable ? spacing(task.discharge - task.endRequirement) : null,
    }
}
