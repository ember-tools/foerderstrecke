/** What can be shared: a planned line or a task for the learning part. */
export type ShareKind = 'plan' | 'task'

/** The two tokens of a new share: one opens it, the other deletes it. */
export interface ShareTokens {
    token: string
    deleteToken: string
}

/** Why a share could not be made or opened. */
export type ShareFailure = 'too-large' | 'rate-limited' | 'not-found' | 'invalid' | 'offline'

/** Store a document under a new link. */
export async function createShare(kind: ShareKind, document: object): Promise<{ok: true, tokens: ShareTokens} | {ok: false, reason: ShareFailure}> {
    try {
        const response = await fetch('/api/shares', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({kind, document}),
        })
        if (response.ok) return {ok: true, tokens: await response.json() as ShareTokens}
        if (response.status === 413) return {ok: false, reason: 'too-large'}
        if (response.status === 429) return {ok: false, reason: 'rate-limited'}
        if (response.status === 422) return {ok: false, reason: 'invalid'}
        return {ok: false, reason: 'offline'}
    } catch {
        return {ok: false, reason: 'offline'}
    }
}

/** Fetch what a link holds. */
export async function fetchShare(token: string): Promise<{ok: true, kind: ShareKind, document: unknown} | {ok: false, reason: ShareFailure}> {
    try {
        const response = await fetch(`/api/shares/${encodeURIComponent(token)}`)
        if (response.status === 404) return {ok: false, reason: 'not-found'}
        if (!response.ok) return {ok: false, reason: 'offline'}
        const body = await response.json() as {kind: ShareKind, document: unknown}
        return {ok: true, kind: body.kind, document: body.document}
    } catch {
        return {ok: false, reason: 'offline'}
    }
}

/** Delete a link with its delete token; true when it is gone, also when it was gone already. */
export async function deleteShare(tokens: ShareTokens): Promise<boolean> {
    try {
        const response = await fetch(`/api/shares/${encodeURIComponent(tokens.token)}`, {
            method: 'DELETE',
            headers: {'X-Delete-Token': tokens.deleteToken},
        })
        return response.ok || response.status === 404
    } catch {
        return false
    }
}

/** The address a share opens at. */
export function shareUrl(token: string): string {
    return `${window.location.origin}/s/${encodeURIComponent(token)}`
}
