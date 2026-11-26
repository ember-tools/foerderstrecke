<script setup lang="ts">
import {useConfirm} from '@emberbox/ui'
import {computed, reactive, ref, watch} from 'vue'
import {useRouter} from 'vue-router'
import TaskSketch from '../components/learn/TaskSketch.vue'
import {FRICTION_TABLES, type FrictionTableId} from '../hydraulics/friction'
import {t} from '../i18n'
import {checkAnswers, type Verdict} from '../learn/check'
import {taskAsPlan} from '../learn/planner'
import {newSeed, useLearningState} from '../learn/progress'
import {solutionSteps} from '../learn/steps'
import {type Question, solveTask, taskLine, taskPump} from '../learn/task'
import {FIXED_TASKS, generateTask, type Stage, STAGES} from '../learn/tasks'
import {formatBar, formatDistance, formatHeight, formatWhole} from '../plan/format'
import {hasStoredPlan, storePlan} from '../plan/store'

/**
 * Relay calculations to solve by hand: a task in stages or from the teaching material, fields for
 * the asked results, a check with tolerance, and the worked solution with the planner's formulas.
 */
const router = useRouter()
const confirm = useConfirm()
const {state, save, record, resetProgress} = useLearningState()

const task = computed(() => {
  const current = state.value.current
  if ('fixed' in current) return FIXED_TASKS.find(candidate => candidate.id === current.fixed) ?? FIXED_TASKS[0]!
  return generateTask(state.value.stage, current.seed, state.value.table)
})
const solution = computed(() => solveTask(task.value))
const steps = computed(() => solutionSteps(task.value, solution.value))
const line = computed(() => taskLine(task.value))
const answers = reactive<Partial<Record<Question, number | null>>>({})
const verdicts = ref<Verdict[] | null>(null)
const showSolution = ref(false)
const peeked = ref(false)
const toast = useToast()

watch(task, () => {
  for (const question of Object.keys(answers) as Question[]) delete answers[question]
  verdicts.value = null
  showSolution.value = false
  peeked.value = false
})

watch(showSolution, shown => {
  if (shown && !verdicts.value?.every(verdict => verdict.correct)) peeked.value = true
})

const stageItems = STAGES.map(value => ({value, label: t(`learn.stages.${value}`)}))
const tableItems = (Object.keys(FRICTION_TABLES) as FrictionTableId[]).map(value => ({value, label: t(`planner.tables.${value}`)}))
const fixedItems = FIXED_TASKS.map(entry => ({value: entry.id, label: entry.source ?? entry.id}))

const stage = computed({
  get: () => state.value.stage,
  set: (value: Stage) => {
    state.value.stage = value
    state.value.current = {seed: newSeed()}
    save()
  },
})

const table = computed({
  get: () => state.value.table,
  set: (value: FrictionTableId) => {
    state.value.table = value
    if ('seed' in state.value.current) state.value.current = {seed: newSeed()}
    save()
  },
})

const fixedId = computed({
  get: () => 'fixed' in state.value.current ? state.value.current.fixed : undefined,
  set: (value: string | undefined) => {
    if (!value) return
    state.value.current = {fixed: value}
    save()
  },
})

function nextTask() {
  state.value.current = {seed: newSeed()}
  save()
}

function setAnswer(question: Question, value: number | null | undefined) {
  answers[question] = typeof value === 'number' && Number.isFinite(value) ? value : null
}

function check() {
  verdicts.value = checkAnswers(task.value.asked, solution.value, answers)
  record(task.value.id, !peeked.value && verdicts.value.every(verdict => verdict.correct))
}

function verdictOf(question: Question): Verdict | undefined {
  return verdicts.value?.find(verdict => verdict.question === question)
}

function formatAnswer(question: Question, value: number | null): string {
  if (value === null) return '–'
  if (question === 'needed' || question === 'discharge') return formatBar(value)
  if (question === 'spacing') return formatDistance(value)
  return formatWhole(value)
}

const correctCount = computed(() => verdicts.value?.filter(verdict => verdict.correct).length ?? 0)

const placedPumps = computed(() => {
  if (!task.value.asked.includes('pumps') || task.value.firstDischarges.length) return null
  return taskAsPlan(task.value).pumps.length
})

async function openInPlanner() {
  if (hasStoredPlan() && !await confirm(t('learn.openInPlanner'), {
    description: t('learn.replacePlan'), confirmLabel: t('learn.openInPlanner'),
  })) return
  if (!storePlan(taskAsPlan(task.value))) {
    toast.add({title: t('learn.storageBlocked'), color: 'error', icon: 'i-lucide-triangle-alert'})
    return
  }
  await router.push('/planer')
}

const given = computed(() => {
  const current = task.value
  const entries: {label: string, value: string}[] = []
  entries.push({label: t('learn.task.length'), value: formatDistance(line.value.length)})
  if (current.stretches.length > 1) {
    entries.push({
      label: t('learn.task.stretches'),
      value: current.stretches.map(stretch => stretch.rise === 0
          ? t('learn.task.stretchFlat', {length: formatDistance(stretch.length)})
          : t(stretch.rise > 0 ? 'learn.task.stretchUp' : 'learn.task.stretchDown',
              {length: formatDistance(stretch.length), rise: formatHeight(Math.abs(stretch.rise))})).join('; '),
    })
  } else if (current.stretches[0]!.rise !== 0) {
    const rise = current.stretches[0]!.rise
    entries.push({
      label: t('learn.task.stretches'),
      value: t(rise > 0 ? 'learn.task.stretchUp' : 'learn.task.stretchDown',
          {length: formatDistance(line.value.length), rise: formatHeight(Math.abs(rise))}),
    })
  }
  entries.push({label: t('learn.task.flow'), value: `${formatWhole(current.flow)} l/min`})
  const size = FRICTION_TABLES[current.table].hose
  entries.push({
    label: t('learn.task.hose'),
    value: t(current.lines === 2 ? 'learn.task.hoseDouble' : 'learn.task.hoseSingle', {size}),
  })
  entries.push({label: t('learn.task.table'), value: t(`planner.tables.${current.table}`)})
  entries.push({label: t('learn.task.pump'), value: taskPump(current, current.firstDischarges.length).name})
  if (current.firstDischarges.length) {
    entries.push({
      label: t('learn.task.firstDischarges'),
      value: current.firstDischarges.map((pressure, index) => `${formatBar(pressure)} (${taskPump(current, index).name})`).join(', '),
    })
  }
  if (!current.asked.includes('discharge')) {
    entries.push({
      label: t(current.firstDischarges.length ? 'learn.task.dischargeRest' : 'learn.task.discharge'),
      value: formatBar(current.discharge),
    })
  }
  entries.push({label: t('learn.task.endRequirement'), value: formatBar(current.endRequirement)})
  if (current.givenPumps !== null) entries.push({label: t('learn.task.givenPumps'), value: String(current.givenPumps)})
  return entries
})
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-6">
    <header class="flex flex-col gap-2">
      <h1 class="headline m-0 text-3xl">{{ t('learn.heading') }}</h1>
      <p class="m-0 text-muted">{{ t('learn.intro') }}</p>
    </header>

    <div class="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <UFormField :label="t('learn.stage')">
        <USelect v-model="stage" :items="stageItems" class="w-full"/>
      </UFormField>
      <UFormField :label="t('learn.table')">
        <USelect v-model="table" :items="tableItems" class="w-full"/>
      </UFormField>
      <UButton icon="i-lucide-shuffle" :label="t('learn.next')" @click="nextTask"/>
    </div>
    <UFormField :label="t('learn.fixed')">
      <USelect v-model="fixedId" :items="fixedItems" :placeholder="t('learn.fixedPlaceholder')" class="w-full"/>
    </UFormField>

    <section class="flex flex-col gap-4 rounded-md border border-default p-4">
      <p v-if="task.source" class="m-0 text-sm text-muted">{{ t('learn.source', {source: task.source}) }}</p>
      <TaskSketch :task="task"/>
      <div class="grid gap-6 md:grid-cols-2">
        <div>
          <h2 class="m-0 mb-2 text-base font-semibold">{{ t('learn.given') }}</h2>
          <dl class="m-0 flex flex-col gap-1 text-sm">
            <div v-for="entry in given" :key="entry.label" class="grid grid-cols-[11rem_1fr] gap-2">
              <dt class="text-muted">{{ entry.label }}</dt>
              <dd class="m-0">{{ entry.value }}</dd>
            </div>
          </dl>
          <p class="m-0 mt-2 text-xs text-muted">{{ t('learn.task.mode') }}</p>
        </div>
        <form class="flex flex-col gap-3" @submit.prevent="check">
          <h2 class="m-0 text-base font-semibold">{{ t('learn.asked') }}</h2>
          <UFormField v-for="question in task.asked" :key="`${task.id}-${question}`" :label="t(`learn.questions.${question}`)">
            <div class="flex items-center gap-2">
              <UInputNumber :model-value="answers[question] ?? undefined" :step="question === 'needed' || question === 'discharge' ? 0.1 : 1"
                            :format-options="{maximumFractionDigits: 2}" class="w-40"
                            :color="verdictOf(question) ? (verdictOf(question)!.correct ? 'success' : 'error') : undefined"
                            :highlight="Boolean(verdictOf(question))"
                            @update:model-value="value => setAnswer(question, value)"/>
              <span v-if="verdictOf(question)" class="flex items-center gap-1 text-sm"
                    :class="verdictOf(question)!.correct ? 'text-success' : 'text-error'">
                <UIcon :name="verdictOf(question)!.correct ? 'i-lucide-circle-check' : 'i-lucide-circle-x'" class="size-4"/>
                {{ verdictOf(question)!.answer === null ? t('learn.missing') : verdictOf(question)!.correct ? t('learn.correct') : t('learn.wrong') }}
              </span>
            </div>
            <p v-if="verdictOf(question) && showSolution" class="m-0 mt-1 text-sm text-muted">
              {{ t('learn.expected', {value: formatAnswer(question, verdictOf(question)!.expected)}) }}
            </p>
          </UFormField>
          <div class="flex flex-wrap gap-2">
            <UButton type="submit" icon="i-lucide-check" :label="t('learn.check')"/>
            <UButton color="neutral" variant="outline" :icon="showSolution ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                     :label="showSolution ? t('learn.hideSolution') : t('learn.showSolution')"
                     @click="showSolution = !showSolution"/>
            <UButton color="neutral" variant="ghost" icon="i-lucide-map" :label="t('learn.openInPlanner')" @click="openInPlanner"/>
          </div>
          <p v-if="verdicts" class="m-0 text-sm font-semibold">
            {{ correctCount === verdicts.length ? t('learn.allCorrect') : t('learn.someWrong', {correct: correctCount, total: verdicts.length}) }}
          </p>
        </form>
      </div>
    </section>

    <section v-if="showSolution" class="flex flex-col gap-3">
      <h2 class="m-0 text-lg font-semibold">{{ t('learn.solution') }}</h2>
      <ol class="m-0 flex flex-col gap-3 pl-5">
        <li v-for="(step, index) in steps" :key="index">
          <div class="font-semibold">{{ step.title }}</div>
          <div class="text-sm">{{ step.working }}</div>
        </li>
      </ol>
      <UAlert v-if="placedPumps !== null && solution.textbook.pumps !== null && placedPumps !== solution.textbook.pumps"
              color="info" variant="subtle" icon="i-lucide-info"
              :description="t('learn.placedDiffers', {placed: placedPumps, pumps: solution.textbook.pumps})"/>
    </section>

    <p class="m-0 flex flex-wrap items-center gap-2 text-sm text-muted">
      {{ t('learn.progress', {solved: state.solved.length, tried: state.tried.length}) }}
      <UButton v-if="state.tried.length" color="neutral" variant="link" size="sm" :label="t('learn.resetProgress')"
               @click="resetProgress"/>
    </p>
  </div>
</template>
