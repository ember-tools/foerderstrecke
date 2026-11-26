<script setup lang="ts">
import {breadcrumbData, HelpPage, helpPath, HelpSection, HelpTopic, usePage} from '@emberbox/ui'
import {computed} from 'vue'
import {helpParts, helpTopics} from '../help/content'
import type {HelpTopicSlug} from '../help/topics'
import {t} from '../i18n'

/**
 * One topic of the help center. A topic of one part shows its paragraphs in an untitled frame below
 * the page title; a topic of several parts gives each part a titled section.
 */
const props = defineProps<{ slug: HelpTopicSlug }>()

const topics = helpTopics()
const topic = computed(() => topics.find(candidate => candidate.slug === props.slug)!)
const parts = computed(() => helpParts(props.slug))

usePage(() => ({
  title: t('help.topicTitle', {topic: topic.value.title}),
  description: topic.value.description,
  path: helpPath(topic.value.slug),
  structuredData: [breadcrumbData([
    {name: t('app.name'), path: '/'},
    {name: t('help.crumb'), path: helpPath()},
    {name: topic.value.title, path: helpPath(topic.value.slug)},
  ])],
}))
</script>

<template>
  <HelpPage :title="topic.title" :topics="topics" :current="topic.slug">
    <HelpSection v-for="part in parts" :key="part.title ?? topic.slug" :title="part.title ?? undefined">
      <HelpTopic :paragraphs="part.paragraphs"/>
    </HelpSection>
  </HelpPage>
</template>
