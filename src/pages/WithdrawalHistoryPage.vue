<script setup>
import { useLocale } from '../locale.js'
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '../api'
import { watchNotice } from '../feedback'
import { formatBrl } from '../money'
import MemberPagination from './MemberPagination.vue'

const { locale, t } = useLocale()

const records = ref(null)
const loading = ref(true)
const error = ref('')
const requestedPage = ref(1)
const legacySource = ref(null)
let request

const statuses = { reviewing: '审核中', succeeded: '成功', failed: '失败', cancelled: '已取消，款项已退回' }
const lifecycle = {
  pending: ['待审核', 'Aguardando análise'], processing: ['出款中', 'Pagamento em processamento'],
  unresolved: ['等待三方确认', 'Aguardando confirmação do provedor'],
  failed: ['出款失败，款项已退回', 'Pagamento falhou e o valor foi devolvido'],
  rejected: ['已拒绝，款项已退回', 'Solicitação recusada e valor devolvido'],
}
const sources = { red_packet: '红包提现', balance: '余额提现' }
const legacyPaths = { red_packet: '/pix-withdrawals', balance: '/cash-wallet/withdrawals' }

function statusLabel(order) {
  if (order.rejection_deducted) return t('已拒绝，款项已扣除')
  const label = lifecycle[order.lifecycle_status]
  return label ? t(...label) : t(statuses[order.status] || '待确认')
}

function formatDate(value) {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short' }).format(date) : '—'
}

async function fetchOrders(page, signal) {
  const query = '?' + new URLSearchParams({ page })
  const options = { signal, fresh: true }
  if (!legacySource.value) {
    try {
      return await api('/withdrawal-history' + query, options)
    } catch (failure) {
      if (signal.aborted || failure.status !== 404) throw failure
      legacySource.value = 'balance'
    }
  }
  const source = legacySource.value
  const result = await api(legacyPaths[source] + query, options)
  return {
    ...result,
    data: result.data.map(order => ({
      ...order,
      source,
      lifecycle_status: order.status,
      status: order.status === 'paid' ? 'succeeded' : order.status === 'cancelled' ? 'cancelled' : ['failed', 'rejected'].includes(order.status) ? 'failed' : 'reviewing',
    })),
  }
}

function selectSource(source) {
  if (source === legacySource.value) return
  legacySource.value = source
  records.value = null
  load()
}

async function load(page = 1) {
  request?.abort()
  request = new AbortController()
  const { signal } = request
  requestedPage.value = page
  loading.value = true
  error.value = ''
  try {
    const data = await fetchOrders(page, signal)
    if (!signal.aborted) records.value = data
  } catch (failure) {
    if (!signal.aborted) error.value = failure.message || '暂时无法读取提现订单，请重试。'
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

onMounted(() => load())
onUnmounted(() => request?.abort())
watchNotice(error, '提现订单加载失败', 'error')
</script>

<template>
  <section class="stack" :aria-label="t('提现订单列表')" :aria-busy="loading">
    <div v-if="legacySource" class="segmented" role="group" :aria-label="t('提现类型')">
      <button v-for="source in ['balance', 'red_packet']" :key="source" type="button"
              :aria-pressed="legacySource === source" @click="selectSource(source)">{{ t(sources[source]) }}</button>
    </div>
    <button v-if="error" class="quiet" type="button" @click="load(requestedPage)">{{ t('重新获取订单') }}</button>
    <template v-else-if="records">
      <p v-if="!records.data.length" class="surface muted withdrawal-empty">{{ t('暂无提现订单。') }}</p>
      <ul v-else class="withdrawal-history">
        <li v-for="order in records.data" :key="order.id" class="surface stack withdrawal-order">
          <header class="withdrawal-summary">
            <h2>{{ t(sources[order.source]) || t('提现') }}</h2>
            <span class="withdrawal-status" :data-status="order.status">{{ statusLabel(order) }}</span>
          </header>
          <strong class="withdrawal-amount">{{ formatBrl(order.amount_cents) }}</strong>
          <dl class="withdrawal-details">
            <div><dt>{{ t('订单号') }}</dt><dd>{{ order.order_number || '—' }}</dd></div>
            <div><dt>{{ t('申请时间') }}</dt><dd><time :datetime="order.created_at">{{ formatDate(order.created_at) }}</time></dd></div>
            <div v-if="order.paid_at"><dt>{{ t('到账时间') }}</dt><dd><time :datetime="order.paid_at">{{ formatDate(order.paid_at) }}</time></dd></div>
            <div v-if="order.status === 'failed' && order.review_reason" class="withdrawal-reason">
              <dt>{{ t('失败原因') }}</dt><dd>{{ order.review_reason }}</dd>
            </div>
          </dl>
        </li>
      </ul>
      <MemberPagination class="withdrawal-pagination" :page="records" :busy="loading" @page="load" />
    </template>
  </section>
</template>

<style scoped>
.withdrawal-history { display: grid; gap: 10px; list-style: none; padding: 0; margin: 0; }
.withdrawal-order { gap: 8px; padding: 13px 14px; }
.withdrawal-empty, .withdrawal-summary h2 { margin: 0; }
.withdrawal-summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.withdrawal-summary h2 { font-size: 14px; }
.withdrawal-status { flex: none; padding: 3px 9px; border-radius: 999px; background: var(--surface-raised); font-size: 12px; font-weight: 700; }
.withdrawal-status[data-status="reviewing"] { color: var(--highlight); background: var(--surface-highlight); }
.withdrawal-status[data-status="succeeded"] { color: var(--success); background: var(--success-surface); }
.withdrawal-status[data-status="failed"] { color: var(--danger); background: var(--danger-surface); }
.withdrawal-amount { font-size: 26px; line-height: 1.2; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.withdrawal-details { display: grid; gap: 5px; border-top: 1px solid var(--line); margin: 2px 0 0; padding-top: 9px; font-size: 12px; }
.withdrawal-details > div { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 10px; }
.withdrawal-details dt { color: var(--muted); }
.withdrawal-details dd { margin: 0; text-align: end; overflow-wrap: anywhere; }
.withdrawal-reason dd { color: var(--danger); white-space: pre-wrap; }
.withdrawal-pagination { display: flex; align-items: center; justify-content: center; gap: 9px; }
</style>
