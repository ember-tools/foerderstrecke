<script setup lang="ts">
import {useConfirm} from '@emberbox/ui'
import {computed, onBeforeUnmount, onMounted, ref, useTemplateRef} from 'vue'
import {fetchElevationInfo} from '../api/elevation'
import HeightList from '../components/planner/HeightList.vue'
import LineSettings from '../components/planner/LineSettings.vue'
import PlannerMap from '../components/planner/PlannerMap.vue'
import PrintSheet from '../components/planner/PrintSheet.vue'
import ProfileChart from '../components/planner/ProfileChart.vue'
import PumpList from '../components/planner/PumpList.vue'
import ResultPanel from '../components/planner/ResultPanel.vue'
import ShareDialog, {type ShareOption} from '../components/share/ShareDialog.vue'
import {planAsTask} from '../learn/shared'
import {t} from '../i18n'
import {createPlanStore} from '../plan/store'

/** The planner: the line on the map, its profile below, and its settings and result beside. */
const store = createPlanStore()
const confirm = useConfirm()
const drawing = ref(store.plan.value.route.length === 0)
const hover = ref<number | null>(null)
const tab = ref('line')
const attribution = ref<string | null>(null)
const mapView = useTemplateRef<InstanceType<typeof PlannerMap>>('mapView')

const tabs = [
  {value: 'line', label: t('planner.tabLine'), slot: 'line' as const},
  {value: 'pumps', label: t('planner.tabPumps'), slot: 'pumps' as const},
  {value: 'result', label: t('planner.tabResult'), slot: 'result' as const},
]

const heightsKnown = computed(() => store.plan.value.heightSource === 'manual'
    || store.elevation.value.state === 'ready'
    || (store.elevation.value.state === 'failed' && store.plan.value.corrections.some(correction => correction !== null)))

const shareOptions = computed<ShareOption[]>(() => [
  {
    kind: 'plan',
    label: t('share.plan'),
    description: t('share.planHelp'),
    title: store.plan.value.title,
    document: () => store.plan.value,
  },
  {
    kind: 'task',
    label: t('share.task'),
    description: t('share.taskHelp'),
    title: store.plan.value.title,
    document: () => planAsTask(store.plan.value, store.profile.value),
    blocked: heightsKnown.value ? null : t('share.taskNeedsHeights'),
  },
])

onMounted(async () => {
  window.addEventListener('pagehide', store.flush)
  attribution.value = (await fetchElevationInfo())?.attribution ?? null
})

onBeforeUnmount(() => {
  window.removeEventListener('pagehide', store.flush)
  store.flush()
})

async function clear() {
  if (!await confirm(t('planner.draw.clearQuestion'), {confirmLabel: t('planner.draw.clear'), danger: true})) return
  store.clearRoute()
  drawing.value = true
}

function print() {
  window.print()
}
</script>

<template>
  <div class="planner flex flex-col gap-4">
    <div class="planner-screen flex flex-wrap items-center gap-2">
      <UInput v-model="store.plan.value.title" :placeholder="t('planner.titlePlaceholder')"
              :aria-label="t('planner.title')" class="min-w-60 grow"/>
      <UButton :color="drawing ? 'primary' : 'neutral'" :variant="drawing ? 'solid' : 'outline'"
               icon="i-lucide-pencil-line" :label="drawing ? t('planner.draw.stop') : t('planner.draw.start')"
               @click="drawing = !drawing"/>
      <UButton color="neutral" variant="outline" icon="i-lucide-scan" :label="t('planner.draw.fit')"
               :disabled="store.plan.value.route.length < 2" @click="mapView?.fit()"/>
      <UButton color="neutral" variant="outline" icon="i-lucide-arrow-left-right" :label="t('planner.draw.reverse')"
               :disabled="store.plan.value.route.length < 2" @click="store.reverseRoute()"/>
      <ShareDialog :options="shareOptions" :disabled="store.plan.value.route.length < 2"/>
      <UButton color="neutral" variant="outline" icon="i-lucide-printer" :label="t('planner.print.action')"
               :disabled="!store.result.value" @click="print"/>
      <UButton color="neutral" variant="ghost" icon="i-lucide-trash-2" :label="t('planner.draw.clear')"
               :disabled="!store.plan.value.route.length" @click="clear"/>
    </div>
    <p v-if="drawing" class="planner-screen m-0 text-sm text-muted">{{ t('planner.draw.hint') }}</p>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div class="flex min-w-0 flex-col gap-4">
        <div class="planner-screen h-[55vh] min-h-80 overflow-hidden rounded-md border border-default">
          <PlannerMap ref="mapView" :store="store" :drawing="drawing" :hover="hover"/>
        </div>
        <ProfileChart :store="store" @hover="value => hover = value"/>
        <p class="planner-screen m-0 flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-graduation-cap" class="size-4 shrink-0"/>
          {{ t('planner.notOperational') }} {{ t('planner.basis') }}
        </p>
      </div>
      <aside class="planner-screen min-w-0">
        <UTabs v-model="tab" :items="tabs" :unmount-on-hide="false" class="w-full">
          <template #line>
            <div class="flex flex-col gap-6 pt-2">
              <LineSettings :store="store"/>
              <HeightList v-if="store.plan.value.route.length" :store="store" :attribution="attribution"/>
            </div>
          </template>
          <template #pumps>
            <div class="pt-2">
              <PumpList :store="store"/>
            </div>
          </template>
          <template #result>
            <div class="pt-2">
              <ResultPanel :store="store"/>
            </div>
          </template>
        </UTabs>
      </aside>
    </div>

    <PrintSheet :store="store"/>
  </div>
</template>

<style>
@media print {
  body:has(.planner) header,
  body:has(.planner) footer,
  .planner-screen {
    display: none !important;
  }
}
</style>
