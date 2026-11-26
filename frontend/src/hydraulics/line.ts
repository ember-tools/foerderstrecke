import {type FrictionTable, linePer100} from './friction'
import {heightAt, type Profile, profileLength, samplesBetween} from './profile'
import {dischargeCap, MIN_INLET, type PumpType, type PumpWarning, pumpWarnings} from './pumps'
import {EPSILON} from './tolerance'

/** The length of one hose in metres; lines and pump spacing are counted in whole hoses. */
export const HOSE_LENGTH = 20

/** How a booster station takes its water: straight into the pump, or from a tank with free outflow. */
export type RelayMode = 'closed' | 'open'

/** Where the line takes its water from. */
export type Source =
    | {kind: 'open-water', suctionLift: number}
    | {kind: 'hydrant', pressure: number, yield: number}
    | {kind: 'tank'}

/** Pressure presets needed at the line's end in bar (HLFS-WF 2.2, 5.7). */
export const END_REQUIREMENTS = {multiPurpose: 6, hollowJet: 7, freeOutflow: 0} as const

/** A pump station along the line. */
export interface Station {
    /** Distance from the source in metres. */
    at: number
    pump: PumpType
    /** Discharge pressure for this pump instead of the line's. */
    discharge?: number
    /** How this station takes its water instead of the line's setting; ignored for the first. */
    mode?: RelayMode
}

/** Everything a line's calculation needs. */
export interface LineInput {
    profile: Profile
    /** Flow in l/min. */
    flow: number
    table: FrictionTable
    lines: 1 | 2
    /** Discharge pressure of every pump unless a station overrides it, in bar. */
    discharge: number
    mode: RelayMode
    /** Pressure needed at the line's end in bar. */
    endRequirement: number
    source: Source
    /** The pump stations; the one nearest the source takes the water from it. */
    stations: readonly Station[]
    /** Reserve hoses per started 100 m of line; 1 by default. */
    reservePer100?: number
}

/** The pressure along one section of the line, from a pump's discharge or a hydrant to the next
 * station or the end. Pressures in bar, distances in metres. */
export interface SectionResult {
    start: number
    end: number
    length: number
    startPressure: number
    friction: number
    /** Loss by height, negative where the section ends lower than it starts. */
    height: number
    endPressure: number
    /** The lowest pressure anywhere along the section, and where it occurs. */
    lowest: number
    lowestAt: number
    required: number
    /** End pressure above the requirement; a shortfall is negative. */
    reserve: number
    holds: boolean
}

/** What a station receives and delivers. */
export interface StationResult {
    at: number
    pump: PumpType
    /** How the station takes its water; null for the first, which takes it from the source. */
    mode: RelayMode | null
    /** Pressure arriving at the inlet, 0 when drawing by suction or from a tank. */
    inlet: number
    requested: number
    cap: number
    discharge: number
    capped: boolean
    warnings: PumpWarning[]
}

/** A problem that makes the line fail as a whole, beyond a section falling short. */
export type LineError =
    | {kind: 'no-stations'}
    | {kind: 'hydrant-yield', flow: number, yield: number}
    | {kind: 'suction-impossible', lift: number}

/** Hoses needed in all, including the reserve. */
export interface HoseCount {
    sections: number[]
    reserve: number
    total: number
}

/** A line's full calculation. */
export interface LineResult {
    length: number
    lossPer100: number
    /** Hydrant to first pump when the source is a hydrant; without length when the pump stands
     * at the hydrant, which still checks the hydrant's pressure against the inlet minimum. */
    intake: SectionResult | null
    stations: StationResult[]
    /** One section per station, from its discharge to the next station or the end. */
    sections: SectionResult[]
    hoses: HoseCount
    errors: LineError[]
    holds: boolean
}

/** The pressure at `x` along a section starting at `start` with `startPressure`. */
export function pressureAt(profile: Profile, start: number, startPressure: number, lossPer100: number, x: number): number {
    return startPressure - lossPer100 * (x - start) / 100 - (heightAt(profile, x) - heightAt(profile, start)) / 10
}

/**
 * The pressure along a section, checked against `required` at its end and against 0 everywhere
 * along it, so the water gets over every crest.
 */
export function evaluateSection(
    profile: Profile, start: number, end: number, startPressure: number, lossPer100: number, required: number,
): SectionResult {
    const endPressure = pressureAt(profile, start, startPressure, lossPer100, end)
    let lowest = endPressure
    let lowestAt = end
    for (const x of samplesBetween(profile, start, end)) {
        const pressure = pressureAt(profile, start, startPressure, lossPer100, x)
        if (pressure < lowest) {
            lowest = pressure
            lowestAt = x
        }
    }
    if (startPressure < lowest) {
        lowest = startPressure
        lowestAt = start
    }
    const reserve = endPressure - required
    return {
        start, end, length: end - start, startPressure,
        friction: lossPer100 * (end - start) / 100,
        height: (heightAt(profile, end) - heightAt(profile, start)) / 10,
        endPressure, lowest, lowestAt, required, reserve,
        holds: reserve >= -EPSILON && lowest >= -EPSILON,
    }
}

/** The pressure the first pump receives, and the intake section when a hydrant feeds it. */
function firstInlet(input: LineInput, firstAt: number, lossPer100: number): {inlet: number, intake: SectionResult | null} {
    if (input.source.kind !== 'hydrant') return {inlet: 0, intake: null}
    const intake = evaluateSection(input.profile, 0, firstAt, input.source.pressure, lossPer100, MIN_INLET)
    return {inlet: intake.endPressure, intake}
}

/** What a pump delivers given what arrives at its inlet. */
function stationResult(
    input: LineInput, station: Station, mode: RelayMode | null, inlet: number, suctionLift?: number,
): StationResult {
    const requested = station.discharge ?? input.discharge
    const cap = dischargeCap(station.pump, inlet)
    return {
        at: station.at, pump: station.pump, mode, inlet, requested, cap,
        discharge: Math.min(requested, cap),
        capped: requested > cap + EPSILON,
        warnings: pumpWarnings(station.pump, input.flow, suctionLift),
    }
}

/** The pressure a section must arrive with at a station taking water the given way. */
export function arrivalRequirement(mode: RelayMode): number {
    return mode === 'closed' ? MIN_INLET : 0
}

/** Count hoses: whole hoses per section, times the parallel lines, plus the reserve. */
export function countHoses(sectionLengths: readonly number[], lines: 1 | 2, reservePer100 = 1): HoseCount {
    const sections = sectionLengths.map(length => Math.ceil(length / HOSE_LENGTH - EPSILON) * lines)
    const total = sectionLengths.reduce((sum, length) => sum + length, 0)
    const reserve = Math.ceil(total / 100 - EPSILON) * reservePer100 * lines
    return {sections, reserve, total: sections.reduce((sum, count) => sum + count, 0) + reserve}
}

/**
 * Calculate a line: what every pump receives and delivers, the pressure along every section, the
 * hoses needed and whether the line holds. With open water or a tank the first pump stands at the
 * source; with a hydrant it may stand away from it, and the stretch between is the intake.
 */
export function calculateLine(input: LineInput): LineResult {
    const length = profileLength(input.profile)
    const lossPer100 = linePer100(input.table, input.flow, input.lines)
    const errors: LineError[] = []
    if (input.source.kind === 'hydrant' && input.flow > input.source.yield) {
        errors.push({kind: 'hydrant-yield', flow: input.flow, yield: input.source.yield})
    }
    if (input.stations.length === 0) {
        errors.push({kind: 'no-stations'})
        const hoses = countHoses([length], input.lines, input.reservePer100)
        return {length, lossPer100, intake: null, stations: [], sections: [], hoses, errors, holds: false}
    }
    const ordered = [...input.stations].sort((a, b) => a.at - b.at)
    const positions = ordered.map((station, index) =>
        index === 0 && input.source.kind !== 'hydrant' ? 0 : Math.min(Math.max(station.at, 0), length))
    const first = firstInlet(input, positions[0]!, lossPer100)
    const suctionLift = input.source.kind === 'open-water' ? input.source.suctionLift : undefined
    if (suctionLift !== undefined && pumpWarnings(ordered[0]!.pump, 0, suctionLift)
        .some(warning => warning.kind === 'suction-impossible')) {
        errors.push({kind: 'suction-impossible', lift: suctionLift})
    }
    const stations: StationResult[] = []
    const sections: SectionResult[] = []
    let inlet = first.inlet
    ordered.forEach((station, index) => {
        const mode = index === 0 ? null : station.mode ?? input.mode
        const result = stationResult(input, {...station, at: positions[index]!}, mode, inlet,
            index === 0 ? suctionLift : undefined)
        stations.push(result)
        const next = ordered[index + 1]
        const nextMode = next ? next.mode ?? input.mode : null
        const end = next ? positions[index + 1]! : length
        const required = nextMode === null ? input.endRequirement : arrivalRequirement(nextMode)
        const section = evaluateSection(input.profile, result.at, end, result.discharge, lossPer100, required)
        sections.push(section)
        inlet = nextMode === 'closed' ? section.endPressure : 0
    })
    const lengths = [...(first.intake ? [first.intake.length] : []), ...sections.map(section => section.length)]
    const hoses = countHoses(lengths, input.lines, input.reservePer100)
    const holds = errors.length === 0
        && (first.intake?.holds ?? true)
        && sections.every(section => section.holds)
    return {length, lossPer100, intake: first.intake, stations, sections, hoses, errors, holds}
}

/** Why a suggestion could not reach the end. */
export type SuggestionProblem = 'no-hose-holds' | 'hydrant-pressure' | 'too-many-pumps'

/** Where a suggestion placed the pumps, or where and why it could not go on. */
export interface Suggestion {
    /** Distances of the pumps from the source. */
    stations: number[]
    feasible: boolean
    problem: SuggestionProblem | null
    /** The station from which not even one hose held. */
    stuckAt: number | null
}

/**
 * Suggest pump stations, all of one type and taking water the line's way: walking from the
 * source, each next pump stands at the farthest whole hose at which the section still holds,
 * until the last pump reaches the end. The first pump stands at the source. Stops where not even
 * one hose holds, before a hydrant too weak to feed a pump, and after `maxStations` pumps.
 */
export function suggestStations(input: Omit<LineInput, 'stations'>, pump: PumpType, maxStations?: number): Suggestion {
    const length = profileLength(input.profile)
    const limit = maxStations ?? Math.ceil(length / HOSE_LENGTH) + 1
    const lossPer100 = linePer100(input.table, input.flow, input.lines)
    const arrival = arrivalRequirement(input.mode)
    let position = 0
    let inlet = input.source.kind === 'hydrant' ? input.source.pressure : 0
    const stations = [0]
    if (input.source.kind === 'hydrant' && inlet < MIN_INLET - EPSILON) {
        return {stations, feasible: false, problem: 'hydrant-pressure', stuckAt: null}
    }
    while (stations.length <= limit) {
        const discharge = Math.min(input.discharge, dischargeCap(pump, inlet))
        if (evaluateSection(input.profile, position, length, discharge, lossPer100, input.endRequirement).holds) {
            return {stations, feasible: true, problem: null, stuckAt: null}
        }
        const next = farthestBooster(input.profile, position, length, discharge, lossPer100, arrival)
        if (next === null) return {stations, feasible: false, problem: 'no-hose-holds', stuckAt: position}
        stations.push(next.at)
        inlet = input.mode === 'closed' ? next.pressure : 0
        position = next.at
    }
    return {stations, feasible: false, problem: 'too-many-pumps', stuckAt: null}
}

/** The farthest whole hose before `length` at which a section from `start` arrives with `required`
 * without dropping below 0 on the way, with the pressure there; null if not even one hose does. */
function farthestBooster(
    profile: Profile, start: number, length: number, discharge: number, lossPer100: number, required: number,
): {at: number, pressure: number} | null {
    let best: {at: number, pressure: number} | null = null
    let previous = start
    for (let hoses = 1; start + hoses * HOSE_LENGTH < length - EPSILON; hoses++) {
        const at = start + hoses * HOSE_LENGTH
        const checkpoints = [...samplesBetween(profile, previous, at), at]
        if (checkpoints.some(x => pressureAt(profile, start, discharge, lossPer100, x) < -EPSILON)) break
        const pressure = pressureAt(profile, start, discharge, lossPer100, at)
        if (pressure >= required - EPSILON) best = {at, pressure}
        previous = at
    }
    return best
}
