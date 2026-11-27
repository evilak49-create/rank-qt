<script setup>
import { computed, ref, useId, watch } from 'vue'
import { useLocale } from './locale.js'

const props = defineProps({
  dateFrom: { type: String, default: '' },
  dateTo: { type: String, default: '' },
  inline: Boolean,
})
const emit = defineEmits(['change'])
const { t } = useLocale()
const picker = ref(null)
const headingId = useId()
const filterActive = computed(() => Boolean(props.dateFrom || props.dateTo))
const from = ref('')
const to = ref('')
const hasDates = computed(() => Boolean(from.value || to.value || props.dateFrom || props.dateTo))

watch(() => [props.dateFrom, props.dateTo], ([dateFrom, dateTo]) => {
  from.value = dateFrom
  to.value = dateTo
}, { immediate: true })

function openPicker() {
  from.value = props.dateFrom
  to.value = props.dateTo
  picker.value.showModal()
}

function applyDates() {
  picker.value.close()
  emit('change', { date_from: from.value, date_to: to.value })
}

function clearDates() {
  from.value = ''
  to.value = ''
  applyDates()
}
</script>

<template>
  <Teleport :to="inline ? 'body' : '#record-date-filter-actions'" :disabled="inline">
    <button class="record-date-filter__trigger" type="button" aria-haspopup="dialog" :data-active="filterActive" @click="openPicker">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16l-6 7v5l-4 2v-7z" /></svg>
      {{ t('筛选时间', 'Filtrar por data') }}
      <span v-if="filterActive" class="record-date-filter__dot" :aria-label="t('已筛选', 'Filtro ativo')"></span>
    </button>
  </Teleport>
  <Teleport to="body">
    <dialog ref="picker" class="record-date-filter__dialog" :aria-labelledby="headingId" @click.self="picker.close()">
      <form class="record-date-filter" @submit.prevent="applyDates">
        <div class="record-date-filter__header">
          <div>
            <h2 :id="headingId">{{ t('筛选时间', 'Filtrar por data') }}</h2>
            <small>{{ t('巴西利亚时间', 'Horário de Brasília') }}</small>
          </div>
          <button type="button" class="record-date-filter__close" :aria-label="t('关闭', 'Fechar')" autofocus @click="picker.close()">×</button>
        </div>
        <div class="record-date-filter__grid">
          <label>
            <span>{{ t('开始日期', 'Data inicial') }}</span>
            <input v-model="from" type="date" min="0001-01-01" :max="to || '9998-12-31'" />
          </label>
          <label>
            <span>{{ t('结束日期', 'Data final') }}</span>
            <input v-model="to" type="date" :min="from || '0001-01-01'" max="9998-12-31" />
          </label>
        </div>
        <div class="record-date-filter__actions">
          <button class="quiet" type="button" :disabled="!hasDates" @click="clearDates">{{ t('清除', 'Limpar') }}</button>
          <button class="primary" type="submit">{{ t('筛选', 'Filtrar') }}</button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.record-date-filter__trigger {
  display: inline-flex;
  justify-self: end;
  align-items: center;
  gap: 5px;
  min-height: 44px;
  padding: 0 4px;
  color: var(--highlight);
  font-size: 12px;
  font-weight: 750;
  white-space: nowrap;
}

.record-date-filter__trigger svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linejoin: round;
}

.record-date-filter__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.record-date-filter__dialog {
  width: min(360px, calc(100% - 28px));
  max-height: calc(100vh - 28px);
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 16px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 20px 55px var(--shadow);
}

.record-date-filter__dialog::backdrop {
  background: var(--scrim);
}

.record-date-filter {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 12px;
}

.record-date-filter__header,
.record-date-filter__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.record-date-filter__header {
  justify-content: space-between;
}

.record-date-filter__header h2 {
  margin: 0;
  font-size: 17px;
}

.record-date-filter__close {
  width: 44px;
  height: 44px;
  color: var(--muted);
  font-size: 21px;
}

.record-date-filter__header small,
.record-date-filter__grid label {
  color: var(--muted);
  font-size: 12px;
}

.record-date-filter__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.record-date-filter__grid label {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.record-date-filter__grid input {
  min-width: 0;
  width: 100%;
  min-height: 42px;
  padding-inline: 8px;
  color-scheme: dark;
  font-size: 16px;
}

.record-date-filter__grid input::-webkit-date-and-time-value {
  min-width: 0;
  text-align: start;
}

.record-date-filter__actions {
  justify-content: flex-end;
}

.record-date-filter__actions button {
  width: auto;
  min-height: 38px;
  padding: 6px 14px;
}
</style>
