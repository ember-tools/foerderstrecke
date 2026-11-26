<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, useTemplateRef} from 'vue'
import {heightAt} from '../../hydraulics/profile'
import {t} from '../../i18n'
import {niceTicks, pressureCurve, pressureOnLine} from '../../plan/chart'
import {allSections} from '../../plan/sections'
import {formatBar, formatDistance, formatHeight} from '../../plan/format'
import {sectionStatus} from '../../plan/status'
import type {PlanStore} from '../../plan/store'

/**
 * The longitudinal profile of a line: the ground's height over the distance from the source, and
 * below it, on its own axis, the pressure in the hose with each section coloured by how it stands.
 * Pumps are marked across both. Hovering shows the values at a point and reports the distance, so
 * the map can mark the same place.
 */
const props = defineProps<{ store: PlanStore }>()
const emit = defineEmits<{ inspect: [distance: number | null] }>()

const MARGIN = {left: 52, right: 14, top: 18}
const PANEL = 140
const GAP = 46
const AXIS = 26
const HEIGHT = MARGIN.top + PANEL + GAP + PANEL + AXIS

const box = useTemplateRef<HTMLDivElement>('box')
const width = ref(640)
const hovered = ref<number | null>(null)
let observer: ResizeObserver | undefined

onMounted(() => {
  if (!box.value) return
  observer = new ResizeObserver(entries => {
    width.value = Math.max(320, entries[0]!.contentRect.width)
  })
  observer.observe(box.value)
})

onBeforeUnmount(() => observer?.disconnect())

const length = computed(() => props.store.length.value)
const profile = computed(() => props.store.profile.value)
const result = computed(() => props.store.result.value)
const plotWidth = computed(() => width.value - MARGIN.left - MARGIN.right)

const x = (distance: number) => MARGIN.left + (length.value > 0 ? distance / length.value : 0) * plotWidth.value
const heightTop = MARGIN.top
const pressureTop = MARGIN.top + PANEL + GAP

const heightDomain = computed(() => {
  const heights = profile.value.samples.map(([, height]) => height)
  const low = Math.min(...heights)
  const high = Math.max(...heights)
  const pad = Math.max(2, (high - low) * 0.1)
  return [Math.floor(low - pad), Math.ceil(high + pad)] as const
})

const pressureDomain = computed(() => {
  const sections = result.value ? allSections(result.value).map(entry => entry.section) : []
  const low = Math.min(0, ...sections.map(section => section.lowest))
  const high = Math.max(10, ...sections.map(section => section.startPressure))
  return [Math.floor(low), Math.ceil(high)] as const
})

const yHeight = (height: number) => {
  const [low, high] = heightDomain.value
  return heightTop + PANEL - (height - low) / (high - low) * PANEL
}

const yPressure = (pressure: number) => {
  const [low, high] = pressureDomain.value
  return pressureTop + PANEL - (pressure - low) / (high - low) * PANEL
}

const path = (points: [number, number][]) => points.map(([px, py], index) => `${index ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')

const ground = computed(() => {
  const points = profile.value.samples.map(([at, height]) => [x(at), yHeight(height)] as [number, number])
  if (points.length < 2) return {line: '', area: ''}
  const line = path(points)
  return {line, area: `${line}L${points.at(-1)![0].toFixed(1)},${heightTop + PANEL}L${points[0]![0].toFixed(1)},${heightTop + PANEL}Z`}
})

const pressureLines = computed(() => {
  if (!result.value) return []
  const lossPer100 = result.value.lossPer100
  return allSections(result.value).map(entry => entry.section).filter(section => section.length > 0).map((section, index) => ({
    key: index,
    status: sectionStatus(section),
    path: path(pressureCurve(profile.value, section, lossPer100).map(([at, pressure]) => [x(at), yPressure(pressure)])),
    requirement: {x: x(section.end), y: yPressure(section.required)},
  }))
})

const pumpMarks = computed(() => props.store.pumps.value.map((pump, index) => ({
  key: pump.id, x: x(pump.at), label: `P${index + 1}`,
})))

const xTicks = computed(() => niceTicks(0, length.value, Math.max(2, Math.floor(plotWidth.value / 110))))
const heightTicks = computed(() => niceTicks(heightDomain.value[0], heightDomain.value[1], 4))
const pressureTicks = computed(() => niceTicks(pressureDomain.value[0], pressureDomain.value[1], 4))

const readout = computed(() => {
  if (hovered.value === null) return null
  const at = hovered.value
  const height = heightAt(profile.value, at)
  const pressure = result.value ? pressureOnLine(profile.value, result.value, at) : null
  return {
    at,
    x: x(at),
    height,
    heightY: yHeight(height),
    pressure: pressure?.pressure ?? null,
    pressureY: pressure ? yPressure(pressure.pressure) : null,
  }
})

function onMove(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const bounds = svg.getBoundingClientRect()
  const share = (event.clientX - bounds.left - MARGIN.left) / plotWidth.value
  if (share < 0 || share > 1 || length.value <= 0) {
    onLeave()
    return
  }
  hovered.value = share * length.value
  emit('inspect', hovered.value)
}

function onLeave() {
  hovered.value = null
  emit('inspect', null)
}
</script>

<template>
  <figure class="m-0 flex flex-col gap-1">
    <figcaption class="text-sm font-semibold">{{ t('planner.profile.label') }}</figcaption>
    <div ref="box" class="relative w-full">
      <p v-if="length <= 0" class="m-0 py-6 text-sm text-muted">{{ t('planner.profile.empty') }}</p>
      <svg v-else :width="width" :height="HEIGHT" class="profile-chart block" role="img"
           :aria-label="t('planner.profile.label')" @pointermove="onMove" @pointerleave="onLeave">
        <text :x="MARGIN.left" :y="heightTop - 6" class="profile-axis-title">{{ t('planner.profile.height') }}</text>
        <g v-for="tick in heightTicks" :key="`h${tick}`">
          <line :x1="MARGIN.left" :x2="width - MARGIN.right" :y1="yHeight(tick)" :y2="yHeight(tick)" class="profile-grid"/>
          <text :x="MARGIN.left - 6" :y="yHeight(tick) + 4" class="profile-tick" text-anchor="end">{{ tick }}</text>
        </g>
        <path :d="ground.area" class="profile-ground-area"/>
        <path :d="ground.line" class="profile-ground-line"/>

        <text :x="MARGIN.left" :y="pressureTop - 6" class="profile-axis-title">{{ t('planner.profile.pressure') }}</text>
        <g v-for="tick in pressureTicks" :key="`p${tick}`">
          <line :x1="MARGIN.left" :x2="width - MARGIN.right" :y1="yPressure(tick)" :y2="yPressure(tick)"
                :class="tick === 0 ? 'profile-zero' : 'profile-grid'"/>
          <text :x="MARGIN.left - 6" :y="yPressure(tick) + 4" class="profile-tick" text-anchor="end">{{ tick }}</text>
        </g>
        <g v-for="line in pressureLines" :key="line.key">
          <path :d="line.path" class="profile-pressure" :class="`is-${line.status}`"/>
          <line :x1="line.requirement.x - 7" :x2="line.requirement.x" :y1="line.requirement.y" :y2="line.requirement.y"
                class="profile-requirement"/>
        </g>

        <g v-for="pump in pumpMarks" :key="pump.key">
          <line :x1="pump.x" :x2="pump.x" :y1="heightTop" :y2="pressureTop + PANEL" class="profile-pump"/>
          <text :x="pump.x" :y="pressureTop + PANEL + AXIS - 2" class="profile-pump-label" text-anchor="middle">{{ pump.label }}</text>
        </g>

        <g v-for="tick in xTicks" :key="`x${tick}`">
          <text :x="x(tick)" :y="heightTop + PANEL + 16" class="profile-tick" text-anchor="middle">{{ formatDistance(tick) }}</text>
        </g>

        <g v-if="readout">
          <line :x1="readout.x" :x2="readout.x" :y1="heightTop" :y2="pressureTop + PANEL" class="profile-crosshair"/>
          <circle :cx="readout.x" :cy="readout.heightY" r="4" class="profile-dot"/>
          <circle v-if="readout.pressureY !== null" :cx="readout.x" :cy="readout.pressureY" r="4" class="profile-dot"/>
        </g>
      </svg>
      <div v-if="readout" class="profile-tooltip"
           :style="{left: `${Math.min(readout.x + 12, width - 170)}px`, top: `${MARGIN.top}px`}">
        <div class="font-semibold">{{ formatDistance(readout.at) }}</div>
        <div>{{ t('planner.profile.height') }}: {{ formatHeight(readout.height) }}</div>
        <div v-if="readout.pressure !== null">{{ t('planner.profile.pressure') }}: {{ formatBar(readout.pressure) }}</div>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.profile-chart {
  touch-action: pan-y;
}

.profile-axis-title {
  font-size: 12px;
  font-weight: 600;
  fill: var(--ui-text-muted);
}

.profile-tick {
  font-size: 11px;
  fill: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}

.profile-grid {
  stroke: var(--ui-border);
  stroke-width: 1;
}

.profile-zero {
  stroke: var(--ui-text-muted);
  stroke-width: 1;
}

.profile-ground-area {
  fill: var(--ui-bg-accented);
}

.profile-ground-line {
  fill: none;
  stroke: var(--ui-text-muted);
  stroke-width: 2;
  stroke-linejoin: round;
}

.profile-pressure {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
}

.profile-pressure.is-ok {
  stroke: var(--ui-success);
}

.profile-pressure.is-fails {
  stroke: var(--ui-error);
  stroke-dasharray: 6 4;
}

.profile-requirement {
  stroke: var(--ui-text-highlighted);
  stroke-width: 2;
}

.profile-pump {
  stroke: var(--ui-text-muted);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.profile-pump-label {
  font-size: 11px;
  font-weight: 600;
  fill: var(--ui-text-highlighted);
}

.profile-crosshair {
  stroke: var(--ui-text-highlighted);
  stroke-width: 1;
}

.profile-dot {
  fill: var(--ui-primary);
  stroke: var(--ui-bg);
  stroke-width: 2;
}

.profile-tooltip {
  position: absolute;
  pointer-events: none;
  min-width: 150px;
  padding: 6px 8px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--ui-text);
  background-color: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 4px;
}
</style>
