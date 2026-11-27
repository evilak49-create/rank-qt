<script setup>
import { computed, ref, watch } from 'vue'
import { useLocale } from './locale.js'

const props = defineProps({
  dateFrom: { type: String, default: '' },
  dateTo: { type: String, default: '' },
})
const emit = defineEmits(['change'])
const { t } = useLocale()
const from = ref('')
const to = ref('')
const hasDates = computed(() => Boolean(from.value || to.value || props.dateFrom || props.dateTo))

watch(() => [props.dateFrom, props.dateTo], ([dateFrom, dateTo]) => {
  from.value = dateFrom
  to.value = dateTo
}, { immediate: true })

function applyDates() {
  emit('change', { date_from: from.value, date_to: to.value })
}

function clearDates() {
  from.value = ''
  to.value = ''
  applyDates()
}
</script>

<template>
  <form class="record-date-filter surface" @submit.prevent="applyDates">
    <div class="record-date-filter__header">
      <strong>{{ t('筛选日期', 'Filtrar por data') }}</strong>
      <small>{{ t('巴西利亚时间', 'Horário de Brasília') }}</small>
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
</template>

<style scoped>
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
