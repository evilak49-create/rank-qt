<script setup>
import EmptyState from '../EmptyState.vue'
import RecordDateFilter from '../RecordDateFilter.vue'
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
  const seconds = Math.max(0, Math.ceil((nextDispatch.value - currentTime.value) / 1000))
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
    .map(value => String(value).padStart(2, '0'))
})
const countdownUnits = computed(() => [t('小时', 'Horas'), t('分钟', 'Minutos'), t('秒', 'Segundos')])
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
    const historyQuery = new URLSearchParams({ page })
    if (isHistory) {
      for (const key of ['date_from', 'date_to']) {
        const value = props.route.query.get(key)
        if (value) historyQuery.set(key, value)
      }
    }
    const resource = isHistory ? '/cashback/history?' + historyQuery
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

function routePage() {
  const page = Number(props.route.query.get('page'))
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

function goHistoryPage(page, dates = {}) {
  const params = new URLSearchParams(props.route.query)
  for (const [key, value] of Object.entries(dates)) {
    if (value) params.set(key, value)
    else params.delete(key)
  }
  if (page > 1) params.set('page', page)
  else params.delete('page')
  go('/cashback/records' + (params.size ? '?' + params : ''), { replace: true })
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
  if (isHistory) results.value = null
  load(routePage())
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
    <section v-if="!isHistory" class="cashback-schedule" aria-labelledby="cashback-schedule-title">
      <div class="cashback-schedule-heading">
        <div class="cashback-schedule-time">
          <h2 id="cashback-schedule-title">{{ t('每天自动派发', 'Crédito diário') }}</h2>
          <time datetime="12:00">12:00</time>
          <span>{{ t('巴西利亚时间', 'Hora de Brasília') }}</span>
        </div>
        <p>{{ t('符合条件的返利自动到账，无需领取。', 'Crédito automático direto no saldo.') }}</p>
      </div>
      <div class="cashback-next">
        <div class="cashback-next-heading">
          <h3>{{ t('距下次派发', 'Próximo crédito em') }}</h3>
          <time v-if="nextDispatch > currentTime" class="cashback-next-date" :datetime="new Date(nextDispatch).toISOString()">
            {{ formattedDate(new Date(nextDispatch).toISOString()) }}
          </time>
        </div>
        <template v-if="nextDispatch > currentTime">
          <div class="cashback-countdown" role="timer">
            <div v-for="(unit, index) in countdownUnits" :key="unit" class="cashback-countdown-unit">
              <strong>{{ countdown[index] }}</strong>
              <span>{{ unit }}</span>
            </div>
          </div>
        </template>
        <p v-else-if="nextDispatch" class="cashback-next-date">{{ t('已到派发时间，正在更新下次时间。', 'Chegou o horário do crédito. Atualizando a próxima data.') }}</p>
        <p v-else-if="!loading" class="cashback-next-date">{{ t('下次派发时间暂不可用。', 'O próximo horário ainda não está disponível.') }}</p>
      </div>
    </section>
    <RecordDateFilter v-if="isHistory" :date-from="route.query.get('date_from') ?? ''"
      :date-to="route.query.get('date_to') ?? ''" @change="goHistoryPage(1, $event)" />
    <button v-if="error" class="quiet" type="button" @click="load(isHistory ? routePage() : results?.current_page || 1)">{{ t('重试') }}</button>

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
      <EmptyState v-else :message="t('暂无返利记录。', 'Nenhum cashback registrado.')" />
      <MemberPagination :page="results" :busy="loading" @page="goHistoryPage" />
    </template>

    <template v-else-if="bindingId && detail">
      <section class="surface stack cashback-detail">
        <h2>{{ detail.platform_name }}</h2>
        <p class="muted">{{ t('数据更新时间', 'Dados atualizados em') }} <time :datetime="detail.observed_at">{{ formattedDate(detail.observed_at) }}</time></p>
        <dl class="cashback-metrics">
          <div class="cashback-amount cashback-amount-current"><dt>{{ t('当前可得返利', 'Cashback atual') }}</dt><dd>{{ money(detail.current_cents) }}</dd><small>{{ t('当前返利比例', 'Taxa atual') }} {{ rate(detail.rebate_percent, '%') }}</small></div>
          <div class="cashback-amount cashback-amount-estimate"><dt>{{ t('最高可得返利', 'Cashback máximo') }}</dt><dd>{{ money(detail.estimated_cents) }}</dd><small v-if="detail.estimated_wager_multiplier != null">{{ rate(detail.estimated_wager_multiplier, '×') }} · {{ rate(detail.estimated_rebate_percent, '%') }}</small></div>
        </dl>
        <dl class="summary-list">
          <div><dt>{{ t('当前充值总额') }}</dt><dd>{{ money(detail.observed_deposit_cents) }}</dd></div>
          <div><dt>{{ t('当前投注额') }}</dt><dd>{{ money(detail.observed_valid_bet_cents) }}</dd></div>
          <div><dt>{{ t('本期待结算存款', 'Depósitos a liquidar') }}</dt><dd>{{ money(detail.deposit_cents) }}</dd></div>
          <div><dt>{{ t('本期有效投注额') }}</dt><dd>{{ money(detail.valid_bet_cents) }}</dd></div>
          <div><dt>{{ t('命中打码挡位', 'Faixa de apostas atingida') }}</dt><dd>{{ rate(detail.matched_rebate_wager_multiplier, '×') }}</dd></div>
        </dl>
      </section>
    </template>

    <template v-else-if="!bindingId && !isHistory && results">
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
          <a class="cashback-details-link" :href="'#/cashback/' + item.binding_id"
             @click.prevent="go('/cashback/' + item.binding_id)">
            {{ t('查看明细', 'Ver detalhes') }} <span aria-hidden="true">›</span>
          </a>
        </header>
        <dl class="cashback-metrics">
          <div class="cashback-amount cashback-amount-current"><dt>{{ t('当前可得返利', 'Cashback atual') }}</dt><dd>{{ money(previews[item.binding_id]?.current_cents) }}</dd><small>{{ t('当前返利比例', 'Taxa atual') }} {{ rate(previews[item.binding_id]?.rebate_percent, '%') }}</small></div>
          <div class="cashback-amount cashback-amount-estimate"><dt>{{ t('最高可得返利', 'Cashback máximo') }}</dt><dd>{{ money(previews[item.binding_id]?.estimated_cents) }}</dd><small v-if="previews[item.binding_id]?.estimated_wager_multiplier != null">{{ rate(previews[item.binding_id].estimated_wager_multiplier, '×') }} · {{ rate(previews[item.binding_id].estimated_rebate_percent, '%') }}</small></div>
        </dl>
      </article>
      <EmptyState v-if="!results.data.length" :message="t('绑定平台后，可在这里查看自动派发的现金返利。', 'Vincule uma plataforma para acompanhar o cashback automático.')">
        <button class="primary" type="button" @click="go('/binding?return=%2Fcashback')">{{ t('绑定平台') }}</button>
      </EmptyState>
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
  display: grid;
  gap: 6px;
  padding: 9px 11px;
  border: 1px solid #6c512f;
  border-radius: 12px;
  background: #2a2018;
  color: #f4ddbe;
}
.cashback-schedule-heading { display: grid; gap: 3px; }
.cashback-schedule-heading h2 { color: #fff2df; font-size: 13px; }
.cashback-schedule-heading p, .cashback-next-date { font-size: 11px; line-height: 1.35; }
.cashback-schedule-time { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 5px; }
.cashback-schedule-time time {
  color: var(--highlight);
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.cashback-schedule-time span { color: #f3d4a7; font-size: 11px; }
.cashback-next { display: grid; gap: 5px; padding-top: 6px; border-top: 1px solid #5c422b; }
.cashback-next-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 2px 8px; }
.cashback-next h3 { margin: 0; color: #fff2df; font-size: 12px; }
.cashback-countdown { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
.cashback-countdown-unit {
  display: flex;
  align-items: baseline;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0 4px;
  padding: 3px;
  border: 1px solid #63492f;
  border-radius: 7px;
  background: #1b1715;
}
.cashback-countdown-unit strong {
  color: var(--highlight);
  font-size: 16px;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.cashback-countdown-unit span { font-size: 10px; }
.cashback-card, .cashback-detail, .cashback-record {
  border-color: var(--cashback-card-border);
  border-radius: 14px;
  background: var(--cashback-card-bg);
  box-shadow: 0 5px 14px #03020255;
}
.cashback-card {
  display: grid;
  gap: 10px;
  border-color: #6b665c;
  border-top: 2px solid #c28b44;
  background: linear-gradient(140deg, #303039, #24262c 70%);
}
.cashback-platform {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: start;
  gap: 8px;
}
.cashback-platform > div { align-self: center; min-width: 0; }
.cashback-platform h2 { color: #fff8ef; font-size: 17px; line-height: 1.15; font-weight: 800; }
.cashback-platform p, .cashback-record time { font-size: 12px; }
.cashback-platform p, .cashback-record time { color: var(--cashback-secondary-text); }
.cashback-logo {
  display: grid;
  place-items: center;
  width: 44px;
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
  gap: 8px;
  margin: 0;
}
.cashback-amount {
  min-width: 0;
  padding: 10px clamp(7px, 2.5vw, 12px);
  border: 1px solid;
  border-radius: 10px;
}
.cashback-amount-current { background: #392813; border-color: #875a25; color: #ffd16d; }
.cashback-amount-estimate { background: #143328; border-color: #397457; color: #a5f5c9; }
.cashback-amount :is(dt, small) { font-size: 12px; }
.cashback-amount small { display: block; margin-top: 3px; }
.cashback-amount dd { margin: 4px 0 0; font-weight: 750; font-size: clamp(16px, 5.5vw, 24px); line-height: 1.2; font-variant-numeric: tabular-nums; }
.cashback-credit { color: var(--highlight); font-variant-numeric: tabular-nums; }
.cashback-details-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 44px;
  padding: 0 8px;
  border: 1px solid #8d6439;
  border-radius: 8px;
  background: #402e1d;
  color: #ffd18a;
  font-size: 12px;
  font-weight: 750;
  text-decoration: none;
  white-space: nowrap;
}
.cashback-details-link:hover { border-color: var(--accent); }
.cashback-details-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cashback-detail .summary-list > div { border-color: var(--cashback-divider); }
.cashback-records { display: grid; gap: 12px; list-style: none; margin: 0; padding: 0; }
.cashback-record { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; }
.cashback-record > p { grid-column: 1 / -1; font-size: 13px; }
</style>
