import {ref} from 'vue'
import {FRICTION_TABLES, type FrictionTableId} from '../hydraulics/friction'
import {type Stage, STAGES} from './tasks'

const STORAGE_KEY = 'foerderstrecke.learning'
const MAX_REMEMBERED = 1000

/** What the learning part keeps in this browser: the current task and which tasks were solved. */
export interface LearningState {
    stage: Stage
    table: FrictionTableId
    /** The current task: a fixed task's id, or the seed of a random one of `stage`. */
    current: {fixed: string} | {seed: number}
    tried: string[]
    solved: string[]
}

/** A new random seed. */
export function newSeed(): number {
    return Math.floor(Math.random() * 2 ** 31)
}

function initial(): LearningState {
    return {stage: 'flat', table: 'b-berlin-nrw', current: {seed: newSeed()}, tried: [], solved: []}
}

function read(raw: unknown): LearningState {
    const fallback = initial()
    if (typeof raw !== 'object' || raw === null) return fallback
    const data = raw as Record<string, unknown>
    const strings = (value: unknown) => Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string').slice(-MAX_REMEMBERED)
        : []
    const current = data.current as Record<string, unknown> | undefined
    return {
        stage: (STAGES as readonly unknown[]).includes(data.stage) ? data.stage as Stage : fallback.stage,
        table: Object.keys(FRICTION_TABLES).includes(data.table as string) ? data.table as FrictionTableId : fallback.table,
        current: typeof current?.fixed === 'string'
            ? {fixed: current.fixed}
            : typeof current?.seed === 'number' && Number.isInteger(current.seed) ? {seed: current.seed} : fallback.current,
        tried: strings(data.tried),
        solved: strings(data.solved),
    }
}

/**
 * The learning state, kept in this browser only; nothing about who solved what leaves it. A first
 * visit stores its task at once, so a reload shows the same one. Storage that is blocked or full
 * keeps the state for the page's lifetime.
 */
export function useLearningState() {
    let stored: unknown = null
    try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    } catch {
        stored = null
    }
    const state = ref<LearningState>(read(stored))

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
        } catch {
            return
        }
    }

    if (stored === null) save()

    /** Record an attempt at a task and whether every answer was right. */
    function record(id: string, solved: boolean) {
        const add = (list: string[]) => list.includes(id) ? list : [...list, id].slice(-MAX_REMEMBERED)
        state.value.tried = add(state.value.tried)
        if (solved) state.value.solved = add(state.value.solved)
        save()
    }

    /** Forget which tasks were tried and solved. */
    function resetProgress() {
        state.value.tried = []
        state.value.solved = []
        save()
    }

    return {state, save, record, resetProgress}
}
