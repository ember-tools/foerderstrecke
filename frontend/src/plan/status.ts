import type {SectionResult} from '../hydraulics/line'

/**
 * How a section stands: it holds, or it fails. The line's discharge pressure already carries the
 * reserve (8 bar by default), so a section that arrives with exactly what it needs is fine.
 */
export type SectionStatus = 'ok' | 'fails'

/** How a section stands, see `SectionStatus`. */
export function sectionStatus(section: SectionResult): SectionStatus {
    return section.holds ? 'ok' : 'fails'
}
