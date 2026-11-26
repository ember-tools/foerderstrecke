import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {emptyPlan} from '../plan/model'
import {forgetShare, ownShares, rememberShare} from '../share/own'
import {openSharedTask, useLearningState} from './progress'
import {joinStretches, planAsTask, readTask} from './shared'
import {solveTask} from './task'
import {FIXED_TASKS, generateTask} from './tasks'

describe('shared tasks', () => {
    it('read back as they were shared, under the link\'s id', () => {
        for (const task of [...FIXED_TASKS, generateTask('discharge', 5), generateTask('double', 9)]) {
            expect(readTask(JSON.parse(JSON.stringify(task)), 'abc')).toEqual({...task, id: 'shared:abc'})
        }
    })

    it('refuse anything incomplete or out of range', () => {
        const task = FIXED_TASKS[0]!
        for (const broken of [null, [], {...task, stretches: []}, {...task, flow: -1}, {...task, table: 'x'},
            {...task, asked: []}, {...task, stretches: [{length: 'x', rise: 0}]}, {...task, asked: ['discharge']}]) {
            expect(readTask(broken, 'abc')).toBeNull()
        }
    })

    it('drop unknown questions and fields', () => {
        const read = readTask({...FIXED_TASKS[0]!, asked: ['pumps', 'everything'], extra: 1}, 'abc')!
        expect(read.asked).toEqual(['pumps'])
        expect(read).not.toHaveProperty('extra')
    })
})

describe('joining stretches', () => {
    it('joins segments that keep rising, falling or running level', () => {
        expect(joinStretches([
            {length: 100, rise: 5}, {length: 200, rise: 10}, {length: 50, rise: 0}, {length: 50, rise: 0},
            {length: 300, rise: -7}, {length: 100, rise: 2},
        ])).toEqual([{length: 300, rise: 15}, {length: 100, rise: 0}, {length: 300, rise: -7}, {length: 100, rise: 2}])
    })

    it('keeps length and net rise in one stretch when the slopes are too many', () => {
        const segments = Array.from({length: 120}, (_, index) => ({length: 20, rise: index % 2 ? -1 : 2}))
        expect(joinStretches(segments)).toEqual([{length: 2400, rise: 60}])
    })
})

describe('a planned line as a task', () => {
    it('takes one stretch per segment with the profile\'s rise', () => {
        const plan = {
            ...emptyPlan(),
            title: 'Übung Nordhang',
            route: [[52.5, 13.4], [52.5, 13.41], [52.51, 13.41]] as [number, number][],
            corrections: [null, null, null],
            flow: 1000,
            end: {preset: 'custom' as const, requirement: 4.5},
        }
        const profile = {samples: [[0, 100], [677, 130], [1789, 110]] as [number, number][]}
        const task = planAsTask(plan, profile)
        expect(task.source).toBe('Übung Nordhang')
        expect(task.stretches.map(stretch => stretch.rise)).toEqual([30, -20])
        expect(task.flow).toBe(1000)
        expect(task.endRequirement).toBe(4.5)
        expect(task.asked).toEqual(['needed', 'pumps', 'hoses'])
        expect(solveTask(task).textbook.pumps).not.toBeNull()
    })
})

describe('kept in this browser', () => {
    let kept: Map<string, string>

    beforeEach(() => {
        kept = new Map()
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => kept.get(key) ?? null,
            setItem: (key: string, value: string) => void kept.set(key, value),
        })
    })

    afterEach(() => vi.unstubAllGlobals())

    it('opens a shared task as the current one and reads it back', () => {
        const task = readTask(FIXED_TASKS[1], 'xyz')!
        expect(openSharedTask(task)).toBe(true)
        expect(useLearningState().state.value.current).toEqual({shared: task})
    })

    it('falls back to a random task when a stored shared task was tampered with', () => {
        kept.set('foerderstrecke.learning', JSON.stringify({current: {shared: {...FIXED_TASKS[1], id: 'shared:xyz', flow: -3}}}))
        expect(useLearningState().state.value.current).toHaveProperty('seed')
    })

    it('remembers own links newest first and forgets deleted ones', () => {
        const link = (token: string) => ({token, deleteToken: `${token}-delete`, kind: 'plan' as const, title: '', created: '2026-11-26T12:00:00Z'})
        rememberShare(link('a'))
        rememberShare(link('b'))
        rememberShare(link('a'))
        expect(ownShares().map(entry => entry.token)).toEqual(['a', 'b'])
        forgetShare('a')
        expect(ownShares().map(entry => entry.token)).toEqual(['b'])
        kept.set('foerderstrecke.shares', JSON.stringify([{token: 1}, link('c')]))
        expect(ownShares().map(entry => entry.token)).toEqual(['c'])
    })
})
