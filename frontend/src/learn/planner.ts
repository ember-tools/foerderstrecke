import {FRICTION_TABLES} from '../hydraulics/friction'
import {suggestStations} from '../hydraulics/line'
import {profileThrough} from '../hydraulics/profile'
import {type LatLng, METRES_PER_DEGREE} from '../plan/geo'
import {emptyPlan, type Plan, pumpId} from '../plan/model'
import {DEFAULT_CENTER} from '../scripts/tiles'
import {solveTask, type Task, taskLine, taskPump} from './task'

/**
 * A task as a plan for the planner: a straight line running east from `start`, one vertex at
 * every change of slope, with the task's heights entered by hand so the map's terrain plays no
 * part, and the pumps of the task's type placed on whole hoses as the planner would suggest them.
 * Where the task asks for the discharge pressure of a given number of pumps, the pumps run at that
 * pressure, rounded up to a tenth of a bar.
 */
export function taskAsPlan(task: Task, start: LatLng = DEFAULT_CENTER): Plan {
    const metresPerLongitude = METRES_PER_DEGREE * Math.cos(start[0] * Math.PI / 180)
    const route: LatLng[] = [start]
    const corrections: number[] = [0]
    let along = 0
    let height = 0
    for (const stretch of task.stretches) {
        along += stretch.length
        height += stretch.rise
        route.push([start[0], start[1] + along / metresPerLongitude])
        corrections.push(height)
    }
    const pump = taskPump(task, task.firstDischarges.length)
    const discharge = task.givenPumps === null ? task.discharge : Math.ceil(solveTask(task).discharge! * 10 - 1e-9) / 10
    const plan: Plan = {
        ...emptyPlan(),
        title: task.source ?? '',
        route,
        corrections,
        heightSource: 'manual',
        end: {preset: 'custom', requirement: task.endRequirement},
        flow: task.flow,
        table: task.table,
        lines: task.lines,
        discharge,
        mode: 'closed',
        pumpType: pump.id,
        source: {...emptyPlan().source, kind: 'open-water', suctionLift: 0},
        view: {center: [start[0], start[1] + taskLine(task).length / metresPerLongitude / 2], zoom: 14},
    }
    const profile = profileThrough(route.map((_, index) => [
        task.stretches.slice(0, index).reduce((sum, stretch) => sum + stretch.length, 0), corrections[index]!,
    ] as const))
    const firstStations = task.firstDischarges.map((first, index) => ({pump: taskPump(task, index), discharge: first}))
    const suggestion = suggestStations({
        profile, flow: task.flow, table: FRICTION_TABLES[task.table], lines: task.lines, discharge,
        mode: 'closed', endRequirement: task.endRequirement, source: {kind: 'open-water', suctionLift: 0},
    }, pump, undefined, firstStations)
    plan.pumps = suggestion.stations.map((at, index) => ({
        id: pumpId(),
        at,
        type: firstStations[index]?.pump.id ?? pump.id,
        discharge: firstStations[index]?.discharge ?? null,
        mode: null,
    }))
    return plan
}
