<script setup>
import { computed, ref, watch } from 'vue'
import { api } from './api'
import { useLocale } from './locale'
import { go } from './navigation'

const props = defineProps({
  platformId: [Number, String],
  name: String,
  promotionUrl: String,
  detailHref: String,
  row: Boolean,
})
const { t } = useLocale()
const card = ref(null)
const trigger = ref(null)
const hovered = ref(false)
const expanded = ref(false)
const discoveredUrl = ref()
const opened = computed(() => hovered.value || expanded.value)
const path = computed(() => '/platforms/' + props.platformId)
const url = computed(() => {
  try {
    const link = new URL(props.promotionUrl ?? discoveredUrl.value)
    return ['https:', 'http:'].includes(link.protocol) ? link.href : ''
  } catch {
    return ''
  }
})

function close() {
  hovered.value = false
  expanded.value = false
}

watch(opened, (active, _, onCleanup) => {
  if (!active) return
  function outside(event) {
    if (!card.value?.contains(event.target)) close()
  }
  document.addEventListener('pointerdown', outside)
  onCleanup(() => document.removeEventListener('pointerdown', outside))
  if (props.promotionUrl !== undefined || discoveredUrl.value !== undefined) return
  const request = new AbortController()
  onCleanup(() => request.abort())
  api(path.value, { signal: request.signal }).then(({ data }) => {
    if (!request.signal.aborted) discoveredUrl.value = data.promotion_url ?? null
  }).catch(() => {})
})

function details(event) {
  if (props.detailHref || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  close()
  go(path.value)
}
</script>

<template>
  <div ref="card" class="platform-entry" :class="{ 'platform-entry-row': row }"
       @pointerenter="event => { if (event.pointerType === 'mouse') hovered = true }"
       @pointerleave="hovered = false"
       @focusout="event => { if (!card?.contains(event.relatedTarget)) close() }"
       @keydown.esc.stop="close(); trigger.focus()">
    <slot />
    <button ref="trigger" class="platform-entry-trigger" type="button" :aria-label="name + ' · ' + t('网站操作', 'Opções do site')"
            :aria-expanded="opened" @click="expanded = !expanded"></button>
    <div v-if="opened" class="platform-entry-actions">
      <a class="primary" :href="detailHref || '#' + path" @click="details">{{ t('网站详情', 'Detalhes do site') }}</a>
      <a v-if="url" class="quiet" :href="url" target="_blank" rel="noopener noreferrer">{{ t('打开网站', 'Abrir site') }}</a>
      <button v-else class="quiet" type="button" disabled>{{ t('打开网站', 'Abrir site') }}</button>
    </div>
    <slot name="controls" />
  </div>
</template>

<style scoped>
.platform-entry { position: relative; min-width: 0; }
.platform-entry-trigger { position: absolute; z-index: 1; inset: 0; width: 100%; border-radius: inherit; }
.platform-entry-trigger:focus-visible { outline-offset: -3px; }
.platform-entry-actions {
  position: absolute;
  z-index: 2;
  inset: 0;
  display: grid;
  align-content: center;
  gap: 5px;
  padding: 5px;
  border-radius: inherit;
  background: transparent;
}
.platform-entry-actions :is(a, button) {
  display: grid;
  place-items: center;
  min-height: 40px;
  padding: 4px 3px;
  text-align: center;
  font-size: 11px;
  line-height: 1.15;
  border-radius: 7px;
}
.platform-entry-actions .primary { background: #6d4bea; color: #fff; font-weight: 800; }
.platform-entry-actions .quiet { border: 1px solid #7b6aab; background: transparent; color: #eee7ff; }
.platform-entry-actions a.quiet:hover { border-color: #b3a2ff; background: transparent; }
.platform-entry-row .platform-entry-actions { grid-auto-flow: column; justify-content: start; align-items: center; padding-inline: 8px; }
.platform-entry-row .platform-entry-actions :is(a, button) { min-height: 36px; padding-inline: 7px; }
:slotted(.platform-entry-control) { position: relative; z-index: 3; }
</style>
