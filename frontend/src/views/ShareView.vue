<script setup lang="ts">
import {useConfirm} from '@emberbox/ui'
import {onMounted, ref} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {fetchShare, type ShareFailure} from '../api/shares'
import {t} from '../i18n'
import {openSharedTask} from '../learn/progress'
import {readTask} from '../learn/shared'
import {readPlan} from '../plan/model'
import {hasStoredPlan, storePlan} from '../plan/store'

/**
 * Opens a shared link: a line as a copy in the planner, a task in the learning part. A line
 * replaces the one kept in this browser only after asking.
 */
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const failure = ref<ShareFailure | 'invalid' | 'storage' | null>(null)

onMounted(async () => {
  const token = String(route.params.token ?? '')
  const answer = await fetchShare(token)
  if (!answer.ok) {
    failure.value = answer.reason
    return
  }
  if (answer.kind === 'task') {
    const task = readTask(answer.document, token)
    if (!task) {
      failure.value = 'invalid'
      return
    }
    if (!openSharedTask(task)) {
      failure.value = 'storage'
      return
    }
    await router.replace('/lernen')
    return
  }
  const plan = readPlan(answer.document)
  if (!plan) {
    failure.value = 'invalid'
    return
  }
  if (hasStoredPlan() && !await confirm(t('share.openQuestion'), {
    description: t('share.openHelp'), confirmLabel: t('share.open'),
  })) {
    await router.replace('/planer')
    return
  }
  if (!storePlan(plan)) {
    failure.value = 'storage'
    return
  }
  await router.replace('/planer')
})
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4 py-8">
    <p v-if="!failure" class="m-0 text-muted">{{ t('share.opening') }}</p>
    <template v-else>
      <UAlert color="error" variant="subtle" icon="i-lucide-link-2-off" :description="t(`share.failed.${failure}`)"/>
      <UButton to="/planer" color="neutral" variant="outline" class="self-start" :label="t('nav.openPlanner')"/>
    </template>
  </div>
</template>
