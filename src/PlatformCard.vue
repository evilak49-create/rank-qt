<script>
import { shallowRef } from 'vue'

const activeMenu = shallowRef(null)
</script>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { api, imageUrl } from './api'
import { useLocale } from './locale'
import { go } from './navigation'

const props = defineProps({
  platformId: [Number, String],
  name: String,
  logoUrl: String,
  rating: [Number, String],
  rank: Number,
  promotionUrl: String,
  detailHref: String,
  row: Boolean,
  inlineActions: Boolean,
})
const { t } = useLocale()
const card = ref(null)
const trigger = ref(null)
const menuId = Symbol()
const discoveredUrl = ref()
const opened = computed(() => activeMenu.value?.id === menuId)
const path = computed(() => '/platforms/' + props.platformId)
const artwork = computed(() => imageUrl(props.logoUrl))
const actionOrder = computed(() => props.inlineActions ? ['open', 'details'] : ['details', 'open'])
const url = computed(() => {
  try {
    const link = new URL(props.promotionUrl ?? discoveredUrl.value)
    return ['https:', 'http:'].includes(link.protocol) ? link.href : ''
  } catch {
    return ''
  }
})

function close() {
  if (opened.value) activeMenu.value = null
}

function hover(event) {
  if (!props.inlineActions && event.pointerType === 'mouse' && !opened.value) activeMenu.value = { id: menuId, pinned: false }
}

function leave() {
  if (opened.value && !activeMenu.value.pinned) close()
}

function toggle() {
  if (opened.value && activeMenu.value.pinned) close()
  else activeMenu.value = { id: menuId, pinned: true }
}

onUnmounted(close)

watch(opened, (active, _, onCleanup) => {
  if (!active) return
  function outside(event) {
    if (!card.value?.contains(event.target)) close()
  }
  document.addEventListener('pointerdown', outside, true)
  onCleanup(() => document.removeEventListener('pointerdown', outside, true))
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
  <div ref="card" class="platform-entry" :class="{ 'platform-entry-row': row, 'platform-entry-poster': !$slots.default, 'platform-entry-inline': inlineActions }"
       @pointerenter="hover" @pointerleave="leave"
       @focusout="event => { if (!card?.contains(event.relatedTarget)) close() }"
       @keydown.esc="event => { if (opened) { event.stopPropagation(); close(); trigger?.focus({ preventScroll: true }) } }">
    <slot v-if="$slots.default" />
    <template v-else>
      <span class="platform-artwork" aria-hidden="true">
        {{ name?.slice(0, 1) }}
        <img v-if="artwork" :src="artwork" alt="" loading="lazy" @error="$event.target.hidden = true" @load="$event.target.hidden = false">
      </span>
      <span v-if="rank" class="platform-rank" :data-rank="rank">{{ rank }}</span>
      <span v-if="rating != null" class="platform-rating"><span aria-hidden="true">★</span> {{ rating }}</span>
      <strong class="platform-name">{{ name }}</strong>
    </template>
    <slot name="summary" />
    <button v-if="!inlineActions" ref="trigger" class="platform-entry-trigger" type="button" :aria-label="name + ' · ' + t('网站操作', 'Opções do site')"
            :aria-expanded="opened" @click="toggle"></button>
    <div v-if="opened || inlineActions" class="platform-entry-actions">
      <template v-for="action in actionOrder" :key="action">
        <a v-if="action === 'details'" class="primary platform-details" :href="detailHref || '#' + path" @click="details">
          {{ inlineActions ? t('品牌详情', 'Detalhes') : t('网站详情', 'Detalhes do site') }}
        </a>
        <a v-else-if="url" class="quiet platform-visit" :href="url" target="_blank" rel="noopener noreferrer">
          {{ inlineActions ? t('进入平台', 'Abrir site') : t('打开网站', 'Abrir site') }}
        </a>
        <button v-else class="quiet platform-visit" type="button" disabled>
          {{ inlineActions ? t('进入平台', 'Abrir site') : t('打开网站', 'Abrir site') }}
        </button>
      </template>
    </div>
    <slot name="controls" />
  </div>
</template>

<style scoped>
.platform-entry { position: relative; min-width: 0; }
.platform-entry-row { min-height: 48px; }
.platform-entry-poster {
  display: grid;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid var(--line, #2b3650);
  border-radius: 12px;
  background: var(--surface, #1a2334);
}
.platform-entry-poster:focus-within, .platform-entry-poster:hover { border-color: #9581ed; }
.platform-artwork {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 0;
  overflow: hidden;
  background: radial-gradient(ellipse at top, #534083, #202c49 75%);
  color: #e2d5ff;
  font-size: clamp(27px, 9vw, 44px);
  font-weight: 850;
}
.platform-artwork img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.platform-artwork img[hidden] { display: none; }
.platform-name {
  display: grid;
  place-items: center;
  min-height: 39px;
  padding: 5px 6px;
  background: linear-gradient(180deg, #9ee8c2, #67c994);
  color: #0e3225;
  text-align: center;
  font-size: clamp(12px, 3.4vw, 15px);
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.platform-rating, .platform-rank { position: absolute; top: 5px; padding: 2px 5px; border-radius: 6px; font-size: 10px; font-weight: 800; }
.platform-rating { right: 5px; color: #f4ffad; background: #121929dc; font-variant-numeric: tabular-nums; }
.platform-rank { left: 5px; color: #221140; background: #c6b1ff; }
.platform-rank[data-rank="1"] { color: #36280e; background: #f6cd68; }
.platform-rank[data-rank="2"] { color: #253752; background: #c2d8f5; }
.platform-entry-trigger { position: absolute; z-index: 1; inset: 0; width: 100%; border-radius: inherit; }
.platform-entry-trigger:focus-visible { outline-offset: -3px; }
.platform-entry-actions {
  position: absolute;
  z-index: 2;
  inset: 0;
  display: grid;
  align-content: center;
  gap: 7px;
  padding: 5px;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(
    to bottom,
    rgb(17 22 40 / 24%),
    rgb(17 22 40 / 74%) 18% 82%,
    rgb(17 22 40 / 24%)
  );
}
.platform-entry-actions :is(a, button) {
  display: grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  pointer-events: auto;
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
.platform-entry-row .platform-entry-actions :is(a, button) { padding-inline: 7px; }
:slotted(.platform-entry-control) { position: relative; z-index: 3; }
</style>
