<script>
const catalogs = new Map()
const records = new Map()
const submissions = new Map()
</script>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api, imageUrl } from '../api'
import { go, back } from '../navigation'
import { icons } from '../icons'

const props = defineProps({ route: { type: Object, required: true }, member: Object })
const emit = defineEmits(['refresh-member'])
const filters = [
  { id: 'all', label: '全部' },
  { id: 'goods', label: '商品' },
  { id: 'funds', label: '平台资金' },
]
const statusLabels = {
  pending: '待处理', shipped: '已发货', cancelled: '已取消', processing: '处理中',
  paid: '已到账', rejected: '已驳回', failed: '兑换失败', unresolved: '待核实',
}
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const rateFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const number = new Intl.NumberFormat('zh-CN')
const calendar = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
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
const status = (type, value) => value === 'pending' ? (type === 'goods' ? '待发货' : '待审核') : statusLabels[value] || '状态待更新'
const date = value => value && !Number.isNaN(Date.parse(value)) ? calendar.format(new Date(value)) : '—'
const brl = cents => money.format(Number(cents) / 100)
const rateText = cents => '1 积分 = R$ ' + rateFormat.format(Number(cents) / 100)
const addressLine = value => [value.street, value.number, value.complement, value.district, value.city, value.state, value.postal_code].filter(Boolean).join(' · ')
const message = error => Object.values(error.errors || {}).flat()[0] || error.message || '请稍后重试。'
const requestKey = () => [props.member?.id, mode.value, props.route.params.id].join(':')
const login = () => go('/login?next=' + sessionPath.value)
const goToHistory = type => go('/shop/redemptions' + (type === 'all' ? '' : '?type=' + type))
const newList = () => ({ items: [], page: 0, last: 1, loading: false, error: '' })

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
        const result = await api('/shop/redemptions?type=' + type + '&page=' + (list.page + 1), { signal })
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
        const result = await api(orderEndpoints[stream.kind] + '?page=' + (stream.page + 1), { signal })
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
  loading.value = previewing.value = submitting.value = false
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
    if (!props.member) return
    const key = props.member.id + ':' + filter.value
    if (!records.has(key)) records.set(key, newList())
    history.value = records.get(key)
    if (!history.value.page) historyPage()
    return
  }

  if (mode.value === 'missing' || (mode.value === 'detail' && !props.member)) return
  loading.value = true
  try {
    if (mode.value === 'goods' || mode.value === 'funds') {
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
    } else {
      const result = await api(orderEndpoints[orderType.value] + '/' + id, { signal })
      if (!signal.aborted) order.value = result.data
    }
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
  const memberId = props.member.id
  const signal = controller.signal
  const payload = previous || (goods
    ? { product_id: subject.value.id, address_version: address.value.version, request_id: crypto.randomUUID() }
    : { binding_id: binding.value.id, points: quote.value.points, rate_version: quote.value.rate_version, request_id: crypto.randomUUID() })
  submissions.set(key, payload)
  submitting.value = true
  issue.value = notice.value = ''
  try {
    const { data } = await api(goods ? '/shop/orders' : '/platform-funds/orders', { body: payload })
    submissions.delete(key)
    for (const { id } of filters) records.delete(memberId + ':' + id)
    if (goods) {
      for (const entry of catalogs.values()) {
        const item = entry.products.items.find(item => String(item.id) === String(payload.product_id))
        if (item && item.stock > 0) item.stock -= 1
      }
    }
    if (!signal.aborted) {
      emit('refresh-member')
      showNotice('兑换已提交', '可在兑换记录中查看订单进度。', 'success')
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
      notice.value = '兑换比例已更新，请核对新金额后再次确认。'
    } else if (goods && error.status === 409 && !error.message.includes('请求号')) {
      const checkoutPath = props.route.path
      await load()
      if (props.route.path === checkoutPath && subject.value) notice.value = '收货地址已更新，请重新核对后确认。'
    } else {
      issue.value = knownFailure ? message(error) : '订单结果尚未确认。可查看兑换记录，或使用同一请求重试。'
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
watchNotice(issue, '商城兑换提醒', 'error')
watchNotice(notice, text => text?.includes('比例') ? '兑换比例已更新' : '收货地址已更新')
watchNotice(() => catalog.value?.products.error, '商品加载失败', 'error')
watchNotice(() => catalog.value?.platforms.error, '平台资金列表加载失败', 'error')
watchNotice(() => history.value?.error, '兑换记录加载失败', 'error')
</script>

<template>
  <section class="shop-screen stack">
    <template v-if="mode === 'catalog' && catalog">
      <div class="shop-balance surface">
        <div>
          <p class="muted">可用积分</p>
          <strong v-if="member">{{ balance === null ? '—' : number.format(balance) }}</strong>
          <button v-else class="shop-login" @click="login">登录后查看</button>
        </div>
        <button class="quiet" @click="goToHistory('all')">兑换记录 <span aria-hidden="true">›</span></button>
      </div>
      <form class="shop-search" role="search" @submit.prevent="searchCatalog">
        <input v-model="search" class="field" type="search" maxlength="120" placeholder="搜索商品或平台" aria-label="搜索商品或平台" @search="searchCatalog" />
        <button class="quiet" type="submit">搜索</button>
      </form>

      <section class="stack" aria-labelledby="shop-goods">
        <h2 id="shop-goods">商品兑换</h2>
        <div v-if="catalog.products.items.length" class="shop-products">
          <article v-for="item in catalog.products.items" :key="item.id" class="surface shop-product">
            <div class="shop-art">
              <img v-if="imageUrl(item.image_url) && !brokenImages.has('product-' + item.id)" :src="imageUrl(item.image_url)" alt="" loading="lazy" @error="failedImage('product-' + item.id)" />
              <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.shop" /></svg>
            </div>
            <div class="shop-product-content">
              <h3>{{ item.name }}</h3>
              <p class="shop-highlight">{{ number.format(item.points_price) }} <small>积分</small></p>
              <p class="muted">{{ item.stock ? '库存 ' + item.stock : '已售罄' }}</p>
              <button class="primary" :disabled="!item.stock" :aria-label="'兑换 ' + item.name" @click="go('/shop/products/' + item.id)">兑换</button>
            </div>
          </article>
        </div>
        <p v-if="!catalog.products.loading && !catalog.products.error && !catalog.products.items.length" class="surface muted">暂无匹配商品。</p>
        <button v-if="catalog.products.page < catalog.products.last && !catalog.products.loading" class="quiet" @click="catalogPage('products')">{{ catalog.products.error ? '重试' : '加载更多商品' }}</button>
      </section>

      <section class="stack" aria-labelledby="shop-funds">
        <h2 id="shop-funds">平台资金兑换</h2>
        <div v-if="catalog.platforms.items.length" class="shop-funds-list">
          <article v-for="item in catalog.platforms.items" :key="item.id" class="surface shop-fund">
            <div class="shop-logo">
              <img v-if="imageUrl(item.logo_url) && !brokenImages.has('platform-' + item.id)" :src="imageUrl(item.logo_url)" alt="" loading="lazy" @error="failedImage('platform-' + item.id)" />
              <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.platforms" /></svg>
            </div>
            <div class="shop-list-text"><h3>{{ item.name }}</h3><p class="muted">{{ rate ? rateText(rate.cents_per_point) : '暂未取得比例 · 可查看兑换预览' }}</p></div>
            <button class="primary" :aria-label="'兑换 ' + item.name + ' 平台资金'" @click="go('/shop/funds/' + item.id)">兑换</button>
          </article>
        </div>
        <p v-if="!catalog.platforms.loading && !catalog.platforms.error && !catalog.platforms.items.length" class="surface muted">暂无匹配平台。</p>
        <button v-if="catalog.platforms.page < catalog.platforms.last && !catalog.platforms.loading" class="quiet" @click="catalogPage('platforms')">{{ catalog.platforms.error ? '重试' : '加载更多平台' }}</button>
      </section>
    </template>

    <template v-else-if="mode === 'history'">
      <div class="segmented shop-segmented" aria-label="兑换记录类型">
        <button v-for="item in filters" :key="item.id" :aria-pressed="filter === item.id" @click="goToHistory(item.id)">{{ item.label }}</button>
      </div>
      <div v-if="!member" class="surface stack"><p>请登录查看兑换记录。</p><button class="primary" @click="login">登录</button></div>
      <template v-else-if="history">
        <div v-if="history.items.length" class="row-list shop-records">
          <button v-for="item in history.items" :key="item.type + ':' + item.id" class="surface shop-record" @click="go(redemptionPath(item.id, item.type))">
            <span class="shop-list-text"><strong>{{ item.name }}</strong><small class="muted">{{ date(item.created_at) }}</small></span>
            <span class="shop-record-amount"><strong>−{{ number.format(item.points) }} 积分</strong><small class="shop-status" :data-status="item.status">{{ status(item.type, item.status) }}</small></span>
          </button>
        </div>
        <p v-if="!history.loading && !history.error && !history.items.length" class="surface muted">暂无兑换记录。</p>
        <button v-if="history.page < history.last && !history.loading" class="quiet" @click="historyPage">{{ history.error ? '重试' : '加载更多' }}</button>
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
              <p v-if="mode === 'goods'" class="shop-highlight">{{ number.format(subject.points_price) }} 积分</p>
              <p v-else class="muted">{{ rate ? rateText(rate.cents_per_point) : '暂未取得比例 · 可查看兑换预览' }}</p>
            </div>
          </div>
          <p v-if="mode === 'goods' && subject.description" class="muted shop-description">{{ subject.description }}</p>
          <p v-if="member && balance !== null" class="muted">可用积分 {{ number.format(balance) }}</p>

          <template v-if="!member">
            <p>请登录后继续兑换。</p>
            <button class="primary" @click="login">登录</button>
          </template>
          <template v-else-if="retry">
            <p class="shop-notice">有一笔兑换尚待确认结果。</p>
            <div class="shop-actions"><button class="quiet" @click="goToHistory(mode)">兑换记录</button><button class="primary" :disabled="submitting" @click="submit">重试原请求</button></div>
          </template>
          <template v-else-if="mode === 'goods'">
            <p v-if="!subject.stock" class="shop-notice">商品已售罄。</p>
            <template v-else-if="!address">
              <p>您还没有绑定收货地址。</p>
              <div class="shop-actions"><button class="quiet" @click="back('/shop')">取消</button><button class="primary" @click="go('/address?next=' + sessionPath)">去绑定</button></div>
            </template>
            <template v-else>
              <div class="shop-facts"><strong>收货地址</strong><p>{{ address.recipient }} {{ address.masked_phone }}</p><p class="muted">{{ addressLine(address) }}</p></div>
              <p v-if="balance !== null && balance < subject.points_price" class="error">积分余额不足。</p>
              <button class="primary" :disabled="!confirmGoods || submitting" @click="submit">确认兑换</button>
            </template>
          </template>
          <template v-else-if="!binding">
            <p>您还没有绑定该平台账号。</p>
            <div class="shop-actions"><button class="quiet" @click="back('/shop')">取消</button><button class="primary" @click="go('/binding?platform=' + subject.id + '&return=' + sessionPath)">去绑定</button></div>
          </template>
          <template v-else>
            <div class="shop-facts"><strong>平台账号</strong><p class="muted">{{ binding.masked_platform_account }}</p></div>
            <label class="shop-points">消耗积分 <input v-model="points" class="field" type="text" inputmode="numeric" maxlength="10" placeholder="输入正整数积分" :disabled="submitting" /></label>
            <div class="shop-facts shop-estimate">
              <span class="muted">预计到账（BRL）</span>
              <strong class="shop-highlight" aria-live="polite">{{ previewing ? '—' : quote ? brl(quote.amount_cents) : validPoints && rate && !overBalance ? brl(Number(points) * rate.cents_per_point) : '—' }}</strong>
            </div>
            <p v-if="points && !validPoints" class="error">请输入 1 至 2,147,483,647 之间的整数积分。</p>
            <p v-else-if="overBalance" class="error">积分余额不足。</p>
            <button v-if="issue && !quote && validPoints && !overBalance && !previewing" class="quiet" @click="previewFunds">重新获取兑换预览</button>
            <button v-else class="primary" :disabled="!quote || overBalance || balance === null || submitting" @click="submit">确认兑换</button>
          </template>
        </article>
        <button v-else-if="issue" class="quiet" @click="load">重新加载</button>
      </template>

      <template v-else-if="mode === 'detail'">
        <div v-if="!member" class="surface stack"><p>请登录查看订单详情。</p><button class="primary" @click="login">登录</button></div>
        <article v-else-if="order" class="surface stack shop-checkout">
          <div class="shop-summary">
            <div class="shop-list-text"><h2>{{ orderType === 'goods' ? order.product_name : order.platform_name }}</h2><p class="shop-highlight">−{{ number.format(orderType === 'goods' ? order.points_price : order.points) }} 积分</p></div>
            <span class="shop-status" :data-status="order.status">{{ status(orderType, order.status) }}</span>
          </div>
          <dl class="shop-details">
            <dt>订单编号</dt><dd>{{ order.order_number }}</dd>
            <dt>提交时间</dt><dd>{{ date(order.created_at) }}</dd>
            <template v-if="orderType === 'goods'">
              <template v-if="order.address"><dt>收货人</dt><dd>{{ order.address.recipient }}</dd><dt>收货地址</dt><dd>{{ addressLine(order.address) }}</dd></template>
              <template v-if="order.carrier"><dt>承运公司</dt><dd>{{ order.carrier }}</dd></template>
              <template v-if="order.tracking_number"><dt>物流单号</dt><dd>{{ order.tracking_number }}</dd></template>
              <template v-if="order.shipped_at"><dt>发货时间</dt><dd>{{ date(order.shipped_at) }}</dd></template>
              <template v-if="order.cancelled_at"><dt>取消时间</dt><dd>{{ date(order.cancelled_at) }}</dd></template>
              <template v-if="order.cancellation_reason"><dt>取消原因</dt><dd>{{ order.cancellation_reason }}</dd></template>
            </template>
            <template v-else>
              <dt>平台账号</dt><dd>{{ order.masked_platform_account }}</dd>
              <dt>兑换金额</dt><dd class="shop-highlight">{{ brl(order.amount_cents) }} {{ order.currency }}</dd>
              <dt>兑换比例</dt><dd>{{ rateText(order.cents_per_point) }}</dd>
              <template v-if="order.paid_at"><dt>到账时间</dt><dd>{{ date(order.paid_at) }}</dd></template>
              <template v-if="order.paused || order.needs_review"><dt>处理进度</dt><dd>{{ order.needs_review ? '等待人工核实' : '发放已暂停' }}</dd></template>
              <template v-if="order.reviewed_at"><dt>审核时间</dt><dd>{{ date(order.reviewed_at) }}</dd></template>
              <template v-if="order.review_reason"><dt>审核说明</dt><dd>{{ order.review_reason }}</dd></template>
            </template>
          </dl>
        </article>
        <div v-if="member" class="shop-actions"><button class="quiet" @click="back('/shop/redemptions')">返回</button><button class="primary" @click="goToHistory('all')">兑换记录</button></div>
      </template>
      <div v-else class="surface stack"><p>未找到该商城页面。</p><button class="quiet" @click="go('/shop')">返回商城</button></div>
    </template>
  </section>
</template>

<style scoped>
.shop-screen, .shop-screen section { display: grid; gap: 12px; }
.shop-screen { padding-block: 2px 18px; }
.shop-screen h2 { font-size: 17px; line-height: 1.35; }
.shop-screen h3 { font-size: 14px; overflow-wrap: anywhere; }
.shop-screen .surface { min-width: 0; }
.shop-balance { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 15px; border-color: #5f4b92; background: linear-gradient(112deg, #2b204d, #1b2335); }
.shop-balance strong { display: block; color: var(--lime); font-size: 28px; line-height: 1.2; }
.shop-login { padding: 0; min-height: 38px; color: var(--lime); font-weight: 750; }
.shop-search, .shop-actions { display: flex; gap: 8px; }
.shop-search .field { flex: 1; min-width: 0; }
.shop-screen input.field { width: 100%; min-height: 44px; padding: 8px 11px; border: 1px solid #495879; border-radius: 8px; background: #121927; color: inherit; font-size: 16px; }
.shop-search button { flex-shrink: 0; }
.shop-actions > * { flex: 1; }
.shop-products { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.shop-product.surface { overflow: hidden; padding: 0; }
.shop-art, .shop-logo { display: grid; place-items: center; background: #27233f; color: var(--accent); overflow: hidden; }
.shop-art { aspect-ratio: 4 / 3; }
.shop-art img, .shop-logo img { width: 100%; height: 100%; object-fit: cover; min-height: 0; }
.shop-art svg, .shop-logo svg { width: 32px; fill: none; stroke: currentColor; stroke-width: 1.4; }
.shop-product-content { display: grid; gap: 5px; padding: 10px; }
.shop-product-content button { margin-top: 3px; }
.shop-highlight { color: var(--lime); font-weight: 800; }
.shop-highlight small { color: inherit; }
.shop-product-content .muted, .shop-list-text .muted { font-size: 12px; }
.shop-funds-list, .shop-records { display: grid; gap: 7px; }
.shop-fund, .shop-summary, .shop-record { display: flex; align-items: center; gap: 10px; }
.shop-summary > :last-child:not(.shop-list-text), .shop-fund > :last-child { flex-shrink: 0; }
.shop-logo { width: 43px; height: 43px; flex: 0 0 43px; border-radius: 9px; }
.shop-logo svg { width: 22px; }
.shop-list-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.shop-record { width: 100%; justify-content: space-between; text-align: left; }
.shop-record:hover { border-color: #7d69c5; }
.shop-record small { display: block; margin-top: 3px; }
.shop-record-amount { flex-shrink: 0; text-align: right; }
.shop-record-amount strong { font-size: 13px; }
.shop-status { color: var(--accent); font-size: 12px; }
.shop-status[data-status="paid"], .shop-status[data-status="shipped"] { color: var(--lime); }
.shop-status[data-status="failed"], .shop-status[data-status="rejected"], .shop-status[data-status="cancelled"] { color: #ffb2bc; }
.shop-checkout { padding: 14px; overflow-wrap: anywhere; }
.shop-checkout-art { aspect-ratio: 2 / 1; max-height: 230px; border-radius: 9px; }
.shop-description { white-space: pre-line; }
.shop-facts { display: grid; gap: 3px; padding: 10px; border: 1px solid var(--line); border-radius: 9px; }
.shop-points { display: grid; gap: 5px; }
.shop-estimate { grid-template-columns: 1fr auto; align-items: center; }
.shop-details { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 12px; margin: 0; padding-top: 10px; border-top: 1px solid var(--line); font-size: 13px; }
.shop-details dt { color: var(--muted); }
.shop-details dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.shop-notice { color: #e2ccff; }
</style>
