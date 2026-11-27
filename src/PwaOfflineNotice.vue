<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({ locale: String, message: String })
const dialog = ref(null)
const portuguese = computed(() => props.locale === 'pt-BR')
const fallback = computed(() => portuguese.value ? 'Sem conexão. Conecte-se à internet e tente novamente.' : '当前网络不可用，请联网后重试')
const events = new AbortController()

function showOffline() {
  if (!dialog.value.open) dialog.value.showModal()
}

function retry() {
  if (navigator.onLine) location.reload()
}

onMounted(() => {
  window.addEventListener('offline', showOffline, { signal: events.signal })
  if (!navigator.onLine) showOffline()
})
onBeforeUnmount(() => events.abort())
</script>

<template>
  <dialog ref="dialog" class="pwa-offline-dialog" aria-labelledby="pwa-offline-title" @cancel.prevent>
    <h2 id="pwa-offline-title">{{ message || fallback }}</h2>
    <button type="button" @click="retry">{{ portuguese ? 'Tentar novamente' : '重试' }}</button>
  </dialog>
</template>

<style scoped>
.pwa-offline-dialog { width: min(calc(100% - 32px), 380px); padding: 24px; border: 1px solid #453926; border-radius: 14px; background: #18181b; color: #fafafa; text-align: center; }
.pwa-offline-dialog::backdrop { background: #09090b; }
h2 { margin: 0 0 18px; font-size: 1.1rem; }
button { min-height: 44px; padding-inline: 18px; border: 0; border-radius: 8px; background: #f5c66e; color: #211507; font-weight: 700; }
</style>
