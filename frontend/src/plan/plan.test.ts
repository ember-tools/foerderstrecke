import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {nextTick} from 'vue'
import {calculateLine} from '../hydraulics/line'
import {heightAt} from '../hydraulics/profile'
import {niceTicks, pressureCurve, pressureOnLine} from './chart'
import {distance, pointAt, projectOnto, routeLength, segmentAt, sliceRoute, vertexDistances} from './geo'
import {correctedProfile} from './heights'
import {emptyPlan, lineInput, orderedPumps, readPlan} from './model'
import {materialFor} from './material'
import {namedSections} from './sections'
import {createPlanStore} from './store'

const ROUTE = [[52.5, 13.4], [52.5, 13.41], [52.51, 13.41]] as const

describe('geometry', () => {
    it('measures like the server: a degree of latitude is about 111 km', () => {
        expect(distance([52, 13], [53, 13])).toBeCloseTo(111_195, -1)
    })

    it('adds up the segments of a route', () => {
        const distances = vertexDistances(ROUTE)
        expect(distances[0]).toBe(0)
        expect(distances[2]).toBeCloseTo(distance(ROUTE[0], ROUTE[1]) + distance(ROUTE[1], ROUTE[2]), 6)
        expect(routeLength(ROUTE)).toBe(distances[2])
        expect(routeLength([])).toBe(0)
    })

    it('finds the position at a distance and back again', () => {
        const total = routeLength(ROUTE)
        for (const at of [0, 100, distance(ROUTE[0], ROUTE[1]), total - 50, total]) {
            expect(projectOnto(ROUTE, pointAt(ROUTE, at))).toBeCloseTo(at, 0)
        }
        expect(pointAt(ROUTE, -10)).toEqual(ROUTE[0])
        expect(pointAt(ROUTE, total + 10)).toEqual(ROUTE[2])
    })

    it('projects a position beside the route onto its nearest point', () => {
        const at = projectOnto(ROUTE, [52.5003, 13.405])
        expect(at).toBeCloseTo(distance(ROUTE[0], [52.5, 13.405]), -1)
    })
})

describe('corrected profile', () => {
    const samples = [[0, 100], [500, 110], [1000, 120]] as const

    it('keeps the model heights where nothing is corrected', () => {
        const profile = correctedProfile(samples, [0, 600, 1000], [null, null, null])
        expect(heightAt(profile, 250)).toBeCloseTo(105, 10)
        expect(heightAt(profile, 600)).toBeCloseTo(112, 10)
    })

    it('reads a corrected vertex as entered and fades the shift to the neighbours', () => {
        const profile = correctedProfile(samples, [0, 600, 1000], [null, 132, null])
        expect(heightAt(profile, 600)).toBeCloseTo(132, 10)
        expect(heightAt(profile, 300)).toBeCloseTo(106 + 10, 10)
        expect(heightAt(profile, 0)).toBeCloseTo(100, 10)
        expect(heightAt(profile, 1000)).toBeCloseTo(120, 10)
    })

    it('stands on the corrections alone without model heights', () => {
        const profile = correctedProfile([], [0, 400], [50, 90])
        expect(heightAt(profile, 0)).toBe(50)
        expect(heightAt(profile, 200)).toBe(70)
    })
})

describe('plan', () => {
    it('reads its own form back unchanged', () => {
        const plan = {...emptyPlan(), route: [[52.5, 13.4], [52.6, 13.5]] as [number, number][], corrections: [null, 40]}
        expect(readPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan)
    })

    it('refuses what is not a plan and repairs what is malformed', () => {
        expect(readPlan(null)).toBeNull()
        expect(readPlan({version: 2})).toBeNull()
        const plan = readPlan({
            version: 1, title: 7, route: [[52.5, 13.4], ['x', 1], [91, 0], [52.6, 13.5]], flow: -5, lines: 3,
            table: 'nonsense', end: {preset: 'custom', requirement: 99},
            pumps: [{at: 'x', type: 'unknown', discharge: 50, mode: 'sideways'}],
        })!
        expect(plan.title).toBe('')
        expect(plan.route).toEqual([[52.5, 13.4], [52.6, 13.5]])
        expect(plan.corrections).toEqual([null, null])
        expect(plan.flow).toBe(0)
        expect(plan.lines).toBe(1)
        expect(plan.table).toBe('b-berlin-nrw')
        expect(plan.end.requirement).toBe(20)
        expect(plan.pumps[0]).toMatchObject({at: 0, type: 'fpn-10-1000', discharge: 20, mode: 'closed'})
    })

    it('takes the end requirement from its preset', () => {
        expect(readPlan({version: 1, end: {preset: 'hollowJet', requirement: 3}})!.end.requirement).toBe(7)
    })

    it('stands the first pump at the source unless a hydrant feeds it', () => {
        const pumps = [{id: 'b', at: 400, type: 'fpn-10-1000', discharge: null, mode: null},
            {id: 'a', at: 30, type: 'fpn-10-1000', discharge: null, mode: null}]
        const open = {...emptyPlan(), pumps}
        expect(orderedPumps(open).map(pump => pump.at)).toEqual([0, 400])
        const hydrant = {...open, source: {...open.source, kind: 'hydrant-pillar' as const}}
        expect(orderedPumps(hydrant).map(pump => pump.at)).toEqual([30, 400])
    })

    it('turns into the calculation input', () => {
        const plan = {
            ...emptyPlan(),
            lines: 2 as const,
            source: {kind: 'hydrant-underground' as const, suctionLift: 0, pressure: 4, yield: 800},
            pumps: [{id: 'a', at: 0, type: 'fpn-15-1000', discharge: 12, mode: 'open' as const}],
        }
        const input = lineInput(plan, {samples: [[0, 0], [100, 0]]})
        expect(input.source).toEqual({kind: 'hydrant', pressure: 4, yield: 800})
        expect(input.lines).toBe(2)
        expect(input.table.id).toBe('b-berlin-nrw')
        expect(input.stations).toEqual([{at: 0, pump: expect.objectContaining({id: 'fpn-15-1000'}), discharge: 12, mode: 'open'}])
    })
})

describe('material', () => {
    it('counts hoses, pumps by type, breechings and the tanks of open stations', () => {
        const plan = {
            ...emptyPlan(),
            pumps: [
                {id: 'a', at: 0, type: 'fpn-10-1000', discharge: null, mode: null},
                {id: 'b', at: 300, type: 'pfpn-10-1000', discharge: null, mode: 'open' as const},
                {id: 'c', at: 600, type: 'fpn-10-1000', discharge: null, mode: null},
            ],
        }
        const result = calculateLine(lineInput(plan, {samples: [[0, 0], [900, 0]]}))
        expect(materialFor(plan, result)).toEqual({
            hose: 'B', hoses: 45 + 9, reserve: 9,
            pumps: [{name: 'FPN 10-1000', count: 2}, {name: 'PFPN 10-1000 (TS 8/8)', count: 1}],
            breechings: 1, tanks: 1,
        })
    })
})

describe('corrected profile without model heights', () => {
    it('runs straight between the entered heights and holds them beyond', () => {
        const profile = correctedProfile([], [0, 100, 200, 300, 400], [null, 300, null, 320, null])
        expect(heightAt(profile, 0)).toBe(300)
        expect(heightAt(profile, 200)).toBe(310)
        expect(heightAt(profile, 400)).toBe(320)
    })

    it('is flat at 0 m without any entered height', () => {
        expect(correctedProfile([], [0, 500], [null, null]).samples).toEqual([[0, 0], [500, 0]])
    })
})

describe('reading plans', () => {
    it('keeps every correction with its own vertex when a vertex is dropped', () => {
        const plan = readPlan({version: 1, route: [[52.5, 13.4], ['bad'], [52.6, 13.5]], corrections: [10, 20, 30]})!
        expect(plan.corrections).toEqual([10, 30])
    })

    it('gives duplicate pump ids new ones', () => {
        const pump = {id: 'same', at: 0, type: 'fpn-10-1000', discharge: null, mode: null}
        const plan = readPlan({version: 1, pumps: [pump, {...pump, at: 300}]})!
        expect(new Set(plan.pumps.map(entry => entry.id)).size).toBe(2)
        expect(plan.pumps[0]!.id).toBe('same')
    })

    it('feeds the calculation only sane numbers, whatever a field holds while edited', () => {
        const plan = {...emptyPlan(), flow: undefined as unknown as number, discharge: Number.NaN}
        const input = lineInput(plan, {samples: [[0, 0], [100, 0]]})
        expect(input.flow).toBe(emptyPlan().flow)
        expect(input.discharge).toBe(emptyPlan().discharge)
        expect(() => calculateLine(input)).not.toThrow()
    })
})

describe('route pieces', () => {
    it('cut a route between two distances through the vertices inside', () => {
        const first = distance(ROUTE[0], ROUTE[1])
        const piece = sliceRoute(ROUTE, 100, first + 100)
        expect(piece).toHaveLength(3)
        expect(piece[1]).toEqual(ROUTE[1])
        expect(sliceRoute(ROUTE, 200, 100)).toEqual([])
    })

    it('find the segment a distance lies on', () => {
        const first = distance(ROUTE[0], ROUTE[1])
        expect(segmentAt(ROUTE, 10)).toBe(0)
        expect(segmentAt(ROUTE, first + 10)).toBe(1)
        expect(segmentAt(ROUTE, routeLength(ROUTE) + 10)).toBe(1)
    })
})

describe('chart', () => {
    it('picks round ticks', () => {
        expect(niceTicks(0, 4634, 5)).toEqual([0, 1000, 2000, 3000, 4000])
        expect(niceTicks(780, 1160, 4)).toEqual([800, 900, 1000, 1100])
        expect(niceTicks(5, 5, 4)).toEqual([5])
    })

    it('reads the pressure along the line from the section holding the point', () => {
        const plan = {...emptyPlan(), pumps: [
            {id: 'a', at: 0, type: 'fpn-10-1000', discharge: null, mode: null},
            {id: 'b', at: 500, type: 'fpn-10-1000', discharge: null, mode: null},
        ]}
        const profile = {samples: [[0, 0], [900, 0]] as [number, number][]}
        const result = calculateLine(lineInput(plan, profile))
        expect(pressureOnLine(profile, result, 250)!.pressure).toBeCloseTo(8 - 2.75, 10)
        expect(pressureOnLine(profile, result, 700)!.pressure).toBeCloseTo(8 - 2.2, 10)
        expect(pressureCurve(profile, result.sections[0]!, result.lossPer100).at(-1)![1]).toBeCloseTo(2.5, 10)
    })
})

describe('sections', () => {
    it('name sections by their pumps and carry their hoses', () => {
        const plan = {...emptyPlan(), pumps: [
            {id: 'a', at: 0, type: 'fpn-10-1000', discharge: null, mode: null},
            {id: 'b', at: 500, type: 'fpn-10-1000', discharge: null, mode: null},
        ]}
        const result = calculateLine(lineInput(plan, {samples: [[0, 0], [900, 0]]}))
        expect(namedSections(result).map(entry => [entry.name, entry.hoses])).toEqual([['P1 → P2', 25], ['P2 → Abgabe', 20]])
    })

    it('list an intake only with a length or when the hydrant is too weak', () => {
        const pumps = [{id: 'a', at: 0, type: 'fpn-10-1000', discharge: null, mode: null}]
        const strong = {...emptyPlan(), pumps, source: {kind: 'hydrant-pillar' as const, suctionLift: 0, pressure: 4, yield: 1500}}
        const profile = {samples: [[0, 0], [200, 0]] as [number, number][]}
        expect(namedSections(calculateLine(lineInput(strong, profile))).map(entry => entry.intake)).toEqual([false])
        const weak = {...strong, source: {...strong.source, pressure: 1}}
        expect(namedSections(calculateLine(lineInput(weak, profile))).map(entry => entry.intake)).toEqual([true, false])
    })
})

describe('store', () => {
    const answer = {length: 1000, vertices: [0, 1000], samples: [[0, 100], [1000, 150]]}

    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(answer))))
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    function storeWith(route: [number, number][]) {
        return createPlanStore({...emptyPlan(), route, corrections: route.map(() => null)})
    }

    it('keeps corrections aligned when vertices come and go', () => {
        const store = storeWith([[52.5, 13.4], [52.5, 13.42]])
        store.plan.value.corrections[1] = 40
        store.insertVertex(0, [52.5, 13.41])
        expect(store.plan.value.corrections).toEqual([null, null, 40])
        store.removeVertex(1)
        expect(store.plan.value.corrections).toEqual([null, 40])
    })

    it('keeps pumps within the route when a vertex moves closer', () => {
        const store = storeWith([[52.5, 13.4], [52.5, 13.42]])
        store.plan.value.pumps = [{id: 'a', at: 1200, type: 'fpn-10-1000', discharge: null, mode: null}]
        store.moveVertex(1, [52.5, 13.405])
        expect(store.plan.value.pumps[0]!.at).toBeCloseTo(store.length.value, 0)
    })

    it('turns the route around with its pumps and corrections', () => {
        const store = storeWith([[52.5, 13.4], [52.5, 13.42]])
        store.plan.value.corrections = [10, 20]
        store.plan.value.pumps = [{id: 'a', at: 300, type: 'fpn-10-1000', discharge: null, mode: null}]
        const total = store.length.value
        store.reverseRoute()
        expect(store.plan.value.route[0]).toEqual([52.5, 13.42])
        expect(store.plan.value.corrections).toEqual([20, 10])
        expect(store.plan.value.pumps[0]!.at).toBeCloseTo(total - 300, 6)
    })

    it('adds a pump in the middle of the longest gap', () => {
        const store = storeWith([[52.5, 13.4], [52.5, 13.42]])
        store.addPump()
        expect(store.plan.value.pumps[0]!.at).toBe(0)
        store.addPump()
        expect(store.plan.value.pumps[1]!.at).toBe(Math.round(store.length.value / 2))
    })

    it('keeps the last heights while new ones load', async () => {
        const store = storeWith([[52.5, 13.4], [52.5, 13.42]])
        await vi.runAllTimersAsync()
        expect(store.elevation.value.state).toBe('ready')
        store.moveVertex(1, [52.5, 13.41])
        await nextTick()
        expect(store.heightsPending.value).toBe(true)
        expect(heightAt(store.profile.value, 0)).toBe(100)
    })
})
