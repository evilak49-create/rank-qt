<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '../api'
import { useLocale } from '../locale.js'
import { formatBrl } from '../money'
import MemberPagination from './MemberPagination.vue'

const { locale, t } = useLocale()
const records = ref(null)
const loading = ref(true)
const loadFailed = ref(false)
const source = ref('')
let request
let requestedPage = 1

const labels = {
  rebate: ['返利', 'Cashback'],
  rescue_fund: ['救援金', 'Auxílio'],
  withdrawal: ['提现', 'Saque'],
  withdrawal_refund: ['提现返回', 'Estorno de saque'],
  shop_payment: ['商城支出', 'Pagamento na loja'],
  shop_refund: ['商城退款', 'Estorno da loja'],
  platform_payment: ['平台兑换支出', 'Pagamento para resgate na plataforma'],
  platform_refund: ['平台兑换退款', 'Estorno de resgate na plataforma'],
}

function sourceLabel(value) {
  return t(...(Object.hasOwn(labels, value) ? labels[value] : ['其他资金变动', 'Outra movimentação']))
}

function formatDate(value) {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short' }).format(date)
    : '—'
}

function formatAmount(cents) {
  const sign = cents < 0 ? '−' : cents > 0 ? '+' : ''
  return sign + formatBrl(Math.abs(cents))
}

async function load(page = 1) {
  request?.abort()
  request = new AbortController()
  const { signal } = request
  const query = new URLSearchParams({ page })
  if (source.value) query.set('source', source.value)
  requestedPage = page
  loading.value = true
  loadFailed.value = false
  try {
    const result = await api('/cash-wallet/entries?' + query, { fresh: true, signal })
    if (!signal.aborted) records.value = result
  } catch {
    if (!signal.aborted) loadFailed.value = true
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

onMounted(() => load())
onUnmounted(() => request?.abort())
</script>

<template>
  <section class="stack fund-records" :aria-label="t('资金明细')" :aria-busy="loading">
    <label class="surface field">
      {{ t('资金类型', 'Tipo de movimentação') }}
      <select v-model="source" @change="load()">
        <option value="">{{ t('全部', 'Todas') }}</option>
        <option v-for="(_, value) in labels" :key="value" :value="value">{{ sourceLabel(value) }}</option>
      </select>
    </label>
    <p v-if="loading" class="state" role="status">{{ t('正在加载…', 'Carregando…') }}</p>
    <div v-else-if="loadFailed" class="state">
      <p>{{ t('暂时无法读取资金明细，请重试。', 'Não foi possível consultar as movimentações. Tente novamente.') }}</p>
      <button class="text-button" type="button" @click="load(requestedPage)">{{ t('重试') }}</button>
    </div>
    <p v-else-if="!records?.data.length" class="state">{{ t('暂无资金明细。', 'Nenhuma movimentação registrada.') }}</p>
    <template v-else>
      <ul class="surface fund-entries">
        <li v-for="entry in records.data" :key="entry.id" class="fund-entry">
          <div class="fund-entry-row">
            <h2>{{ sourceLabel(entry.source) }}</h2>
            <strong :class="{ 'fund-credit': entry.amount_cents > 0 }">{{ formatAmount(entry.amount_cents) }}</strong>
          </div>
          <div class="fund-entry-row fund-entry-information muted">
            <span v-if="entry.platform_name">{{ entry.platform_name }}</span>
            <time :datetime="entry.created_at">{{ formatDate(entry.created_at) }}</time>
          </div>
        </li>
      </ul>
      <MemberPagination :page="records" :busy="loading" @page="load" />
    </template>
  </section>
</template>

<style scoped>
.fund-records .state, .fund-records .state p { margin: 0; }
.fund-entries { list-style: none; margin: 0; }
.fund-entry + .fund-entry { border-top: 1px solid var(--line); }
.fund-entry { padding-block: 10px; }
.fund-entry:first-child { padding-top: 0; }
.fund-entry:last-child { padding-bottom: 0; }
.fund-entry-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.fund-entry-row h2 { margin: 0; font-size: 15px; }
.fund-entry-row strong { text-align: end; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.fund-entry-information { flex-wrap: wrap; margin-top: 4px; }
.fund-entry-information span { overflow-wrap: anywhere; }
.fund-entry-information time { margin-inline-start: auto; }
.fund-credit { color: var(--highlight); }
</style>
