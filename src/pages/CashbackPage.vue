<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { api, imageUrl } from '../api'
import { watchNotice } from '../feedback'
import { useLocale } from '../locale'
import { formatBrl } from '../money'
import { go } from '../navigation'
import MemberPagination from './MemberPagination.vue'

const props = defineProps({ route: { type: Object, required: true } })
const { locale, t } = useLocale()
const isHistory = props.route.path === '/cashback/records'
const bindingId = /^\/cashback\/(\d+)$/.exec(props.route.path)?.[1]
const results = ref(null)
const detail = ref(null)
const previews = ref({})
const brokenLogos = ref(new Set())
const loading = ref(false)
const error = ref('')
const currentTime = ref(Date.now())
const nextDispatch = ref(0)
let clockOffset = 0
let refreshAt = 0
let timer
let request

const date = computed(() => new Intl.DateTimeFormat(locale.value, {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
}))
const decimal = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 6 }))
const countdown = computed(() => {
  if (!nextDispatch.value) return '—'
  const seconds = Math.max(0, Math.ceil((nextDispatch.value - currentTime.value) / 1000))
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':')
})
const statusLabels = {
  credited: ['已到账', 'Creditado'],
  insufficient_wager: ['未达返利门槛，额度已保留', 'Volume mínimo não atingido. O saldo de cálculo foi mantido.'],
  insufficient_rebate: ['返利为零，额度已保留', 'Cashback zerado. O saldo de cálculo foi mantido.'],
  no_deposit: ['暂无待结算存款，额度已保留', 'Sem depósitos para calcular. O saldo de cálculo foi mantido.'],
  rebate_disabled: ['返利暂未开放', 'Cashback indisponível'],
}

function formattedDate(value) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? date.value.format(time) : '—'
}

function money(cents) {
  if (cents == null) return '—'
  const value = String(cents)
  return value.startsWith('-') ? '−' + formatBrl(value.slice(1)) : formatBrl(value)
}

function rate(value, unit) {
  return value == null ? '—' : decimal.value.format(Number(value)) + unit
}

function historyStatus(result) {
  return t(...(statusLabels[result] || ['未派发，额度已保留', 'Cashback não enviado. O saldo de cálculo foi mantido.']))
}

function updateClock(response) {
  const server = Date.parse(response.server_now)
  const next = Date.parse(response.next_dispatch_at)
  if (!Number.isFinite(server) || !Number.isFinite(next)) return
  clockOffset = server - Date.now()
  currentTime.value = server
  nextDispatch.value = next
  refreshAt = Math.min(server + 120000, next + 5000)
}

async function loadPreviews(items, signal) {
  const pending = items.slice()
  async function worker() {
    while (pending.length && !signal.aborted) {
      const item = pending.shift()
      try {
        const response = await api('/cashback/' + item.binding_id, { signal, background: true })
        if (!signal.aborted) previews.value[item.binding_id] = response.data
      } catch {
        if (!signal.aborted && !previews.value[item.binding_id]?.observed_at) previews.value[item.binding_id] = null
      }
    }
  }
  await Promise.all([worker(), worker()])
}

async function load(page = 1, background = false) {
  request?.abort()
  request = new AbortController()
  const { signal } = request
  if (!background) {
    loading.value = true
    error.value = ''
    previews.value = {}
  }
  try {
    const resource = isHistory ? '/cashback/history?page=' + page
      : bindingId ? '/cashback/' + bindingId : '/cashback?page=' + page
    const response = await api(resource, { signal, background })
    if (signal.aborted) return
    error.value = ''
    if (!isHistory) updateClock(response)
    if (bindingId) detail.value = response.data
    else results.value = response
    if (!isHistory && !bindingId) await loadPreviews(response.data, signal)
  } catch (failure) {
    if (!signal.aborted) {
      if (background) refreshAt = currentTime.value + 30000
      else error.value = failure.status === 404
        ? t('暂时无法读取该平台返利数据。', 'Não foi possível consultar o cashback desta plataforma.')
        : t('返利数据读取失败，请稍后重试。', 'Não foi possível carregar o cashback. Tente novamente.')
    }
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

function tick() {
  currentTime.value = Date.now() + clockOffset
  if (refreshAt && currentTime.value >= refreshAt && !document.hidden) {
    refreshAt = currentTime.value + 120000
    load(results.value?.current_page || 1, true)
  }
}

watch(() => props.route.key, () => {
  const legacyBinding = props.route.query.get('binding')
  if (!isHistory && !bindingId && /^\d+$/.test(legacyBinding ?? '')) {
    go('/cashback/' + legacyBinding, { replace: true })
    return
  }
  const page = Number(props.route.query.get('page'))
  load(Number.isSafeInteger(page) && page > 0 ? page : 1)
}, { immediate: true })
onMounted(() => {
  if (!isHistory) timer = window.setInterval(tick, 1000)
})
onUnmounted(() => {
  request?.abort()
  window.clearInterval(timer)
})
watchNotice(error, () => t('现金返利提醒', 'Aviso de cashback'), 'error')
</script>

<template>
  <section class="cashback-page stack" :aria-busy="loading">
    <button v-if="error" class="quiet" type="button" @click="load(results?.current_page || 1)">{{ t('重试') }}</button>

    <template v-else-if="isHistory && results">
      <ul v-if="results.data.length" class="cashback-records">
        <li v-for="item in results.data" :key="item.id" class="surface cashback-record">
          <div>
            <h2>{{ item.platform_name }}</h2>
            <time :datetime="item.settled_at">{{ formattedDate(item.settled_at) }}</time>
          </div>
          <strong :class="{ 'cashback-credit': item.result === 'credited' }">{{ money(item.amount_cents) }}</strong>
          <p class="muted">{{ historyStatus(item.result) }}</p>
        </li>
      </ul>
      <p v-else class="surface muted">{{ t('暂无返利记录。', 'Nenhum cashback registrado.') }}</p>
      <MemberPagination :page="results" :busy="loading" @page="load" />
    </template>

    <template v-else-if="bindingId && detail">
      <section class="surface stack cashback-detail">
        <h2>{{ detail.platform_name }}</h2>
        <p class="muted">{{ t('数据更新时间', 'Dados atualizados em') }} <time :datetime="detail.observed_at">{{ formattedDate(detail.observed_at) }}</time></p>
        <dl class="summary-list">
          <div><dt>{{ t('当前可领返利', 'Cashback disponível') }}</dt><dd class="cashback-credit">{{ money(detail.current_cents) }}</dd></div>
          <div><dt>{{ t('当前返利比例', 'Percentual atual de cashback') }}</dt><dd>{{ rate(detail.rebate_percent, '%') }}</dd></div>
          <div><dt>{{ t('预计可领返利', 'Cashback estimado') }}</dt><dd>{{ money(detail.estimated_cents) }}</dd></div>
          <div><dt>{{ t('最高返利比例', 'Percentual máximo de cashback') }}</dt><dd>{{ rate(detail.max_rebate_percent, '%') }}</dd></div>
          <div><dt>{{ t('当前充值总额') }}</dt><dd>{{ money(detail.observed_deposit_cents) }}</dd></div>
          <div><dt>{{ t('当前投注额') }}</dt><dd>{{ money(detail.observed_valid_bet_cents) }}</dd></div>
          <div><dt>{{ t('本期待结算存款', 'Depósitos a liquidar') }}</dt><dd>{{ money(detail.deposit_cents) }}</dd></div>
          <div><dt>{{ t('本期有效投注额') }}</dt><dd>{{ money(detail.valid_bet_cents) }}</dd></div>
          <div><dt>{{ t('命中打码挡位', 'Faixa de apostas atingida') }}</dt><dd>{{ rate(detail.matched_rebate_wager_multiplier, '×') }}</dd></div>
        </dl>
      </section>
    </template>

    <template v-else-if="!bindingId && !isHistory && results">
      <p v-if="results.data.length" class="cashback-schedule">{{ t('每天巴西利亚时间 12:00 自动派发至可用余额。', 'Crédito automático no saldo às 12h, no horário de Brasília.') }}</p>
      <article v-for="item in results.data" :key="item.binding_id" class="surface cashback-card">
        <header class="cashback-platform">
          <span class="cashback-logo" aria-hidden="true">
            <img v-if="imageUrl(item.logo_url) && !brokenLogos.has(item.binding_id)" :src="imageUrl(item.logo_url)" width="40" height="40" alt="" loading="lazy" @error="brokenLogos.add(item.binding_id)">
            <span v-else>{{ item.platform_name.slice(0, 1) }}</span>
          </span>
          <div>
            <h2>{{ item.platform_name }}</h2>
            <p v-if="previews[item.binding_id]?.observed_at" class="muted">{{ t('数据更新时间', 'Dados atualizados em') }} <time :datetime="previews[item.binding_id].observed_at">{{ formattedDate(previews[item.binding_id].observed_at) }}</time></p>
            <p v-else-if="previews[item.binding_id] === null" class="muted">{{ t('平台数据暂未更新', 'Dados da plataforma indisponíveis no momento') }}</p>
          </div>
        </header>
        <dl class="cashback-metrics">
          <div class="cashback-primary-metric"><dt>{{ t('当前可领返利', 'Cashback disponível') }}</dt><dd class="cashback-credit">{{ money(previews[item.binding_id]?.current_cents) }}</dd></div>
          <div><dt>{{ t('当前返利比例', 'Percentual atual de cashback') }}</dt><dd>{{ rate(previews[item.binding_id]?.rebate_percent, '%') }}</dd></div>
          <div><dt>{{ t('预计可领返利', 'Cashback estimado') }}</dt><dd>{{ money(previews[item.binding_id]?.estimated_cents) }}</dd><small>{{ t('达到最高挡位时', 'Na faixa máxima') }}</small></div>
        </dl>
        <footer class="cashback-card-footer">
          <div><span class="muted">{{ t('距下次派发', 'Próximo crédito em') }}</span> <strong class="cashback-countdown">{{ countdown }}</strong></div>
          <a class="text-button" :href="'#/cashback/' + item.binding_id" @click.prevent="go('/cashback/' + item.binding_id)">{{ t('查看明细', 'Ver detalhes') }} ›</a>
        </footer>
      </article>
      <div v-if="!results.data.length" class="surface stack">
        <p class="muted">{{ t('绑定平台后，可在这里查看自动派发的现金返利。', 'Vincule uma plataforma para acompanhar o cashback automático.') }}</p>
        <button class="primary" type="button" @click="go('/binding?return=%2Fcashback')">{{ t('绑定平台') }}</button>
      </div>
      <MemberPagination :page="results" :busy="loading" @page="load" />
    </template>
  </section>
</template>

<style scoped>
.cashback-page {
  --cashback-card-bg: #202329;
  --cashback-card-border: #484d57;
  --cashback-divider: #3b404a;
  --cashback-secondary-text: #c3c6ce;
  gap: 16px;
  overflow-wrap: anywhere;
}
.cashback-page h2 { margin: 0; font-size: 16px; }
.cashback-schedule {
  padding: 8px 11px;
  border-inline-start: 2px solid var(--accent);
  border-radius: 0 8px 8px 0;
  background: #30241a;
  color: #f1d7b3;
  font-size: 12px;
}
.cashback-card, .cashback-detail, .cashback-record {
  border-color: var(--cashback-card-border);
  border-radius: 14px;
  background: var(--cashback-card-bg);
  box-shadow: 0 5px 14px #03020255;
}
.cashback-card { display: grid; gap: 12px; }
.cashback-platform { display: flex; align-items: center; gap: 10px; }
.cashback-platform > div { min-width: 0; }
.cashback-platform p, .cashback-record time, .cashback-card-footer { font-size: 12px; }
.cashback-platform p, .cashback-record time { color: var(--cashback-secondary-text); }
.cashback-logo {
  display: grid;
  place-items: center;
  flex: 0 0 44px;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--cashback-divider);
  border-radius: 10px;
  background: #14171c;
  color: var(--highlight);
}
.cashback-logo img { display: block; width: 100%; height: 100%; object-fit: contain; }
.cashback-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  row-gap: 10px;
  margin: 0;
}
.cashback-metrics > div { padding: 0 10px; }
.cashback-metrics > div:nth-child(3) { border-inline-start: 1px solid var(--cashback-divider); }
.cashback-metrics > .cashback-primary-metric {
  grid-column: 1 / -1;
  padding: 10px 12px;
  border: 1px solid #705130;
  border-radius: 10px;
  background: linear-gradient(105deg, #45321e, #2a241f);
}
.cashback-metrics :is(dt, small) { color: var(--cashback-secondary-text); font-size: 12px; }
.cashback-primary-metric dt { color: #f1d7b3; }
.cashback-metrics dd { margin: 2px 0 0; font-weight: 750; }
.cashback-primary-metric dd { font-size: 25px; line-height: 1.2; }
.cashback-credit, .cashback-countdown { color: var(--highlight); font-variant-numeric: tabular-nums; }
.cashback-countdown { display: inline-block; }
.cashback-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding-top: 9px;
  border-top: 1px solid var(--cashback-divider);
}
.cashback-card-footer > div { display: grid; gap: 1px; }
.cashback-countdown { font-size: 14px; }
.cashback-card-footer a {
  display: inline-flex;
  align-items: center;
  margin-inline-start: auto;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid #745c40;
  border-radius: 8px;
  background: #30271f;
  text-align: start;
}
.cashback-card-footer a:hover { border-color: var(--accent); }
.cashback-detail .summary-list > div { border-color: var(--cashback-divider); }
.cashback-records { display: grid; gap: 12px; list-style: none; margin: 0; padding: 0; }
.cashback-record { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; }
.cashback-record > p { grid-column: 1 / -1; font-size: 13px; }
</style>
