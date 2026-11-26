/**
 * The topics of the help center in the order they are read, each a page at `/hilfe/<slug>`. Titles,
 * descriptions and texts live in the catalogue under `help.topics.<slug>`; this list holds only the
 * slugs, so `vite.config.ts` can read it for the prerendered paths.
 */
export const HELP_TOPIC_SLUGS = [
    'erste-schritte',
    'strecke-zeichnen',
    'hoehen',
    'entnahme-und-abgabe',
    'leitung',
    'pumpen',
    'ergebnis',
    'laengsprofil',
    'drucken',
    'rechenaufgaben',
    'teilen',
    'rechengrundlagen',
    'daten',
] as const

/** The slug of a help topic. */
export type HelpTopicSlug = typeof HELP_TOPIC_SLUGS[number]

/** Tell whether a slug names a help topic. */
export function isHelpTopic(slug: unknown): slug is HelpTopicSlug {
    return (HELP_TOPIC_SLUGS as readonly unknown[]).includes(slug)
}
