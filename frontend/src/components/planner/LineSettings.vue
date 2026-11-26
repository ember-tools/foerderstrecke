<script setup lang="ts">
import {computed} from 'vue'
import {FRICTION_TABLES, type FrictionTableId} from '../../hydraulics/friction'
import {END_REQUIREMENTS, type RelayMode} from '../../hydraulics/line'
import {PUMP_TYPES} from '../../hydraulics/pumps'
import {t} from '../../i18n'
import {type EndPreset, HYDRANT_YIELD, isHydrant, type SourceKind} from '../../plan/model'
import type {PlanStore} from '../../plan/store'

/** The settings of a line: source, end, hose and pumps, the way every pump runs. */
const props = defineProps<{ store: PlanStore }>()

const plan = computed(() => props.store.plan.value)

const sourceItems = (['open-water', 'hydrant-underground', 'hydrant-pillar', 'tank'] as SourceKind[])
    .map(value => ({value, label: t(`planner.source.${value}`)}))
const endItems = (['multiPurpose', 'hollowJet', 'freeOutflow', 'custom'] as EndPreset[])
    .map(value => ({value, label: t(`planner.end.${value}`)}))
const tableItems = (Object.keys(FRICTION_TABLES) as FrictionTableId[])
    .map(value => ({value, label: t(`planner.tables.${value}`)}))
const lineItems = [{value: 1, label: t('planner.hydraulics.single')}, {value: 2, label: t('planner.hydraulics.double')}]
const modeItems = (['closed', 'open'] as RelayMode[]).map(value => ({value, label: t(`planner.hydraulics.${value}`)}))
const pumpItems = PUMP_TYPES.map(type => ({value: type.id, label: type.name}))

const sourceKind = computed({
  get: () => plan.value.source.kind,
  set: (kind: SourceKind) => {
    if (isHydrant(kind) && kind !== plan.value.source.kind) plan.value.source.yield = HYDRANT_YIELD[kind]
    plan.value.source.kind = kind
  },
})

/** A number field's model that keeps the last value while the field is empty or not a number. */
function numberField(read: () => number, write: (value: number) => void) {
  return computed({
    get: read,
    set: (value: number | null | undefined) => {
      if (typeof value === 'number' && Number.isFinite(value)) write(value)
    },
  })
}

const suctionLift = numberField(() => plan.value.source.suctionLift, value => plan.value.source.suctionLift = value)
const hydrantPressure = numberField(() => plan.value.source.pressure, value => plan.value.source.pressure = value)
const hydrantYield = numberField(() => plan.value.source.yield, value => plan.value.source.yield = value)
const requirement = numberField(() => plan.value.end.requirement, value => plan.value.end.requirement = value)
const flow = numberField(() => plan.value.flow, value => plan.value.flow = value)
const discharge = numberField(() => plan.value.discharge, value => plan.value.discharge = value)
const reserve = numberField(() => plan.value.reservePer100, value => plan.value.reservePer100 = value)

const endPreset = computed({
  get: () => plan.value.end.preset,
  set: (preset: EndPreset) => {
    plan.value.end.preset = preset
    if (preset !== 'custom') plan.value.end.requirement = END_REQUIREMENTS[preset]
  },
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <section class="flex flex-col gap-3">
      <h3 class="m-0 text-sm font-semibold">{{ t('planner.source.label') }}</h3>
      <USelect v-model="sourceKind" :items="sourceItems" class="w-full"/>
      <UFormField v-if="plan.source.kind === 'open-water'" :label="t('planner.source.suctionLift')"
                  :help="t('planner.source.suctionLiftHelp')">
        <UInputNumber v-model="suctionLift" :min="0" :max="20" :step="0.5" class="w-full"/>
      </UFormField>
      <div v-if="isHydrant(plan.source.kind)" class="grid grid-cols-2 gap-3">
        <UFormField :label="t('planner.source.pressure')">
          <UInputNumber v-model="hydrantPressure" :min="0" :max="20" :step="0.5" class="w-full"/>
        </UFormField>
        <UFormField :label="t('planner.source.yield')">
          <UInputNumber v-model="hydrantYield" :min="0" :max="10000" :step="100" class="w-full"/>
        </UFormField>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h3 class="m-0 text-sm font-semibold">{{ t('planner.end.label') }}</h3>
      <USelect v-model="endPreset" :items="endItems" class="w-full"/>
      <UFormField v-if="plan.end.preset === 'custom'" :label="t('planner.end.requirement')">
        <UInputNumber v-model="requirement" :min="0" :max="20" :step="0.5" class="w-full"/>
      </UFormField>
    </section>

    <section class="flex flex-col gap-3">
      <UFormField :label="t('planner.hydraulics.flow')">
        <UInputNumber v-model="flow" :min="0" :max="5000" :step="50" class="w-full"/>
      </UFormField>
      <div class="grid grid-cols-2 gap-3">
        <UFormField :label="t('planner.hydraulics.table')">
          <USelect v-model="plan.table" :items="tableItems" class="w-full"/>
        </UFormField>
        <UFormField :label="t('planner.hydraulics.lines')">
          <USelect v-model="plan.lines" :items="lineItems" class="w-full"/>
        </UFormField>
      </div>
      <UFormField :label="t('planner.hydraulics.discharge')" :help="t('planner.hydraulics.dischargeHelp')">
        <UInputNumber v-model="discharge" :min="1" :max="20" :step="0.5" class="w-full"/>
      </UFormField>
      <div class="grid grid-cols-2 gap-3">
        <UFormField :label="t('planner.hydraulics.mode')">
          <USelect v-model="plan.mode" :items="modeItems" class="w-full"/>
        </UFormField>
        <UFormField :label="t('planner.hydraulics.pumpType')">
          <USelect v-model="plan.pumpType" :items="pumpItems" class="w-full"/>
        </UFormField>
      </div>
      <UFormField :label="t('planner.hydraulics.reserve')">
        <UInputNumber v-model="reserve" :min="0" :max="10" :step="1" class="w-full"/>
      </UFormField>
    </section>
  </div>
</template>
