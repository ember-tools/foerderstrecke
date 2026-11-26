/** A hose size the line can be laid with. */
export type HoseSize = 'B' | 'A'

/** A friction table identifier; B lines have two, A lines one. */
export type FrictionTableId = 'b-berlin-nrw' | 'b-hessen' | 'a'

/** Loss per 100 m of hose in bar, measured at a set of flows in l/min. */
export interface FrictionTable {
    id: FrictionTableId
    hose: HoseSize
    points: readonly (readonly [flow: number, loss: number])[]
}

/**
 * B-75 after Berliner Feuerwehr training values, Feuerwehr Wuppertal (chapter 10) and the CGDIS
 * handout (slide 45); where they differ, at 600 l/min, Wuppertal's 0.7 bar is used.
 */
export const B_BERLIN_NRW: FrictionTable = {
    id: 'b-berlin-nrw',
    hose: 'B',
    points: [
        [200, 0.1], [250, 0.15], [300, 0.2], [350, 0.25], [400, 0.3], [450, 0.4], [500, 0.5], [600, 0.7],
        [700, 0.9], [800, 1.1], [900, 1.5], [1000, 1.7], [1100, 1.9], [1200, 2.5], [1300, 2.9], [1400, 3.45],
        [1500, 4.0], [1600, 4.6], [1700, 5.2], [1800, 5.8], [1900, 6.4], [2000, 7.0], [2100, 7.6],
        [2200, 8.2], [2300, 8.8], [2400, 9.4], [2500, 10.0],
    ],
}

/** B-75 after the Hessische Landesfeuerwehrschule, Lernunterlage Wasserförderung, table 4. */
export const B_HESSEN: FrictionTable = {
    id: 'b-hessen',
    hose: 'B',
    points: [[400, 0.3], [600, 0.6], [800, 1.0], [1000, 1.4], [1200, 2.0], [1600, 4.0]],
}

/** A-110 after the CGDIS handout, slide 45. */
export const A_CGDIS: FrictionTable = {
    id: 'a',
    hose: 'A',
    points: [
        [1000, 0.3], [1100, 0.35], [1200, 0.4], [1300, 0.45], [1400, 0.5], [1500, 0.6], [1600, 0.65],
        [1700, 0.75], [1800, 0.8], [1900, 0.9], [2000, 1.0], [2100, 1.1], [2200, 1.2], [2300, 1.3],
        [2400, 1.45], [2500, 1.6], [2600, 1.75], [2700, 1.9], [2800, 2.0], [2900, 2.15], [3000, 2.3],
    ],
}

/** Every friction table, by identifier. */
export const FRICTION_TABLES: Record<FrictionTableId, FrictionTable> = {
    'b-berlin-nrw': B_BERLIN_NRW,
    'b-hessen': B_HESSEN,
    'a': A_CGDIS,
}

/** The tables that fit a hose size, the default first. */
export function tablesFor(hose: HoseSize): FrictionTable[] {
    return hose === 'B' ? [B_BERLIN_NRW, B_HESSEN] : [A_CGDIS]
}

/**
 * The loss per 100 m of one hose line carrying `flow` l/min. Between two table points the loss
 * follows the power law through both; below the first or above the last point it follows the
 * four-times rule (exponent 2) from the nearest point.
 */
export function frictionPer100(table: FrictionTable, flow: number): number {
    if (flow <= 0) return 0
    const points = table.points
    const [firstFlow, firstLoss] = points[0]!
    const [lastFlow, lastLoss] = points[points.length - 1]!
    if (flow <= firstFlow) return firstLoss * (flow / firstFlow) ** 2
    if (flow >= lastFlow) return lastLoss * (flow / lastFlow) ** 2
    const upper = points.findIndex(([pointFlow]) => pointFlow >= flow)
    const [lowFlow, lowLoss] = points[upper - 1]!
    const [highFlow, highLoss] = points[upper]!
    if (flow === highFlow) return highLoss
    const exponent = Math.log(highLoss / lowLoss) / Math.log(highFlow / lowFlow)
    return lowLoss * (flow / lowFlow) ** exponent
}

/** The loss per 100 m of a line of `lines` parallel hoses sharing `flow` l/min evenly. */
export function linePer100(table: FrictionTable, flow: number, lines: 1 | 2): number {
    return frictionPer100(table, flow / lines)
}
