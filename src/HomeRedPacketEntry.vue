<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import redPacketEntry from './assets/red-packet-entry.png'
import { useLocale } from './locale.js'
import { formatBrl } from './money.js'
import { go } from './navigation'

defineProps({ balance: { type: Number, required: true } })
const { t } = useLocale()
const entry = ref(null)
const position = ref(null)
const dragging = ref(false)
const viewport = window.visualViewport
let pointer
let suppressClick = false

function moveWithinViewport(left, top) {
  const inset = 8
  const box = entry.value
  const viewportLeft = viewport?.offsetLeft ?? 0
  const viewportTop = viewport?.offsetTop ?? 0
  const right = viewportLeft + (viewport?.width ?? window.innerWidth)
  const visibleBottom = viewportTop + (viewport?.height ?? window.innerHeight)
  const navigationTop = document.querySelector('.home-bottom-nav')?.getBoundingClientRect().top ?? visibleBottom
  const minLeft = viewportLeft + inset
  const minTop = viewportTop + inset
  const maxLeft = Math.max(minLeft, right - box.offsetWidth - inset)
  const maxTop = Math.max(minTop, Math.min(visibleBottom, navigationTop) - box.offsetHeight - inset)
  position.value = {
    left: Math.min(Math.max(left, minLeft), maxLeft),
    top: Math.min(Math.max(top, minTop), maxTop),
  }
}

function constrainPosition() {
  if (position.value) moveWithinViewport(position.value.left, position.value.top)
}

function beginDrag(event) {
  if (!event.isPrimary || event.button !== 0) return
  const { left, top } = entry.value.getBoundingClientRect()
  suppressClick = false
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left, top }
  entry.value.setPointerCapture(event.pointerId)
}

function moveDrag(event) {
  if (pointer?.id !== event.pointerId) return
  const dx = event.clientX - pointer.x
  const dy = event.clientY - pointer.y
  if (!dragging.value && Math.hypot(dx, dy) < 6) return
  dragging.value = true
  suppressClick = true
  moveWithinViewport(pointer.left + dx, pointer.top + dy)
}

function endDrag(event) {
  if (pointer?.id !== event.pointerId) return
  pointer = undefined
  dragging.value = false
}

function openRewards(event) {
  if (suppressClick && (event.detail > 0 || event.pointerType)) return
  go('/red-packets')
}

onMounted(() => {
  window.addEventListener('resize', constrainPosition)
  viewport?.addEventListener('resize', constrainPosition)
  viewport?.addEventListener('scroll', constrainPosition)
})
onUnmounted(() => {
  window.removeEventListener('resize', constrainPosition)
  viewport?.removeEventListener('resize', constrainPosition)
  viewport?.removeEventListener('scroll', constrainPosition)
})
</script>

<template>
  <a ref="entry" class="home-red-packet-entry" href="#/red-packets"
     :class="{ 'is-positioned': position, 'is-dragging': dragging }"
     :style="position && { left: position.left + 'px', top: position.top + 'px' }"
     :aria-label="t('我的红包') + ' · ' + formatBrl(balance)" draggable="false"
     @pointerdown="beginDrag" @pointermove="moveDrag" @pointerup="endDrag"
     @pointercancel="endDrag" @lostpointercapture="endDrag" @click.prevent="openRewards">
    <strong>{{ formatBrl(balance) }}</strong>
    <img :src="redPacketEntry" width="63" height="63" alt="" draggable="false">
  </a>
</template>

<style scoped>
.home-red-packet-entry {
  position: fixed;
  z-index: 2;
  inset-inline-end: max(10px, env(safe-area-inset-right), calc((100% - 480px) / 2 + 10px));
  top: 54vh;
  top: min(54dvh, calc(100dvh - 160px));
  display: grid;
  touch-action: none;
  user-select: none;
  -webkit-touch-callout: none;
  cursor: grab;
  justify-items: center;
  min-width: 72px;
  padding: 3px 3px 0;
  background: transparent;
  color: #ffda83;
  text-align: center;
  text-shadow: 0 1px 3px #13070f, 0 2px 6px #170508;
}
.home-red-packet-entry strong {
  font-size: clamp(14px, 4vw, 19px);
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
}
.home-red-packet-entry img {
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 4px 4px #13021690);
}
.home-red-packet-entry.is-positioned { inset-inline-end: auto; }
.home-red-packet-entry.is-dragging { cursor: grabbing; }
@media (prefers-reduced-motion: no-preference) {
  .home-red-packet-entry strong { animation: packet-balance-pulse 2s ease-in-out infinite; }
  @keyframes packet-balance-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.14); }
  }
}
</style>
