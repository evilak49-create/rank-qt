<script setup>
import { useLocale } from '../locale.js'
import { computed, ref, watch } from 'vue'
import { showNotice } from '../feedback'
import { memberAvatars as options } from './memberAvatars.js'

const { t } = useLocale()

const props = defineProps({ accountId: [Number, String] })
const storageKey = computed(() => props.accountId == null ? '' : 'cash-club:avatar:' + props.accountId)
const current = ref(null)
const selected = ref(null)
const picker = ref(null)

watch(storageKey, key => {
  picker.value?.close()
  current.value = null
  if (!key) return
  try {
    const id = localStorage.getItem(key)
    current.value = options.find(option => option.id === id) ?? null
  } catch {
    // The default avatar is available even when browser storage is blocked.
  }
}, { immediate: true })

function open() {
  selected.value = current.value
  picker.value.showModal()
}

function save() {
  if (!storageKey.value || !selected.value) return
  try {
    localStorage.setItem(storageKey.value, selected.value.id)
    current.value = selected.value
    picker.value.close()
  } catch {
    picker.value.close()
    showNotice('头像保存失败', '浏览器无法保存头像设置，请允许站点存储后重试。', 'error')
  }
}
</script>

<template>
  <button class="avatar-trigger" type="button" :aria-label="t('更换头像')" aria-haspopup="dialog" :disabled="!storageKey" @click="open">
    <img v-if="current" :src="current.url" alt="" width="40" height="40">
    <svg v-else viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21a7.5 7.5 0 1 1 15 0"/></svg>
    <span class="avatar-edit" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m4 9 5.8-5.8 3 3L7 12l-3.8.8L4 9Z"/></svg></span>
  </button>

  <Teleport to="body">
    <dialog ref="picker" class="avatar-picker" aria-labelledby="avatar-picker-title" @click.self="picker.close()">
      <form @submit.prevent="save">
        <header>
          <h2 id="avatar-picker-title">{{ t('更换头像') }}</h2>
          <button class="avatar-close" type="button" :aria-label="t('关闭')" @click="picker.close()">×</button>
        </header>
        <div class="avatar-options" role="group" :aria-label="t('可选头像')">
          <button v-for="(option, index) in options" :key="option.id" class="avatar-option" type="button"
                  :aria-label="t('头像 ') + (index + 1)" :aria-pressed="selected?.id === option.id" @click="selected = option">
            <img :src="option.url" alt="" width="56" height="56" loading="lazy">
            <span v-if="selected?.id === option.id" class="avatar-check" aria-hidden="true">✓</span>
          </button>
        </div>
        <button class="primary avatar-save" type="submit" :disabled="!selected">{{ t('保存头像') }}</button>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.avatar-trigger {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: var(--surface-highlight);
  color: var(--accent);
}
.avatar-trigger > svg { width: 21px; height: 21px; }
.avatar-trigger img, .avatar-option img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.avatar-trigger svg, .avatar-edit svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.avatar-edit, .avatar-check {
  position: absolute;
  right: -3px;
  bottom: -2px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--accent);
  border-radius: 50%;
  background: var(--primary);
  color: var(--on-primary);
}
.avatar-edit svg { width: 12px; height: 12px; }
.avatar-picker {
  width: min(calc(100% - 24px), 400px);
  max-height: calc(100dvh - 24px);
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 20px;
  color: var(--text);
  background: radial-gradient(ellipse at top right, var(--surface-highlight), transparent 62%), var(--surface);
  box-shadow: 0 20px 60px var(--shadow);
}
.avatar-picker::backdrop { background: var(--scrim); backdrop-filter: blur(3px); }
.avatar-picker form { display: grid; gap: 13px; padding: 14px 16px 16px; }
.avatar-picker header { display: flex; justify-content: space-between; align-items: center; }
.avatar-picker h2 { margin: 0; font-size: 17px; }
.avatar-close { width: 44px; height: 44px; border-radius: 12px; color: var(--text); background: var(--surface-raised); font-size: 23px; }
.avatar-options { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px 5px; }
.avatar-option {
  position: relative;
  justify-self: center;
  width: min(100%, 60px);
  aspect-ratio: 1;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface-recessed);
}
.avatar-option[aria-pressed="true"] { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
.avatar-check { font-size: 11px; font-weight: 800; }
.avatar-save { min-height: 44px; }
</style>
