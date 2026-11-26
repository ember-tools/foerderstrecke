<script setup lang="ts">
import {computed} from 'vue'
import {t} from '../../i18n'
import {formatBar, formatDistance, formatMetres, formatWhole} from '../../plan/format'
import {materialFor} from '../../plan/material'
import {namedSections} from '../../plan/sections'
import {sectionStatus} from '../../plan/status'
import type {PlanStore} from '../../plan/store'

/** What the calculation says: whether the line holds, what it needs, and every section in turn. */
const props = defineProps<{ store: PlanStore }>()

const plan = computed(() => props.store.plan.value)
const result = computed(() => props.store.result.value)
const material = computed(() => result.value ? materialFor(plan.value, result.value) : null)
const sections = computed(() => result.value ? namedSections(result.value) : [])

function errorText(error: NonNullable<typeof result.value>['errors'][number]): string {
  if (error.kind === 'hydrant-yield') {
    return t('planner.result.errors.hydrant-yield', {yield: formatWhole(error.yield), flow: formatWhole(error.flow)})
  }
  if (error.kind === 'suction-impossible') {
    return t('planner.result.errors.suction-impossible', {lift: formatMetres(error.lift)})
  }
  return t('planner.result.errors.no-stations')
}

const STATUS_ICON = {ok: 'i-lucide-circle-check', fails: 'i-lucide-circle-x'}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="!result" class="m-0 text-sm text-muted">{{ t('planner.draw.empty') }}</p>
    <template v-else>
      <UAlert :color="result.holds ? 'success' : 'error'" variant="subtle"
              :icon="result.holds ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
              :title="result.holds ? t('planner.result.holds') : t('planner.result.fails')">
        <template v-if="result.errors.length" #description>
          <ul class="m-0 list-disc pl-4">
            <li v-for="error in result.errors" :key="error.kind">{{ errorText(error) }}</li>
          </ul>
        </template>
      </UAlert>

      <dl class="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt class="text-muted">{{ t('planner.result.length') }}</dt>
          <dd class="m-0 font-semibold">{{ formatDistance(result.length) }}</dd>
        </div>
        <div>
          <dt class="text-muted">{{ t('planner.result.pumps') }}</dt>
          <dd class="m-0 font-semibold">{{ result.stations.length }}</dd>
        </div>
        <div v-if="material">
          <dt class="text-muted">{{ t('planner.result.hoses') }}</dt>
          <dd class="m-0 font-semibold">
            {{ t('planner.result.hosesDetail', {count: material.hoses, size: material.hose, reserve: material.reserve}) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">{{ t('planner.result.lossPer100') }}</dt>
          <dd class="m-0 font-semibold">{{ formatBar(result.lossPer100) }}</dd>
        </div>
        <div class="col-span-2">
          <dt class="text-muted">{{ t('planner.result.table') }}</dt>
          <dd class="m-0">{{ t(`planner.tables.${plan.table}`) }}</dd>
        </div>
        <div v-if="material && material.pumps.length" class="col-span-2">
          <dt class="text-muted">{{ t('planner.result.vehicles') }}</dt>
          <dd class="m-0">
            <span v-for="(entry, index) in material.pumps" :key="entry.name">
              {{ index ? ', ' : '' }}{{ entry.count }} × {{ entry.name }}
            </span>
          </dd>
        </div>
      </dl>

      <ol class="m-0 flex list-none flex-col gap-2 p-0">
        <li v-for="(item, index) in sections" :key="index"
            class="rounded-md border border-default p-3 text-sm">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold">
              {{ item.name }}
            </span>
            <span class="flex items-center gap-1" :class="{
              'text-success': sectionStatus(item.section) === 'ok',
              'text-error': sectionStatus(item.section) === 'fails',
            }">
              <UIcon :name="STATUS_ICON[sectionStatus(item.section)]" class="size-4"/>
              {{ t('planner.result.reserve') }} {{ formatBar(item.section.reserve) }}
            </span>
          </div>
          <div class="mt-1 grid grid-cols-2 gap-x-4 text-muted">
            <span>{{ formatDistance(item.section.length) }} · {{ item.hoses }} × {{ material?.hose }}</span>
            <span>{{ t('planner.result.start') }} {{ formatBar(item.section.startPressure) }}</span>
            <span>{{ t('planner.result.friction') }} −{{ formatBar(item.section.friction) }}</span>
            <span>{{ t('planner.result.height') }} {{ item.section.height >= 0 ? '−' : '+' }}{{ formatBar(Math.abs(item.section.height)) }}</span>
            <span>{{ t('planner.result.arrival') }} {{ formatBar(item.section.endPressure) }}</span>
            <span>{{ t('planner.result.required') }} {{ formatBar(item.section.required) }}</span>
          </div>
          <p v-if="item.section.lowest < 0" class="m-0 mt-1 text-error">
            {{ t('planner.result.lowest', {pressure: formatBar(item.section.lowest), distance: formatDistance(item.section.lowestAt)}) }}
          </p>
        </li>
      </ol>
      <p class="m-0 text-xs text-muted">{{ t('planner.notOperational') }}</p>
    </template>
  </div>
</template>
