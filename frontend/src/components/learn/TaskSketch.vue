<script setup lang="ts">
import {computed} from 'vue'
import {t} from '../../i18n'
import {formatDistance, formatHeight} from '../../plan/format'
import type {Task} from '../../learn/task'

/**
 * A drawn longitudinal profile of a task: each stretch as a slope with its length and its rise or
 * fall, the source at the left and the end at the right. Heights are exaggerated so that a rise
 * of a few dozen metres over kilometres can be seen.
 */
const props = defineProps<{ task: Task }>()

const WIDTH = 640
const HEIGHT = 170
const MARGIN = {left: 24, right: 24, top: 30, bottom: 34}

const points = computed(() => {
  const result: {at: number, height: number}[] = [{at: 0, height: 0}]
  for (const stretch of props.task.stretches) {
    const last = result.at(-1)!
    result.push({at: last.at + stretch.length, height: last.height + stretch.rise})
  }
  return result
})

const scale = computed(() => {
  const length = points.value.at(-1)!.at
  const heights = points.value.map(point => point.height)
  const middle = (Math.min(...heights) + Math.max(...heights)) / 2
  const span = Math.max(Math.max(...heights) - Math.min(...heights), 10)
  const high = middle + span / 2
  return {
    x: (at: number) => MARGIN.left + at / length * (WIDTH - MARGIN.left - MARGIN.right),
    y: (height: number) => MARGIN.top + (high - height) / span * (HEIGHT - MARGIN.top - MARGIN.bottom),
  }
})

const line = computed(() => points.value
    .map((point, index) => `${index ? 'L' : 'M'}${scale.value.x(point.at).toFixed(1)},${scale.value.y(point.height).toFixed(1)}`)
    .join(''))

const labels = computed(() => props.task.stretches.map((stretch, index) => {
  const from = points.value[index]!
  const to = points.value[index + 1]!
  const rise = stretch.rise === 0
      ? t('learn.sketch.flat')
      : stretch.rise > 0
          ? t('learn.sketch.up', {rise: formatHeight(stretch.rise)})
          : t('learn.sketch.down', {rise: formatHeight(-stretch.rise)})
  return {
    x: (scale.value.x(from.at) + scale.value.x(to.at)) / 2,
    y: Math.min(scale.value.y(from.height), scale.value.y(to.height)) - 8,
    length: formatDistance(stretch.length),
    rise,
  }
}))
</script>

<template>
  <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" class="task-sketch block h-auto w-full" role="img"
       :aria-label="t('learn.sketch.label')">
    <line :x1="MARGIN.left" :x2="WIDTH - MARGIN.right" :y1="HEIGHT - MARGIN.bottom + 12" :y2="HEIGHT - MARGIN.bottom + 12"
          class="task-sketch-base"/>
    <path :d="line" class="task-sketch-line"/>
    <g v-for="(label, index) in labels" :key="index">
      <text :x="label.x" :y="label.y" text-anchor="middle" class="task-sketch-rise">{{ label.rise }}</text>
      <text :x="label.x" :y="HEIGHT - MARGIN.bottom + 28" text-anchor="middle" class="task-sketch-length">{{ label.length }}</text>
    </g>
    <circle :cx="scale.x(0)" :cy="scale.y(0)" r="6" class="task-sketch-pump"/>
    <text :x="scale.x(0)" :y="scale.y(0) - 12" text-anchor="start" class="task-sketch-mark">P1</text>
    <circle :cx="scale.x(points.at(-1)!.at)" :cy="scale.y(points.at(-1)!.height)" r="6" class="task-sketch-end"/>
    <text :x="scale.x(points.at(-1)!.at)" :y="scale.y(points.at(-1)!.height) - 12" text-anchor="end" class="task-sketch-mark">
      {{ t('planner.result.end') }}
    </text>
  </svg>
</template>

<style scoped>
.task-sketch-base {
  stroke: var(--ui-border);
}

.task-sketch-line {
  fill: none;
  stroke: var(--ui-text-highlighted);
  stroke-width: 3;
  stroke-linejoin: round;
}

.task-sketch-rise,
.task-sketch-length,
.task-sketch-mark {
  font-size: 13px;
  fill: var(--ui-text);
}

.task-sketch-length {
  fill: var(--ui-text-muted);
}

.task-sketch-mark {
  font-weight: 600;
}

.task-sketch-pump {
  fill: var(--ui-signal);
}

.task-sketch-end {
  fill: var(--ui-bg);
  stroke: var(--ui-text-highlighted);
  stroke-width: 2;
}
</style>
