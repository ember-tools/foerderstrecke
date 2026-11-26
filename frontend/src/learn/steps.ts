import {HOSE_LENGTH} from '../hydraulics/line'
import {MIN_INLET} from '../hydraulics/pumps'
import {t} from '../i18n'
import {formatBar, formatDistance, formatWhole} from '../plan/format'
import {type Question, type Task, taskLine, type TaskSolution} from './task'

/** One step of a worked solution: what is worked out, and the arithmetic. */
export interface SolutionStep {
    title: string
    working: string
    /** The question this step answers, if it answers one. */
    answers: Question | null
}

const number = new Intl.NumberFormat('de-DE', {maximumFractionDigits: 2})

/** A plain number with German decimals, up to two places. */
function plain(value: number): string {
    return number.format(value)
}

/**
 * The worked solution of a task, step by step with the formulas of the hydraulics documentation:
 * friction from the table, the height, the end requirement, their sum, the pumps from the pressure
 * budget, the booster spacing, the hoses, and for a given number of pumps their discharge pressure.
 */
export function solutionSteps(task: Task, solution: TaskSolution): SolutionStep[] {
    const {length, rise} = taskLine(task)
    const {textbook, lossPer100} = solution
    const steps: SolutionStep[] = []
    const perLine = task.flow / task.lines
    steps.push({
        title: t('learn.steps.loss'),
        working: task.lines === 2
            ? t('learn.steps.lossDouble', {flow: formatWhole(task.flow), perLine: formatWhole(perLine), table: t(`planner.tables.${task.table}`), loss: formatBar(lossPer100)})
            : t('learn.steps.lossSingle', {flow: formatWhole(task.flow), table: t(`planner.tables.${task.table}`), loss: formatBar(lossPer100)}),
        answers: null,
    })
    steps.push({
        title: t('learn.steps.friction'),
        working: `${plain(lossPer100)} bar × ${plain(length)} m / 100 m = ${formatBar(textbook.friction)}`,
        answers: null,
    })
    steps.push({
        title: t('learn.steps.height'),
        working: `${plain(rise)} m / 10 m = ${formatBar(textbook.height)}`,
        answers: null,
    })
    steps.push({
        title: t('learn.steps.needed'),
        working: `${formatBar(textbook.friction)} + ${formatBar(textbook.height)} + ${formatBar(task.endRequirement)} = ${formatBar(textbook.needed)}`,
        answers: 'needed',
    })
    if (task.givenPumps === null) {
        steps.push(pumpStep(task, solution))
    } else {
        steps.push({
            title: t('learn.steps.discharge'),
            working: t('learn.steps.dischargeWorking', {
                needed: formatBar(textbook.needed), pumps: task.givenPumps, inlet: formatBar(MIN_INLET),
                result: formatBar(solution.discharge!),
            }),
            answers: 'discharge',
        })
    }
    if (task.asked.includes('spacing') && textbook.boosterSpacing) {
        const height = textbook.heightPer100
        steps.push({
            title: t('learn.steps.spacing'),
            working: `(${formatBar(task.discharge)} − ${formatBar(MIN_INLET)}) / (${plain(lossPer100)} ${height < 0 ? '−' : '+'} ${plain(Math.abs(height))}) bar × 100 m = ${formatDistance(textbook.boosterSpacing.exact)} → ${t('learn.steps.wholeHoses', {distance: formatDistance(textbook.boosterSpacing.hoses), count: textbook.boosterSpacing.hoses / HOSE_LENGTH})}`,
            answers: 'spacing',
        })
    } else if (task.asked.includes('spacing') && textbook.pumps !== null) {
        steps.push({title: t('learn.steps.spacing'), working: t('learn.steps.noBoosterNeeded'), answers: 'spacing'})
    }
    steps.push({
        title: t('learn.steps.hoses'),
        working: t(task.lines === 2 ? 'learn.steps.hosesDouble' : 'learn.steps.hosesSingle', {
            length: formatWhole(length), forLength: solution.hosesForLength, reserve: solution.reserve, total: solution.hoses,
        }),
        answers: 'hoses',
    })
    return steps
}

/** The step that counts the pumps from the pressure budget. */
function pumpStep(task: Task, solution: TaskSolution): SolutionStep {
    const {textbook} = solution
    if (textbook.endUnreachable) {
        return {title: t('learn.steps.pumps'), working: t('learn.steps.endUnreachable'), answers: 'pumps'}
    }
    if (task.firstDischarges.length) {
        const pressures = Array.from({length: textbook.pumps ?? 1}, (_, index) => task.firstDischarges[index] ?? task.discharge)
        const parts = pressures.map((pressure, index) => index === 0 ? formatBar(pressure) : `(${formatBar(pressure)} − ${formatBar(MIN_INLET)})`)
        const covered = pressures.reduce((sum, pressure, index) => sum + (index === 0 ? pressure : pressure - MIN_INLET), 0)
        return {
            title: t('learn.steps.pumps'),
            working: `${parts.join(' + ')} = ${formatBar(covered)} ≥ ${formatBar(textbook.needed)} → ${t('learn.steps.pumpCount', {count: textbook.pumps ?? 0})}`,
            answers: 'pumps',
        }
    }
    const gain = task.discharge - MIN_INLET
    const missing = Math.max(0, textbook.needed - task.discharge)
    return {
        title: t('learn.steps.pumps'),
        working: t('learn.steps.pumpsWorking', {
            needed: formatBar(textbook.needed), discharge: formatBar(task.discharge), missing: formatBar(missing),
            gain: formatBar(gain), boosters: Math.max(0, (textbook.pumps ?? 1) - 1), count: textbook.pumps ?? 0,
        }),
        answers: 'pumps',
    }
}
