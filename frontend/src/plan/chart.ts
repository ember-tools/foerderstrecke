import {pressureAt, type LineResult, type SectionResult} from '../hydraulics/line'
import {allSections} from './sections'
import {type Profile, samplesBetween} from '../hydraulics/profile'

/** Round axis ticks covering `min` to `max`, about `count` of them, at 1, 2 or 5 times a power of ten. */
export function niceTicks(min: number, max: number, count: number): number[] {
    if (!(max > min)) return [min]
    const raw = (max - min) / Math.max(1, count)
    const power = 10 ** Math.floor(Math.log10(raw))
    const step = [1, 2, 5, 10].map(factor => factor * power).find(candidate => candidate >= raw)!
    const ticks: number[] = []
    for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
        ticks.push(Math.round(value / step) * step)
    }
    return ticks
}

/** A section's pressure along its length, as (distance, pressure) points through every sample. */
export function pressureCurve(profile: Profile, section: SectionResult, lossPer100: number): [number, number][] {
    const points = [section.start, ...samplesBetween(profile, section.start, section.end)]
    if (points.at(-1) !== section.end) points.push(section.end)
    return points.map(at => [at, pressureAt(profile, section.start, section.startPressure, lossPer100, at)])
}

/** The pressure at a distance along a calculated line, from the section holding it. */
export function pressureOnLine(profile: Profile, result: LineResult, at: number): {pressure: number, section: SectionResult} | null {
    const sections = allSections(result).map(entry => entry.section).filter(section => section.length > 0)
    const section = sections.find(candidate => at >= candidate.start && at <= candidate.end)
    return section ? {pressure: pressureAt(profile, section.start, section.startPressure, result.lossPer100, at), section} : null
}
