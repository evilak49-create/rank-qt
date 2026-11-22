<script>
import { shallowRef } from 'vue'

const activeMenu = shallowRef(null)
</script>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { api, imageUrl } from './api'
import { icons } from './icons'
import { useLocale } from './locale'
import { formatGuaranteeAmount } from './money'
import { go } from './navigation'

const props = defineProps({
  platformId: [Number, String],
  name: String,
  logoUrl: String,
  rating: [Number, String],
  rank: [Number, String],
  guaranteeAmount: [Number, String],
  maxRebatePercent: [Number, String],
  promotionUrl: String,
  detailHref: String,
  row: Boolean,
  inlineActions: Boolean,
  direct: Boolean,
  home: Boolean,
})
const { locale, t } = useLocale()
const card = ref(null)
const trigger = ref(null)
const menuId = Symbol()
const discoveredUrl = ref()
const opened = computed(() => activeMenu.value?.id === menuId)
const path = computed(() => '/platforms/' + props.platformId)
const artwork = ref('')
const artworkLoaded = ref(false)
const originalArtwork = computed(() => imageUrl(props.logoUrl))
watch(originalArtwork, (url) => {
  artworkLoaded.value = false
  artwork.value = url
}, { immediate: true })

function uploadedImageFallback(url) {
  const image = new URL(url)
  const upstream = import.meta.env.VITE_IMAGE_ORIGIN || 'https://ht.1234.fund'
  const origin = new URL(upstream).origin
  if (image.origin !== window.location.origin && image.origin !== origin) return ''
  if (!/^\/uploads\/images\/[\da-f-]+\.(jpg|png|webp)$/i.test(image.pathname)) return ''

  // The hosted image route returns 200 with a trailing slash.
  return new URL(image.pathname + '/', import.meta.env.DEV ? image.origin : origin).href
}

function retryArtwork() {
  artworkLoaded.value = false
  artwork.value = props.home && artwork.value === originalArtwork.value
    ? uploadedImageFallback(originalArtwork.value)
    : ''
}
const podiumRank = computed(() => [1, 2, 3].find(rank => rank === Number(props.rank)))
const guarantee = computed(() => formatGuaranteeAmount(props.guaranteeAmount))
const rebate = computed(() => {
  const rate = Number(props.maxRebatePercent)
  if (props.maxRebatePercent == null || String(props.maxRebatePercent).trim() === '' || !Number.isFinite(rate) || rate < 0 || rate > 100) return ''
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 6 }).format(rate) + '%'
})
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
  if (!props.inlineActions && !props.direct && !props.home && event.pointerType === 'mouse' && !opened.value) activeMenu.value = { id: menuId, pinned: false }
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
})

const shouldDiscoverUrl = computed(() => (opened.value || props.inlineActions) && props.promotionUrl === undefined)
watch([path, shouldDiscoverUrl], ([urlPath, active], previous, onCleanup) => {
  if (urlPath !== previous[0]) discoveredUrl.value = undefined
  if (!active || discoveredUrl.value !== undefined) return
  const request = new AbortController()
  onCleanup(() => request.abort())
  api(urlPath, { signal: request.signal }).then(({ data }) => {
    if (!request.signal.aborted) discoveredUrl.value = data.promotion_url ?? null
  }).catch(() => {})
}, { immediate: true })

function details(event) {
  if (props.detailHref || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  close()
  go(path.value)
}
</script>

<template>
  <div ref="card" class="platform-entry" :class="{ 'platform-entry-row': row, 'platform-entry-poster': !$slots.default, 'platform-entry-inline': inlineActions, 'platform-entry-home': home, 'platform-entry-direct': direct || home }"
       :data-top-ranked="inlineActions && podiumRank === 1 ? '' : undefined"
       @pointerenter="hover" @pointerleave="leave"
       @focusout="event => { if (!card?.contains(event.relatedTarget)) close() }"
       @keydown.esc="event => { if (opened) { event.stopPropagation(); close(); trigger?.focus({ preventScroll: true }) } }">
    <slot v-if="$slots.default" />
    <template v-else>
      <span class="platform-artwork" :class="{ 'has-artwork': artworkLoaded }" aria-hidden="true">
        {{ name?.slice(0, 1) }}
        <img v-if="artwork" :key="artwork" :src="artwork" alt="" loading="lazy" @error="retryArtwork" @load="artworkLoaded = true">
      </span>
      <span v-if="inlineActions ? podiumRank : rank" class="platform-rank" :data-rank="inlineActions ? podiumRank : rank">
        {{ inlineActions ? podiumRank : rank }}
      </span>
      <span v-if="rating != null" class="platform-rating"><span aria-hidden="true">★</span> {{ rating }}</span>
      <strong class="platform-name">{{ name }}</strong>
    </template>
    <div v-if="inlineActions" class="platform-offers">
      <a v-if="guarantee" class="platform-guarantee" :href="'#' + path + '/protection'" @click.prevent="go(path + '/protection')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.protection"/></svg>
        <span>{{ t('本站担保') }}</span>
        <strong>{{ guarantee }}</strong>
      </a>
      <div v-if="rebate" class="platform-rebate">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.shop"/></svg>
        <span>{{ t('最高返利', 'Cashback máximo') }}</span>
        <strong>{{ rebate }}</strong>
      </div>
    </div>
    <slot name="summary" />
    <a v-if="direct || home" class="platform-entry-trigger" :href="'#' + path" :aria-label="t('平台详情') + ' · ' + name" @click="details"></a>
    <button v-else-if="!inlineActions" ref="trigger" class="platform-entry-trigger" type="button" :aria-label="name + ' · ' + t('网站操作', 'Opções do site')"
            :aria-expanded="opened" @click="toggle"></button>
    <div v-if="opened || inlineActions" class="platform-entry-actions">
      <template v-for="action in actionOrder" :key="action">
        <a v-if="action === 'details'" class="primary platform-details" :href="detailHref || '#' + path" @click="details">
          <svg v-if="home" class="platform-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.document"/></svg>
          {{ inlineActions ? t('品牌详情', 'Detalhes') : t('网站详情', 'Detalhes do site') }}
        </a>
        <a v-else-if="url" class="quiet platform-visit" :href="url" target="_blank" rel="noopener noreferrer">
          <svg v-if="home" class="platform-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.external"/></svg>
          {{ inlineActions ? t('进入平台', 'Abrir site') : t('打开网站', 'Abrir site') }}
        </a>
        <button v-else class="quiet platform-visit" type="button" disabled>
          <svg v-if="home" class="platform-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.external"/></svg>
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
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.platform-entry-poster:focus-within, .platform-entry-poster:hover { border-color: var(--accent); }
.platform-artwork {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 0;
  overflow: hidden;
  background: radial-gradient(ellipse at top, var(--surface-highlight), var(--surface) 75%);
  color: var(--text);
  font-size: clamp(27px, 9vw, 44px);
  font-weight: 850;
}
.platform-artwork img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.platform-artwork:not(.has-artwork) img { opacity: 0; }
.platform-name {
  display: grid;
  place-items: center;
  min-height: 39px;
  padding: 5px 6px;
  background: var(--surface-highlight);
  color: var(--text);
  text-align: center;
  font-size: clamp(12px, 3.4vw, 15px);
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.platform-rating, .platform-rank { position: absolute; top: 5px; padding: 2px 5px; border-radius: 6px; font-size: 10px; font-weight: 800; }
.platform-rating { right: 5px; color: var(--highlight); background: #090907e8; font-variant-numeric: tabular-nums; }
.platform-rank { left: 5px; color: var(--on-primary); background: var(--accent); }
.platform-rank[data-rank="1"] { color: #36280e; background: #f6cd68; }
.platform-rank[data-rank="2"] { color: #28170e; background: #d7c9b8; }
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
    rgb(17 16 18 / 24%),
    rgb(17 16 18 / 74%) 18% 82%,
    rgb(17 16 18 / 24%)
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
.platform-entry-actions .primary { background: var(--primary, #6d4bea); color: var(--on-primary, #fff); font-weight: 800; }
.platform-entry-actions .primary:hover { background: var(--primary-hover, #6d4bea); }
.platform-entry-actions .quiet { border: 1px solid var(--control-line, #7b6aab); background: transparent; color: var(--text, #eee7ff); }
.platform-entry-actions a.quiet:hover { border-color: var(--accent, #b3a2ff); background: transparent; }
.platform-entry-row .platform-entry-actions { grid-auto-flow: column; justify-content: start; align-items: center; padding-inline: 8px; }
.platform-entry-row .platform-entry-actions :is(a, button) { padding-inline: 7px; }
:slotted(.platform-entry-control) { position: relative; z-index: 3; }

.platform-entry-inline {
  grid-template-rows: auto auto 1fr auto;
  gap: 4px;
  padding: 0 8px 8px;
  border-color: #716255;
  border-radius: 16px;
  background:
    radial-gradient(ellipse at 82% 20%, #6f380d 0, transparent 48%),
    linear-gradient(155deg, transparent 31%, #e085272b 37%, transparent 44%),
    linear-gradient(145deg, #271a11, #100f12 70%);
  box-shadow: inset 0 0 16px #ad753729;
}
.platform-entry-inline:nth-child(4n+2), .platform-entry-inline:nth-child(4n+3) {
  border-color: #537d70;
  background:
    radial-gradient(ellipse at 82% 20%, #155940 0, transparent 52%),
    linear-gradient(155deg, transparent 31%, #56cb9a38 37%, transparent 44%),
    linear-gradient(145deg, #112e2a, #0e1516 70%);
  box-shadow: inset 0 0 16px #44ba832e;
}
.platform-entry-inline:is(:hover, :focus-within) { border-color: #c4a877; }
.platform-entry-inline[data-top-ranked] {
  border-color: #ffca75;
  box-shadow: inset 0 0 9px #ffb65955, 0 0 8px #ff9d2a66;
}
.platform-entry-inline .platform-artwork {
  height: clamp(70px, 22vw, 100px);
  margin-top: 28px;
  aspect-ratio: auto;
  background: transparent;
  color: #ffe0a5;
}
.platform-entry-inline .platform-artwork.has-artwork { color: transparent; }
.platform-entry-inline .platform-artwork img { padding: 0 8px; }
.platform-entry-inline .platform-name {
  min-height: 24px;
  padding: 0 4px 4px;
  background: transparent;
  color: #fff8ec;
  font-size: clamp(13px, 3.5vw, 16px);
}
.platform-entry-inline .platform-rating {
  top: 7px;
  right: 7px;
  padding: 2px 7px;
  border-radius: 999px;
  color: #ffde75;
  background: #090907e8;
  font-size: 12px;
}
.platform-entry-inline .platform-rank {
  top: 0;
  left: 8px;
  min-width: 26px;
  padding: 3px 6px 8px;
  border-radius: 0;
  color: #28170e;
  font-size: 13px;
  text-align: center;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%);
}
.platform-entry-inline .platform-rank[data-rank="1"] { background: linear-gradient(120deg, #fbb53e, #fff1a8, #db8a24); }
.platform-entry-inline .platform-rank[data-rank="2"] { background: linear-gradient(120deg, #b2bac6, #f6f8fc, #8293a5); }
.platform-entry-inline .platform-rank[data-rank="3"] { background: linear-gradient(120deg, #bd774d, #ffdbb5, #c98657); }
.platform-offers {
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 5px;
  text-align: center;
  font-size: 11px;
  line-height: 1.2;
}
.platform-offers svg { width: 15px; height: 15px; flex: none; stroke: #ffcf67; fill: none; stroke-width: 1.8; }
.platform-offers strong { color: #ffdc7e; font-size: 13px; font-variant-numeric: tabular-nums; }
.platform-guarantee, .platform-rebate {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 2px 4px;
  max-width: 100%;
}
.platform-guarantee {
  min-height: 29px;
  padding: 4px 6px;
  border: 1px solid #d7a84b;
  border-radius: 12px;
  background: #191106d9;
  color: #ffe8b2;
  box-shadow: inset 0 0 5px #e5a33341;
}
.platform-guarantee:hover { border-color: #ffdf8b; }
.platform-rebate { min-height: 22px; color: #f5ead8; }
.platform-entry-inline .platform-entry-actions {
  position: static;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  padding: 0;
  background: none;
  pointer-events: auto;
}
.platform-entry-inline .platform-entry-actions :is(a, button) {
  min-width: 0;
  border-radius: 999px;
  padding: 4px;
  font-size: clamp(10px, 3vw, 13px);
  font-weight: 800;
  overflow-wrap: anywhere;
}
.platform-entry-inline .platform-entry-actions .platform-visit {
  border: 1px solid #ffaf43;
  background: var(--primary);
  color: var(--on-primary);
}
.platform-entry-inline .platform-entry-actions a.platform-visit:hover { background: var(--primary-hover); }
.platform-entry-inline .platform-entry-actions .platform-details {
  border: 1px solid #b8b0a6;
  background: #1010138c;
  color: #fff5e9;
}
.platform-entry-inline .platform-entry-actions .platform-details:hover { border-color: #ffca7d; }
.platform-entry-inline :is(a, button):focus-visible { outline-color: #ffdc89; outline-offset: -3px; }

.platform-entry-home {
  --card-inline-padding: clamp(5px, 1.8vw, 9px);
  min-height: calc((100cqi - 10px) / 2 + 47px);
  grid-template-rows: auto minmax(min-content, 1fr) auto;
  gap: 3px;
  padding: 30px var(--card-inline-padding) 5px;
  border-radius: 16px;
  border-color: #8d7557;
}
.platform-entry-home[data-top-ranked] {
  border-color: #ffd492;
  box-shadow: inset 0 0 8px #ffaf544c, 0 0 0 1px #ffc47166, 0 0 10px #ff9d2a58;
}
.platform-entry-home::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(180deg, #10090520, #10090512 26%, #1009059e 67%, #100905ba);
  pointer-events: none;
}
.platform-entry-home .platform-artwork {
  position: absolute;
  grid-area: 1 / 1 / 3 / 2;
  inset: auto calc(-1 * var(--card-inline-padding)) 0;
  z-index: -2;
  width: auto;
  height: auto;
  margin: 0;
  aspect-ratio: 1;
  background: transparent;
}
.platform-entry-home .platform-artwork img { padding: 0; }
.platform-entry-home .platform-name { min-height: 17px; padding: 0 2px; text-shadow: 0 1px 4px #090604, 0 1px 10px #090604; }
.platform-entry-home .platform-offers { gap: 3px; align-content: end; font-size: clamp(9px, 2.7vw, 11px); }
.platform-entry-direct .platform-guarantee { position: relative; z-index: 2; }
.platform-entry-home .platform-guarantee {
  width: 100%;
  padding-block: 3px;
  border-color: transparent;
  border-radius: 999px;
  background: rgb(35 19 8 / 70%);
  box-shadow: none;
}
.platform-entry-home .platform-offers strong { font-size: clamp(11px, 3.3vw, 13px); overflow-wrap: anywhere; }
.platform-entry-home .platform-rebate { padding: 2px 7px; border-radius: 999px; background: rgb(14 12 11 / 68%); }
.platform-entry-home .platform-entry-actions :is(a, button) {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 3px;
  padding-inline: 3px;
  font-size: clamp(10px, 2.9vw, 13px);
  position: relative;
  isolation: isolate;
}
.platform-entry-home .platform-entry-actions :is(.platform-visit, .platform-details),
.platform-entry-home .platform-entry-actions :is(.platform-visit, .platform-details):hover {
  border: 0;
  background: transparent;
}
.platform-entry-home .platform-entry-actions :is(a, button)::before {
  content: '';
  position: absolute;
  inset: 5px 0;
  z-index: -1;
  border: 1px solid;
  border-radius: inherit;
}
.platform-entry-home .platform-entry-actions .platform-visit::before { border-color: #ffaf43c4; background: linear-gradient(#ffbd49de, #f97813d9); }
.platform-entry-home .platform-entry-actions a.platform-visit:hover::before { background: linear-gradient(#ffd178eb, #ff981fe0); }
.platform-entry-home .platform-entry-actions .platform-details::before { border-color: #b8b0a6ba; background: rgb(16 16 19 / 68%); }
.platform-entry-home .platform-entry-actions .platform-details:hover::before { border-color: #ffca7d; }
.platform-action-icon {
  width: clamp(12px, 3.5vw, 17px);
  height: auto;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
@media (max-width: 360px) {
  .platform-entry-home:lang(pt-BR) .platform-entry-actions :is(a, button) { flex-direction: column; gap: 2px; }
}
</style>
