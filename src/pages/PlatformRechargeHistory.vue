<script setup>
import EmptyState from '../EmptyState.vue'
import RecordDateFilter from '../RecordDateFilter.vue'
import { computed, onUnmounted, ref, watch } from 'vue'
import { api } from '../api.js'
import { useLocale } from '../locale.js'
import { formatBrl } from '../money.js'
import MemberPagination from './MemberPagination.vue'

const props = defineProps({ bindingId: { type: [Number, String], required: true } })
const { locale, t } = useLocale()
const formatter = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }))
const result = ref(null)
const loading = ref(false)
const failed = ref(false)
const dates = ref({ date_from: '', date_to: '' })
const hasDates = computed(() => Boolean(dates.value.date_from || dates.value.date_to))
let controller
let requested = 1

async function load(page = 1) {
  controller?.abort()
  controller = new AbortController()
  const { signal } = controller
  requested = page
  failed.value = false
  loading.value = true
  const params = new URLSearchParams({ page })
  if (dates.value.date_from) params.set('date_from', dates.value.date_from)
  if (dates.value.date_to) params.set('date_to', dates.value.date_to)
  try {
    const response = await api('/platform-bindings/' + props.bindingId + '/recharges?' + params, {
      signal, fresh: true, timeoutMs: 12000,
    })
    if (!signal.aborted) result.value = response
  } catch {
    if (!signal.aborted) failed.value = true
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

function filterRecharges(value) {
  dates.value = value
  result.value = null
  load()
}

watch(() => props.bindingId, () => filterRecharges({ date_from: '', date_to: '' }), { immediate: true })
onUnmounted(() => controller?.abort())
</script>

<template>
  <div class="surface recharge-history stack" :aria-busy="loading">
    <header class="recharge-heading">
      <h2>{{ hasDates ? t('充值记录', 'Histórico de depósitos') : t('最近一个月', 'Último mês') }}</h2>
      <button type="button" class="quiet" :disabled="loading" @click="load()">{{ t('刷新记录', 'Atualizar registros') }}</button>
    </header>
    <RecordDateFilter inline :date-from="dates.date_from" :date-to="dates.date_to" @change="filterRecharges" />
    <p v-if="loading" class="muted" role="status">{{ t('正在查询充值记录…', 'Consultando depósitos…') }}</p>
    <div v-if="failed" class="stack">
      <p class="muted" role="alert">{{ t('暂时无法获取充值记录，请稍后重试。', 'Não foi possível consultar os depósitos. Tente novamente.') }}</p>
      <button type="button" class="quiet" @click="load(requested)">{{ t('重试') }}</button>
    </div>
    <template v-if="result">
      <ul v-if="result.data.length" class="recharge-list">
        <li v-for="entry in result.data" :key="entry.reference">
          <div>
            <time :datetime="entry.recharged_at">{{ formatter.format(new Date(entry.recharged_at)) }}</time>
            <small class="muted">{{ t('记录编号', 'Referência') }} {{ entry.reference }}</small>
          </div>
          <strong>{{ formatBrl(entry.amount_cents) }}</strong>
        </li>
      </ul>
      <EmptyState v-else-if="!loading && !failed" :message="t('这段时间暂无充值记录。', 'Nenhum depósito neste período.')" />
      <MemberPagination :page="result" :busy="loading" @page="load" />
    </template>
  </div>
</template>

<style scoped>
.recharge-history { padding: 15px; }
.recharge-heading, .recharge-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.recharge-heading { flex-wrap: wrap; }
.recharge-heading h2 { font-size: 17px; }
.recharge-list { margin: 0; padding: 0; list-style: none; }
.recharge-list li { padding-block: 10px; border-top: 1px solid var(--line); }
.recharge-list li > div { min-width: 0; overflow-wrap: anywhere; }
.recharge-list small { display: block; }
.recharge-list strong { flex-shrink: 0; color: var(--highlight); font-variant-numeric: tabular-nums; }
</style>
