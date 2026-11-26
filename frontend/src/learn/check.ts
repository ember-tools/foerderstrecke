import type {Question, TaskSolution} from './task'

/** The solution's value for a question as the solution shows it, null where the task has none. */
export function expected(question: Question, solution: TaskSolution): number | null {
    switch (question) {
        case 'needed':
            return solution.textbook.needed
        case 'pumps':
            return solution.textbook.pumps
        case 'spacing':
            return solution.textbook.boosterSpacing?.hoses ?? null
        case 'hoses':
            return solution.hoses
        case 'discharge':
            return solution.discharge
    }
}

/**
 * The answers accepted for a question, as the lowest and highest value. Counts of pumps and hoses
 * must be exact. Pressures and distances get room, because the teaching material rounds its
 * intermediate values, but only on the safe side where it matters: a spacing may be rounded down
 * by up to one hose but never be longer than the exact spacing, and a discharge pressure may be
 * rounded up by up to half a bar and lie at most 0.1 bar below what is needed.
 */
export function accepted(question: Question, solution: TaskSolution): [number, number] | null {
    const value = expected(question, solution)
    if (value === null) return null
    switch (question) {
        case 'needed':
            return [value - 0.3, value + 0.3]
        case 'spacing':
            return [value - 20, solution.textbook.boosterSpacing!.exact]
        case 'discharge':
            return [value - 0.1, value + 0.5]
        default:
            return [value, value]
    }
}

/** The outcome of one answer. */
export interface Verdict {
    question: Question
    answer: number | null
    expected: number | null
    correct: boolean
}

/** Check the answers to the asked questions; a missing answer counts as wrong. */
export function checkAnswers(
    asked: readonly Question[], solution: TaskSolution, answers: Partial<Record<Question, number | null>>,
): Verdict[] {
    return asked.map(question => {
        const answer = answers[question] ?? null
        const range = accepted(question, solution)
        const correct = answer !== null && range !== null && answer >= range[0] - 1e-9 && answer <= range[1] + 1e-9
        return {question, answer, expected: expected(question, solution), correct}
    })
}
