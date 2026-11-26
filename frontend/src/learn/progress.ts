import {ref} from 'vue'
import {FRICTION_TABLES, type FrictionTableId} from '../hydraulics/friction'
import {readTask} from './shared'
import type {Task} from './task'
import {type Stage, STAGES} from './tasks'

const STORAGE_KEY = 'foerderstrecke.learning'
const MAX_REMEMBERED = 1000

/** What the learning part keeps in this browser: the current task and which tasks were solved. */
export interface LearningState {
    stage: Stage
    table: FrictionTableId
    /** The current task: a fixed task's id, the seed of a random one of `stage`, or a shared task. */
    current: {fixed: string} | {seed: number} | {shared: Task}
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
        current: readCurrent(current) ?? fallback.current,
        tried: strings(data.tried),
        solved: strings(data.solved),
    }
}

function readCurrent(current: Record<string, unknown> | undefined): LearningState['current'] | null {
    if (typeof current?.fixed === 'string') return {fixed: current.fixed}
    if (typeof current?.seed === 'number' && Number.isInteger(current.seed)) return {seed: current.seed}
    const shared = current?.shared as Record<string, unknown> | undefined
    if (typeof shared?.id === 'string' && shared.id.startsWith('shared:')) {
        const task = readTask(shared, shared.id.slice('shared:'.length))
        return task ? {shared: task} : null
    }
    return null
}

/** What this browser keeps, or null when it keeps nothing yet or cannot be read. */
function stored(): unknown {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    } catch {
        return null
    }
}

/** Keep the learning state in this browser and tell whether that worked. */
function store(state: LearningState): boolean {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
        return true
    } catch {
        return false
    }
}

/**
 * Make a shared task the current one, so the learning part opens with it; false when the browser
 * keeps nothing.
 */
export function openSharedTask(task: Task): boolean {
    return store({...read(stored()), current: {shared: task}})
}

/**
 * The learning state, kept in this browser only; nothing about who solved what leaves it. A first
 * visit stores its task at once, so a reload shows the same one. Storage that is blocked or full
 * keeps the state for the page's lifetime.
 */
export function useLearningState() {
    const kept = stored()
    const state = ref<LearningState>(read(kept))

    function save() {
        store(state.value)
    }

    if (kept === null) save()

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
