<script setup lang="ts">
import {HelpIndex, HelpPage, usePage} from '@emberbox/ui'
import {helpTopics} from '../help/content'
import {paragraphs, t} from '../i18n'

usePage({
  title: t('help.pageTitle'),
  description: t('help.description'),
  path: '/hilfe',
})

const topics = helpTopics()
</script>

<template>
  <HelpPage :title="t('help.title')" back="/">
    <div class="flex flex-col gap-3">
      <p v-for="paragraph in paragraphs('help.intro')" :key="paragraph" class="m-0 text-muted">{{ paragraph }}</p>
    </div>
    <HelpIndex :topics="topics"/>
  </HelpPage>
</template>
