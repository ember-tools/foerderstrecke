import {FRICTION_TABLES, type FrictionTableId} from '../hydraulics/friction'
import {END_REQUIREMENTS, type LineInput, type RelayMode, type Source} from '../hydraulics/line'
import type {Profile} from '../hydraulics/profile'
import {DEFAULT_DISCHARGE, DEFAULT_PUMP, pumpType} from '../hydraulics/pumps'
import type {LatLng} from './geo'

/** Where a planned line takes its water from; hydrants come as the two kinds drawn on the map. */
export type SourceKind = 'open-water' | 'hydrant-underground' | 'hydrant-pillar' | 'tank'

/** How the pressure needed at the end is chosen: a preset or a value of its own. */
export type EndPreset = keyof typeof END_REQUIREMENTS | 'custom'

/** A pump placed on the line, at a distance from the source in metres. */
export interface PlanPump {
    id: string
    at: number
    type: string
    /** Discharge pressure instead of the line's, in bar. */
    discharge: number | null
    /** How this station takes its water instead of the line's setting. */
    mode: RelayMode | null
}

/** Everything a planned line consists of, as kept in the browser and shared. */
export interface Plan {
    version: 1
    title: string
    /** The hose line from the source (first vertex) to the end (last vertex). */
    route: LatLng[]
    /** Heights entered by hand per vertex in metres, null where the model height stands. */
    corrections: (number | null)[]
    source: {kind: SourceKind, suctionLift: number, pressure: number, yield: number}
    end: {preset: EndPreset, requirement: number}
    /** Flow in l/min. */
    flow: number
    table: FrictionTableId
    lines: 1 | 2
    /** Discharge pressure of the line's pumps in bar. */
    discharge: number
    mode: RelayMode
    /** The pump type new and suggested pumps get. */
    pumpType: string
    reservePer100: number
    pumps: PlanPump[]
    view: {center: LatLng, zoom: number} | null
}

/** Typical yields of hydrants in l/min (HLFS-WF 4.2). */
export const HYDRANT_YIELD = {'hydrant-underground': 800, 'hydrant-pillar': 1500} as const

/** An empty plan with the defaults of the calculation. */
export function emptyPlan(): Plan {
    return {
        version: 1,
        title: '',
        route: [],
        corrections: [],
        source: {kind: 'open-water', suctionLift: 1.5, pressure: 3, yield: HYDRANT_YIELD['hydrant-underground']},
        end: {preset: 'multiPurpose', requirement: END_REQUIREMENTS.multiPurpose},
        flow: 800,
        table: 'b-berlin-nrw',
        lines: 1,
        discharge: DEFAULT_DISCHARGE,
        mode: 'closed',
        pumpType: DEFAULT_PUMP.id,
        reservePer100: 1,
        pumps: [],
        view: null,
    }
}

/** Whether a source is a hydrant. */
export function isHydrant(kind: SourceKind): kind is 'hydrant-underground' | 'hydrant-pillar' {
    return kind === 'hydrant-underground' || kind === 'hydrant-pillar'
}

/** The source as the calculation sees it. */
export function calculationSource(plan: Plan): Source {
    const source = plan.source
    if (isHydrant(source.kind)) return {kind: 'hydrant', pressure: source.pressure, yield: source.yield}
    if (source.kind === 'tank') return {kind: 'tank'}
    return {kind: 'open-water', suctionLift: source.suctionLift}
}

/** The pumps ordered from the source, the first standing at the source unless a hydrant feeds it. */
export function orderedPumps(plan: Plan): PlanPump[] {
    const pumps = [...plan.pumps].sort((a, b) => a.at - b.at)
    if (pumps.length && !isHydrant(plan.source.kind)) pumps[0] = {...pumps[0]!, at: 0}
    return pumps
}

/**
 * The input of the calculation for a plan along its profile. The plan is read through `readPlan`
 * first, so a field left empty or out of range while editing never reaches the calculation.
 */
export function lineInput(edited: Plan, profile: Profile): LineInput {
    const plan = readPlan(edited) ?? emptyPlan()
    return {
        profile,
        flow: plan.flow,
        table: FRICTION_TABLES[plan.table],
        lines: plan.lines,
        discharge: plan.discharge,
        mode: plan.mode,
        endRequirement: plan.end.requirement,
        source: calculationSource(plan),
        reservePer100: plan.reservePer100,
        stations: orderedPumps(plan).map(pump => ({
            at: pump.at,
            pump: pumpType(pump.type),
            ...(pump.discharge === null ? {} : {discharge: pump.discharge}),
            ...(pump.mode === null ? {} : {mode: pump.mode}),
        })),
    }
}

/** A new pump id. */
export function pumpId(): string {
    return Math.random().toString(36).slice(2, 10)
}

const SOURCE_KINDS: readonly SourceKind[] = ['open-water', 'hydrant-underground', 'hydrant-pillar', 'tank']
const END_PRESETS: readonly EndPreset[] = ['multiPurpose', 'hollowJet', 'freeOutflow', 'custom']
const MAX_VERTICES = 500
const MAX_PUMPS = 200
const MAX_PRESSURE = 20
const MIN_DISCHARGE = 1
const MAX_FLOW = 10_000
const MIN_HEIGHT = -500
const MAX_HEIGHT = 9000

function finite(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function oneOf<T>(value: unknown, options: readonly T[], fallback: T): T {
    return options.includes(value as T) ? value as T : fallback
}

function position(value: unknown): LatLng | null {
    if (!Array.isArray(value) || value.length !== 2) return null
    const [latitude, longitude] = value
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
    return [latitude, longitude]
}

function record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/**
 * A plan read from storage or a shared link, with every field checked: anything missing or
 * malformed falls back to the default, numbers are kept within sensible bounds, and unknown
 * fields are dropped. Returns null for something that is not a plan at all.
 */
export function readPlan(raw: unknown): Plan | null {
    const data = record(raw)
    if (data.version !== 1) return null
    const defaults = emptyPlan()
    const rawCorrections = Array.isArray(data.corrections) ? data.corrections : []
    const vertices = (Array.isArray(data.route) ? data.route : []).slice(0, MAX_VERTICES)
        .map((point, index) => {
            const correction = rawCorrections[index]
            return {
                point: position(point),
                correction: typeof correction === 'number' && Number.isFinite(correction)
                    ? finite(correction, 0, MIN_HEIGHT, MAX_HEIGHT) : null,
            }
        })
        .filter((vertex): vertex is {point: LatLng, correction: number | null} => vertex.point !== null)
    const route = vertices.map(vertex => vertex.point)
    const corrections = vertices.map(vertex => vertex.correction)
    const seen = new Set<string>()
    const source = record(data.source)
    const end = record(data.end)
    const view = record(data.view)
    const center = position(view.center)
    const pumps = (Array.isArray(data.pumps) ? data.pumps : []).slice(0, MAX_PUMPS).map(record)
        .map((pump): PlanPump => {
            const wanted = typeof pump.id === 'string' && pump.id.length <= 40 ? pump.id : ''
            const id = wanted && !seen.has(wanted) ? wanted : pumpId()
            seen.add(id)
            return {
                id,
                at: finite(pump.at, 0, 0, 1_000_000),
                type: pumpType(typeof pump.type === 'string' ? pump.type : '').id,
                discharge: pump.discharge === null || pump.discharge === undefined
                    ? null : finite(pump.discharge, DEFAULT_DISCHARGE, MIN_DISCHARGE, MAX_PRESSURE),
                mode: pump.mode === null || pump.mode === undefined ? null : oneOf<RelayMode>(pump.mode, ['closed', 'open'], 'closed'),
            }
        })
    const preset = oneOf(end.preset, END_PRESETS, defaults.end.preset)
    return {
        version: 1,
        title: typeof data.title === 'string' ? data.title.slice(0, 120) : '',
        route,
        corrections,
        source: {
            kind: oneOf(source.kind, SOURCE_KINDS, defaults.source.kind),
            suctionLift: finite(source.suctionLift, defaults.source.suctionLift, 0, MAX_PRESSURE),
            pressure: finite(source.pressure, defaults.source.pressure, 0, MAX_PRESSURE),
            yield: finite(source.yield, defaults.source.yield, 0, MAX_FLOW),
        },
        end: {
            preset,
            requirement: preset === 'custom'
                ? finite(end.requirement, defaults.end.requirement, 0, MAX_PRESSURE)
                : END_REQUIREMENTS[preset],
        },
        flow: finite(data.flow, defaults.flow, 0, MAX_FLOW),
        table: oneOf(data.table, Object.keys(FRICTION_TABLES) as FrictionTableId[], defaults.table),
        lines: data.lines === 2 ? 2 : 1,
        discharge: finite(data.discharge, defaults.discharge, MIN_DISCHARGE, MAX_PRESSURE),
        mode: oneOf<RelayMode>(data.mode, ['closed', 'open'], defaults.mode),
        pumpType: pumpType(typeof data.pumpType === 'string' ? data.pumpType : '').id,
        reservePer100: finite(data.reservePer100, defaults.reservePer100, 0, 10),
        pumps,
        view: center ? {center, zoom: finite(view.zoom, 14, 10, 21)} : null,
    }
}
