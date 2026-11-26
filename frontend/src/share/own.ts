import type {ShareKind, ShareTokens} from '../api/shares'

const STORAGE_KEY = 'foerderstrecke.shares'
const MAX_REMEMBERED = 1000

/** A link made in this browser, remembered so it can be found and deleted again. */
export interface OwnShare extends ShareTokens {
    kind: ShareKind
    title: string
    created: string
}

/** The links made in this browser, newest first. */
export function ownShares(): OwnShare[] {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
        if (!Array.isArray(stored)) return []
        return stored.filter((entry): entry is OwnShare => typeof entry === 'object' && entry !== null
            && typeof entry.token === 'string' && typeof entry.deleteToken === 'string'
            && (entry.kind === 'plan' || entry.kind === 'task')
            && typeof entry.title === 'string' && typeof entry.created === 'string')
    } catch {
        return []
    }
}

function store(shares: OwnShare[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(shares.slice(0, MAX_REMEMBERED)))
    } catch {
        return
    }
}

/** Remember a link made in this browser. */
export function rememberShare(share: OwnShare) {
    store([share, ...ownShares().filter(entry => entry.token !== share.token)])
}

/** Forget a link, after it was deleted. */
export function forgetShare(token: string) {
    store(ownShares().filter(entry => entry.token !== token))
}
