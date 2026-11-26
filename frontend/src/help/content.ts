import type {HelpTopicInfo} from '@emberbox/ui'
import {i18n, type RawMessage, renderList, t} from '../i18n'
import {HELP_TOPIC_SLUGS, type HelpTopicSlug} from './topics'

/** One part of a help topic: an optional heading and its paragraphs. */
export interface HelpPart {
    title: string | null
    paragraphs: string[]
}

/** Every help topic with its title and description, for the overview and the topic navigation. */
export function helpTopics(): HelpTopicInfo[] {
    return HELP_TOPIC_SLUGS.map(slug => ({
        slug,
        title: t(`help.topics.${slug}.title`),
        description: t(`help.topics.${slug}.description`),
    }))
}

/** The parts of a help topic, read from the catalogue. */
export function helpParts(slug: HelpTopicSlug): HelpPart[] {
    const sections = i18n.global.tm(`help.topics.${slug}.sections`) as unknown as {title?: RawMessage, paragraphs: RawMessage[]}[]
    return sections.map(section => ({
        title: section.title ? renderList([section.title])[0]! : null,
        paragraphs: renderList(section.paragraphs),
    }))
}
