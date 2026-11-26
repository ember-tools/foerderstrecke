/** A position as [latitude, longitude] in degrees. */
export type LatLng = readonly [number, number]

const EARTH_RADIUS = 6_371_008.8

/** The great-circle distance between two positions in metres, as the server measures it. */
export function distance(start: LatLng, end: LatLng): number {
    const phi1 = start[0] * Math.PI / 180
    const phi2 = end[0] * Math.PI / 180
    const halfPhi = (phi2 - phi1) / 2
    const halfLambda = (end[1] - start[1]) * Math.PI / 360
    const a = Math.sin(halfPhi) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(halfLambda) ** 2
    return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** The distance of every vertex of a route from its start, in metres. */
export function vertexDistances(route: readonly LatLng[]): number[] {
    const distances = route.length ? [0] : []
    for (let index = 1; index < route.length; index++) {
        distances.push(distances[index - 1]! + distance(route[index - 1]!, route[index]!))
    }
    return distances
}

/** The length of a route in metres. */
export function routeLength(route: readonly LatLng[]): number {
    return vertexDistances(route).at(-1) ?? 0
}

/** The position at a distance along a route, held at its ends. */
export function pointAt(route: readonly LatLng[], at: number): LatLng {
    if (route.length === 0) return [0, 0]
    const distances = vertexDistances(route)
    if (at <= 0) return route[0]!
    for (let index = 1; index < route.length; index++) {
        if (at <= distances[index]!) {
            const length = distances[index]! - distances[index - 1]!
            const share = length === 0 ? 0 : (at - distances[index - 1]!) / length
            const [startLat, startLng] = route[index - 1]!
            const [endLat, endLng] = route[index]!
            return [startLat + (endLat - startLat) * share, startLng + (endLng - startLng) * share]
        }
    }
    return route[route.length - 1]!
}

/**
 * The distance along a route of the route's point nearest to a position. Each segment is
 * measured in a flat plane around its start, which is exact enough over the length of a segment.
 */
export function projectOnto(route: readonly LatLng[], position: LatLng): number {
    if (route.length < 2) return 0
    const distances = vertexDistances(route)
    let best = {gap: Infinity, at: 0}
    for (let index = 1; index < route.length; index++) {
        const start = route[index - 1]!
        const end = route[index]!
        const scale = Math.cos(start[0] * Math.PI / 180)
        const segment = [(end[1] - start[1]) * scale, end[0] - start[0]] as const
        const offset = [(position[1] - start[1]) * scale, position[0] - start[0]] as const
        const squared = segment[0] ** 2 + segment[1] ** 2
        const share = squared === 0 ? 0 : Math.min(1, Math.max(0,
            (offset[0] * segment[0] + offset[1] * segment[1]) / squared))
        const nearest: LatLng = [start[0] + (end[0] - start[0]) * share, start[1] + (end[1] - start[1]) * share]
        const gap = distance(nearest, position)
        if (gap < best.gap) {
            best = {gap, at: distances[index - 1]! + (distances[index]! - distances[index - 1]!) * share}
        }
    }
    return best.at
}

/** The part of a route between two distances along it, as the positions to draw it through. */
export function sliceRoute(route: readonly LatLng[], from: number, to: number): LatLng[] {
    if (route.length < 2 || to < from) return []
    const distances = vertexDistances(route)
    const inside = route.filter((_, index) => distances[index]! > from && distances[index]! < to)
    return [pointAt(route, from), ...inside, pointAt(route, to)]
}

/** The index of the vertex a distance along the route lies after. */
export function segmentAt(route: readonly LatLng[], at: number): number {
    const distances = vertexDistances(route)
    let index = 0
    while (index < distances.length - 2 && distances[index + 1]! <= at) index++
    return index
}
