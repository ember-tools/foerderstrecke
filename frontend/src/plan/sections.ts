import type {LineResult, SectionResult} from '../hydraulics/line'
import {t} from '../i18n'

/** A section with its name and its hoses, as the result lists it. */
export interface NamedSection {
    section: SectionResult
    /** "P1 → P2", "P3 → Abgabe", or the intake from the hydrant. */
    name: string
    hoses: number
    intake: boolean
}

/** The name of a pump station by its number from the source, or of the line's end. */
export function stationName(number: number | null): string {
    return number === null ? t('planner.result.end') : `P${number}`
}

/** Every section from the source on, the intake first when there is one, with its hoses. */
export function allSections(result: LineResult): {section: SectionResult, hoses: number, intake: boolean}[] {
    const sections = [
        ...(result.intake ? [{section: result.intake, intake: true}] : []),
        ...result.sections.map(section => ({section, intake: false})),
    ]
    return sections.map((entry, index) => ({...entry, hoses: result.hoses.sections[index] ?? 0}))
}

/**
 * The sections to list: all with a length, and an intake without length only when it fails,
 * which is when the hydrant itself is too weak.
 */
export function namedSections(result: LineResult): NamedSection[] {
    let pump = 0
    return allSections(result).flatMap(entry => {
        if (entry.intake) {
            return entry.section.length > 0 || !entry.section.holds
                ? [{...entry, name: t('planner.result.intake')}]
                : []
        }
        pump++
        const next = pump < result.sections.length ? pump + 1 : null
        return [{...entry, name: `${stationName(pump)} → ${stationName(next)}`}]
    })
}
