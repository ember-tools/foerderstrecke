/** A sample of a line's height profile: distance from the source and height, both in metres. */
export type ProfileSample = readonly [distance: number, height: number]

/**
 * The heights along a line, sampled from its start, ordered by distance. The last sample marks
 * the line's end. Between samples the height runs straight.
 */
export interface Profile {
    samples: readonly ProfileSample[]
}

/** A profile rising evenly by `rise` metres (falling for a negative rise) over `length` metres. */
export function uniformProfile(length: number, rise: number): Profile {
    return {samples: [[0, 0], [length, rise]]}
}

/** A profile through the given points, each the distance and the height there. */
export function profileThrough(points: readonly ProfileSample[]): Profile {
    return {samples: [...points].sort((a, b) => a[0] - b[0])}
}

/** The length of the line a profile describes. */
export function profileLength(profile: Profile): number {
    return profile.samples.length === 0 ? 0 : profile.samples[profile.samples.length - 1]![0]
}

/** The height at a distance, interpolated between samples and held beyond the ends. */
export function heightAt(profile: Profile, distance: number): number {
    const samples = profile.samples
    if (samples.length === 0) return 0
    const first = samples[0]!
    const last = samples[samples.length - 1]!
    if (distance <= first[0]) return first[1]
    if (distance >= last[0]) return last[1]
    let low = 0
    let high = samples.length - 1
    while (high - low > 1) {
        const middle = (low + high) >> 1
        if (samples[middle]![0] <= distance) low = middle
        else high = middle
    }
    const [lowDistance, lowHeight] = samples[low]!
    const [highDistance, highHeight] = samples[high]!
    const share = highDistance === lowDistance ? 0 : (distance - lowDistance) / (highDistance - lowDistance)
    return lowHeight + (highHeight - lowHeight) * share
}

/** The distances of the samples strictly after `from` and up to `to`. */
export function samplesBetween(profile: Profile, from: number, to: number): number[] {
    const distances: number[] = []
    for (let index = firstAfter(profile, from); index < profile.samples.length; index++) {
        const distance = profile.samples[index]![0]
        if (distance > to) break
        distances.push(distance)
    }
    return distances
}

/** The index of the first sample lying strictly after a distance. */
function firstAfter(profile: Profile, distance: number): number {
    let low = 0
    let high = profile.samples.length
    while (low < high) {
        const middle = (low + high) >> 1
        if (profile.samples[middle]![0] <= distance) low = middle + 1
        else high = middle
    }
    return low
}
