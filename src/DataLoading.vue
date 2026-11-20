<script setup>
import { ref, watch } from 'vue'
import { apiLoading } from './api'
import spinner from './assets/data-loading.png'

defineProps({ language: { type: String, default: 'zh-CN' } })
const overlay = ref(null)
const visible = ref(false)
const popover = 'showPopover' in HTMLElement.prototype ? 'manual' : undefined

watch(apiLoading, (loading, _previous, onCleanup) => {
  if (!loading) {
    visible.value = false
    return
  }
  const timer = setTimeout(() => { visible.value = true }, 160)
  onCleanup(() => clearTimeout(timer))
}, { immediate: true })

watch(visible, active => {
  if (!popover) return
  if (active) overlay.value.showPopover()
  else overlay.value.hidePopover()
}, { flush: 'post' })
</script>

<template>
  <div ref="overlay" v-show="visible" :popover="popover" class="data-loading" role="status">
    <img :src="spinner" width="78" height="78" alt="">
    <span class="data-loading-label">{{ language === 'pt-BR' ? 'Carregando…' : '正在加载…' }}</span>
  </div>
</template>

<style scoped>
.data-loading {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: #06081299;
  pointer-events: none;
}
.data-loading img { display: block; object-fit: contain; filter: drop-shadow(0 0 9px #a56cff7a); }
.data-loading-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (prefers-reduced-motion: no-preference) {
  .data-loading img { animation: loading-spin .9s linear infinite; }
}
@keyframes loading-spin { to { transform: rotate(360deg); } }
</style>
