<script setup lang="ts">
import {computed} from 'vue'
import {t} from '../../i18n'
import {formatDistance, formatHeight} from '../../plan/format'
import type {PlanStore} from '../../plan/store'

/**
 * The heights at the route's vertices: the model height, and a field to enter the real one where
 * the model is off, as on a bridge, beside a building or under trees.
 */
const props = defineProps<{ store: PlanStore, attribution: string | null }>()

const plan = computed(() => props.store.plan.value)
const elevation = computed(() => props.store.elevation.value)

function correction(index: number): number | undefined {
  return plan.value.corrections[index] ?? undefined
}

function setCorrection(index: number, value: number | null | undefined) {
  plan.value.corrections[index] = value === null || value === undefined || Number.isNaN(value) ? null : value
}

function label(index: number): string {
  if (index === 0) return t('planner.source.label')
  if (index === plan.value.route.length - 1) return t('planner.end.label')
  return t('planner.heights.vertex', {number: index + 1})
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <h3 class="m-0 text-sm font-semibold">{{ t('planner.heights.label') }}</h3>
    <p v-if="elevation.state === 'loading'" class="m-0 text-sm text-muted">{{ t('planner.heights.loading') }}</p>
    <UAlert v-if="elevation.state === 'failed'" color="warning" variant="subtle" icon="i-lucide-mountain"
            :description="t(`planner.heights.failed.${elevation.reason}`)"/>
    <p class="m-0 text-sm text-muted">{{ t('planner.heights.surfaceModel') }}</p>
    <ul class="m-0 flex list-none flex-col gap-2 p-0">
      <li v-for="(point, index) in plan.route" :key="`${index}-${point[0]}-${point[1]}`"
          class="grid grid-cols-[1fr_7.5rem_auto] items-center gap-2">
        <div class="min-w-0 text-sm">
          <div class="truncate font-medium">{{ label(index) }}</div>
          <div class="text-xs text-muted">
            {{ formatDistance(store.distances.value[index] ?? 0) }}
            <template v-if="store.modelHeights.value[index] != null">
              · {{ t('planner.heights.model', {value: formatHeight(store.modelHeights.value[index]!)}) }}
            </template>
          </div>
        </div>
        <UInputNumber :model-value="correction(index)" :placeholder="t('planner.heights.corrected')"
                      :step="1" :min="-500" :max="9000" size="sm"
                      @update:model-value="value => setCorrection(index, value)"/>
        <UButton v-if="plan.corrections[index] != null" color="neutral" variant="ghost" size="sm"
                 icon="i-lucide-rotate-ccw" :aria-label="t('planner.heights.reset')"
                 @click="setCorrection(index, null)"/>
        <span v-else class="w-8"/>
      </li>
    </ul>
    <p v-if="attribution" class="m-0 text-xs text-muted">{{ attribution }}</p>
  </section>
</template>
