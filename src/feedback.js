import { ref, watch } from 'vue'

export const notices = ref([])

export function showNotice(title, text, tone = 'info', action = null) {
  if (typeof text !== 'string' || !text.trim()) return
  const message = text.trim()
  if (!notices.value.some(item => item.title === title && item.text === message)) {
    notices.value.push({ title, text: message, tone, action })
  }
}

export function watchNotice(source, title, tone) {
  watch(source, text => showNotice(typeof title === 'function' ? title(text) : title, text, tone), { immediate: true })
}
