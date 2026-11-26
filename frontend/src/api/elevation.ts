import type {ProfileSample} from '../hydraulics/profile'
import {type LatLng, routeLength} from '../plan/geo'

/** The longest line the server profiles, in metres. */
export const MAX_PROFILE_LENGTH = 100_000

/** The heights along a line as the server measures them, see `POST /api/elevation/profile`. */
export interface ElevationProfile {
    length: number
    vertices: number[]
    samples: ProfileSample[]
}

/** Why heights could not be had. */
export type ElevationFailure = 'unavailable' | 'outside' | 'too-long' | 'offline'

/** The outcome of asking for heights: the profile, or why there is none. */
export type ElevationResult = {ok: true, profile: ElevationProfile} | {ok: false, reason: ElevationFailure}

/** Which dataset the heights come from and how it has to be credited. */
export interface ElevationInfo {
    dataset: string
    attribution: string
}

/** Ask the server for the heights along a route. */
export async function fetchProfile(route: readonly LatLng[], signal?: AbortSignal): Promise<ElevationResult> {
    let response: Response
    try {
        response = await fetch('/api/elevation/profile', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({line: route}),
            signal,
        })
    } catch (error) {
        if (signal?.aborted) throw error
        return {ok: false, reason: 'offline'}
    }
    if (response.ok) return {ok: true, profile: await response.json() as ElevationProfile}
    if (response.status === 503) return {ok: false, reason: 'unavailable'}
    if (route.length >= 2 && routeLength(route) > MAX_PROFILE_LENGTH) return {ok: false, reason: 'too-long'}
    if (response.status === 422) return {ok: false, reason: 'outside'}
    return {ok: false, reason: 'offline'}
}

/** Ask the server which dataset its heights come from; null without elevation data. */
export async function fetchElevationInfo(): Promise<ElevationInfo | null> {
    try {
        const response = await fetch('/api/elevation')
        return response.ok ? await response.json() as ElevationInfo : null
    } catch {
        return null
    }
}
