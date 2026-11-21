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
import { useLocale } from '../locale.js'
import { createRequestId } from '../requestId.js'

const props = defineProps({ route: { type: Object, required: true }, member: Object, language: String })
const emit = defineEmits(['refresh-member'])
const { t, locale } = useLocale()
const filters = [
  { id: 'all', label: ['全部', 'Todos'] },
  { id: 'goods', label: ['商品', 'Produtos'] },
  { id: 'funds', label: ['平台资金', 'Crédito na plataforma'] },
]
const statusLabels = computed(() => ({
  pending: t('待处理', 'Pendente'), shipped: t('已发货', 'Enviado'), cancelled: t('已取消', 'Cancelado'), processing: t('处理中', 'Em processamento'),
  paid: t('已到账', 'Creditado'), rejected: t('已驳回', 'Recusado'), failed: t('兑换失败', 'Falha no resgate'), unresolved: t('待核实', 'Aguardando verificação'),
}))
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const rateFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const number = computed(() => new Intl.NumberFormat(locale.value))
const calendar = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }))
const mode = computed(() => {
  const { path, params } = props.route
  if (path === '/shop') return 'catalog'
  if (path === '/shop/redemptions') return 'history'
  if (params.id && path === '/shop/products/' + params.id) return 'goods'
  if (params.id && path === '/shop/funds/' + params.id) return 'funds'
  if (params.id && path === '/shop/redemptions/' + params.id) return 'detail'
  return 'missing'
})
const filter = computed(() => {
  const type = props.route.query.get('type')
  return filters.some(item => item.id === type) ? type : 'all'
})
const orderType = computed(() => filter.value === 'funds' ? 'funds' : 'goods')
const catalog = ref(null)
const history = ref(null)
const search = ref('')
const balance = ref(null)
const subject = ref(null)
const address = ref(null)
const binding = ref(null)
const rate = ref(null)
const order = ref(null)
const points = ref('')
const quote = ref(null)
const loading = ref(false)
const refreshingOrder = ref(false)
const previewing = ref(false)
const submitting = ref(false)
const issue = ref('')
const notice = ref('')
const retry = ref(null)
const brokenImages = ref(new Set())
let controller
let quoteGeneration = 0
let quoteTimer

const validPoints = computed(() => /^\d+$/.test(points.value) && Number(points.value) >= 1 && Number(points.value) <= 2147483647)
const overBalance = computed(() => balance.value !== null && Number(points.value) > balance.value)
const confirmGoods = computed(() => address.value && subject.value?.stock > 0 && balance.value !== null && balance.value >= subject.value.points_price)
const sessionPath = computed(() => encodeURIComponent(props.route.fullPath || props.route.path))
const redemptionPath = (id, type) => '/shop/redemptions/' + id + '?type=' + type
const status = (type, value) => value === 'pending' ? (type === 'goods' ? t('待发货', 'Aguardando envio') : t('待审核', 'Aguardando análise')) : statusLabels.value[value] || t('状态待更新', 'Situação a confirmar')
const date = value => value && !Number.isNaN(Date.parse(value)) ? calendar.value.format(new Date(value)) : '—'
const brl = cents => money.format(Number(cents) / 100)
const rateText = cents => t('1 积分 = R$ ', '1 ponto = R$ ') + rateFormat.format(Number(cents) / 100)
const addressLine = value => [value.street, value.number, value.complement, value.district, value.city, value.state, value.postal_code].filter(Boolean).join(' · ')
const message = error => {
  if (locale.value !== 'pt-BR') return Object.values(error.errors || {}).flat()[0] || error.message || '请稍后重试。'
  return ({
    403: 'Você não pode realizar esta operação.',
    404: 'Este produto, plataforma ou pedido não está disponível.',
    409: 'As informações mudaram. Confira os dados e tente novamente.',
    422: 'Não foi possível validar o resgate. Confira os dados e o saldo.',
    503: 'O serviço está indisponível no momento. Tente novamente mais tarde.',
  })[error.status] || 'Não foi possível concluir a operação. Tente novamente.'
}
const requestKey = () => [props.member?.id, mode.value, props.route.params.id].join(':')
const login = () => go('/login?next=' + sessionPath.value)
const goToHistory = type => go('/shop/redemptions' + (type === 'all' ? '' : '?type=' + type))
const newList = () => ({ items: [], page: 0, last: 1, loading: false, error: '' })
const refreshLabel = computed(() => props.language === 'pt-BR' ? 'Atualizar' : '刷新')

function fetchList(list, path, signal) {
  if (list.loading || list.page >= list.last) return
  const page = list.page + 1
  list.loading = true
  list.error = ''
  return api(path + (path.includes('?') ? '&' : '?') + 'page=' + page, { signal })
    .then(result => {
      if (signal.aborted) return
      list.items.push(...result.data)
      list.page = result.current_page
      list.last = result.last_page
    })
    .catch(error => { if (!signal.aborted) list.error = message(error) })
    .finally(() => { list.loading = false })
}

function catalogPage(type) {
  const term = encodeURIComponent((props.route.query.get('search') || '').slice(0, 120))
  return fetchList(catalog.value[type], (type === 'products' ? '/shop/products' : '/platforms') + '?search=' + term, controller.signal)
}

const orderEndpoints = { goods: '/shop/orders', funds: '/platform-funds/orders' }

async function historyPage() {
  const list = history.value
  if (list.loading || list.page >= list.last) return
  const signal = controller.signal
  const type = filter.value
  list.loading = true
  list.error = ''
  try {
    if (!list.legacy) {
      try {
        const result = await api('/shop/redemptions?type=' + type + '&page=' + (list.page + 1), { signal, fresh: true })
        if (!signal.aborted) {
          list.items.push(...result.data)
          list.page = result.current_page
          list.last = result.last_page
        }
        return
      } catch (error) {
        if (error.status !== 404 || list.page || signal.aborted) throw error
        const types = type === 'all' ? ['goods', 'funds'] : [type]
        list.legacy = types.map(kind => ({ kind, page: 0, last: 1, items: [] }))
      }
    }

    // Exhaust buffered rows in submission order, fetching either stream before
    // comparing its next record with the other stream.
    for (let added = 0; added < 20 && !signal.aborted; added += 1) {
      const results = await Promise.allSettled(list.legacy.map(async stream => {
        if (stream.items.length || stream.page >= stream.last) return
        const result = await api(orderEndpoints[stream.kind] + '?page=' + (stream.page + 1), { signal, fresh: true })
        if (signal.aborted) return
        stream.items = result.data
        stream.page = result.current_page
        stream.last = result.last_page
      }))
      if (signal.aborted) return
      const failure = results.find(result => result.status === 'rejected')
      if (failure) throw failure.reason
      const next = list.legacy.filter(stream => stream.items.length)
        .sort((a, b) => Date.parse(b.items[0].created_at) - Date.parse(a.items[0].created_at))[0]
      if (!next) break
      const record = next.items.shift()
      const goods = next.kind === 'goods'
      list.items.push({
        id: record.id, type: next.kind, created_at: record.created_at, status: record.status,
        name: goods ? record.product_name : record.platform_name,
        points: goods ? record.points_price : record.points,
      })
    }
    if (!signal.aborted) {
      list.page += 1
      list.last = list.legacy.some(stream => stream.items.length || stream.page < stream.last) ? list.page + 1 : list.page
    }
  } catch (error) {
    if (!signal.aborted) list.error = message(error)
  } finally {
    list.loading = false
  }
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
    const { data } = await api(orderEndpoints[orderType.value] + '/' + props.route.params.id, { signal, fresh: true })
    if (!signal.aborted) order.value = data
  } catch (error) {
    if (!signal.aborted) issue.value = message(error)
  } finally {
    if (!signal.aborted) refreshingOrder.value = false
  }
}

async function readBalance(signal) {
  try {
    const { data } = await api('/wallet', { signal })
    if (!signal.aborted) balance.value = data.points_balance
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

async function loadRate(signal) {
  try {
    const { data } = await api('/platform-funds/rate', { signal })
    if (!signal.aborted) rate.value = data
  } catch {
    if (!signal.aborted) rate.value = null
  }
}

async function load() {
  controller?.abort()
  const signal = (controller = new AbortController()).signal
  clearTimeout(quoteTimer)
  quoteGeneration += 1
  loading.value = previewing.value = submitting.value = refreshingOrder.value = false
  issue.value = notice.value = points.value = ''
  subject.value = address.value = binding.value = quote.value = order.value = rate.value = null
  balance.value = props.member?.points_balance ?? null
  retry.value = props.member ? submissions.get(requestKey()) || null : null
  const id = props.route.params.id

  if (mode.value === 'catalog') {
    search.value = (props.route.query.get('search') || '').slice(0, 120)
    const key = search.value
    if (!catalogs.has(key)) {
      if (catalogs.size >= 12) catalogs.delete(catalogs.keys().next().value)
      catalogs.set(key, { products: newList(), platforms: newList() })
    }
    catalog.value = catalogs.get(key)
    if (!catalog.value.products.page) catalogPage('products')
    if (!catalog.value.platforms.page) catalogPage('platforms')
    loadRate(signal)
    if (props.member) readBalance(signal)
    return
  }

  if (mode.value === 'history') {
    history.value = null
    if (props.member) refreshHistory()
    return
  }

  if (mode.value === 'detail') {
    if (props.member) refreshOrder()
    return
  }

  if (mode.value === 'missing') return
  loading.value = true
  try {
    const goods = mode.value === 'goods'
    const publicPath = goods ? '/shop/products/' : '/platforms/'
    const memberData = !props.member ? null : goods
      ? api('/shipping-address', { signal }).then(result => result.data)
      : findBinding(id, signal)
    if (props.member) readBalance(signal)
    if (!goods) loadRate(signal)
    const [item, prerequisite] = await Promise.all([api(publicPath + id, { signal }), memberData])
    if (signal.aborted) return
    subject.value = item.data
    if (goods) address.value = prerequisite
    else binding.value = prerequisite
  } catch (error) {
    if (!signal.aborted) issue.value = message(error)
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

watch(() => [props.route.fullPath || props.route.path, props.member?.id], load, { immediate: true })
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
  if (mode.value !== 'funds' || !binding.value || retry.value || !validPoints.value || overBalance.value) return
  const signal = controller.signal
  issue.value = notice.value = ''
  previewing.value = true
  quoteTimer = setTimeout(async () => {
    try {
      const { data } = await api('/platform-funds/preview', {
        body: { binding_id: binding.value.id, points: Number(points.value) }, signal,
      })
      if (generation === quoteGeneration && !signal.aborted) quote.value = data
    } catch (error) {
      if (generation === quoteGeneration && !signal.aborted) issue.value = message(error)
    } finally {
      if (generation === quoteGeneration && !signal.aborted) previewing.value = false
    }
  }, 300)
}

watch([points, binding, overBalance], previewFunds)

async function submit() {
  if (submitting.value || !props.member) return
  const goods = mode.value === 'goods'
  const previous = retry.value
  if (!previous && (goods ? !confirmGoods.value : !quote.value || overBalance.value || balance.value === null)) return
  const key = requestKey()
  const signal = controller.signal
  const payload = previous || (goods
    ? { product_id: subject.value.id, address_version: address.value.version, request_id: createRequestId() }
    : { binding_id: binding.value.id, points: quote.value.points, rate_version: quote.value.rate_version, request_id: createRequestId() })
  submissions.set(key, payload)
  submitting.value = true
  issue.value = notice.value = ''
  try {
    const { data } = await api(goods ? '/shop/orders' : '/platform-funds/orders', { body: payload })
    submissions.delete(key)
    if (goods) {
      for (const entry of catalogs.values()) {
        const item = entry.products.items.find(item => String(item.id) === String(payload.product_id))
        if (item && item.stock > 0) item.stock -= 1
      }
    }
    if (!signal.aborted) {
      emit('refresh-member')
      showNotice(t('兑换已提交', 'Resgate solicitado'), t('可在兑换记录中查看订单进度。', 'Acompanhe o pedido no histórico de resgates.'), 'success')
      go(redemptionPath(data.id, goods ? 'goods' : 'funds'), { replace: true })
    }
  } catch (error) {
    const knownFailure = [400, 403, 404, 409, 422].includes(error.status)
    if (knownFailure) submissions.delete(key)
    if (signal.aborted) return
    retry.value = knownFailure ? null : payload
    if (error.status === 409 && error.code === 'rate_changed' && error.data && !goods) {
      points.value = String(payload.points)
      await Promise.resolve()
      clearTimeout(quoteTimer)
      quoteGeneration += 1
      previewing.value = false
      quote.value = error.data
      notice.value = t('兑换比例已更新，请核对新金额后再次确认。', 'A taxa foi atualizada. Confira o novo valor e confirme novamente.')
    } else if (goods && error.status === 409 && !error.message.includes('请求号')) {
      const checkoutPath = props.route.path
      await load()
      if (props.route.path === checkoutPath && subject.value) notice.value = t('收货地址已更新，请重新核对后确认。', 'O endereço de entrega foi atualizado. Confira e confirme novamente.')
    } else {
      issue.value = knownFailure ? message(error) : t('订单结果尚未确认。可查看兑换记录，或使用同一请求重试。', 'O resultado ainda não foi confirmado. Consulte o histórico ou repita a mesma solicitação.')
      if (knownFailure) readBalance(signal)
    }
  } finally {
    if (!signal.aborted) submitting.value = false
  }
}

function failedImage(key) {
  brokenImages.value.add(key)
}

import { showNotice, watchNotice } from '../feedback'
watchNotice(issue, () => t('商城兑换提醒', 'Resgate na loja'), 'error')
watchNotice(notice, () => t('兑换提醒', 'Aviso de resgate'))
watchNotice(() => catalog.value?.products.error, () => t('商品加载失败', 'Não foi possível carregar os produtos'), 'error')
watchNotice(() => catalog.value?.platforms.error, () => t('平台资金列表加载失败', 'Não foi possível carregar as plataformas'), 'error')
watchNotice(() => history.value?.error, () => t('兑换记录加载失败', 'Não foi possível carregar o histórico'), 'error')
</script>

<template>
  <section class="shop-screen stack">
    <template v-if="mode === 'catalog' && catalog">
      <div class="shop-balance surface">
        <div>
          <p class="muted">{{ t('可用积分', 'Pontos disponíveis') }}</p>
          <strong v-if="member">{{ balance === null ? '—' : number.format(balance) }}</strong>
          <button v-else class="shop-login" @click="login">{{ t('登录后查看', 'Entre para consultar') }}</button>
        </div>
        <button class="quiet" @click="goToHistory('all')">{{ t('兑换记录', 'Histórico de resgates') }} <span aria-hidden="true">›</span></button>
      </div>
      <form class="shop-search" role="search" @submit.prevent="searchCatalog">
        <input v-model="search" class="field" type="search" maxlength="120" :placeholder="t('搜索商品或平台', 'Buscar produtos ou plataformas')" :aria-label="t('搜索商品或平台', 'Buscar produtos ou plataformas')" @search="searchCatalog" />
        <button class="quiet" type="submit">{{ t('搜索', 'Buscar') }}</button>
      </form>

      <section class="stack" aria-labelledby="shop-goods">
        <h2 id="shop-goods">{{ t('商品兑换', 'Resgatar produtos') }}</h2>
        <div v-if="catalog.products.items.length" class="shop-products">
          <article v-for="item in catalog.products.items" :key="item.id" class="surface shop-product">
            <div class="shop-art">
              <img v-if="imageUrl(item.image_url) && !brokenImages.has('product-' + item.id)" :src="imageUrl(item.image_url)" alt="" loading="lazy" @error="failedImage('product-' + item.id)" />
              <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.shop" /></svg>
            </div>
            <div class="shop-product-content">
              <h3>{{ item.name }}</h3>
              <p class="shop-highlight">{{ number.format(item.points_price) }} <small>{{ t('积分', 'pontos') }}</small></p>
              <p class="muted">{{ item.stock ? t('库存 ', 'Estoque: ') + item.stock : t('已售罄', 'Esgotado') }}</p>
              <button class="primary" :disabled="!item.stock" :aria-label="t('兑换 ', 'Resgatar ') + item.name" @click="go('/shop/products/' + item.id)">{{ t('兑换', 'Resgatar') }}</button>
            </div>
          </article>
        </div>
        <p v-if="!catalog.products.loading && !catalog.products.error && !catalog.products.items.length" class="surface muted">{{ t('暂无匹配商品。', 'Nenhum produto encontrado.') }}</p>
        <button v-if="catalog.products.page < catalog.products.last && !catalog.products.loading" class="quiet" @click="catalogPage('products')">{{ catalog.products.error ? t('重试', 'Tentar novamente') : t('加载更多商品', 'Ver mais produtos') }}</button>
      </section>

      <section class="stack" aria-labelledby="shop-funds">
        <h2 id="shop-funds">{{ t('平台资金兑换', 'Resgatar crédito na plataforma') }}</h2>
        <div v-if="catalog.platforms.items.length" class="shop-funds-list">
          <PlatformCard v-for="item in catalog.platforms.items" :key="item.id" class="surface shop-fund" row
                        :platform-id="item.id" :name="item.name" :promotion-url="item.promotion_url">
            <div class="shop-logo">
              <img v-if="imageUrl(item.logo_url) && !brokenImages.has('platform-' + item.id)" :src="imageUrl(item.logo_url)" alt="" loading="lazy" @error="failedImage('platform-' + item.id)" />
              <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.platforms" /></svg>
            </div>
            <div class="shop-list-text"><h3>{{ item.name }}</h3><p class="muted">{{ rate ? rateText(rate.cents_per_point) : t('暂未取得比例 · 可查看兑换预览', 'Consulte a simulação para ver a taxa de conversão.') }}</p></div>
            <template #controls>
              <button class="primary platform-entry-control" :aria-label="t('兑换 ', 'Resgatar crédito em ') + item.name" @click="go('/shop/funds/' + item.id)">{{ t('兑换', 'Resgatar') }}</button>
            </template>
          </PlatformCard>
        </div>
        <p v-if="!catalog.platforms.loading && !catalog.platforms.error && !catalog.platforms.items.length" class="surface muted">{{ t('暂无匹配平台。', 'Nenhuma plataforma encontrada.') }}</p>
        <button v-if="catalog.platforms.page < catalog.platforms.last && !catalog.platforms.loading" class="quiet" @click="catalogPage('platforms')">{{ catalog.platforms.error ? t('重试', 'Tentar novamente') : t('加载更多平台', 'Ver mais plataformas') }}</button>
      </section>
    </template>

    <template v-else-if="mode === 'history'">
      <div class="segmented shop-segmented" :aria-label="t('兑换记录类型', 'Tipo de resgate')">
        <button v-for="item in filters" :key="item.id" :aria-pressed="filter === item.id" @click="goToHistory(item.id)">{{ t(...item.label) }}</button>
      </div>
      <div v-if="!member" class="surface stack"><p>{{ t('请登录查看兑换记录。', 'Entre para consultar seu histórico de resgates.') }}</p><button class="primary" @click="login">{{ t('登录', 'Entrar') }}</button></div>
      <template v-else-if="history">
        <button class="quiet" :disabled="history.loading" @click="refreshHistory">{{ refreshLabel }}</button>
        <div v-if="history.items.length" class="row-list shop-records">
          <button v-for="item in history.items" :key="item.type + ':' + item.id" class="surface shop-record" @click="go(redemptionPath(item.id, item.type))">
            <span class="shop-list-text"><strong>{{ item.name }}</strong><small class="muted">{{ date(item.created_at) }}</small></span>
            <span class="shop-record-amount"><strong>−{{ number.format(item.points) }} {{ t('积分', 'pontos') }}</strong><small class="shop-status" :data-status="item.status">{{ status(item.type, item.status) }}</small></span>
          </button>
        </div>
        <p v-if="!history.loading && !history.error && !history.items.length" class="surface muted">{{ t('暂无兑换记录。', 'Nenhum resgate registrado.') }}</p>
        <button v-if="history.page < history.last && !history.loading" class="quiet" @click="historyPage">{{ history.error ? t('重试', 'Tentar novamente') : t('加载更多', 'Ver mais') }}</button>
      </template>
    </template>

    <template v-else-if="!loading">
      <template v-if="mode === 'goods' || mode === 'funds'">
        <article v-if="subject" class="surface stack shop-checkout">
          <div v-if="mode === 'goods'" class="shop-checkout-art shop-art">
            <img v-if="imageUrl(subject.image_url) && !brokenImages.has('product-' + subject.id)" :src="imageUrl(subject.image_url)" alt="" @error="failedImage('product-' + subject.id)" />
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.shop" /></svg>
          </div>
          <div class="shop-summary">
            <div v-if="mode === 'funds'" class="shop-logo">
              <img v-if="imageUrl(subject.logo_url) && !brokenImages.has('platform-' + subject.id)" :src="imageUrl(subject.logo_url)" alt="" @error="failedImage('platform-' + subject.id)" />
              <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.platforms" /></svg>
            </div>
            <div class="shop-list-text">
              <h2>{{ subject.name }}</h2>
              <p v-if="mode === 'goods'" class="shop-highlight">{{ number.format(subject.points_price) }} {{ t('积分', 'pontos') }}</p>
              <p v-else class="muted">{{ rate ? rateText(rate.cents_per_point) : t('暂未取得比例 · 可查看兑换预览', 'Consulte a simulação para ver a taxa de conversão.') }}</p>
            </div>
          </div>
          <p v-if="mode === 'goods' && subject.description" class="muted shop-description">{{ subject.description }}</p>
          <p v-if="member && balance !== null" class="muted">{{ t('可用积分', 'Pontos disponíveis') }} {{ number.format(balance) }}</p>

          <template v-if="!member">
            <p>{{ t('请登录后继续兑换。', 'Entre para continuar o resgate.') }}</p>
            <button class="primary" @click="login">{{ t('登录', 'Entrar') }}</button>
          </template>
          <template v-else-if="retry">
            <p class="shop-notice">{{ t('有一笔兑换尚待确认结果。', 'Há um resgate com resultado pendente.') }}</p>
            <div class="shop-actions"><button class="quiet" @click="goToHistory(mode)">{{ t('兑换记录', 'Histórico de resgates') }}</button><button class="primary" :disabled="submitting" @click="submit">{{ t('重试原请求', 'Repetir a solicitação original') }}</button></div>
          </template>
          <template v-else-if="mode === 'goods'">
            <p v-if="!subject.stock" class="shop-notice">{{ t('商品已售罄。', 'Produto esgotado.') }}</p>
            <template v-else-if="!address">
              <p>{{ t('您还没有绑定收货地址。', 'Você ainda não cadastrou um endereço de entrega.') }}</p>
              <div class="shop-actions"><button class="quiet" @click="back('/shop')">{{ t('取消', 'Cancelar') }}</button><button class="primary" @click="go('/address?next=' + sessionPath)">{{ t('去绑定', 'Cadastrar') }}</button></div>
            </template>
            <template v-else>
              <div class="shop-facts"><strong>{{ t('收货地址', 'Endereço de entrega') }}</strong><p>{{ address.recipient }} {{ address.masked_phone }}</p><p class="muted">{{ addressLine(address) }}</p></div>
              <p v-if="balance !== null && balance < subject.points_price" class="error">{{ t('积分余额不足。', 'Saldo de pontos insuficiente.') }}</p>
              <button class="primary" :disabled="!confirmGoods || submitting" @click="submit">{{ t('确认兑换', 'Confirmar resgate') }}</button>
            </template>
          </template>
          <template v-else-if="!binding">
            <p>{{ t('您还没有绑定该平台账号。', 'Você ainda não vinculou uma conta nessa plataforma.') }}</p>
            <div class="shop-actions"><button class="quiet" @click="back('/shop')">{{ t('取消', 'Cancelar') }}</button><button class="primary" @click="go('/binding?platform=' + subject.id + '&return=' + sessionPath)">{{ t('去绑定', 'Cadastrar') }}</button></div>
          </template>
          <template v-else>
            <div class="shop-facts"><strong>{{ t('平台账号', 'Conta na plataforma') }}</strong><p class="muted">{{ binding.masked_platform_account }}</p></div>
            <label class="shop-points">{{ t('消耗积分', 'Pontos a usar') }} <input v-model="points" class="field" type="text" inputmode="numeric" maxlength="10" :placeholder="t('输入正整数积分', 'Digite um número inteiro de pontos')" :disabled="submitting" /></label>
            <div class="shop-facts shop-estimate">
              <span class="muted">{{ t('预计到账（BRL）', 'Crédito estimado (BRL)') }}</span>
              <strong class="shop-highlight" aria-live="polite">{{ previewing ? '—' : quote ? brl(quote.amount_cents) : validPoints && rate && !overBalance ? brl(Number(points) * rate.cents_per_point) : '—' }}</strong>
            </div>
            <p v-if="points && !validPoints" class="error">{{ t('请输入 1 至 2,147,483,647 之间的整数积分。', 'Digite um valor inteiro entre 1 e 2.147.483.647 pontos.') }}</p>
            <p v-else-if="overBalance" class="error">{{ t('积分余额不足。', 'Saldo de pontos insuficiente.') }}</p>
            <button v-if="issue && !quote && validPoints && !overBalance && !previewing" class="quiet" @click="previewFunds">{{ t('重新获取兑换预览', 'Simular novamente') }}</button>
            <button v-else class="primary" :disabled="!quote || overBalance || balance === null || submitting" @click="submit">{{ t('确认兑换', 'Confirmar resgate') }}</button>
          </template>
        </article>
        <button v-else-if="issue" class="quiet" @click="load">{{ t('重新加载', 'Recarregar') }}</button>
      </template>

      <template v-else-if="mode === 'detail'">
        <div v-if="!member" class="surface stack"><p>{{ t('请登录查看订单详情。', 'Entre para ver os detalhes do pedido.') }}</p><button class="primary" @click="login">{{ t('登录', 'Entrar') }}</button></div>
        <article v-else-if="order" class="surface stack shop-checkout">
          <div class="shop-summary">
            <div class="shop-list-text"><h2>{{ orderType === 'goods' ? order.product_name : order.platform_name }}</h2><p class="shop-highlight">−{{ number.format(orderType === 'goods' ? order.points_price : order.points) }} {{ t('积分', 'pontos') }}</p></div>
            <span class="shop-status" :data-status="order.status">{{ status(orderType, order.status) }}</span>
          </div>
          <dl class="shop-details">
            <dt>{{ t('订单编号', 'Número do pedido') }}</dt><dd>{{ order.order_number }}</dd>
            <dt>{{ t('提交时间', 'Data da solicitação') }}</dt><dd>{{ date(order.created_at) }}</dd>
            <template v-if="orderType === 'goods'">
              <template v-if="order.address"><dt>{{ t('收货人', 'Destinatário') }}</dt><dd>{{ order.address.recipient }}</dd><dt>{{ t('收货地址', 'Endereço de entrega') }}</dt><dd>{{ addressLine(order.address) }}</dd></template>
              <template v-if="order.carrier"><dt>{{ t('承运公司', 'Transportadora') }}</dt><dd>{{ order.carrier }}</dd></template>
              <template v-if="order.tracking_number"><dt>{{ t('物流单号', 'Código de rastreio') }}</dt><dd>{{ order.tracking_number }}</dd></template>
              <template v-if="order.shipped_at"><dt>{{ t('发货时间', 'Data de envio') }}</dt><dd>{{ date(order.shipped_at) }}</dd></template>
              <template v-if="order.cancelled_at"><dt>{{ t('取消时间', 'Data de cancelamento') }}</dt><dd>{{ date(order.cancelled_at) }}</dd></template>
              <template v-if="order.cancellation_reason"><dt>{{ t('取消原因', 'Motivo do cancelamento') }}</dt><dd>{{ order.cancellation_reason }}</dd></template>
            </template>
            <template v-else>
              <dt>{{ t('平台账号', 'Conta na plataforma') }}</dt><dd>{{ order.masked_platform_account }}</dd>
              <dt>{{ t('兑换金额', 'Valor do resgate') }}</dt><dd class="shop-highlight">{{ brl(order.amount_cents) }} {{ order.currency }}</dd>
              <dt>{{ t('兑换比例', 'Taxa de conversão') }}</dt><dd>{{ rateText(order.cents_per_point) }}</dd>
              <template v-if="order.paid_at"><dt>{{ t('到账时间', 'Data do crédito') }}</dt><dd>{{ date(order.paid_at) }}</dd></template>
              <template v-if="order.paused || order.needs_review"><dt>{{ t('处理进度', 'Andamento') }}</dt><dd>{{ order.needs_review ? t('等待人工核实', 'Aguardando verificação manual') : t('发放已暂停', 'Crédito suspenso') }}</dd></template>
              <template v-if="order.reviewed_at"><dt>{{ t('审核时间', 'Data da análise') }}</dt><dd>{{ date(order.reviewed_at) }}</dd></template>
              <template v-if="order.review_reason"><dt>{{ t('审核说明', 'Nota da análise') }}</dt><dd>{{ order.review_reason }}</dd></template>
            </template>
          </dl>
        </article>
        <div v-if="member" class="shop-actions">
          <button class="quiet" @click="back('/shop/redemptions')">{{ t('返回', 'Voltar') }}</button>
          <button class="quiet" :disabled="refreshingOrder" @click="refreshOrder">{{ refreshLabel }}</button>
          <button class="primary" @click="goToHistory('all')">{{ t('兑换记录', 'Histórico de resgates') }}</button>
        </div>
      </template>
      <div v-else class="surface stack"><p>{{ t('未找到该商城页面。', 'Página da loja não encontrada.') }}</p><button class="quiet" @click="go('/shop')">{{ t('返回商城', 'Voltar à loja') }}</button></div>
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
.shop-balance strong { display: block; color: var(--highlight); font-size: 28px; line-height: 1.2; }
.shop-login { padding: 0; min-height: 38px; color: var(--accent); font-weight: 750; }
.shop-search, .shop-actions { display: flex; gap: 8px; }
.shop-search .field { flex: 1; min-width: 0; }
.shop-screen input.field { width: 100%; min-height: 44px; padding: 8px 11px; border: 1px solid var(--control-line); border-radius: 8px; background: var(--surface-recessed); color: inherit; font-size: 16px; }
.shop-search button { flex-shrink: 0; }
.shop-actions > * { flex: 1; }
.shop-products { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.shop-product.surface { overflow: hidden; padding: 0; }
.shop-art, .shop-logo { display: grid; place-items: center; background: var(--surface-highlight); color: var(--accent); overflow: hidden; }
.shop-art { aspect-ratio: 4 / 3; }
.shop-art img, .shop-logo img { width: 100%; height: 100%; object-fit: cover; min-height: 0; }
.shop-art svg, .shop-logo svg { width: 32px; fill: none; stroke: currentColor; stroke-width: 1.4; }
.shop-product-content { display: grid; gap: 5px; padding: 10px; }
.shop-product-content button { margin-top: 3px; }
.shop-highlight { color: var(--highlight); font-weight: 800; }
.shop-highlight small { color: inherit; }
.shop-product-content .muted, .shop-list-text .muted { font-size: 12px; }
.shop-funds-list, .shop-records { display: grid; gap: 7px; }
.shop-fund, .shop-summary, .shop-record { display: flex; align-items: center; gap: 10px; }
.shop-summary > :last-child:not(.shop-list-text), .shop-fund > :last-child { flex-shrink: 0; }
.shop-logo { width: 43px; height: 43px; flex: 0 0 43px; border-radius: 9px; }
.shop-logo svg { width: 22px; }
.shop-list-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.shop-record { width: 100%; justify-content: space-between; text-align: left; }
.shop-record:hover { border-color: var(--accent); }
.shop-record small { display: block; margin-top: 3px; }
.shop-record-amount { flex-shrink: 0; text-align: right; }
.shop-record-amount strong { font-size: 13px; }
.shop-status { color: var(--accent); font-size: 12px; }
.shop-status[data-status="paid"], .shop-status[data-status="shipped"] { color: var(--success); }
.shop-status[data-status="failed"], .shop-status[data-status="rejected"], .shop-status[data-status="cancelled"] { color: var(--danger); }
.shop-checkout { padding: 14px; overflow-wrap: anywhere; }
.shop-checkout-art { aspect-ratio: 2 / 1; max-height: 230px; border-radius: 9px; }
.shop-description { white-space: pre-line; }
.shop-facts { display: grid; gap: 3px; padding: 10px; border: 1px solid var(--line); border-radius: 9px; }
.shop-points { display: grid; gap: 5px; }
.shop-estimate { grid-template-columns: 1fr auto; align-items: center; }
.shop-details { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; margin: 0; padding-top: 10px; border-top: 1px solid var(--line); font-size: 13px; }
.shop-details dt { color: var(--muted); }
.shop-details dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.shop-notice { color: var(--muted); }
</style>
