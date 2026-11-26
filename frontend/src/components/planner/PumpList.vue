<script setup lang="ts">
import {useConfirm} from '@emberbox/ui'
import {computed, ref} from 'vue'
import type {RelayMode, Suggestion} from '../../hydraulics/line'
import {PUMP_TYPES} from '../../hydraulics/pumps'
import {t} from '../../i18n'
import {formatBar, formatDistance, formatWhole} from '../../plan/format'
import type {PlanPump} from '../../plan/model'
import type {PlanStore} from '../../plan/store'

/**
 * The pumps along the line: a suggestion that places them, and per pump its type, its own
 * discharge pressure and how it takes its water, with what it receives and delivers.
 */
const props = defineProps<{ store: PlanStore }>()

const confirm = useConfirm()
const plan = computed(() => props.store.plan.value)
const stations = computed(() => props.store.result.value?.stations ?? [])
const suggestion = ref<Suggestion | null>(null)
const canPlan = computed(() => plan.value.route.length >= 2)

const typeItems = PUMP_TYPES.map(type => ({value: type.id, label: type.name}))
const modeItems = computed(() => [
  {value: 'line', label: t('planner.pumps.modeDefault')},
  ...(['closed', 'open'] as RelayMode[]).map(value => ({value, label: t(`planner.hydraulics.${value}`)})),
])

async function suggest() {
  if (plan.value.pumps.length && !await confirm(t('planner.pumps.suggest'), {
    description: t('planner.pumps.suggestQuestion'), confirmLabel: t('planner.pumps.suggest'),
  })) return
  suggestion.value = props.store.suggestPumps()
}

/** The stored pump behind an ordered one, which is what the fields edit. */
function stored(pump: PlanPump): PlanPump {
  return plan.value.pumps.find(candidate => candidate.id === pump.id) ?? pump
}

function setDischarge(pump: PlanPump, value: number | null | undefined) {
  stored(pump).discharge = value === null || value === undefined || Number.isNaN(value) ? null : value
}

function setMode(pump: PlanPump, value: string) {
  stored(pump).mode = value === 'line' ? null : value as RelayMode
}

function setType(pump: PlanPump, value: string) {
  stored(pump).type = value
}

const failure = computed(() => {
  const current = suggestion.value
  if (!current || current.feasible || !current.problem) return null
  return t(`planner.pumps.suggestFailed.${current.problem}`, {distance: formatDistance(current.stuckAt ?? 0)})
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-2">
      <UButton icon="i-lucide-wand-sparkles" :label="t('planner.pumps.suggest')"
               :disabled="!canPlan || store.heightsPending.value" :loading="store.heightsPending.value" @click="suggest"/>
      <UButton color="neutral" variant="outline" icon="i-lucide-plus" :label="t('planner.pumps.add')"
               :disabled="!canPlan" @click="store.addPump()"/>
    </div>
    <UAlert v-if="failure" color="error" variant="subtle" icon="i-lucide-triangle-alert" :description="failure"/>
    <p v-if="!store.pumps.value.length" class="m-0 text-sm text-muted">{{ t('planner.pumps.none') }}</p>
    <ol class="m-0 flex list-none flex-col gap-3 p-0">
      <li v-for="(pump, index) in store.pumps.value" :key="pump.id"
          class="flex flex-col gap-2 rounded-md border border-default p-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <span class="font-semibold">{{ t('planner.pumps.name', {number: index + 1}) }}</span>
            <span class="text-sm text-muted"> · {{ t('planner.pumps.at', {distance: formatDistance(pump.at)}) }}</span>
          </div>
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-trash-2"
                   :aria-label="t('planner.pumps.remove')" @click="store.removePump(pump.id)"/>
        </div>
        <USelect :model-value="pump.type" :items="typeItems" size="sm" class="w-full"
                 @update:model-value="value => setType(pump, value as string)"/>
        <div class="grid grid-cols-2 gap-2">
          <UFormField :label="t('planner.pumps.discharge')" size="sm">
            <UInputNumber :model-value="pump.discharge ?? undefined" size="sm" :min="1" :max="20" :step="0.5"
                          :placeholder="t('planner.pumps.dischargeDefault', {value: formatBar(plan.discharge)})"
                          @update:model-value="value => setDischarge(pump, value)"/>
          </UFormField>
          <UFormField :label="t('planner.pumps.mode')" size="sm">
            <USelect v-if="index > 0" :model-value="pump.mode ?? 'line'" :items="modeItems" size="sm" class="w-full"
                     @update:model-value="value => setMode(pump, value as string)"/>
            <p v-else class="m-0 py-1 text-sm text-muted">{{ t('planner.pumps.fromSource') }}</p>
          </UFormField>
        </div>
        <div v-if="stations[index]" class="flex flex-col gap-1 text-sm">
          <div class="text-muted">
            {{ t('planner.result.start') }}: {{ formatBar(stations[index]!.discharge) }}
            · {{ t('planner.pumps.inlet') }}: {{ formatBar(stations[index]!.inlet) }}
          </div>
          <div v-if="stations[index]!.capped" class="text-warning">
            {{ t('planner.result.capped', {cap: formatBar(stations[index]!.cap)}) }}
          </div>
          <div v-for="warning in stations[index]!.warnings" :key="warning.kind" class="text-warning">
            {{ t(`planner.result.warnings.${warning.kind}`, {nominalFlow: 'nominalFlow' in warning ? formatWhole(warning.nominalFlow) : ''}) }}
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>
