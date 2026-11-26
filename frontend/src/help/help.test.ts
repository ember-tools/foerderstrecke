import {describe, expect, it} from 'vitest'
import {createMemoryHistory} from 'vue-router'
import {createAppRouter} from '../router'
import {helpParts, helpTopics} from './content'
import {HELP_TOPIC_SLUGS, isHelpTopic} from './topics'

describe('help center', () => {
    it('gives every topic a title, a description and text', () => {
        const topics = helpTopics()
        expect(topics.map(topic => topic.slug)).toEqual([...HELP_TOPIC_SLUGS])
        for (const topic of topics) {
            expect(topic.title).not.toMatch(/help\./)
            expect(topic.description.length).toBeGreaterThan(10)
            const parts = helpParts(topic.slug as typeof HELP_TOPIC_SLUGS[number])
            expect(parts.length).toBeGreaterThan(0)
            for (const part of parts) {
                expect(part.paragraphs.length).toBeGreaterThan(0)
                expect(part.paragraphs.every(paragraph => paragraph.length > 20 && !paragraph.includes('{'))).toBe(true)
            }
        }
    })

    it('titles the parts of a topic only when it has several', () => {
        for (const slug of HELP_TOPIC_SLUGS) {
            const parts = helpParts(slug)
            expect(parts.every(part => (part.title === null) === (parts.length === 1)), slug).toBe(true)
        }
    })

    it('knows its topics', () => {
        expect(isHelpTopic('pumpen')).toBe(true)
        expect(isHelpTopic('unbekannt')).toBe(false)
    })

    it('sends an unknown topic to the overview', async () => {
        const router = createAppRouter(createMemoryHistory())
        await router.push('/hilfe/unbekannt')
        expect(router.currentRoute.value.path).toBe('/hilfe')
        await router.push('/hilfe/hoehen')
        expect(router.currentRoute.value.path).toBe('/hilfe/hoehen')
    })
})
