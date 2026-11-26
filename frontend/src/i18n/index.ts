import {createI18n} from 'vue-i18n'
import de from './de'

export const i18n = createI18n({
    legacy: false,
    locale: 'de',
    fallbackLocale: 'de',
    messages: {de},
})

export const t = i18n.global.t

/** The texts of a list of messages, such as the paragraphs of a help topic. */
export function paragraphs(key: string): string[] {
    return (i18n.global.tm(key) as unknown as unknown[]).map(message => i18n.global.rt(message as Parameters<typeof i18n.global.rt>[0]))
}
