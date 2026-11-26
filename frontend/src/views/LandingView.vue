<script setup lang="ts">
import {usePage, webApplicationData} from '@emberbox/ui'
import {t} from '../i18n'

usePage({
  title: t('landing.title'),
  description: t('landing.description'),
  path: '/',
  structuredData: [webApplicationData({name: t('app.name'), description: t('landing.description')})],
})

const FEATURES = [
  {key: 'map', icon: 'i-lucide-map'},
  {key: 'pumps', icon: 'i-lucide-gauge'},
  {key: 'profile', icon: 'i-lucide-chart-spline'},
  {key: 'material', icon: 'i-lucide-printer'},
  {key: 'learn', icon: 'i-lucide-graduation-cap'},
  {key: 'share', icon: 'i-lucide-share-2'},
]
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-10 py-4">
    <section class="flex max-w-3xl flex-col gap-3">
      <p class="eyebrow">{{ t('landing.eyebrow') }}</p>
      <h1 class="headline m-0 text-4xl md:text-5xl">{{ t('landing.heading') }}</h1>
      <p class="m-0 text-lg text-muted">{{ t('landing.description') }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton to="/planer" icon="i-lucide-arrow-right" trailing :label="t('nav.openPlanner')"/>
        <UButton to="/lernen" color="neutral" variant="outline" icon="i-lucide-graduation-cap" :label="t('landing.openLearn')"/>
        <UButton to="/hilfe" color="neutral" variant="ghost" icon="i-lucide-life-buoy" :label="t('nav.help')"/>
      </div>
    </section>

    <section aria-labelledby="features" class="flex flex-col gap-4">
      <h2 id="features" class="eyebrow m-0">{{ t('landing.featuresHeading') }}</h2>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <UCard v-for="feature in FEATURES" :key="feature.key">
          <div class="flex flex-col gap-2">
            <UIcon :name="feature.icon" class="size-6 text-signal"/>
            <h3 class="headline m-0 text-xl">{{ t(`landing.features.${feature.key}.title`) }}</h3>
            <p class="m-0 text-muted">{{ t(`landing.features.${feature.key}.text`) }}</p>
          </div>
        </UCard>
      </div>
    </section>

    <section class="flex max-w-3xl flex-col gap-2">
      <h2 class="eyebrow m-0">{{ t('landing.audienceHeading') }}</h2>
      <p class="m-0">{{ t('landing.audience') }}</p>
    </section>
  </div>
</template>
