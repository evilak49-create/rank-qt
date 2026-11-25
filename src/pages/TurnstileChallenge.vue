<script>
let turnstileLoad

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  turnstileLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    const timer = setTimeout(fail, 15000)

    function fail() {
      clearTimeout(timer)
      script.remove()
      reject(new Error('Could not load Cloudflare Turnstile.'))
    }
    script.onerror = fail
    script.onload = () => {
      if (!window.turnstile) return fail()
      clearTimeout(timer)
      resolve(window.turnstile)
    }
    document.head.append(script)
  }).catch(error => {
    turnstileLoad = undefined
    throw error
  })
  return turnstileLoad
}
</script>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLocale } from '../locale.js'

const props = defineProps({
  siteKey: String,
  action: { type: String, required: true },
  resetKey: Number,
})
const emit = defineEmits(['update:modelValue'])
const { t, locale } = useLocale()
const host = ref(null)
const unavailable = ref(false)
let widget
let disposed = false

async function renderChallenge() {
  emit('update:modelValue', '')
  unavailable.value = false
  try {
    if (!props.siteKey) throw new Error('Turnstile site key is missing.')
    const turnstile = await loadTurnstile()
    if (disposed || !host.value) return
    widget = turnstile.render(host.value, {
      sitekey: props.siteKey,
      action: props.action,
      language: locale.value.toLowerCase(),
      size: host.value.clientWidth < 300 ? 'compact' : 'flexible',
      callback: token => {
        unavailable.value = false
        emit('update:modelValue', token)
      },
      'expired-callback': () => emit('update:modelValue', ''),
      'error-callback': showRetry,
      'timeout-callback': showRetry,
    })
  } catch {
    if (!disposed) unavailable.value = true
  }
}

function showRetry() {
  emit('update:modelValue', '')
  unavailable.value = true
}

function retryChallenge() {
  if (widget == null) return renderChallenge()
  emit('update:modelValue', '')
  unavailable.value = false
  window.turnstile?.reset(widget)
}

onMounted(renderChallenge)
watch(() => props.resetKey, retryChallenge)
onBeforeUnmount(() => {
  disposed = true
  if (widget != null) window.turnstile?.remove(widget)
})
</script>

<template>
  <div class="field">
    <div ref="host"></div>
    <div v-if="unavailable" class="stack">
      <p role="status">{{ t('Cloudflare 验证暂不可用。', 'A verificação Cloudflare está indisponível.') }}</p>
      <button v-if="siteKey" type="button" class="quiet" @click="retryChallenge">{{ t('重试', 'Tentar novamente') }}</button>
    </div>
  </div>
</template>
