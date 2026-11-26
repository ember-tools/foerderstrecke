<script setup lang="ts">
import {computed} from 'vue'
import {t} from '../../i18n'
import {givenEntries} from '../../learn/given'
import type {Task} from '../../learn/task'

/** What a task gives, as a list of labelled values, with the rules every task shares below it. */
const props = defineProps<{ task: Task }>()

const entries = computed(() => givenEntries(props.task))
</script>

<template>
  <div>
    <h2 class="m-0 mb-2 text-base font-semibold">{{ t('learn.given') }}</h2>
    <dl class="m-0 flex flex-col gap-1 text-sm">
      <div v-for="entry in entries" :key="entry.label" class="grid grid-cols-[11rem_1fr] gap-2">
        <dt class="text-muted">{{ entry.label }}</dt>
        <dd class="m-0">{{ entry.value }}</dd>
      </div>
    </dl>
    <p class="m-0 mt-2 text-xs text-muted">{{ t('learn.task.mode') }}</p>
  </div>
</template>
