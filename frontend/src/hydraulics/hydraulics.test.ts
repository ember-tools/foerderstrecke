import {describe, expect, it} from 'vitest'
import {A_CGDIS, B_BERLIN_NRW, B_HESSEN, frictionPer100, linePer100} from './friction'
import {calculateLine, countHoses, evaluateSection, type LineInput, suggestStations} from './line'
import {profileThrough, uniformProfile} from './profile'
import {DEFAULT_PUMP, dischargeCap, pumpType, pumpWarnings} from './pumps'
import {pumpsByBudget, solveTextbook} from './textbook'

describe('friction', () => {
    it('reads every table point exactly', () => {
        for (const table of [B_BERLIN_NRW, B_HESSEN, A_CGDIS]) {
            for (const [flow, loss] of table.points) expect(frictionPer100(table, flow)).toBeCloseTo(loss, 10)
        }
    })

    it('follows the power law through both neighbours between points', () => {
        const loss = frictionPer100(B_BERLIN_NRW, 850)
        const exponent = Math.log(1.5 / 1.1) / Math.log(900 / 800)
        expect(loss).toBeCloseTo(1.1 * (850 / 800) ** exponent, 10)
        expect(loss).toBeGreaterThan(1.1)
        expect(loss).toBeLessThan(1.5)
    })

    it('extrapolates with the four-times rule outside the table', () => {
        expect(frictionPer100(B_BERLIN_NRW, 100)).toBeCloseTo(0.1 / 4, 10)
        expect(frictionPer100(B_HESSEN, 3200)).toBeCloseTo(4.0 * 4, 10)
        expect(frictionPer100(B_BERLIN_NRW, 0)).toBe(0)
    })

    it('rises with the flow', () => {
        let previous = 0
        for (let flow = 50; flow <= 3500; flow += 50) {
            const loss = frictionPer100(B_BERLIN_NRW, flow)
            expect(loss).toBeGreaterThan(previous)
            previous = loss
        }
    })

    it('reads a double line at half the flow', () => {
        expect(linePer100(B_BERLIN_NRW, 1600, 2)).toBeCloseTo(1.1, 10)
        expect(linePer100(B_HESSEN, 1000, 1)).toBeCloseTo(1.4, 10)
    })
})

describe('pumps', () => {
    it('cap the discharge at nominal pressure plus inlet, counting suction as nothing', () => {
        expect(dischargeCap(DEFAULT_PUMP, 1.5)).toBe(11.5)
        expect(dischargeCap(DEFAULT_PUMP, -0.6)).toBe(10)
        expect(dischargeCap(pumpType('fpn-15-1000'), 0)).toBe(15)
    })

    it('warn about flow above rating and suction lift', () => {
        expect(pumpWarnings(DEFAULT_PUMP, 1200).map(warning => warning.kind)).toEqual(['flow-above-rating'])
        expect(pumpWarnings(DEFAULT_PUMP, 800, 3).map(warning => warning.kind)).toEqual([])
        expect(pumpWarnings(DEFAULT_PUMP, 800, 4).map(warning => warning.kind)).toEqual(['suction-reduced'])
        expect(pumpWarnings(DEFAULT_PUMP, 800, 7.6).map(warning => warning.kind)).toEqual(['suction-half'])
        expect(pumpWarnings(DEFAULT_PUMP, 800, 8.5).map(warning => warning.kind)).toEqual(['suction-impossible'])
    })

    it('fall back to the default type for an unknown id', () => {
        expect(pumpType('nonsense')).toBe(DEFAULT_PUMP)
    })
})

describe('reference cases', () => {
    it('1, short line: 2 pumps by budget, 3 on whole hoses (CGDIS 51–53)', () => {
        const solution = solveTextbook({length: 640, rise: 30, lossPer100: 1.7, discharge: 10, endRequirement: 4.5})
        expect(solution.needed).toBeCloseTo(18.38, 10)
        expect(solution.pumps).toBe(2)
        const placed = suggestStations(lineInput({
            profile: uniformProfile(640, 30), flow: 1000, discharge: 10, endRequirement: 4.5,
        }), DEFAULT_PUMP)
        expect(placed.stations).toEqual([0, 380, 620])
    })

    it('2, long line: 11 pumps by budget, 12 placed on whole hoses (WUP 11, Beispiel 01)', () => {
        const task = {length: 3600, rise: 65, lossPer100: 1.7, discharge: 8, endRequirement: 5}
        const solution = solveTextbook(task)
        expect(solution.needed).toBeCloseTo(72.7, 10)
        expect(solution.pumps).toBe(11)
        expect(solution.boosterSpacing?.exact).toBeCloseTo(345.6, 1)
        expect(solution.boosterSpacing?.hoses).toBe(340)
        expect(solution.lastSection?.exact).toBeCloseTo(159.5, 1)
        const placed = suggestStations(lineInput({profile: uniformProfile(3600, 65), flow: 1000}), DEFAULT_PUMP)
        expect(placed.feasible).toBe(true)
        expect(placed.stations).toHaveLength(12)
        expect(placed.stations.slice(0, 4)).toEqual([0, 340, 680, 1020])
    })

    it('3, spacing: next pump at 460 m, 23 hoses (WUP 11, Beispiel 02)', () => {
        const solution = solveTextbook({length: 1000, rise: 30, lossPer100: 1.1, discharge: 8, endRequirement: 5})
        expect(solution.boosterSpacing?.exact).toBeCloseTo(464.3, 1)
        expect(solution.boosterSpacing?.hoses).toBe(460)
        const placed = suggestStations(lineInput({profile: uniformProfile(1000, 30), flow: 800}), DEFAULT_PUMP)
        expect(placed.stations[1]).toBe(460)
    })

    it('4, mixed pumps: 4 pumps (CGDIS 54–57)', () => {
        const solution = solveTextbook({
            length: 1460, rise: 57 - 3, lossPer100: 1.7, discharge: 10, endRequirement: 4.5, pumpDischarges: [10, 15],
        })
        expect(solution.needed).toBeCloseTo(34.72, 10)
        expect(solution.pumps).toBe(4)
        expect(pumpsByBudget(solution.needed, index => [10, 15][index] ?? 10)).toBe(4)
        expect(pumpsByBudget(31.9, index => [10, 15][index] ?? 10)).toBe(3)
        expect(pumpsByBudget(32, index => [10, 15][index] ?? 10)).toBe(3)
        expect(pumpsByBudget(32.1, index => [10, 15][index] ?? 10)).toBe(4)
        const fpn15 = pumpType('fpn-15-1000')
        const stations = [
            {at: 0, pump: pumpType('pfpn-10-1000')},
            {at: 400, pump: fpn15, discharge: 15},
            {at: 1040, pump: DEFAULT_PUMP},
            {at: 1440, pump: DEFAULT_PUMP},
        ]
        const input = lineInput({
            profile: uniformProfile(1460, 54), flow: 1000, discharge: 10, endRequirement: 4.5, stations,
        })
        const placed = calculateLine(input)
        expect(placed.stations[1]!.cap).toBeCloseTo(15 + placed.sections[0]!.endPressure, 10)
        expect(placed.stations[1]!.discharge).toBe(15)
        expect(placed.holds).toBe(true)
        expect(calculateLine({...input, stations: stations.slice(0, 3)}).holds).toBe(false)
        const suggested = suggestStations(input, DEFAULT_PUMP, undefined,
            [{pump: pumpType('pfpn-10-1000'), discharge: 10}, {pump: fpn15, discharge: 15}])
        expect(suggested.stations).toEqual([0, 400, 1040, 1440])
    })

    it.each([
        ['2.1', 1700, 80, 41.4, 5],
        ['2.2', 2500, 70, 54, 7],
        ['2.3', 2000, 50, 43.5, 5],
    ])('5, textbook series, Aufgabe %s (CGDIS 66–68)', (_, length, rise, needed, pumps) => {
        const solution = solveTextbook({length, rise, lossPer100: 1.7, discharge: 10, endRequirement: 4.5})
        expect(solution.needed).toBeCloseTo(needed, 10)
        expect(solution.pumps).toBe(pumps)
    })
})

describe('textbook', () => {
    it('needs no booster spacing on ground falling steeply enough', () => {
        const solution = solveTextbook({length: 1000, rise: -300, lossPer100: 1.7, discharge: 8, endRequirement: 6})
        expect(solution.boosterSpacing).toBeNull()
        expect(solution.pumps).toBe(1)
    })

    it('cannot deliver more at the end than the last pump discharges on a line losing pressure', () => {
        const solution = solveTextbook({length: 2000, rise: 20, lossPer100: 1.1, discharge: 5, endRequirement: 6})
        expect(solution.endUnreachable).toBe(true)
        expect(solution.pumps).toBeNull()
        expect(solution.lastSection).toBeNull()
        const downhill = solveTextbook({length: 1000, rise: -300, lossPer100: 1.1, discharge: 5, endRequirement: 6})
        expect(downhill.endUnreachable).toBe(false)
        expect(downhill.pumps).toBe(1)
    })

    it('cannot relay a closed line at 1.5 bar or less', () => {
        const solution = solveTextbook({length: 2000, rise: 0, lossPer100: 1.7, discharge: 1.5, endRequirement: 1})
        expect(solution.pumps).toBeNull()
        expect(solution.boosterSpacing).toBeNull()
    })
})

/** A closed B line at 8 bar from open water to multi-purpose nozzles, with the given changes. */
function lineInput(changes: Partial<LineInput>): LineInput {
    return {
        profile: uniformProfile(1000, 0),
        flow: 800,
        table: B_BERLIN_NRW,
        lines: 1,
        discharge: 8,
        mode: 'closed',
        endRequirement: 5,
        source: {kind: 'open-water', suctionLift: 2},
        stations: [{at: 0, pump: DEFAULT_PUMP}],
        ...changes,
    }
}

describe('sections', () => {
    it('lose friction and height along the way', () => {
        const section = evaluateSection(uniformProfile(500, 20), 0, 500, 8, 1.1, 1.5)
        expect(section.friction).toBeCloseTo(5.5, 10)
        expect(section.height).toBeCloseTo(2, 10)
        expect(section.endPressure).toBeCloseTo(0.5, 10)
        expect(section.reserve).toBeCloseTo(-1, 10)
        expect(section.holds).toBe(false)
    })

    it('fail when the water does not get over a crest, even if the end is fine', () => {
        const profile = profileThrough([[0, 0], [200, 90], [400, 0]])
        const section = evaluateSection(profile, 0, 400, 8, 0.3, 1.5)
        expect(section.endPressure).toBeGreaterThan(1.5)
        expect(section.lowest).toBeLessThan(0)
        expect(section.lowestAt).toBe(200)
        expect(section.holds).toBe(false)
    })

    it('gain pressure downhill', () => {
        const section = evaluateSection(uniformProfile(1000, -50), 0, 1000, 8, 1.1, 6)
        expect(section.endPressure).toBeCloseTo(8 - 11 + 5, 10)
    })
})

describe('line', () => {
    it('chains closed stations: each pump receives what the section before delivers', () => {
        const result = calculateLine(lineInput({
            profile: uniformProfile(900, 0),
            stations: [{at: 0, pump: DEFAULT_PUMP}, {at: 500, pump: DEFAULT_PUMP}],
        }))
        expect(result.sections).toHaveLength(2)
        expect(result.sections[0]!.endPressure).toBeCloseTo(2.5, 10)
        expect(result.stations[1]!.inlet).toBeCloseTo(2.5, 10)
        expect(result.stations[1]!.discharge).toBe(8)
        expect(result.sections[1]!.endPressure).toBeCloseTo(3.6, 10)
        expect(result.sections[1]!.required).toBe(5)
        expect(result.holds).toBe(false)
    })

    it('lets an open station start from a tank and only reach it with pressure left', () => {
        const result = calculateLine(lineInput({
            profile: uniformProfile(900, 0),
            endRequirement: 0,
            stations: [{at: 0, pump: DEFAULT_PUMP}, {at: 700, pump: DEFAULT_PUMP, mode: 'open'}],
        }))
        expect(result.sections[0]!.required).toBe(0)
        expect(result.sections[0]!.endPressure).toBeCloseTo(0.3, 10)
        expect(result.stations[1]!.inlet).toBe(0)
        expect(result.stations[1]!.mode).toBe('open')
        expect(result.holds).toBe(true)
    })

    it('caps a pump at nominal pressure plus inlet and flags it', () => {
        const result = calculateLine(lineInput({discharge: 12}))
        expect(result.stations[0]!.cap).toBe(10)
        expect(result.stations[0]!.discharge).toBe(10)
        expect(result.stations[0]!.capped).toBe(true)
    })

    it('lets a station override the discharge pressure', () => {
        const result = calculateLine(lineInput({stations: [{at: 0, pump: DEFAULT_PUMP, discharge: 5}]}))
        expect(result.stations[0]!.discharge).toBe(5)
    })

    it('checks the intake from a hydrant and feeds its pressure into the first pump', () => {
        const result = calculateLine(lineInput({
            source: {kind: 'hydrant', pressure: 4, yield: 1500},
            stations: [{at: 100, pump: DEFAULT_PUMP}],
        }))
        expect(result.intake?.endPressure).toBeCloseTo(2.9, 10)
        expect(result.intake?.holds).toBe(true)
        expect(result.stations[0]!.inlet).toBeCloseTo(2.9, 10)
        expect(result.stations[0]!.cap).toBeCloseTo(12.9, 10)
    })

    it('refuses a flow above the hydrant yield', () => {
        const result = calculateLine(lineInput({source: {kind: 'hydrant', pressure: 3, yield: 800}, flow: 1000}))
        expect(result.errors).toContainEqual({kind: 'hydrant-yield', flow: 1000, yield: 800})
        expect(result.holds).toBe(false)
    })

    it('refuses a suction lift beyond 8 m', () => {
        const result = calculateLine(lineInput({source: {kind: 'open-water', suctionLift: 8.5}}))
        expect(result.errors).toContainEqual({kind: 'suction-impossible', lift: 8.5})
        expect(result.stations[0]!.warnings.map(warning => warning.kind)).toContain('suction-impossible')
    })

    it('places the first pump at the source unless a hydrant feeds it', () => {
        const result = calculateLine(lineInput({source: {kind: 'tank'}, stations: [{at: 150, pump: DEFAULT_PUMP}]}))
        expect(result.stations[0]!.at).toBe(0)
        expect(result.sections[0]!.length).toBe(1000)
    })

    it('orders the stations from the source, whatever order they come in', () => {
        const result = calculateLine(lineInput({
            profile: uniformProfile(900, 0),
            stations: [{at: 500, pump: DEFAULT_PUMP}, {at: 0, pump: DEFAULT_PUMP}, {at: 300, pump: DEFAULT_PUMP}],
        }))
        expect(result.stations.map(station => station.at)).toEqual([0, 300, 500])
        expect(result.sections.map(section => section.length)).toEqual([300, 200, 400])
        expect(result.hoses.sections).toEqual([15, 10, 20])
    })

    it('checks the mains pressure when the pump stands at the hydrant', () => {
        const weak = calculateLine(lineInput({source: {kind: 'hydrant', pressure: 1, yield: 1500}}))
        expect(weak.intake?.length).toBe(0)
        expect(weak.intake?.holds).toBe(false)
        expect(weak.holds).toBe(false)
        const strong = calculateLine(lineInput({
            profile: uniformProfile(200, 0), source: {kind: 'hydrant', pressure: 3, yield: 1500},
        }))
        expect(strong.intake?.holds).toBe(true)
        expect(strong.stations[0]!.inlet).toBe(3)
        expect(strong.holds).toBe(true)
    })

    it('fails when the intake from the hydrant arrives too weak', () => {
        const result = calculateLine(lineInput({
            profile: uniformProfile(1000, 0),
            source: {kind: 'hydrant', pressure: 3, yield: 1500},
            stations: [{at: 200, pump: DEFAULT_PUMP}],
        }))
        expect(result.intake?.endPressure).toBeCloseTo(0.8, 10)
        expect(result.intake?.holds).toBe(false)
        expect(result.holds).toBe(false)
    })

    it('raises a closed booster\'s cap by what arrives at its inlet', () => {
        const result = calculateLine(lineInput({
            profile: uniformProfile(1000, 0),
            discharge: 12,
            stations: [{at: 0, pump: DEFAULT_PUMP, discharge: 10}, {at: 680, pump: DEFAULT_PUMP}],
        }))
        expect(result.stations[1]!.inlet).toBeCloseTo(2.52, 10)
        expect(result.stations[1]!.cap).toBeCloseTo(12.52, 10)
        expect(result.stations[1]!.discharge).toBe(12)
        expect(result.stations[1]!.capped).toBe(false)
    })

    it('passes the pump warnings on and leaves the first station without a relay mode', () => {
        const result = calculateLine(lineInput({
            flow: 1200,
            source: {kind: 'open-water', suctionLift: 7.6},
            stations: [{at: 0, pump: DEFAULT_PUMP}, {at: 300, pump: DEFAULT_PUMP}],
        }))
        expect(result.stations[0]!.warnings.map(warning => warning.kind)).toEqual(['flow-above-rating', 'suction-half'])
        expect(result.stations[1]!.warnings.map(warning => warning.kind)).toEqual(['flow-above-rating'])
        expect(result.stations[0]!.mode).toBeNull()
        expect(result.stations[1]!.mode).toBe('closed')
        const reduced = calculateLine(lineInput({source: {kind: 'open-water', suctionLift: 3.5}}))
        expect(reduced.stations[0]!.warnings.map(warning => warning.kind)).toEqual(['suction-reduced'])
        expect(reduced.errors).toEqual([])
    })

    it('fails without any station', () => {
        expect(calculateLine(lineInput({stations: []})).errors).toEqual([{kind: 'no-stations'}])
    })

    it('counts hoses per section, double lines twice, with a reserve per started 100 m', () => {
        expect(countHoses([340, 159.5], 1)).toEqual({sections: [17, 8], reserve: 5, total: 30})
        expect(countHoses([1000], 2)).toEqual({sections: [100], reserve: 20, total: 120})
        expect(countHoses([1000], 1, 2)).toEqual({sections: [50], reserve: 20, total: 70})
        const result = calculateLine(lineInput({
            source: {kind: 'hydrant', pressure: 4, yield: 1500},
            stations: [{at: 30, pump: DEFAULT_PUMP}],
        }))
        expect(result.hoses.sections).toEqual([2, 49])
    })
})

describe('suggestion', () => {
    it('places every pump at the farthest whole hose that still holds', () => {
        const input = lineInput({profile: uniformProfile(2000, 0)})
        const suggestion = suggestStations(input, DEFAULT_PUMP)
        expect(suggestion.stations).toEqual([0, 580, 1160, 1740])
        const result = calculateLine({...input, stations: suggestion.stations.map(at => ({at, pump: DEFAULT_PUMP}))})
        expect(result.holds).toBe(true)
    })

    it('needs a single pump when it reaches the end', () => {
        expect(suggestStations(lineInput({profile: uniformProfile(200, 0)}), DEFAULT_PUMP).stations).toEqual([0])
    })

    it('reports where not even one hose holds', () => {
        const suggestion = suggestStations(lineInput({profile: uniformProfile(1000, 4000)}), DEFAULT_PUMP)
        expect(suggestion.feasible).toBe(false)
        expect(suggestion.problem).toBe('no-hose-holds')
        expect(suggestion.stuckAt).toBe(0)
    })

    it('stops before a crest the water cannot pass', () => {
        const profile = profileThrough([[0, 0], [300, 0], [310, 60], [320, 0], [600, 0]])
        const suggestion = suggestStations(lineInput({profile, endRequirement: 1}), DEFAULT_PUMP)
        expect(suggestion.feasible).toBe(true)
        expect(suggestion.stations[1]).toBeLessThanOrEqual(300)
    })

    it('starts from a hydrant\'s pressure, and not at all from one too weak to feed a pump', () => {
        const fed = suggestStations(lineInput({
            profile: uniformProfile(2000, 0), source: {kind: 'hydrant', pressure: 4, yield: 1500},
        }), DEFAULT_PUMP)
        expect(fed.feasible).toBe(true)
        expect(fed.stations[1]).toBe(580)
        const weak = suggestStations(lineInput({source: {kind: 'hydrant', pressure: 1, yield: 1500}}), DEFAULT_PUMP)
        expect(weak).toEqual({stations: [0], feasible: false, problem: 'hydrant-pressure', stuckAt: null})
    })

    it('says when it ran out of pumps rather than out of pressure', () => {
        const suggestion = suggestStations(lineInput({profile: uniformProfile(5000, 0)}), DEFAULT_PUMP, 3)
        expect(suggestion.feasible).toBe(false)
        expect(suggestion.problem).toBe('too-many-pumps')
    })

    it('uses the open relay requirement when the line is open', () => {
        const closed = suggestStations(lineInput({profile: uniformProfile(2000, 0)}), DEFAULT_PUMP)
        const open = suggestStations(lineInput({profile: uniformProfile(2000, 0), mode: 'open'}), DEFAULT_PUMP)
        expect(open.stations[1]).toBe(720)
        expect(closed.stations[1]).toBe(580)
    })
})

describe('long lines', () => {
    it('suggest pumps along a 100 km profile of 4000 samples', () => {
        const samples = Array.from({length: 4001}, (_, index) =>
            [index * 25, 100 + 40 * Math.sin(index / 50)] as const)
        const input = lineInput({profile: profileThrough(samples), flow: 1000})
        const suggestion = suggestStations(input, DEFAULT_PUMP)
        expect(suggestion.feasible).toBe(true)
        const result = calculateLine({...input, stations: suggestion.stations.map(at => ({at, pump: DEFAULT_PUMP}))})
        expect(result.holds).toBe(true)
        expect(result.length).toBe(100_000)
    })
})
