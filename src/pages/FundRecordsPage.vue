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
const typePicker = ref(null)
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

const filterOptions = ['', ...Object.keys(labels)]

function filterLabel(value) {
  return value ? sourceLabel(value) : t('全部类型', 'Todos os tipos')
}

function selectSource(value) {
  typePicker.value.close()
  if (source.value === value) return
  source.value = value
  load()
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
    <button class="fund-filter" type="button" aria-haspopup="dialog" @click="typePicker.showModal()">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16l-6 7v5l-4 2v-7z" /></svg>
      <span class="fund-filter-label">{{ t('资金类型', 'Tipo de movimentação') }}</span>
      <strong>{{ filterLabel(source) }}</strong>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <dialog ref="typePicker" class="locale-sheet fund-type-sheet" aria-labelledby="fund-type-title" @click.self="typePicker.close()">
      <div class="locale-panel">
        <div class="locale-heading">
          <h2 id="fund-type-title">{{ t('选择资金类型', 'Selecione o tipo de movimentação') }}</h2>
          <button class="locale-close" type="button" :aria-label="t('关闭', 'Fechar')" @click="typePicker.close()">×</button>
        </div>
        <div class="fund-type-options">
          <button v-for="value in filterOptions" :key="value" class="locale-option fund-type-option"
            :class="{ 'fund-type-all': !value }" type="button" :aria-pressed="source === value"
            @click="selectSource(value)">
            <span>{{ filterLabel(value) }}</span>
            <span v-if="source === value" class="locale-check" aria-hidden="true">✓</span>
          </button>
        </div>
      </div>
    </dialog>
    <div v-if="!loading && loadFailed" class="state">
      <p>{{ t('暂时无法读取资金明细，请重试。', 'Não foi possível consultar as movimentações. Tente novamente.') }}</p>
      <button class="text-button" type="button" @click="load(requestedPage)">{{ t('重试') }}</button>
    </div>
    <p v-else-if="!loading && !records?.data.length" class="state">{{ t('暂无资金明细。', 'Nenhuma movimentação registrada.') }}</p>
    <template v-else-if="!loading">
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
.fund-filter {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) fit-content(46%) 16px;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 13px;
  background: var(--surface-gradient);
  text-align: start;
}
.fund-filter svg { width: 100%; fill: none; stroke: var(--accent); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.fund-filter-label { color: var(--muted); font-size: 13px; }
.fund-filter strong { color: var(--highlight); font-size: 13px; line-height: 1.3; text-align: end; }
.fund-filter-label, .fund-filter strong, .fund-type-option span { overflow-wrap: anywhere; }
.fund-type-sheet { max-height: 85dvh; overscroll-behavior: contain; }
.fund-type-sheet .locale-close { flex: none; }
.fund-type-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.fund-type-option { grid-template-columns: minmax(0, 1fr) auto; min-height: 46px; font-size: 13px; line-height: 1.3; }
.fund-type-all { grid-column: 1 / -1; }
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
