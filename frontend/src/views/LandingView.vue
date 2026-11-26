<script setup lang="ts">
import {usePage, webApplicationData} from '@emberbox/ui'
import {t} from '../i18n'

const DESCRIPTION = 'Eine Förderstrecke auf der Karte planen und üben: Druckverluste, Pumpenabstände, Höhen und '
    + 'Schlauchbedarf für die Ausbildung. Kostenlos und ohne Anmeldung.'

usePage({
  title: 'Förderstrecke – Wasserförderung über lange Wegstrecken',
  description: DESCRIPTION,
  path: '/',
  structuredData: [webApplicationData({name: 'Förderstrecke', description: DESCRIPTION})],
})
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-10 py-4">
    <section class="flex max-w-3xl flex-col gap-3">
      <p class="eyebrow">Förderstrecke</p>
      <h1 class="headline m-0 text-4xl md:text-5xl">Wasserförderung über lange Wegstrecken</h1>
      <p class="m-0 text-lg text-muted">{{ DESCRIPTION }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton to="/planer" icon="i-lucide-arrow-right" trailing :label="t('nav.openPlanner')"/>
      </div>
    </section>
  </div>
</template>
