import {FRICTION_TABLES, type HoseSize} from '../hydraulics/friction'
import type {LineResult} from '../hydraulics/line'
import {pumpType} from '../hydraulics/pumps'
import {orderedPumps, type Plan} from './model'

/** What a line needs on the ground. */
export interface Material {
    hose: HoseSize
    /** Hoses in all, with how many of them are reserve. */
    hoses: number
    reserve: number
    /** Pumps by type name, in the order they first appear from the source. */
    pumps: {name: string, count: number}[]
    /** Dividing breechings at the end, one unless the line ends in a tank. */
    breechings: number
    /** Portable tanks, one at every station of an open relay. */
    tanks: number
}

/** The material a calculated line needs. */
export function materialFor(plan: Plan, result: LineResult): Material {
    const pumps: {name: string, count: number}[] = []
    for (const pump of orderedPumps(plan)) {
        const name = pumpType(pump.type).name
        const entry = pumps.find(candidate => candidate.name === name)
        if (entry) entry.count++
        else pumps.push({name, count: 1})
    }
    return {
        hose: FRICTION_TABLES[plan.table].hose,
        hoses: result.hoses.total,
        reserve: result.hoses.reserve,
        pumps,
        breechings: plan.end.preset === 'freeOutflow' ? 0 : 1,
        tanks: result.stations.filter(station => station.mode === 'open').length,
    }
}
