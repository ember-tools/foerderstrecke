import {FRICTION_TABLES} from '../hydraulics/friction'
import {t} from '../i18n'
import {formatBar, formatDistance, formatHeight, formatWhole} from '../plan/format'
import {type Stretch, type Task, taskLine, taskPump} from './task'

/** One line of what a task gives: a label and its value. */
export interface GivenEntry {
    label: string
    value: string
}

/** What a task gives, as labelled entries in the order the teaching material states them. */
export function givenEntries(current: Task): GivenEntry[] {
    const length = taskLine(current).length
    const entries: GivenEntry[] = []
    entries.push({label: t('learn.task.length'), value: formatDistance(length)})
    if (current.stretches.length > 1 || current.stretches[0]!.rise !== 0) {
        entries.push({label: t('learn.task.stretches'), value: current.stretches.map(stretchText).join('; ')})
    }
    entries.push({label: t('learn.task.flow'), value: t('units.flow', {flow: formatWhole(current.flow)})})
    const size = FRICTION_TABLES[current.table].hose
    entries.push({
        label: t('learn.task.hose'),
        value: t(current.lines === 2 ? 'learn.task.hoseDouble' : 'learn.task.hoseSingle', {size}),
    })
    entries.push({label: t('learn.task.table'), value: t(`planner.tables.${current.table}`)})
    entries.push({label: t('learn.task.pump'), value: taskPump(current, current.firstDischarges.length).name})
    if (current.firstDischarges.length) {
        entries.push({
            label: t('learn.task.firstDischarges'),
            value: current.firstDischarges.map((pressure, index) => `${formatBar(pressure)} (${taskPump(current, index).name})`).join(', '),
        })
    }
    if (!current.asked.includes('discharge')) {
        entries.push({
            label: t(current.firstDischarges.length ? 'learn.task.dischargeRest' : 'learn.task.discharge'),
            value: formatBar(current.discharge),
        })
    }
    entries.push({label: t('learn.task.endRequirement'), value: formatBar(current.endRequirement)})
    if (current.givenPumps !== null) entries.push({label: t('learn.task.givenPumps'), value: String(current.givenPumps)})
    return entries
}

/** A stretch in words: its length and whether it rises, falls or runs level. */
function stretchText(stretch: Stretch): string {
    const length = formatDistance(stretch.length)
    if (stretch.rise === 0) return t('learn.task.stretchFlat', {length})
    const key = stretch.rise > 0 ? 'learn.task.stretchUp' : 'learn.task.stretchDown'
    return t(key, {length, rise: formatHeight(Math.abs(stretch.rise))})
}
