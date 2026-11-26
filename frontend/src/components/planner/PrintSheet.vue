<script setup lang="ts">
import {computed} from 'vue'
import {pumpType} from '../../hydraulics/pumps'
import {t} from '../../i18n'
import {formatBar, formatDistance, formatPosition, formatWhole} from '../../plan/format'
import {pointAt} from '../../plan/geo'
import {sectionStatus} from '../../plan/status'
import type {PlanStore} from '../../plan/store'

/**
 * The printed overview for preparing an exercise: material, pump stations and the sections with
 * their pressures. Shown only on paper; the profile is printed from the page above it.
 */
const props = defineProps<{ store: PlanStore }>()

const {material, sections} = props.store

const plan = computed(() => props.store.plan.value)
const result = computed(() => props.store.result.value)

function modeText(index: number): string {
  const mode = result.value?.stations[index]?.mode
  return mode ? t(`planner.hydraulics.${mode}`) : t('planner.pumps.fromSource')
}
</script>

<template>
  <section class="planner-print">
    <h1 class="m-0 text-xl font-semibold">{{ plan.title || t('planner.untitled') }}</h1>
    <p class="m-0 text-sm">{{ t('planner.print.heading') }} · {{ t('planner.notOperational') }}</p>
    <template v-if="result && material">
      <p class="m-0 mt-2 font-semibold">{{ result.holds ? t('planner.result.holds') : t('planner.result.fails') }}</p>
      <p class="m-0 text-sm">
        {{ t('planner.result.length') }} {{ formatDistance(result.length) }} ·
        {{ t(`planner.source.${plan.source.kind}`) }} ·
        {{ t('units.flow', {flow: formatWhole(plan.flow)}) }} · {{ t(`planner.tables.${plan.table}`) }} ·
        {{ plan.lines === 2 ? t('planner.hydraulics.double') : t('planner.hydraulics.single') }} ·
        {{ t('planner.result.required') }} {{ formatBar(plan.end.requirement) }}
      </p>

      <h2 class="mt-3 mb-1 text-base font-semibold">{{ t('planner.print.material') }}</h2>
      <ul class="m-0 pl-5 text-sm">
        <li>{{ t('planner.result.hosesDetail', {count: material.hoses, size: material.hose, reserve: material.reserve}) }}</li>
        <li v-for="entry in material.pumps" :key="entry.name">{{ entry.count }} × {{ entry.name }}</li>
        <li v-if="material.breechings">{{ material.breechings }} × {{ t('planner.print.breeching') }}</li>
        <li v-if="material.tanks">{{ material.tanks }} × {{ t('planner.print.tank') }}</li>
      </ul>

      <h2 class="mt-3 mb-1 text-base font-semibold">{{ t('planner.print.stations') }}</h2>
      <table class="print-table">
        <thead>
          <tr>
            <th/>
            <th>{{ t('planner.print.position') }}</th>
            <th>{{ t('planner.print.coordinates') }}</th>
            <th>{{ t('planner.hydraulics.pumpType') }}</th>
            <th>{{ t('planner.pumps.mode') }}</th>
            <th>{{ t('planner.pumps.inlet') }}</th>
            <th>{{ t('planner.result.start') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(station, index) in result.stations" :key="index">
            <td>P{{ index + 1 }}</td>
            <td>{{ formatDistance(station.at) }}</td>
            <td>{{ formatPosition(pointAt(plan.route, station.at)) }}</td>
            <td>{{ pumpType(station.pump.id).name }}</td>
            <td>{{ modeText(index) }}</td>
            <td>{{ formatBar(station.inlet) }}</td>
            <td>{{ formatBar(station.discharge) }}</td>
          </tr>
        </tbody>
      </table>

      <h2 class="mt-3 mb-1 text-base font-semibold">{{ t('planner.result.section') }}</h2>
      <table class="print-table">
        <thead>
          <tr>
            <th/>
            <th>{{ t('planner.result.length') }}</th>
            <th>{{ t('planner.result.hoses') }}</th>
            <th>{{ t('planner.result.start') }}</th>
            <th>{{ t('planner.result.friction') }}</th>
            <th>{{ t('planner.result.height') }}</th>
            <th>{{ t('planner.result.arrival') }}</th>
            <th>{{ t('planner.result.required') }}</th>
            <th>{{ t('planner.result.reserve') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in sections" :key="index">
            <td>{{ item.name }}</td>
            <td>{{ formatDistance(item.section.length) }}</td>
            <td>{{ item.hoses }}</td>
            <td>{{ formatBar(item.section.startPressure) }}</td>
            <td>{{ formatBar(item.section.friction) }}</td>
            <td>{{ formatBar(item.section.height) }}</td>
            <td>{{ formatBar(item.section.endPressure) }}</td>
            <td>{{ formatBar(item.section.required) }}</td>
            <td>{{ formatBar(item.section.reserve) }} {{ t(`planner.print.status.${sectionStatus(item.section)}`) }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>

<style scoped>
.planner-print {
  display: none;
}

.print-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.print-table th,
.print-table td {
  padding: 2px 4px;
  text-align: left;
  border-bottom: 1px solid var(--color-steel-400);
}

@media print {
  .planner-print {
    display: block;
    color: var(--color-black);
  }
}
</style>
