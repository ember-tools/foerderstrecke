import {createI18n} from 'vue-i18n'
import de from './de'

export const i18n = createI18n({
    legacy: false,
    locale: 'de',
    fallbackLocale: 'de',
    messages: {de},
})

export const t = i18n.global.t

/** A message of the catalogue as `tm` returns it, before `rt` turns it into text. */
export type RawMessage = Parameters<typeof i18n.global.rt>[0]

/** The texts of raw messages, such as the paragraphs of a help topic. */
export function renderList(messages: readonly RawMessage[]): string[] {
    return messages.map(message => i18n.global.rt(message))
}

/** The texts of a list of messages in the catalogue. */
export function paragraphs(key: string): string[] {
    return renderList(i18n.global.tm(key) as unknown as RawMessage[])
}
