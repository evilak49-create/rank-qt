<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { notices, showNotice } from './feedback'

defineProps({ language: String })
const modal = ref(null)
const active = computed(() => notices.value[0])
let validating = false

watch(active, notice => {
  if (notice && modal.value && !modal.value.open) modal.value.showModal()
}, { flush: 'post', immediate: true })

function invalid(event) {
  if (!event.target.validationMessage) return
  event.preventDefault()
  if (validating) return
  validating = true
  setTimeout(() => { validating = false }, 0)
  const field = event.target.labels?.[0]?.textContent?.trim()
  showNotice(field || '请检查输入', event.target.validationMessage, 'error')
}

onMounted(() => document.addEventListener('invalid', invalid, true))
onUnmounted(() => document.removeEventListener('invalid', invalid, true))
</script>

<template>
  <Teleport to="body">
    <dialog ref="modal" class="feedback-modal" role="alertdialog" aria-labelledby="feedback-title" aria-describedby="feedback-text"
            @click.self="modal.close()" @close="notices.shift()">
      <div v-if="active" class="feedback-content" :data-tone="active.tone">
        <div class="feedback-symbol" aria-hidden="true">{{ active.tone === 'error' ? '!' : active.tone === 'success' ? '✓' : '✦' }}</div>
        <h2 id="feedback-title">{{ active.title }}</h2>
        <p id="feedback-text">{{ active.text }}</p>
        <form method="dialog">
          <button class="primary" autofocus>{{ language === 'pt-BR' ? 'OK' : '确定' }}</button>
        </form>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.feedback-modal { width: min(360px, calc(100% - 40px)); padding: 0; border: 1px solid #564978; border-radius: 19px; color: #f7f3ff; background: #1b2033; box-shadow: 0 20px 65px #070713c9; }
.feedback-modal::backdrop { background: #080b16b3; backdrop-filter: blur(3px); }
.feedback-content { display: grid; gap: 10px; justify-items: center; padding: 21px; text-align: center; background: radial-gradient(ellipse at top, #3b2b55, transparent 70%); }
.feedback-symbol { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: #553e82; color: #e6d7ff; font-size: 21px; font-weight: 800; }
[data-tone="error"] .feedback-symbol { background: #563245; color: #ffc0cf; }
[data-tone="success"] .feedback-symbol { background: #334331; color: #d9fa75; }
.feedback-content h2 { margin: 0; font-size: 19px; overflow-wrap: anywhere; }
.feedback-content p { margin: 0; color: #ded9ec; font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.feedback-content form { width: 100%; margin-top: 3px; }
.feedback-content button { width: 100%; }
</style>
