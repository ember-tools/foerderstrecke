<script setup lang="ts">
import {HelpPage, HelpSection, HelpTopic, usePage} from '@emberbox/ui'
import {paragraphs, t} from '../i18n'

usePage({
  title: t('help.pageTitle'),
  description: t('help.description'),
  path: '/hilfe',
})
</script>

<template>
  <HelpPage :title="t('help.title')" back="/">
    <HelpSection :title="t('help.overview.title')">
      <HelpTopic :paragraphs="paragraphs('help.overview.paragraphs')"/>
    </HelpSection>

    <HelpSection :title="t('help.line.title')">
      <HelpTopic :title="t('help.line.draw.title')" :paragraphs="paragraphs('help.line.draw.paragraphs')"/>
      <HelpTopic :title="t('help.line.heights.title')" :paragraphs="paragraphs('help.line.heights.paragraphs')"/>
      <HelpTopic :title="t('help.line.settings.title')" :paragraphs="paragraphs('help.line.settings.paragraphs')"/>
    </HelpSection>

    <HelpSection :title="t('help.pumps.title')">
      <HelpTopic :title="t('help.pumps.suggest.title')" :paragraphs="paragraphs('help.pumps.suggest.paragraphs')"/>
      <HelpTopic :title="t('help.pumps.edit.title')" :paragraphs="paragraphs('help.pumps.edit.paragraphs')"/>
    </HelpSection>

    <HelpSection :title="t('help.result.title')">
      <HelpTopic :paragraphs="paragraphs('help.result.paragraphs')"/>
    </HelpSection>

    <HelpSection :title="t('help.learn.title')">
      <HelpTopic :paragraphs="paragraphs('help.learn.paragraphs')"/>
    </HelpSection>

    <HelpSection :title="t('help.share.title')">
      <HelpTopic :paragraphs="paragraphs('help.share.paragraphs')"/>
    </HelpSection>

    <HelpSection :title="t('help.sources.title')">
      <HelpTopic :paragraphs="paragraphs('help.sources.paragraphs')"/>
    </HelpSection>
  </HelpPage>
</template>
