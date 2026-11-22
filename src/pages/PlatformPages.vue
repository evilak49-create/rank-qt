<script>
const directoryCache = new Map()
</script>

<script setup>
import { createRequestId } from '../requestId.js'
import { useLocale } from '../locale.js'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { api, imageUrl } from '../api'
import { icons } from '../icons'
import { formatBrl, formatGuaranteeAmount } from '../money'
import PlatformCard from '../PlatformCard.vue'
import { go, restoreScroll, resume, safePath } from '../navigation'
import { avatarForReview } from './memberAvatars.js'
import PlatformIntroduction from './PlatformIntroduction.vue'
import PlatformRechargeHistory from './PlatformRechargeHistory.vue'

const { locale, t } = useLocale()

const props = defineProps({ route: { type: Object, required: true }, member: Object, cardBindings: Map })
const emit = defineEmits(['credited'])
const screen = computed(() => {
  const path = props.route.path
  if (path.endsWith('/reviews/new')) return 'review'
  if (path.endsWith('/protection')) return 'terms'
  if (path === '/bindings') return 'bindings'
  if (path.startsWith('/bindings/')) return 'bindingDetail'
  if (path === '/binding') return 'bind'
  if (path === '/cashback' || path === '/points') return 'cashback'
  return path === '/platforms' ? 'directory' : 'detail'
})
const protectedScreens = ['review', 'bindings', 'bindingDetail', 'bind', 'cashback']
const platformPath = computed(() => '/platforms/' + props.route.params.id)
const target = computed(() => safePath(props.route.query.get('return'), ''))
const directory = ref([])
const selected = ref(null)
const platform = ref(null)
const guaranteeAmount = computed(() => formatGuaranteeAmount(platform.value?.guarantee_amount_brl))
const terms = ref(null)
const reviews = ref([])
const reviewsLoading = ref(false)
const reviewListError = ref('')
const reviewPage = ref(1)
const reviewLastPage = ref(1)
const favorite = ref(false)
const favoriteLoading = ref(false)
const tab = ref('reviews')
const detailTabs = [
  ['reviews', '网站评价', 'Avaliações do site'],
  ['information', '网站信息', 'Informações do site'],
  ['about', '关于网站', 'Sobre o site'],
]
const bindingTab = ref('summary')
const bindingTabs = [
  ['summary', '绑定信息', 'Conta vinculada'],
  ['recharges', '充值记录', 'Histórico de depósitos'],
]
const search = ref('')
const listPage = ref(1)
const listLastPage = ref(1)
const listing = ref(false)
const listingError = ref('')
const picker = ref(false)
const pickerBox = ref(null)
const pickerInput = ref(null)
const highlighted = ref(-1)
const ownBindings = ref([])
const bindingPage = ref(1)
const bindingLastPage = ref(1)
const bindingDetail = ref(null)
const bindingTotals = ref(null)
const totalsError = ref('')
const phone = ref('')
const code = ref('')
const quote = ref(null)
const defaultRating = 5
const rating = ref(defaultRating)
const reviewBody = ref('')
const busy = ref(false)
const loading = ref(false)
const error = ref('')
const loadError = ref('')
const status = ref('')
const now = ref(Date.now())
let loadRequest
let directoryRequest
let searchTimer
let reviewIntent
let disposed = false
const ticker = window.setInterval(() => { now.value = Date.now() }, 1000)
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const date = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }))
const ruleNumbers = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 6 }))
const scoreNumbers = computed(() => new Intl.NumberFormat(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const platformScore = computed(() => platform.value?.rating == null ? '—' : scoreNumbers.value.format(platform.value.rating))
const maxRebate = computed(() => formatRule(platform.value?.max_rebate_percent, '%', ''))
const rebateWager = computed(() => formatRule(platform.value?.min_rebate_wager_multiplier, '×', ''))
const platformDescription = computed(() => platform.value?.description?.trim())
const bindingStatuses = { pending: '待确认', active: '保障中', inactive: '未生效' }
const eligibility = {
  eligible: '已达到投注要求',
  insufficient_wager: '当前打码未达到返利标准',
  insufficient_rebate: '暂无可领取的返利',
  insufficient_points: '暂无可领取的返利',
  no_deposit: '暂无可领取的返利',
  rebate_disabled: '返利暂未开放',
  paused: '兑换暂不可用',
  stale_snapshot: '平台快照已失效，请重新查询',
  regressed: '平台数据暂不可用于兑换',
  out_of_range: '当前金额超出兑换范围',
}
const activeBinding = computed(() => ownBindings.value.find(item => String(item.platform_id) === String(selected.value?.id)))
const reviewBinding = computed(() => ownBindings.value.some(item => String(item.platform_id) === props.route.params.id))
const requiresCode = computed(() => !props.member?.phone_verified_at || nationalPhone(phone.value) !== nationalPhone(props.member.phone))
const bindingVerification = ref(null)
const bindingCaptcha = ref(null)
const captchaLoading = ref(false)
const captchaError = ref('')
const bindingUsesImage = computed(() => screen.value === 'bind' && bindingVerification.value === 'image')
const mayConfirm = computed(() => quote.value?.cash_only === true && quote.value.status === 'pending' && quote.value.eligibility === 'eligible'
  && Date.parse(quote.value.expires_at) > now.value)
const showQuoteAction = computed(() => screen.value === 'cashback' && quote.value && activeBinding.value
  && quote.value.status !== 'confirmed')
const choices = computed(() => {
  if (screen.value !== 'cashback') return directory.value
  const keyword = search.value.trim().toLowerCase()
  const ids = new Set(directory.value.map(item => String(item.id)))
  const extra = ownBindings.value.filter(item => !ids.has(String(item.platform_id)) && item.platform_name.toLowerCase().includes(keyword))
  return [...extra.map(bindingPlatform), ...directory.value]
})
const promotion = computed(() => {
  try {
    const url = new URL(platform.value?.promotion_url)
    return /^https?:$/.test(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
})

function formatDate(value) {
  return value ? date.value.format(new Date(value)) : t('暂无记录')
}

function formatRule(value, suffix, fallback = '—') {
  return value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0
    ? fallback
    : ruleNumbers.value.format(value) + suffix
}

function moveTab(event, index, tabs, prefix, select) {
  const last = tabs.length - 1
  const indexes = { ArrowLeft: index ? index - 1 : last, ArrowRight: index === last ? 0 : index + 1, Home: 0, End: last }
  if (!Object.hasOwn(indexes, event.key)) return
  event.preventDefault()
  const next = tabs[indexes[event.key]][0]
  select(next)
  document.getElementById(prefix + next)?.focus()
}

function formatMoney(cents) {
  if (cents == null) return '—'
  if (typeof cents === 'string' && /^\d+$/.test(cents)) {
    const value = BigInt(cents)
    return money.format(value / 100n).replace(/,00$/, ',' + String(value % 100n).padStart(2, '0'))
  }
  return money.format(Number(cents) / 100)
}

function nationalPhone(value) {
  return String(value ?? '').trim().replace(/^\+55/, '').replace(/\D/g, '')
}

function failureMessage(failure) {
  return Object.values(failure.errors ?? {}).flat()[0] || failure.message
}

function bindingPlatform(binding) {
  return { id: binding.platform_id, name: binding.platform_name, logo_url: binding.logo_url }
}

function bindPath(id, destination) {
  const params = new URLSearchParams({ platform: id })
  if (destination) params.set('return', destination)
  return '/binding?' + params
}

function requireLogin(destination = props.route.fullPath) {
  go('/login?' + new URLSearchParams({ next: destination }), { replace: protectedScreens.includes(screen.value) })
}

async function run(action) {
  if (busy.value) return
  const route = props.route
  const current = () => !disposed && props.route === route
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    await action(current)
  } catch (failure) {
    if (current()) error.value = failureMessage(failure)
  } finally {
    if (current()) busy.value = false
  }
}

async function listPlatforms(page = 1) {
  directoryRequest?.abort()
  const controller = new AbortController()
  directoryRequest = controller
  listing.value = true
  listingError.value = ''
  const keyword = search.value.trim()
  const { key } = props.route
  const isBinding = screen.value === 'bind'
  const path = isBinding ? '/platforms/bindable' : '/platforms'
  try {
    const result = await api(path + '?' + new URLSearchParams({ search: keyword, page }), { signal: controller.signal, fresh: isBinding })
    if (controller.signal.aborted) return
    directory.value = page === 1 ? result.data : [...directory.value, ...result.data]
    listPage.value = result.current_page
    listLastPage.value = result.last_page
    if (screen.value === 'directory') {
      directoryCache.delete(key)
      directoryCache.set(key, { keyword: search.value, items: directory.value, page: listPage.value, lastPage: listLastPage.value })
      if (directoryCache.size > 12) directoryCache.delete(directoryCache.keys().next().value)
    }
  } catch (failure) {
    if (!controller.signal.aborted) listingError.value = failureMessage(failure)
  } finally {
    if (!controller.signal.aborted) listing.value = false
  }
}

function updateSearch() {
  clearTimeout(searchTimer)
  directoryRequest?.abort()
  highlighted.value = -1
  directory.value = []
  listPage.value = 1
  listLastPage.value = 1
  listing.value = true
  listingError.value = ''
  if (screen.value === 'directory') directoryCache.delete(props.route.key)
  searchTimer = setTimeout(() => listPlatforms(), 220)
}

function openPicker() {
  if (picker.value || busy.value) return
  search.value = ''
  directory.value = []
  listPage.value = 1
  listLastPage.value = 1
  highlighted.value = -1
  picker.value = true
  listPlatforms()
}

function closePicker() {
  if (!picker.value) return
  picker.value = false
  clearTimeout(searchTimer)
  directoryRequest?.abort()
  listing.value = false
}

function typePicker(event) {
  picker.value = true
  search.value = event.target.value
  updateSearch()
}

function outsidePicker(event) {
  if (pickerBox.value && !pickerBox.value.contains(event.target)) closePicker()
}

async function pickerKeys(event) {
  if (event.isComposing) return
  if (event.key === 'Escape' && picker.value) {
    event.preventDefault()
    closePicker()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    openPicker()
    const count = choices.value.length
    if (!count) return
    highlighted.value = highlighted.value < 0
      ? (event.key === 'ArrowDown' ? 0 : count - 1)
      : (highlighted.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
    await nextTick()
    document.getElementById('platform-option-' + highlighted.value)?.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'Enter' && picker.value && highlighted.value >= 0 && choices.value[highlighted.value]) {
    event.preventDefault()
    choose(choices.value[highlighted.value])
  }
}

function togglePicker() {
  if (picker.value) closePicker()
  else {
    openPicker()
    pickerInput.value?.focus()
  }
}

function choose(item) {
  selected.value = item
  closePicker()
  phone.value = props.member?.phone ?? ''
  code.value = ''
  quote.value = null
  error.value = ''
  status.value = ''
}

async function loadBindings(signal, { allPages = false, throughPage = 1 } = {}) {
  const items = []
  let currentPage = 1
  let result
  do {
    result = await api('/platform-bindings?page=' + currentPage, { signal, fresh: screen.value === 'bind' })
    items.push(...result.data)
    currentPage++
  } while (currentPage <= result.last_page && (allPages || currentPage <= throughPage))
  if (signal.aborted) return
  ownBindings.value = items
  bindingPage.value = result.current_page
  bindingLastPage.value = result.last_page
}

function moreBindings() {
  return run(async current => {
    const result = await api('/platform-bindings?page=' + (bindingPage.value + 1))
    if (!current()) return
    ownBindings.value.push(...result.data)
    bindingPage.value = result.current_page
    bindingLastPage.value = result.last_page
    history.replaceState({
      ...history.state,
      platformBindingProgress: { memberId: props.member.id, page: bindingPage.value },
    }, '')
  })
}

async function loadPlatformReviews(page, path = platformPath.value, signal = loadRequest.signal) {
  if (reviewsLoading.value) return
  reviewsLoading.value = true
  reviewListError.value = ''
  try {
    const result = await api(path + '/reviews?page=' + page, { signal })
    if (signal.aborted) return
    reviews.value = page === 1 ? result.data : [...reviews.value, ...result.data]
    reviewPage.value = result.current_page
    reviewLastPage.value = result.last_page
  } catch (failure) {
    if (!signal.aborted) reviewListError.value = failureMessage(failure)
  } finally {
    if (!signal.aborted) reviewsLoading.value = false
  }
}

async function initialize() {
  loadRequest?.abort()
  directoryRequest?.abort()
  clearTimeout(searchTimer)
  const controller = new AbortController()
  loadRequest = controller
  const { signal } = controller
  const path = platformPath.value
  const mode = screen.value
  platform.value = null
  terms.value = null
  selected.value = null
  bindingDetail.value = null
  bindingTab.value = 'summary'
  bindingTotals.value = null
  totalsError.value = ''
  error.value = ''
  loadError.value = ''
  busy.value = false
  loading.value = false
  status.value = ''
  favorite.value = false
  favoriteLoading.value = false
  picker.value = false
  search.value = ''
  directory.value = []
  listPage.value = 1
  listLastPage.value = 1
  listing.value = false
  listingError.value = ''
  ownBindings.value = []
  quote.value = null
  reviews.value = []
  reviewsLoading.value = false
  reviewListError.value = ''
  reviewPage.value = 1
  reviewLastPage.value = 1
  tab.value = 'reviews'
  rating.value = defaultRating
  reviewBody.value = ''
  reviewIntent = null

  if (protectedScreens.includes(mode) && !props.member) return
  if (mode === 'directory') {
    search.value = (props.route.query.get('search') ?? '').trim().slice(0, 120)
    const cached = directoryCache.get(props.route.key)
    if (cached) {
      search.value = cached.keyword
      directory.value = cached.items
      listPage.value = cached.page
      listLastPage.value = cached.lastPage
      await nextTick()
      if (!signal.aborted) restoreScroll()
    } else await listPlatforms()
    return
  }

  loading.value = true
  try {
    if (mode === 'bind' || mode === 'cashback') {
      if (mode === 'bind') {
        bindingVerification.value = null
        const result = await api('/auth/verification', { signal })
        if (signal.aborted) return
        bindingVerification.value = result.data.mode
      }
      await loadBindings(signal, { allPages: true })
      if (signal.aborted) return
      phone.value = props.member.phone ?? ''
      const bindingId = props.route.query.get('binding')
      const platformId = props.route.query.get('platform')
      const preset = ownBindings.value.find(item => mode === 'cashback'
        ? String(item.id) === bindingId || (platformId && String(item.platform_id) === platformId)
        : String(item.platform_id) === platformId)
      if (mode === 'bind' && preset) {
        go('/bindings/' + preset.id, { replace: true })
        return
      }
      if (preset) {
        choose(bindingPlatform(preset))
        if (mode === 'cashback' && props.route.query.get('auto') === '1') await queryCashback()
      } else if (/^\d+$/.test(platformId ?? '')) {
        const result = await api('/platforms/' + platformId, { signal })
        if (!signal.aborted) choose(result.data)
      }
    } else if (mode === 'bindings') {
      const progress = history.state?.platformBindingProgress
      const throughPage = progress?.memberId === props.member.id ? progress.page : 1
      await loadBindings(signal, { throughPage })
    } else if (mode === 'bindingDetail') {
      const result = await api('/platform-bindings/' + props.route.params.id, { signal })
      if (!signal.aborted) {
        bindingDetail.value = result.data
        loading.value = false
        await loadBindingTotals()
      }
    } else if (mode === 'terms') {
      const result = await api(path + '/protection-terms', { signal })
      if (!signal.aborted) terms.value = result.data
    } else {
      const result = await api(path, { signal })
      if (signal.aborted) return
      platform.value = result.data
      if (mode === 'review') await loadBindings(signal, { allPages: true })
      else {
        const posted = props.route.query.get('review')
        if (posted === 'pending') status.value = '评价已提交，审核通过后将公开展示。'
        if (posted === 'approved') status.value = '评价已发布。'
        const tasks = [loadPlatformReviews(1, path, signal)]
        if (props.member) {
          favoriteLoading.value = true
          tasks.push(api('/platform-favorites/' + platform.value.id, { signal }).then(result => {
            if (!signal.aborted) favorite.value = result.data.favorite
          }).catch(failure => {
            if (!signal.aborted) error.value = failureMessage(failure)
          }).finally(() => {
            if (!signal.aborted) favoriteLoading.value = false
          }))
        }
        loading.value = false
        await Promise.all(tasks)
      }
    }
  } catch (failure) {
    if (!signal.aborted) loadError.value = mode === 'terms' && failure.status === 404
      ? '该平台暂无公开保障条款。'
      : failureMessage(failure)
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

function writeReview() {
  const destination = platformPath.value + '/reviews/new'
  if (!props.member) requireLogin(destination)
  else go(destination)
}

function submitReview() {
  return run(async current => {
    const payload = { rating: rating.value, body: reviewBody.value.trim() }
    const key = JSON.stringify(payload)
    if (!reviewIntent || reviewIntent.key !== key) reviewIntent = { key, id: createRequestId() }
    const { data } = await api(platformPath.value + '/reviews', { body: { ...payload, request_id: reviewIntent.id } })
    if (current()) go(platformPath.value + '?review=' + (data.status === 'approved' ? 'approved' : 'pending'), { replace: true })
  })
}

function toggleFavorite() {
  if (!props.member) return requireLogin()
  return run(async current => {
    const next = !favorite.value
    await api('/platform-favorites/' + platform.value.id, { method: next ? 'PUT' : 'DELETE' })
    if (current()) favorite.value = next
  })
}

function sendCode() {
  return run(async current => {
    await api('/platforms/' + selected.value.id + '/binding/code', { body: { phone: phone.value.trim() } })
    if (current()) status.value = '验证码已发送。'
  })
}

function finishBinding(binding) {
  if (target.value) resume(target.value)
  else go('/bindings/' + binding.id, { replace: true })
}

async function refreshBindingCaptcha(signal) {
  const route = props.route
  const picked = selected.value?.id
  const current = () => !disposed && props.route === route && selected.value?.id === picked && !signal?.aborted
  bindingCaptcha.value = null
  code.value = ''
  captchaError.value = ''
  captchaLoading.value = true
  try {
    const { data } = await api('/auth/captcha', { body: { purpose: 'platform_binding' }, signal })
    if (current()) bindingCaptcha.value = data
  } catch (failure) {
    if (current()) captchaError.value = failureMessage(failure)
  } finally {
    if (current()) captchaLoading.value = false
  }
}

watch([bindingUsesImage, () => selected.value?.id, activeBinding, () => props.route], ([useImage, id, existing], previous, onCleanup) => {
  bindingCaptcha.value = null
  captchaLoading.value = false
  captchaError.value = ''
  if (!useImage || !id || existing) return
  const request = new AbortController()
  onCleanup(() => request.abort())
  refreshBindingCaptcha(request.signal)
})

function bindAccount() {
  if (!bindingVerification.value || (bindingUsesImage.value && !bindingCaptcha.value)) return
  return run(async current => {
    const body = { phone: phone.value.trim() }
    const useImage = bindingUsesImage.value
    if (useImage) {
      body.challenge_id = bindingCaptcha.value.challenge_id
      body.code = code.value.trim()
    } else if (requiresCode.value) {
      body.code = code.value.trim()
    }
    try {
      const { data } = await api('/platforms/' + selected.value.id + '/binding', { body })
      if (current()) finishBinding(data)
    } catch (failure) {
      if (useImage && current()) await refreshBindingCaptcha()
      throw failure
    }
  })
}

async function loadBindingTotals() {
  const { signal } = loadRequest
  totalsError.value = ''
  try {
    const { data } = await api('/platform-bindings/' + bindingDetail.value.id + '/totals', { signal })
    if (!signal.aborted) bindingTotals.value = data
  } catch (failure) {
    if (!signal.aborted) totalsError.value = failureMessage(failure)
  }
}

function queryCashback() {
  return run(async current => {
    quote.value = null
    const binding = activeBinding.value
    const { data } = await api('/platform-bindings/' + binding.id + '/point-quotes', { body: { cash_only: true } })
    if (!current()) return
    if (data.cash_only !== true) throw new Error(t('现金返利暂不可用', 'Cashback indisponível no momento'))
    quote.value = data
  })
}

function confirmCashback() {
  return run(async current => {
    const path = '/point-quotes/' + quote.value.id
    let result
    try {
      result = await api(path + '/confirm', { method: 'POST' })
    } catch (failure) {
      if (failure.status && failure.status < 500 && failure.status !== 409) throw failure
      result = await api(path).catch(() => { throw failure })
      if (result.data.status === 'pending' && result.data.eligibility === 'eligible') throw failure
    }
    if (result.data.status === 'confirmed') {
      if (current()) {
        activeBinding.value.last_redeemed_at = result.data.confirmed_at
      }
      emit('credited')
    }
    if (current()) quote.value = result.data
  })
}

watch([() => props.route.key, () => props.member?.id], initialize, { immediate: true })
onMounted(() => document.addEventListener('pointerdown', outsidePicker))
onUnmounted(() => {
  document.removeEventListener('pointerdown', outsidePicker)
  disposed = true
  loadRequest?.abort()
  directoryRequest?.abort()
  clearTimeout(searchTimer)
  clearInterval(ticker)
})

import { watchNotice } from '../feedback'
watchNotice(error, () => screen.value === 'bind' ? '绑定平台提醒' : screen.value === 'cashback' ? '现金返利提醒' : screen.value === 'review' ? '评价提醒' : '平台操作提醒', 'error')
watchNotice(loadError, '平台数据加载失败', 'error')
watchNotice(totalsError, () => t('平台金额查询失败', 'Falha ao consultar os valores'), 'error')
watchNotice(listingError, '平台搜索失败', 'error')
watchNotice(reviewListError, '评价加载失败', 'error')
watchNotice(captchaError, '验证码加载失败', 'error')
watchNotice(status, text => text?.startsWith('验证码') ? '验证码已发送' : '评价提醒', 'success')
watchNotice(() => {
  const result = quote.value
  if (result?.status !== 'confirmed') return ''
  return t('返利已到账', 'Cashback creditado') + ' · ' + formatBrl(result.rebate_cents)
}, '兑换成功', 'success')
watchNotice(() => quote.value && quote.value.status !== 'confirmed' && quote.value.eligibility !== 'eligible'
  ? eligibility[quote.value.eligibility] || '当前报价不可兑换。' : '', '暂不可兑换')
</script>

<template>
  <section class="stack platform-pages" :class="{ 'with-platform-actions': (screen === 'detail' && platform) || showQuoteAction }" :aria-busy="loading || busy">
    <template v-if="protectedScreens.includes(screen) && !member">
      <div class="surface stack guest-panel">
        <h2>{{ t('请先登录') }}</h2>
        <button class="primary" type="button" @click="requireLogin()">{{ t('去登录') }}</button>
      </div>
    </template>
    <template v-else-if="loading"></template>
    <div v-else-if="loadError" class="surface stack message">
      <button class="quiet" type="button" @click="initialize">{{ t('重新加载') }}</button>
    </div>

    <template v-else-if="screen === 'directory'">
      <label class="platform-search">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/></svg>
        <input v-model="search" type="search" maxlength="120" :aria-label="t('搜索平台')" :placeholder="t('输入平台名称')" @input="updateSearch">
      </label>
      <div v-if="directory.length" class="platform-grid">
        <PlatformCard v-for="item in directory" :key="item.id" direct
                      :platform-id="item.id" :name="item.name" :logo-url="item.logo_url"
                      :cashback-binding-id="cardBindings?.get(String(item.id))"
                      :rating="item.rating" :rank="item.featured_position"
                      :guarantee-amount="item.guarantee_amount_brl" :max-rebate-percent="item.max_rebate_percent"
                      :promotion-url="item.promotion_url" inline-actions />
      </div>
      <div v-if="!listing && listingError" class="surface stack message">
        <button class="quiet" type="button" @click="listPlatforms(directory.length ? listPage + 1 : 1)">{{ t('重试') }}</button>
      </div>
      <p v-else-if="!listing && !directory.length" class="surface muted message">{{ t('未找到匹配的平台。') }}</p>
      <button v-else-if="!listing && listPage < listLastPage" type="button" class="quiet" @click="listPlatforms(listPage + 1)">{{ t('加载更多') }}</button>
    </template>

    <template v-else-if="screen === 'detail' && platform">
      <header class="surface platform-hero">
        <div class="platform-hero-identity">
          <div class="platform-logo large-logo">
            <span>{{ platform.name.slice(0, 2) }}</span>
            <img v-if="imageUrl(platform.logo_url)" :src="imageUrl(platform.logo_url)" width="64" height="64" alt="" @error="$event.target.hidden = true" @load="$event.target.hidden = false">
          </div>
          <div class="platform-heading">
            <h1>{{ platform.name }}</h1>
            <p class="hero-rating"><span class="score"><span aria-hidden="true">★</span> {{ platformScore }}</span><span class="muted">{{ platform.review_count }} {{ t('条评价') }}</span></p>
          </div>
        </div>
        <div class="platform-hero-actions">
          <button class="primary" type="button" @click="go(bindPath(platform.id))">{{ t('绑定平台', 'Vincular conta') }}</button>
          <button class="primary" type="button" @click="go('/cashback?platform=' + platform.id + '&amp;auto=1')">{{ t('一键返利', 'Consultar cashback') }}</button>
        </div>
      </header>
      <section class="surface protection-banner">
        <span class="protection-icon"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Z"/><path d="m9 12 2 2 4-4"/></svg></span>
        <div>
          <h2 class="protection-title">
            {{ t('出款保障') }}
            <strong v-if="guaranteeAmount" class="protection-amount">{{ guaranteeAmount }}</strong>
          </h2>
          <p>{{ t('符合保障条款的拒绝出款申诉，经核实后由本站赔付。') }}</p>
        </div>
        <button class="quiet" type="button" @click="go(platformPath + '/protection')">{{ t('查看条款') }}</button>
      </section>
      <dl v-if="maxRebate || rebateWager" class="surface platform-rebate-summary" :aria-label="t('返利信息', 'Informações de cashback')">
        <div v-if="maxRebate" class="platform-rebate-rate">
          <dt>{{ t('最高返利', 'Cashback máximo') }}</dt>
          <dd>{{ maxRebate }}</dd>
        </div>
        <div v-if="rebateWager" class="platform-rebate-wager">
          <dt>{{ t('最低打码倍数', 'Multiplicador mínimo de apostas') }}</dt>
          <dd>{{ rebateWager }}</dd>
        </div>
      </dl>
      <div class="surface platform-tabs"
        role="tablist" :aria-label="t('平台详情')">
        <button v-for="([value, label, translation], index) in detailTabs" :id="'platform-tab-' + value" :key="value"
          type="button" role="tab" :aria-selected="tab === value" :aria-controls="'platform-panel-' + value"
          :tabindex="tab === value ? 0 : -1" @click="tab = value" @keydown="moveTab($event, index, detailTabs, 'platform-tab-', next => tab = next)">{{ t(label, translation) }}</button>
      </div>
      <section v-show="tab === 'reviews'" id="platform-panel-reviews" class="stack" role="tabpanel"
        aria-labelledby="platform-tab-reviews" tabindex="0" :aria-busy="reviewsLoading">
        <div class="surface review-summary">
          <h2>{{ t('平台评分', 'Nota da plataforma') }}</h2>
          <p class="review-score"><span class="score"><strong class="big-score">{{ platformScore }}</strong> <span>/ 5</span></span> <span class="muted">{{ platform.review_count }} {{ t('条评价') }}</span></p>
          <button class="quiet" type="button" @click="writeReview">{{ t('写评价') }}</button>
        </div>
        <article v-for="review in reviews" :key="review.id" class="surface review-item">
          <header class="review-header">
            <img class="review-avatar" :src="avatarForReview(review.id)" alt="" width="35" height="35" loading="lazy">
            <div class="review-meta">
              <strong>{{ review.display_name }}</strong>
              <time v-if="review.published_at" :datetime="review.published_at" class="muted">{{ formatDate(review.published_at) }}</time>
            </div>
            <div class="review-stars" role="img" :aria-label="review.rating + t(' 星')">
              <span v-for="star in 5" :key="star" :class="{ 'dim-stars': star > review.rating }" aria-hidden="true">★</span>
            </div>
          </header>
          <p class="preserved">{{ review.body }}</p>
        </article>
        <p v-if="reviewsLoading" class="muted message" role="status">{{ t('正在加载评价…', 'Carregando avaliações…') }}</p>
        <div v-if="reviewListError" class="surface stack message">
          <button class="quiet" type="button" @click="loadPlatformReviews(reviews.length ? reviewPage + 1 : 1)">{{ t('重试') }}</button>
        </div>
        <div v-else-if="!reviewsLoading && !reviews.length" class="surface message">
          <p class="muted">{{ t('暂无评价。') }}</p><button class="quiet" type="button" @click="writeReview">{{ t('写下第一条评价') }}</button>
        </div>
        <button v-else-if="reviewPage < reviewLastPage" type="button" class="quiet"
          :aria-disabled="reviewsLoading" @click="loadPlatformReviews(reviewPage + 1)">{{ t('加载更多') }}</button>
      </section>
      <section v-show="tab === 'information'" id="platform-panel-information" role="tabpanel"
        aria-labelledby="platform-tab-information" tabindex="0">
        <PlatformIntroduction :platform="platform" :max-rebate="maxRebate" />
      </section>
      <section v-show="tab === 'about'" id="platform-panel-about" role="tabpanel"
        aria-labelledby="platform-tab-about" tabindex="0">
        <article class="surface stack platform-content" aria-labelledby="platform-about-heading">
          <h2 id="platform-about-heading">{{ t('平台详细介绍', 'Sobre a plataforma') }}</h2>
          <p v-if="platformDescription" class="preserved">{{ platformDescription }}</p>
          <p v-else class="muted">{{ t('暂无平台简介。', 'Descrição indisponível') }}</p>
        </article>
      </section>
      <footer class="platform-actions detail-actions">
        <button class="quiet" type="button" :aria-pressed="favorite" :disabled="busy || favoriteLoading" @click="toggleFavorite">
          <span aria-hidden="true">{{ favorite ? '★' : '☆' }}</span> {{ favorite ? t('已收藏') : t('收藏') }}
        </button>
        <a v-if="promotion" class="primary" :href="promotion" target="_blank" rel="noopener noreferrer">{{ t('通过本站注册') }} <span aria-hidden="true">↗</span></a>
        <button v-else class="primary" type="button" disabled>{{ t('通过本站注册') }}</button>
      </footer>
    </template>

    <template v-else-if="screen === 'terms'">
      <article v-if="terms" class="surface stack platform-content">
        <h2>{{ terms.title }}</h2>
        <p class="preserved">{{ terms.body }}</p>
      </article>
      <p v-else class="surface muted message">{{ t('该平台暂无公开保障条款。') }}</p>
    </template>

    <template v-else-if="screen === 'review' && platform">
      <div v-if="!reviewBinding" class="surface stack platform-content">
        <h2>{{ platform.name }}</h2>
        <p class="muted">{{ t('绑定该平台后可发表评价。') }}</p>
        <button class="primary" type="button" @click="go(bindPath(platform.id, route.fullPath))">{{ t('去绑定') }}</button>
      </div>
      <form v-else class="surface stack platform-content" @submit.prevent="submitReview">
        <h2>{{ platform.name }}</h2>
        <fieldset class="rating-picker" :disabled="busy">
          <legend>{{ t('评分') }}</legend>
          <label v-for="star in 5" :key="star" :class="{ highlighted: star <= rating }">
            <input v-model="rating" type="radio" name="platform-rating" required :value="star">
            <span aria-hidden="true">★</span><span class="visually-hidden">{{ star }} {{ t('星') }}</span>
          </label>
        </fieldset>
        <label class="field">{{ t('评价内容') }}
          <textarea v-model="reviewBody" :disabled="busy" rows="5" maxlength="2000" required :placeholder="t('分享你在该平台的使用体验')"></textarea>
        </label>
        <small class="muted word-count">{{ reviewBody.length }} / 2000</small>
        <button class="primary" :disabled="busy || !rating || !reviewBody.trim()">{{ t('提交评价') }}</button>
      </form>
    </template>

    <template v-else-if="screen === 'bindings'">
      <button class="primary" type="button" @click="go('/binding')">{{ t('绑定新平台') }}</button>
      <div v-if="ownBindings.length" class="surface">
        <a v-for="item in ownBindings" :key="item.id" class="binding-row" :href="'#/bindings/' + item.id">
          <span class="platform-logo small-logo" aria-hidden="true">
            <span>{{ item.platform_name.slice(0, 2) }}</span>
            <img v-if="imageUrl(item.logo_url)" :src="imageUrl(item.logo_url)" width="40" height="40" alt=""
                 @error="$event.target.hidden = true">
          </span>
          <span class="binding-label"><strong>{{ item.platform_name }}</strong><small class="muted">{{ item.platform_account_id }}</small></span>
          <span class="binding-label minor">
            <strong :class="item.protection_status === 'active' ? 'binding-protected' : 'muted'">{{ t(bindingStatuses[item.protection_status]) || t('待确认') }}</strong>
            <small aria-hidden="true">›</small>
          </span>
        </a>
      </div>
      <p v-else class="surface muted message">{{ t('暂无已绑定平台。') }}</p>
      <button v-if="bindingPage < bindingLastPage" type="button" class="quiet" :disabled="busy" @click="moreBindings">{{ t('加载更多') }}</button>
    </template>

    <template v-else-if="screen === 'bindingDetail' && bindingDetail">
      <div class="surface stack platform-content">
        <div class="platform-heading"><h2>{{ bindingDetail.platform_name }}</h2><p class="muted">{{ bindingDetail.platform_account_id }}</p></div>
      </div>
      <div class="surface platform-tabs binding-tabs" role="tablist" :aria-label="t('已绑定平台', 'Plataforma vinculada')">
        <button v-for="([value, label, translation], index) in bindingTabs" :id="'binding-tab-' + value" :key="value"
          type="button" role="tab" :aria-selected="bindingTab === value" :aria-controls="'binding-panel-' + value"
          :tabindex="bindingTab === value ? 0 : -1" @click="bindingTab = value"
          @keydown="moveTab($event, index, bindingTabs, 'binding-tab-', next => bindingTab = next)">{{ t(label, translation) }}</button>
      </div>
      <section v-show="bindingTab === 'summary'" id="binding-panel-summary" class="stack" role="tabpanel" aria-labelledby="binding-tab-summary" tabindex="0">
        <div class="surface stack platform-content">
          <dl class="platform-data">
            <div><dt>{{ t('总存款金额', 'Total depositado') }}</dt><dd>{{ formatMoney(bindingTotals?.total_deposit_cents) }}</dd></div>
            <div><dt>{{ t('总打码量', 'Total de apostas válidas') }}</dt><dd>{{ formatMoney(bindingTotals?.total_valid_bet_cents) }}</dd></div>
            <div v-if="bindingDetail.query_phone && bindingDetail.query_phone !== bindingDetail.platform_account_id">
            <dt>{{ t('绑定手机号', 'Celular vinculado') }}</dt><dd>{{ bindingDetail.query_phone }}</dd>
          </div>
          <div><dt>{{ t('绑定时间') }}</dt><dd>{{ formatDate(bindingDetail.created_at) }}</dd></div>
            <div><dt>{{ t('上次兑换时间') }}</dt><dd>{{ formatDate(bindingDetail.last_redeemed_at) }}</dd></div>
            <div><dt>{{ t('保障状态') }}</dt><dd><button type="button" class="inline-action" @click="go('/protection?binding=' + bindingDetail.id)">{{ t(bindingStatuses[bindingDetail.protection_status]) || t('查看保障') }} ›</button></dd></div>
          </dl>
        </div>
        <button v-if="totalsError" class="quiet" type="button" @click="loadBindingTotals">{{ t('重试') }}</button>
        <button type="button" class="primary" @click="go('/cashback?binding=' + bindingDetail.id)">{{ t('查询返利', 'Consultar cashback') }}</button>
      </section>
      <section v-show="bindingTab === 'recharges'" id="binding-panel-recharges" role="tabpanel" aria-labelledby="binding-tab-recharges" tabindex="0">
        <PlatformRechargeHistory v-if="bindingTab === 'recharges'" :binding-id="bindingDetail.id" />
      </section>
    </template>

    <template v-else-if="screen === 'bind' || screen === 'cashback'">
      <section class="surface stack platform-content">
        <div ref="pickerBox" class="field platform-picker-field"
             @focusout="$event.relatedTarget && !pickerBox.contains($event.relatedTarget) && closePicker()">
          <label for="platform-choice">{{ t('选择平台') }}</label>
          <div class="platform-select">
            <input id="platform-choice" ref="pickerInput" :value="picker ? search : selected?.name || ''"
                   type="text" role="combobox" aria-autocomplete="list" aria-controls="platform-options"
                   :aria-expanded="picker" :aria-activedescendant="picker && choices[highlighted] ? 'platform-option-' + highlighted : undefined"
                   :placeholder="picker ? t('输入平台名称搜索') : t('请选择或搜索平台')" autocomplete="off" maxlength="120" :disabled="busy"
                   @focus="openPicker" @click="openPicker" @input="typePicker" @keydown="pickerKeys">
            <button type="button" class="picker-toggle" tabindex="-1" :disabled="busy" :aria-label="picker ? t('收起选项') : t('展开选项')"
                    @mousedown.prevent @click="togglePicker">
              <svg viewBox="0 0 24 24" aria-hidden="true" :class="{ expanded: picker }"><path d="m6 9 6 6 6-6"/></svg>
            </button>
          </div>
          <div v-show="picker" class="picker-panel">
            <div id="platform-options" class="picker-results" role="listbox" :aria-label="t('匹配平台')">
              <button v-for="(item, index) in choices" :id="'platform-option-' + index" :key="item.id" class="binding-row"
                      :class="{ highlighted: index === highlighted }" type="button" role="option" tabindex="-1"
                      :aria-selected="String(selected?.id) === String(item.id)" :disabled="busy" @mousedown.prevent @click="choose(item)">
                <span class="platform-logo small-logo" aria-hidden="true">
                  <span>{{ item.name.slice(0, 2) }}</span>
                  <img v-if="imageUrl(item.logo_url)" :src="imageUrl(item.logo_url)" width="40" height="40" alt=""
                       @error="$event.target.hidden = true" @load="$event.target.hidden = false">
                </span>
                <strong>{{ item.name }}</strong>
                <span v-if="String(selected?.id) === String(item.id)" class="picker-check" aria-hidden="true">✓</span>
              </button>
            </div>
            <div v-if="!listing && listingError" class="stack picker-message">
              <button class="quiet" type="button" @click="listPlatforms(directory.length ? listPage + 1 : 1)">{{ t('重试') }}</button>
            </div>
            <p v-else-if="!listing && !choices.length" class="muted picker-message" role="status">{{ screen === 'bind' ? t('未找到可绑定的平台。') : t('未找到匹配的平台。') }}</p>
            <button v-else-if="!listing && listPage < listLastPage" type="button" class="picker-more" @click="listPlatforms(listPage + 1)">{{ t('加载更多') }}</button>
          </div>
        </div>

        <template v-if="activeBinding">
          <div class="field"><span>{{ t('平台账号') }}</span><div class="masked-account">{{ activeBinding.platform_account_id }} <span>{{ t('已绑定') }}</span></div></div>
          <button v-if="screen === 'cashback'" class="primary" type="button" :disabled="busy" @click="queryCashback">{{ t('查询') }}</button>
          <button v-else-if="target" class="primary" type="button" @click="finishBinding(activeBinding)">{{ t('继续') }}</button>
          <button v-else class="quiet" type="button" @click="go('/bindings/' + activeBinding.id)">{{ t('查看绑定详情') }}</button>
        </template>
        <form v-else-if="selected && screen === 'bind'" class="stack" @submit.prevent="bindAccount">
          <label class="field">{{ t('平台账号（巴西手机号）') }}
            <input v-model.trim="phone" type="tel" maxlength="32" autocomplete="tel" required :disabled="busy" @input="code = ''; status = ''">
          </label>
          <div v-if="requiresCode && bindingVerification === 'sms'" class="code-row">
            <label class="field">{{ t('短信验证码') }}
              <input v-model.trim="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required :disabled="busy">
            </label>
            <button type="button" class="quiet" :disabled="busy || !phone" @click="sendCode">{{ t('获取验证码') }}</button>
          </div>
          <div v-if="bindingUsesImage" class="code-row">
            <label class="field">{{ t('图片验证码') }}
              <input v-model.trim="code" type="text" pattern="[A-Za-z2-9]{4}" maxlength="4" autocomplete="off" required :disabled="busy">
            </label>
            <button type="button" class="quiet" :disabled="busy || captchaLoading" @click="refreshBindingCaptcha()" :aria-label="t('换一张验证码')">
              <img v-if="bindingCaptcha" :src="bindingCaptcha.image" width="150" height="45" :alt="t('图片验证码')">
              <span v-else>{{ t('获取图片') }}</span>
            </button>
          </div>
          <p class="muted">{{ t('绑定成功后不可更换，请核对平台和账号。') }}</p>
          <button class="primary" :disabled="busy || !bindingVerification || (bindingUsesImage && !bindingCaptcha)">{{ t('确认绑定') }}</button>
        </form>
        <template v-else-if="selected && screen === 'cashback'">
          <p class="muted">{{ t('请先绑定该平台账号，再查询返利。', 'Vincule sua conta para consultar o cashback.') }}</p>
          <button class="primary" type="button" @click="go(bindPath(selected.id, '/cashback?platform=' + selected.id))">{{ t('去绑定') }}</button>
        </template>
      </section>
      <section v-if="screen === 'cashback' && quote && activeBinding" class="surface stack platform-content quote-result">
        <div class="quote-highlight">
          <p>{{ quote.status === 'confirmed' ? t('已到账') : t('预计入账') }}</p>
          <dl class="quote-totals">
            <div><dt>{{ t('返利') }}</dt><dd>{{ formatBrl(quote.rebate_cents) }}</dd></div>
          </dl>
        </div>
        <dl class="platform-data">
          <div><dt>{{ t('当前充值总额') }}</dt><dd>{{ formatMoney(quote.observed_deposit_cents) }}</dd></div>
          <div><dt>{{ t('当前投注额') }}</dt><dd>{{ formatMoney(quote.observed_valid_bet_cents) }}</dd></div>
          <div><dt>{{ t('本次待兑换存款') }}</dt><dd>{{ formatMoney(quote.deposit_cents) }}</dd></div>
          <div><dt>{{ t('本期有效投注额') }}</dt><dd>{{ formatMoney(quote.valid_bet_cents) }}</dd></div>
          <div v-if="quote.rebate_enabled"><dt>{{ t('返利所需投注额（' + quote.rebate_wager_multiplier + ' 倍）', 'Apostas exigidas para cashback (' + quote.rebate_wager_multiplier + '×)') }}</dt><dd>{{ formatMoney(quote.rebate_required_bet_cents) }}</dd></div>
          <div v-if="quote.matched_rebate_wager_multiplier != null"><dt>{{ t('命中打码档位', 'Faixa de apostas atingida') }}</dt><dd>{{ formatRule(quote.matched_rebate_wager_multiplier, '×') }}</dd></div>
          <div v-if="quote.rebate_enabled"><dt>{{ t('返利比例') }}</dt><dd>{{ formatRule(quote.rebate_percent, '%') }}</dd></div>
          <div><dt>{{ t('基线快照读取时间') }}</dt><dd>{{ formatDate(quote.baseline_observed_at) }}</dd></div>
          <div><dt>{{ t('本次快照读取时间') }}</dt><dd>{{ formatDate(quote.observed_at) }}</dd></div>
        </dl>
        <template v-if="quote.status === 'confirmed'">
          <button v-if="quote.rebate_enabled || quote.rebate_cents > 0" class="quiet" type="button" @click="go('/cash-wallet/withdraw')">{{ t('查看可用余额') }}</button>
        </template>
        <p v-else-if="mayConfirm" class="muted">{{ t('确认领取时按平台最新数据计算返利。', 'O cashback será recalculado com os dados mais recentes da plataforma ao confirmar.') }}</p>
        <p v-else class="muted" role="status">{{ quote.eligibility === 'eligible' && !mayConfirm ? t('报价已失效，请重新查询。') : t(eligibility[quote.eligibility]) || t('当前报价不可兑换。') }}</p>
      </section>
      <footer v-if="showQuoteAction" class="platform-actions quote-actions">
        <button class="primary" type="button" :disabled="busy || !mayConfirm" @click="confirmCashback">{{ t('确认领取返利', 'Confirmar cashback') }}</button>
      </footer>
    </template>

  </section>
</template>

<style scoped src="./PlatformPages.css"></style>
