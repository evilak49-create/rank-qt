<script>
const catalogs = new Map()
const submissions = new Map()
</script>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api, imageUrl } from '../api'
import PlatformCard from '../PlatformCard.vue'
import { go, back } from '../navigation'
import { icons } from '../icons'
import { formatBrl as brl, parseBrl } from '../money'
import { useLocale } from '../locale.js'
import { createRequestId } from '../requestId.js'

const props = defineProps({ route: { type: Object, required: true }, member: Object, language: String })
const emit = defineEmits(['refresh-member'])
const { t, locale } = useLocale()
const statusLabels = computed(() => ({
  pending: t('待处理', 'Pendente'), cancelled: t('已取消', 'Cancelado'), processing: t('处理中', 'Em processamento'),
  paid: t('已到账', 'Creditado'), rejected: t('已驳回', 'Recusado'), failed: t('兑换失败', 'Falha no resgate'), unresolved: t('待核实', 'Aguardando verificação'),
}))
const calendar = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }))
const mode = computed(() => {
  const { path, params } = props.route
  if (path === '/shop') return 'catalog'
  if (path === '/shop/redemptions') return 'history'
  if (params.id && path === '/shop/funds/' + params.id) return 'funds'
  if (params.id && path === '/shop/redemptions/' + params.id) return 'detail'
  return 'missing'
})
const catalog = ref(null)
const history = ref(null)
const search = ref('')
const balance = ref(null)
const subject = ref(null)
const binding = ref(null)
const order = ref(null)
const amountInput = ref('')
const quote = ref(null)
const loading = ref(false)
const refreshingOrder = ref(false)
const previewing = ref(false)
const submitting = ref(false)
const issue = ref('')
const retry = ref(null)
const brokenImages = ref(new Set())
let controller
let quoteGeneration = 0
let quoteTimer

const amountCents = computed(() => parseBrl(amountInput.value))
const validAmount = computed(() => amountCents.value !== null && amountCents.value <= 2147483647)
const overBalance = computed(() => balance.value !== null && amountCents.value > balance.value)
const sessionPath = computed(() => encodeURIComponent(props.route.fullPath || props.route.path))
const redemptionPath = id => '/shop/redemptions/' + id + '?type=funds'
const status = value => value === 'pending' ? t('待审核', 'Aguardando análise') : statusLabels.value[value] || t('状态待更新', 'Situação a confirmar')
const date = value => value && !Number.isNaN(Date.parse(value)) ? calendar.value.format(new Date(value)) : '—'
const message = error => {
  if (locale.value !== 'pt-BR') return Object.values(error.errors || {}).flat()[0] || error.message || '请稍后重试。'
  return ({
    403: 'Você não pode realizar esta operação.',
    404: 'Esta plataforma ou este pedido não está disponível.',
    409: 'As informações mudaram. Confira os dados e tente novamente.',
    422: 'Não foi possível validar o resgate. Confira os dados e o saldo.',
    503: 'O serviço está indisponível no momento. Tente novamente mais tarde.',
  })[error.status] || 'Não foi possível concluir a operação. Tente novamente.'
}
const requestKey = () => [props.member?.id, mode.value, props.route.params.id].join(':')
const login = () => go('/login?next=' + sessionPath.value)
const goToHistory = () => go('/shop/redemptions')
const newList = () => ({ items: [], page: 0, last: 1, loading: false, error: '' })
const refreshLabel = computed(() => props.language === 'pt-BR' ? 'Atualizar' : '刷新')

function fetchList(list, path, signal, fresh = false) {
  if (list.loading || list.page >= list.last) return
  const page = list.page + 1
  list.loading = true
  list.error = ''
  return api(path + (path.includes('?') ? '&' : '?') + 'page=' + page, { signal, fresh })
    .then(result => {
      if (signal.aborted) return
      list.items.push(...result.data)
      list.page = result.current_page
      list.last = result.last_page
    })
    .catch(error => { if (!signal.aborted) list.error = message(error) })
    .finally(() => { list.loading = false })
}

function catalogPage() {
  const term = encodeURIComponent((props.route.query.get('search') || '').slice(0, 120))
  return fetchList(catalog.value, '/platforms?search=' + term, controller.signal)
}

const platformOrders = '/platform-funds/orders'

function historyPage() {
  return fetchList(history.value, platformOrders, controller.signal, true)
}

function refreshHistory() {
  if (history.value?.loading) return
  history.value = newList()
  return historyPage()
}

async function refreshOrder() {
  if (refreshingOrder.value) return
  const signal = controller.signal
  refreshingOrder.value = true
  issue.value = ''
  try {
    const { data } = await api(platformOrders + '/' + props.route.params.id, { signal, fresh: true })
    if (!signal.aborted) order.value = data
  } catch (error) {
    if (!signal.aborted) issue.value = message(error)
  } finally {
    if (!signal.aborted) refreshingOrder.value = false
  }
}

async function readBalance(signal) {
  try {
    const { data } = await api('/cash-wallet', { signal, fresh: true })
    if (!signal.aborted) balance.value = data.available_balance_cents
  } catch (error) {
    if (!signal.aborted) {
      if (error.status === 401 || error.status === 403) balance.value = null
      if (mode.value !== 'catalog') issue.value = message(error)
    }
  }
}

async function findBinding(id, signal) {
  for (let page = 1; ; page += 1) {
    const result = await api('/platform-bindings?page=' + page, { signal })
    const match = result.data.find(item => String(item.platform_id) === id)
    if (match || page >= result.last_page) return match || null
  }
}


async function load() {
  controller?.abort()
  const signal = (controller = new AbortController()).signal
  clearTimeout(quoteTimer)
  quoteGeneration += 1
  loading.value = previewing.value = submitting.value = refreshingOrder.value = false
  issue.value = amountInput.value = ''
  subject.value = binding.value = quote.value = order.value = null
  balance.value = props.member?.available_balance_cents ?? null
  retry.value = props.member ? submissions.get(requestKey()) || null : null
  const id = props.route.params.id

  if (mode.value === 'catalog') {
    search.value = (props.route.query.get('search') || '').slice(0, 120)
    const key = search.value
    if (!catalogs.has(key)) {
      if (catalogs.size >= 12) catalogs.delete(catalogs.keys().next().value)
      catalogs.set(key, newList())
    }
    catalog.value = catalogs.get(key)
    if (!catalog.value.page) catalogPage()
    if (props.member) readBalance(signal)
    return
  }

  if (mode.value === 'history') {
    history.value = null
    if (props.member) refreshHistory()
    return
  }

  if (mode.value === 'detail') {
    if (props.route.query.get('type') === 'goods') {
      go('/shop/redemptions', { replace: true })
      return
    }
    if (props.member) refreshOrder()
    return
  }

  if (mode.value === 'missing') return
  loading.value = true
  try {
    if (props.member) readBalance(signal)
    const [item, prerequisite] = await Promise.all([
      api('/platforms/' + id, { signal }), props.member ? findBinding(id, signal) : null,
    ])
    if (signal.aborted) return
    subject.value = item.data
    binding.value = prerequisite
  } catch (error) {
    if (!signal.aborted) issue.value = message(error)
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

watch([() => props.route.fullPath || props.route.path, () => props.member?.id], load, { immediate: true })
onBeforeUnmount(() => {
  controller?.abort()
  clearTimeout(quoteTimer)
})

function searchCatalog() {
  const term = search.value.trim()
  go(term ? '/shop?search=' + encodeURIComponent(term) : '/shop', { replace: true })
}

function previewFunds() {
  clearTimeout(quoteTimer)
  quote.value = null
  previewing.value = false
  const generation = ++quoteGeneration
  if (mode.value !== 'funds' || !binding.value || retry.value || !validAmount.value || overBalance.value) return
  const signal = controller.signal
  issue.value = ''
  previewing.value = true
  quoteTimer = setTimeout(async () => {
    try {
      const { data } = await api('/platform-funds/preview', {
        body: { binding_id: binding.value.id, amount_cents: amountCents.value }, signal,
      })
      if (generation !== quoteGeneration || signal.aborted) return
      if (data.balance_paid_cents !== amountCents.value) throw new Error(t('余额结算暂不可用', 'Pagamento com saldo indisponível'))
      quote.value = data
    } catch (error) {
      if (generation === quoteGeneration && !signal.aborted) issue.value = message(error)
    } finally {
      if (generation === quoteGeneration && !signal.aborted) previewing.value = false
    }
  }, 300)
}

watch([amountInput, binding, overBalance], previewFunds)

async function submit() {
  if (submitting.value || !props.member) return
  const previous = retry.value
  if (!previous && (!quote.value || overBalance.value || balance.value === null)) return
  const key = requestKey()
  const signal = controller.signal
  const payload = previous || {
    binding_id: binding.value.id, amount_cents: quote.value.balance_paid_cents, request_id: createRequestId(),
  }
  submissions.set(key, payload)
  submitting.value = true
  issue.value = ''
  try {
    const { data } = await api('/platform-funds/orders', { body: payload })
    submissions.delete(key)
    if (!signal.aborted) {
      emit('refresh-member')
      showNotice(t('兑换已提交', 'Resgate solicitado'), t('可在兑换记录中查看订单进度。', 'Acompanhe o pedido no histórico de resgates.'), 'success')
      go(redemptionPath(data.id), { replace: true })
    }
  } catch (error) {
    const knownFailure = [400, 403, 404, 409, 422].includes(error.status)
    if (knownFailure) submissions.delete(key)
    if (signal.aborted) return
    retry.value = knownFailure ? null : payload
    issue.value = knownFailure ? message(error) : t('订单结果尚未确认。可查看兑换记录，或使用同一请求重试。', 'O resultado ainda não foi confirmado. Consulte o histórico ou repita a mesma solicitação.')
    if (knownFailure) readBalance(signal)
  } finally {
    if (!signal.aborted) submitting.value = false
  }
}

function failedImage(key) {
  brokenImages.value.add(key)
}

import { showNotice, watchNotice } from '../feedback'
watchNotice(issue, () => t('兑换提醒', 'Aviso de resgate'), 'error')
watchNotice(() => catalog.value?.error, () => t('平台资金列表加载失败', 'Não foi possível carregar as plataformas'), 'error')
watchNotice(() => history.value?.error, () => t('兑换记录加载失败', 'Não foi possível carregar o histórico'), 'error')
</script>

<template>
  <section class="shop-screen stack">
    <template v-if="mode === 'catalog' && catalog">
      <div class="shop-balance surface">
        <div>
          <p class="muted">{{ t('可用余额', 'Saldo disponível') }}</p>
          <strong v-if="member">{{ balance === null ? '—' : brl(balance) }}</strong>
          <button v-else class="shop-login" @click="login">{{ t('登录后查看', 'Entre para consultar') }}</button>
        </div>
        <button class="quiet" @click="goToHistory">{{ t('兑换记录', 'Histórico de resgates') }} <span aria-hidden="true">›</span></button>
      </div>
      <form class="shop-search" role="search" @submit.prevent="searchCatalog">
        <input v-model="search" class="field" type="search" maxlength="120" :placeholder="t('搜索平台', 'Buscar plataformas')" :aria-label="t('搜索平台', 'Buscar plataformas')" @search="searchCatalog" />
        <button class="quiet" type="submit">{{ t('搜索', 'Buscar') }}</button>
      </form>

      <section class="stack" aria-labelledby="shop-funds">
        <h2 id="shop-funds">{{ t('平台资金兑换', 'Resgatar crédito na plataforma') }}</h2>
        <div v-if="catalog.items.length" class="shop-funds-list">
          <PlatformCard v-for="item in catalog.items" :key="item.id" class="surface shop-fund" row
                        :platform-id="item.id" :name="item.name" :promotion-url="item.promotion_url">
            <div class="shop-logo">
              <img v-if="imageUrl(item.logo_url) && !brokenImages.has('platform-' + item.id)" :src="imageUrl(item.logo_url)" alt="" loading="lazy" @error="failedImage('platform-' + item.id)" />
              <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.platforms" /></svg>
            </div>
            <div class="shop-list-text"><h3>{{ item.name }}</h3><p class="muted">{{ t('使用余额兑换', 'Resgate com saldo') }}</p></div>
            <template #controls>
              <button class="primary platform-entry-control" :aria-label="t('兑换 ', 'Resgatar crédito em ') + item.name" @click="go('/shop/funds/' + item.id)">{{ t('兑换', 'Resgatar') }}</button>
            </template>
          </PlatformCard>
        </div>
        <p v-if="!catalog.loading && !catalog.error && !catalog.items.length" class="surface muted">{{ t('暂无匹配平台。', 'Nenhuma plataforma encontrada.') }}</p>
        <button v-if="catalog.page < catalog.last && !catalog.loading" class="quiet" @click="catalogPage()">{{ catalog.error ? t('重试', 'Tentar novamente') : t('加载更多平台', 'Ver mais plataformas') }}</button>
      </section>
    </template>

    <template v-else-if="mode === 'history'">
      <div v-if="!member" class="surface stack"><p>{{ t('请登录查看兑换记录。', 'Entre para consultar seu histórico de resgates.') }}</p><button class="primary" @click="login">{{ t('登录', 'Entrar') }}</button></div>
      <template v-else-if="history">
        <button class="quiet" :disabled="history.loading" @click="refreshHistory">{{ refreshLabel }}</button>
        <div v-if="history.items.length" class="row-list shop-records">
          <button v-for="item in history.items" :key="item.id" class="surface shop-record" @click="go(redemptionPath(item.id))">
            <span class="shop-list-text"><strong>{{ item.platform_name }}</strong><small class="muted">{{ date(item.created_at) }}</small></span>
            <span class="shop-record-amount"><strong>{{ item.balance_paid_cents == null ? t('历史兑换', 'Resgate anterior') : '−' + brl(item.balance_paid_cents) }}</strong><small class="shop-status" :data-status="item.status">{{ status(item.status) }}</small></span>
          </button>
        </div>
        <p v-if="!history.loading && !history.error && !history.items.length" class="surface muted">{{ t('暂无兑换记录。', 'Nenhum resgate registrado.') }}</p>
        <button v-if="history.page < history.last && !history.loading" class="quiet" @click="historyPage">{{ history.error ? t('重试', 'Tentar novamente') : t('加载更多', 'Ver mais') }}</button>
      </template>
    </template>

    <template v-else-if="!loading">
      <template v-if="mode === 'funds'">
        <article v-if="subject" class="surface stack shop-checkout">
          <div class="shop-summary">
            <div class="shop-logo">
              <img v-if="imageUrl(subject.logo_url) && !brokenImages.has('platform-' + subject.id)" :src="imageUrl(subject.logo_url)" alt="" @error="failedImage('platform-' + subject.id)" />
              <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.platforms" /></svg>
            </div>
            <div class="shop-list-text">
              <h2>{{ subject.name }}</h2>
              <p class="muted">{{ t('使用余额兑换', 'Resgate com saldo') }}</p>
            </div>
          </div>
          <p v-if="member && balance !== null" class="muted">{{ t('可用余额', 'Saldo disponível') }} {{ brl(balance) }}</p>

          <template v-if="!member">
            <p>{{ t('请登录后继续兑换。', 'Entre para continuar o resgate.') }}</p>
            <button class="primary" @click="login">{{ t('登录', 'Entrar') }}</button>
          </template>
          <template v-else-if="retry">
            <p class="shop-notice">{{ t('有一笔兑换尚待确认结果。', 'Há um resgate com resultado pendente.') }}</p>
            <div class="shop-actions"><button class="quiet" @click="goToHistory">{{ t('兑换记录', 'Histórico de resgates') }}</button><button class="primary" :disabled="submitting" @click="submit">{{ t('重试原请求', 'Repetir a solicitação original') }}</button></div>
          </template>
          <template v-else-if="!binding">
            <p>{{ t('您还没有绑定该平台账号。', 'Você ainda não vinculou uma conta nessa plataforma.') }}</p>
            <div class="shop-actions"><button class="quiet" @click="back('/shop')">{{ t('取消', 'Cancelar') }}</button><button class="primary" @click="go('/binding?platform=' + subject.id + '&return=' + sessionPath)">{{ t('去绑定', 'Cadastrar') }}</button></div>
          </template>
          <template v-else>
            <div class="shop-facts"><strong>{{ t('平台账号', 'Conta na plataforma') }}</strong><p class="muted">{{ binding.platform_account_id }}</p></div>
            <label class="shop-points">{{ t('使用余额金额（BRL）', 'Valor a pagar com saldo (BRL)') }} <input v-model="amountInput" class="field" type="text" inputmode="decimal" maxlength="12" :placeholder="t('输入雷亚尔金额', 'Digite o valor em reais')" :disabled="submitting" /></label>
            <div class="shop-facts shop-estimate">
              <span class="muted">{{ t('预计到账（BRL）', 'Crédito estimado (BRL)') }}</span>
              <strong class="shop-highlight" aria-live="polite">{{ quote ? brl(quote.amount_cents) : '—' }}</strong>
            </div>
            <p v-if="amountInput && !validAmount" class="error">{{ t('请输入有效的金额，最多两位小数。', 'Digite um valor válido com até duas casas decimais.') }}</p>
            <p v-else-if="overBalance" class="error">{{ t('可用余额不足。', 'Saldo disponível insuficiente.') }}</p>
            <button v-if="issue && !quote && validAmount && !overBalance && !previewing" class="quiet" @click="previewFunds">{{ t('重新获取兑换预览', 'Simular novamente') }}</button>
            <button v-else class="primary" :disabled="!quote || overBalance || balance === null || submitting" @click="submit">{{ t('确认兑换', 'Confirmar resgate') }}</button>
          </template>
        </article>
        <button v-else-if="issue" class="quiet" @click="load">{{ t('重新加载', 'Recarregar') }}</button>
      </template>

      <template v-else-if="mode === 'detail'">
        <div v-if="!member" class="surface stack"><p>{{ t('请登录查看订单详情。', 'Entre para ver os detalhes do pedido.') }}</p><button class="primary" @click="login">{{ t('登录', 'Entrar') }}</button></div>
        <article v-else-if="order" class="surface stack shop-checkout">
          <div class="shop-summary">
            <div class="shop-list-text"><h2>{{ order.platform_name }}</h2><p class="shop-highlight">{{ order.balance_paid_cents == null ? t('历史兑换', 'Resgate anterior') : '−' + brl(order.balance_paid_cents) }}</p></div>
            <span class="shop-status" :data-status="order.status">{{ status(order.status) }}</span>
          </div>
          <dl class="shop-details">
            <dt>{{ t('订单编号', 'Número do pedido') }}</dt><dd>{{ order.order_number }}</dd>
            <dt>{{ t('提交时间', 'Data da solicitação') }}</dt><dd>{{ date(order.created_at) }}</dd>
            <dt>{{ t('平台账号', 'Conta na plataforma') }}</dt><dd>{{ order.platform_account_id }}</dd>
            <dt>{{ t('兑换金额', 'Valor do resgate') }}</dt><dd class="shop-highlight">{{ brl(order.amount_cents) }} {{ order.currency }}</dd>
            <template v-if="order.paid_at"><dt>{{ t('到账时间', 'Data do crédito') }}</dt><dd>{{ date(order.paid_at) }}</dd></template>
            <template v-if="order.paused || order.needs_review"><dt>{{ t('处理进度', 'Andamento') }}</dt><dd>{{ order.needs_review ? t('等待人工核实', 'Aguardando verificação manual') : t('发放已暂停', 'Crédito suspenso') }}</dd></template>
            <template v-if="order.reviewed_at"><dt>{{ t('审核时间', 'Data da análise') }}</dt><dd>{{ date(order.reviewed_at) }}</dd></template>
            <template v-if="order.review_reason"><dt>{{ t('审核说明', 'Nota da análise') }}</dt><dd>{{ order.review_reason }}</dd></template>
          </dl>
        </article>
        <div v-if="member" class="shop-actions">
          <button class="quiet" @click="back('/shop/redemptions')">{{ t('返回', 'Voltar') }}</button>
          <button class="quiet" :disabled="refreshingOrder" @click="refreshOrder">{{ refreshLabel }}</button>
          <button class="primary" @click="goToHistory">{{ t('兑换记录', 'Histórico de resgates') }}</button>
        </div>
      </template>
      <div v-else class="surface stack"><p>{{ t('未找到该兑换页面。', 'Página de resgate não encontrada.') }}</p><button class="quiet" @click="go('/shop')">{{ t('返回兑换', 'Voltar aos resgates') }}</button></div>
    </template>
  </section>
</template>

<style scoped>
.shop-screen, .shop-screen section { display: grid; gap: 12px; }
.shop-screen { padding-block: 2px 18px; }
.shop-screen h2 { font-size: 17px; line-height: 1.35; }
.shop-screen h3 { font-size: 14px; overflow-wrap: anywhere; }
.shop-screen .surface { min-width: 0; }
.shop-balance { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 15px; border-color: var(--line-strong); background: linear-gradient(112deg, var(--surface-highlight), var(--surface)); }
.shop-balance > div { min-width: 0; overflow-wrap: anywhere; }
.shop-balance > button { max-width: 48%; overflow-wrap: anywhere; }
.shop-balance strong { display: block; color: var(--highlight); font-size: clamp(19px, 5.9vw, 28px); line-height: 1.2; }
.shop-login { padding: 0; min-height: 38px; color: var(--accent); font-weight: 750; }
.shop-search, .shop-actions { display: flex; gap: 8px; }
.shop-search .field { flex: 1; min-width: 0; }
.shop-screen input.field { width: 100%; min-height: 44px; padding: 8px 11px; border: 1px solid var(--control-line); border-radius: 8px; background: var(--surface-recessed); color: inherit; font-size: 16px; }
.shop-search button { flex-shrink: 0; }
.shop-actions > * { flex: 1; }
.shop-logo { display: grid; place-items: center; background: var(--surface-highlight); color: var(--accent); overflow: hidden; }
.shop-highlight { color: var(--highlight); font-weight: 800; }
.shop-highlight small { color: inherit; }
.shop-list-text .muted { font-size: 12px; }
.shop-funds-list, .shop-records { display: grid; gap: 7px; }
.shop-fund, .shop-summary, .shop-record { display: flex; align-items: center; gap: 10px; }
.shop-summary > :last-child:not(.shop-list-text), .shop-fund > :last-child { flex-shrink: 0; }
.shop-logo { width: 43px; height: 43px; flex: 0 0 43px; border-radius: 9px; }
.shop-logo img { width: 100%; height: 100%; object-fit: cover; min-height: 0; }
.shop-logo svg { width: 22px; fill: none; stroke: currentColor; stroke-width: 1.4; }
.shop-list-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.shop-record { width: 100%; justify-content: space-between; text-align: left; }
.shop-record:hover { border-color: var(--accent); }
.shop-record small { display: block; margin-top: 3px; }
.shop-record-amount { flex-shrink: 0; text-align: right; }
.shop-record-amount strong { font-size: 13px; }
.shop-status { color: var(--accent); font-size: 12px; }
.shop-status[data-status="paid"] { color: var(--success); }
.shop-status[data-status="failed"], .shop-status[data-status="rejected"], .shop-status[data-status="cancelled"] { color: var(--danger); }
.shop-checkout { padding: 14px; overflow-wrap: anywhere; }
.shop-facts { display: grid; gap: 3px; padding: 10px; border: 1px solid var(--line); border-radius: 9px; }
.shop-points { display: grid; gap: 5px; }
.shop-estimate { grid-template-columns: 1fr auto; align-items: center; }
.shop-details { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; margin: 0; padding-top: 10px; border-top: 1px solid var(--line); font-size: 13px; }
.shop-details dt { color: var(--muted); }
.shop-details dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.shop-notice { color: var(--muted); }
</style>
