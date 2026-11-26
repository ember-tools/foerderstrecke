/** A pump type with its nominal pressure in bar and nominal flow in l/min (DIN EN 1028-1). */
export interface PumpType {
    id: string
    name: string
    nominalPressure: number
    nominalFlow: number
}

/** The pump types on offer; a portable PFPN 10-1000 (TS 8/8) counts as FPN 10-1000. */
export const PUMP_TYPES: readonly PumpType[] = [
    {id: 'fpn-10-1000', name: 'FPN 10-1000', nominalPressure: 10, nominalFlow: 1000},
    {id: 'pfpn-10-1000', name: 'PFPN 10-1000 (TS 8/8)', nominalPressure: 10, nominalFlow: 1000},
    {id: 'fpn-10-2000', name: 'FPN 10-2000', nominalPressure: 10, nominalFlow: 2000},
    {id: 'fpn-10-1500', name: 'FPN 10-1500', nominalPressure: 10, nominalFlow: 1500},
    {id: 'fpn-10-750', name: 'FPN 10-750', nominalPressure: 10, nominalFlow: 750},
    {id: 'fpn-6-500', name: 'FPN 6-500', nominalPressure: 6, nominalFlow: 500},
    {id: 'fpn-15-1000', name: 'FPN 15-1000', nominalPressure: 15, nominalFlow: 1000},
]

/** The pump type used where none is chosen. */
export const DEFAULT_PUMP = PUMP_TYPES[0]!

/** Return a pump type by identifier, the default for an unknown one. */
export function pumpType(id: string): PumpType {
    return PUMP_TYPES.find(type => type.id === id) ?? DEFAULT_PUMP
}

/** The discharge pressure a line's pumps run at unless set otherwise, with reserve (WUP 11). */
export const DEFAULT_DISCHARGE = 8

/** The least pressure water must reach a pump's inlet with through hoses (HLFS-WF 5.2, 7.1). */
export const MIN_INLET = 1.5

/** Suction lifts in metres from which a pump's guarantee shrinks (HLFS-P 4.2, HLFS-WF 4.3.2). */
export const SUCTION_REDUCED = 3
export const SUCTION_HALF = 7.5
export const SUCTION_LIMIT = 8

/**
 * The highest discharge pressure a pump reaches: its nominal pressure on top of what arrives at
 * its inlet, counting suction as nothing.
 */
export function dischargeCap(type: PumpType, inlet: number): number {
    return type.nominalPressure + Math.max(inlet, 0)
}

/** What a pump's rating says about a flow and a suction lift. */
export type PumpWarning =
    | {kind: 'flow-above-rating', flow: number, nominalFlow: number}
    | {kind: 'suction-reduced', lift: number}
    | {kind: 'suction-half', lift: number}
    | {kind: 'suction-impossible', lift: number}

/** The warnings for a pump of `type` carrying `flow`, drawing with `suctionLift` metres if given. */
export function pumpWarnings(type: PumpType, flow: number, suctionLift?: number): PumpWarning[] {
    const warnings: PumpWarning[] = []
    if (flow > type.nominalFlow) warnings.push({kind: 'flow-above-rating', flow, nominalFlow: type.nominalFlow})
    if (suctionLift !== undefined) {
        if (suctionLift > SUCTION_LIMIT) warnings.push({kind: 'suction-impossible', lift: suctionLift})
        else if (suctionLift > SUCTION_HALF) warnings.push({kind: 'suction-half', lift: suctionLift})
        else if (suctionLift > SUCTION_REDUCED) warnings.push({kind: 'suction-reduced', lift: suctionLift})
    }
    return warnings
}
