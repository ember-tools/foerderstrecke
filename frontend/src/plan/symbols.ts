import {markSymbol, type MarkKind, unitSymbol} from '@emberbox/ui'
import type {PumpType} from '../hydraulics/pumps'
import type {Plan, SourceKind} from './model'

const SOURCE_MARKS: Record<SourceKind, MarkKind> = {
    'open-water': 'open-water',
    'hydrant-underground': 'hydrant-underground',
    'hydrant-pillar': 'hydrant-pillar',
    'tank': 'water-tank',
}

/** The tactical mark of the line's source. */
export function sourceSymbol(plan: Plan): string {
    return markSymbol(SOURCE_MARKS[plan.source.kind])
}

/** The tactical mark of the line's end: a dividing breeching, or a tank for free outflow. */
export function endSymbol(plan: Plan): string {
    return markSymbol(plan.end.preset === 'freeOutflow' ? 'water-tank' : 'dividing-breeching')
}

/** Whether a pump type is a portable pump rather than one built into a vehicle. */
export function isPortable(type: PumpType): boolean {
    return type.id.startsWith('pfpn')
}

/**
 * The tactical symbol of a pump: a portable pump as a trailer marked TS, any other as a vehicle
 * marked with its nominal pressure and flow.
 */
export function pumpSymbol(type: PumpType): string {
    return isPortable(type)
        ? unitSymbol({shape: 'trailer', organisation: 'fire', text: 'TS'})
        : unitSymbol({shape: 'vehicle', organisation: 'fire', text: `${type.nominalPressure}/${type.nominalFlow}`})
}
