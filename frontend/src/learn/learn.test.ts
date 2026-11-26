import {describe, expect, it} from 'vitest'
import {calculateLine} from '../hydraulics/line'
import {routeLength, vertexDistances} from '../plan/geo'
import {correctedProfile} from '../plan/heights'
import {lineInput} from '../plan/model'
import {accepted, checkAnswers} from './check'
import {taskAsPlan} from './planner'
import {solutionSteps} from './steps'
import {solveTask, taskLine, taskPump} from './task'
import {FIXED_TASKS, generateTask, random, STAGES} from './tasks'

function fixed(id: string) {
    return FIXED_TASKS.find(task => task.id === id)!
}

describe('fixed tasks', () => {
    it('give the results of the teaching material', () => {
        expect(solveTask(fixed('fixed:cgdis-short')).textbook.pumps).toBe(2)
        expect(solveTask(fixed('fixed:wup-long')).textbook.pumps).toBe(11)
        expect(solveTask(fixed('fixed:wup-long')).textbook.needed).toBeCloseTo(72.7, 10)
        expect(solveTask(fixed('fixed:wup-spacing')).textbook.boosterSpacing?.hoses).toBe(460)
        expect(solveTask(fixed('fixed:cgdis-mixed')).textbook.pumps).toBe(4)
        expect(solveTask(fixed('fixed:cgdis-mixed')).textbook.needed).toBeCloseTo(34.72, 10)
        expect(['2.1', '2.2', '2.3'].map(name => solveTask(fixed(`fixed:cgdis-${name}`)).textbook.pumps)).toEqual([5, 7, 5])
    })

    it('count hoses per started 20 m with a reserve per started 100 m', () => {
        const solution = solveTask(fixed('fixed:cgdis-short'))
        expect(solution.hosesForLength).toBe(32)
        expect(solution.reserve).toBe(7)
        expect(solution.hoses).toBe(39)
    })
})

describe('generated tasks', () => {
    it('are the same for the same seed', () => {
        expect(generateTask('uphill', 42)).toEqual(generateTask('uphill', 42))
        expect(random(7)()).toBe(random(7)())
    })

    it('stay solvable and within twelve pumps in every stage', () => {
        for (const stage of STAGES) {
            for (let seed = 1; seed <= 200; seed++) {
                const task = generateTask(stage, seed)
                const solution = solveTask(task)
                if (stage === 'discharge') {
                    expect(solution.discharge).not.toBeNull()
                    expect(solution.discharge!).toBeLessThanOrEqual(10)
                    expect(solution.discharge!).toBeGreaterThanOrEqual(task.endRequirement)
                } else {
                    expect(solution.textbook.pumps).not.toBeNull()
                    expect(solution.textbook.pumps!).toBeLessThanOrEqual(12)
                }
                for (const question of task.asked) {
                    expect(accepted(question, solution), `${stage} ${seed} ${question}`).not.toBeNull()
                }
            }
        }
    })

    it('match their stage', () => {
        expect(taskLine(generateTask('flat', 3)).rise).toBe(0)
        expect(taskLine(generateTask('uphill', 3)).rise).toBeGreaterThan(0)
        expect(taskLine(generateTask('downhill', 3)).rise).toBeLessThan(0)
        expect(generateTask('mixed', 3).stretches).toHaveLength(2)
        expect(generateTask('double', 3).lines).toBe(2)
        expect(generateTask('discharge', 3).givenPumps).not.toBeNull()
    })

    it('stay within what one pump type on offer carries', () => {
        for (const table of ['b-berlin-nrw', 'b-hessen', 'a'] as const) {
            for (let seed = 1; seed <= 50; seed++) {
                const task = generateTask('double', seed, table)
                expect(task.flow).toBeLessThanOrEqual(2000)
                expect(taskPump(task).nominalFlow).toBeGreaterThanOrEqual(task.flow)
            }
        }
    })

    it('tell the same seed under two tables apart', () => {
        expect(generateTask('flat', 4, 'b-hessen').id).not.toBe(generateTask('flat', 4).id)
    })

    it('ask the spacing only where the stage asks it, and show it only then', () => {
        const task = generateTask('discharge', 8)
        expect(solutionSteps(task, solveTask(task)).some(step => step.answers === 'spacing')).toBe(false)
    })

    it('use only flows the chosen table has a value for', () => {
        for (let seed = 1; seed <= 50; seed++) {
            const task = generateTask('uphill', seed, 'b-hessen')
            expect([400, 600, 800, 1000, 1200]).toContain(task.flow)
        }
    })
})

describe('checking', () => {
    const solution = solveTask(fixed('fixed:wup-long'))

    it('wants counts exact', () => {
        expect(checkAnswers(['pumps', 'hoses'], solution, {pumps: 11, hoses: solution.hoses}).every(v => v.correct)).toBe(true)
        expect(checkAnswers(['pumps'], solution, {pumps: 12})[0]!.correct).toBe(false)
    })

    it('allows rounding in pressures', () => {
        expect(checkAnswers(['needed'], solution, {needed: 72.5})[0]!.correct).toBe(true)
        expect(checkAnswers(['needed'], solution, {needed: 72})[0]!.correct).toBe(false)
    })

    it('takes a spacing rounded down by one hose, never one longer than exact', () => {
        expect(checkAnswers(['spacing'], solution, {spacing: 340})[0]!.correct).toBe(true)
        expect(checkAnswers(['spacing'], solution, {spacing: 345})[0]!.correct).toBe(true)
        expect(checkAnswers(['spacing'], solution, {spacing: 320})[0]!.correct).toBe(true)
        expect(checkAnswers(['spacing'], solution, {spacing: 300})[0]!.correct).toBe(false)
        expect(checkAnswers(['spacing'], solution, {spacing: 360})[0]!.correct).toBe(false)
    })

    it('takes a discharge pressure rounded up, not one clearly below what is needed', () => {
        const task = {...fixed('fixed:cgdis-short'), givenPumps: 3, asked: ['discharge' as const]}
        const given = solveTask(task)
        expect(given.discharge).toBeCloseTo((18.38 + 2 * 1.5) / 3, 10)
        expect(checkAnswers(['discharge'], given, {discharge: 7.5})[0]!.correct).toBe(true)
        expect(checkAnswers(['discharge'], given, {discharge: 7})[0]!.correct).toBe(false)
    })

    it('counts a missing answer as wrong', () => {
        expect(checkAnswers(['pumps'], solution, {})[0]).toEqual({question: 'pumps', answer: null, expected: 11, correct: false})
    })
})

describe('solution steps', () => {
    it('work every asked question out', () => {
        for (const task of [...FIXED_TASKS, ...STAGES.map(stage => generateTask(stage, 11))]) {
            const steps = solutionSteps(task, solveTask(task))
            for (const question of task.asked) {
                expect(steps.some(step => step.answers === question), `${task.id} ${question}`).toBe(true)
            }
            expect(steps.every(step => step.working.length > 0 && !step.working.includes('{'))).toBe(true)
        }
    })

    it('add the mixed pumps one by one', () => {
        const steps = solutionSteps(fixed('fixed:cgdis-mixed'), solveTask(fixed('fixed:cgdis-mixed')))
        expect(steps.find(step => step.answers === 'pumps')!.working).toContain('40,5 bar')
    })
})

describe('task in the planner', () => {
    it('becomes a straight line with the task\'s heights entered by hand and pumps that hold', () => {
        const task = fixed('fixed:cgdis-mixed')
        const plan = taskAsPlan(task)
        expect(plan.heightSource).toBe('manual')
        expect(plan.route).toHaveLength(3)
        expect(routeLength(plan.route)).toBeCloseTo(1460, 0)
        expect(plan.corrections).toEqual([0, 57, 54])
        expect(plan.end).toEqual({preset: 'custom', requirement: 4.5})
        expect(plan.pumps[1]).toMatchObject({type: 'fpn-15-1000', discharge: 15})
        expect(plan.pumps).toHaveLength(4)
        const profile = correctedProfile([], vertexDistances(plan.route), plan.corrections)
        expect(calculateLine(lineInput(plan, profile)).holds).toBe(true)
    })

    it('runs the pumps at the asked pressure for a given number of pumps, with a type that carries the flow', () => {
        const task = {...fixed('fixed:cgdis-short'), flow: 1600, givenPumps: 3, asked: ['needed' as const, 'discharge' as const]}
        const plan = taskAsPlan(task)
        expect(plan.discharge).toBeCloseTo(Math.ceil(solveTask(task).discharge! * 10) / 10, 10)
        expect(plan.pumpType).toBe('fpn-10-2000')
        expect(plan.pumps.every(pump => pump.type === 'fpn-10-2000')).toBe(true)
    })

    it('places as many pumps as the planner would suggest', () => {
        const plan = taskAsPlan(fixed('fixed:wup-long'))
        expect(plan.pumps).toHaveLength(12)
    })
})
