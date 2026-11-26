<script setup lang="ts">
import {copyToClipboard, useConfirm} from '@emberbox/ui'
import {ref} from 'vue'
import {createShare, deleteShare, type ShareFailure, type ShareKind, shareUrl} from '../../api/shares'
import {t} from '../../i18n'
import {forgetShare, type OwnShare, ownShares, rememberShare} from '../../share/own'

/** One thing the dialog can share. */
export interface ShareOption {
  kind: ShareKind
  label: string
  description: string
  title: string
  document: () => object
  /** Why the option cannot be used right now, or null when it can. */
  blocked?: string | null
}

/**
 * Sharing by link: each option stores a snapshot on the server and shows its link. Whoever opens
 * the link gets a copy; the links made here are remembered in this browser so they can be deleted.
 */
const props = defineProps<{ options: ShareOption[], disabled?: boolean }>()

const confirm = useConfirm()
const open = ref(false)
const busy = ref(false)
const failure = ref<ShareFailure | null>(null)
const created = ref<OwnShare | null>(null)
const copied = ref(false)
const mine = ref<OwnShare[]>([])

function show() {
  failure.value = null
  created.value = null
  copied.value = false
  mine.value = ownShares()
  open.value = true
}

async function share(option: ShareOption) {
  if (option.blocked) return
  busy.value = true
  failure.value = null
  const answer = await createShare(option.kind, option.document())
  busy.value = false
  if (!answer.ok) {
    failure.value = answer.reason
    return
  }
  const entry: OwnShare = {...answer.tokens, kind: option.kind, title: option.title, created: new Date().toISOString()}
  rememberShare(entry)
  created.value = entry
  mine.value = ownShares()
}

async function copy(entry: OwnShare) {
  copied.value = await copyToClipboard(shareUrl(entry.token))
}

async function remove(entry: OwnShare) {
  if (!await confirm(t('share.deleteQuestion'), {description: t('share.deleteHelp'), confirmLabel: t('share.delete'), danger: true})) return
  if (!await deleteShare(entry)) {
    failure.value = 'offline'
    return
  }
  forgetShare(entry.token)
  if (created.value?.token === entry.token) created.value = null
  mine.value = ownShares()
}

function when(entry: OwnShare): string {
  return new Date(entry.created).toLocaleString('de-DE', {dateStyle: 'short', timeStyle: 'short'})
}
</script>

<template>
  <UButton color="neutral" variant="outline" icon="i-lucide-share-2" :label="t('share.action')" :disabled="disabled"
           @click="show"/>
  <UModal v-model:open="open" :title="t('share.title')" :description="t('share.copyNote')">
    <template #body>
      <div class="flex flex-col gap-4">
        <div v-for="option in props.options" :key="option.kind" class="flex flex-col gap-1">
          <UButton :label="option.label" icon="i-lucide-link" :loading="busy" :disabled="Boolean(option.blocked)"
                   class="self-start" @click="share(option)"/>
          <p class="m-0 text-sm text-muted">{{ option.blocked || option.description }}</p>
        </div>
        <UAlert v-if="failure" color="error" variant="subtle" icon="i-lucide-triangle-alert"
                :description="t(`share.failed.${failure}`)"/>
        <div v-if="created" class="flex flex-col gap-2 rounded-md border border-default p-3">
          <span class="text-sm font-semibold">{{ t('share.created') }}</span>
          <div class="flex gap-2">
            <UInput :model-value="shareUrl(created.token)" readonly class="grow" :aria-label="t('share.link')"/>
            <UButton :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" :label="copied ? t('share.copied') : t('share.copy')"
                     @click="copy(created)"/>
          </div>
        </div>
        <div v-if="mine.length" class="flex flex-col gap-2">
          <span class="text-sm font-semibold">{{ t('share.mine') }}</span>
          <ul class="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            <li v-for="entry in mine" :key="entry.token" class="flex items-center justify-between gap-2">
              <span class="min-w-0 truncate">
                {{ entry.title || t(`share.kinds.${entry.kind}`) }} · {{ t(`share.kinds.${entry.kind}`) }} · {{ when(entry) }}
              </span>
              <span class="flex shrink-0 gap-1">
                <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-copy" :aria-label="t('share.copy')"
                         @click="copy(entry)"/>
                <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-trash-2" :aria-label="t('share.delete')"
                         @click="remove(entry)"/>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </UModal>
</template>
