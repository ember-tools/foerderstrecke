import {heightAt, type Profile, type ProfileSample, profileThrough} from '../hydraulics/profile'

/**
 * The profile of a route: the model heights along it, with the heights the user corrected at
 * vertices (a bridge, a building, better local knowledge). A correction shifts the profile by the
 * difference at its vertex, fading linearly to no shift at the neighbouring vertices, so a
 * corrected vertex reads exactly as entered and the rest of the route is left alone.
 *
 * Without model heights (no elevation data, or heights entered by hand) the route runs straight
 * between the corrected vertices and holds the first and last of them beyond; with no correction
 * at all it is flat at 0 m.
 */
export function correctedProfile(
    samples: readonly ProfileSample[],
    vertexDistances: readonly number[],
    corrections: readonly (number | null)[],
): Profile {
    const length = vertexDistances.at(-1) ?? 0
    const entered = vertexDistances
        .map((at, index) => [at, corrections[index]] as const)
        .filter((vertex): vertex is readonly [number, number] => typeof vertex[1] === 'number')
    if (samples.length < 2) {
        const manual = profileThrough(entered.length ? entered : [[0, 0], [length, 0]])
        return {samples: vertexDistances.map(at => [at, heightAt(manual, at)] as const)}
    }
    const model = profileThrough(samples)
    const shifts = vertexDistances.map((at, index) => {
        const corrected = corrections[index]
        return corrected === null || corrected === undefined ? 0 : corrected - heightAt(model, at)
    })
    const shift = profileThrough(vertexDistances.map((at, index) => [at, shifts[index]!] as const))
    const distances = [...new Set([...model.samples.map(([at]) => at), ...vertexDistances])]
        .filter(at => at >= 0 && at <= length)
        .sort((a, b) => a - b)
    return {samples: distances.map(at => [at, heightAt(model, at) + heightAt(shift, at)] as const)}
}
