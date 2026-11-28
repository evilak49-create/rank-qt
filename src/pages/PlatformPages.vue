<script>
const directoryCache = new Map()
</script>

<script setup>
import { protectionStatusLabel } from '../protectionStatus.js'
import EmptyState from '../EmptyState.vue'
import { createRequestId } from '../requestId.js'
import { useLocale } from '../locale.js'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { api, imageUrl } from '../api'
import { icons } from '../icons'
import { formatGuaranteeAmount } from '../money'
import PlatformCard from '../PlatformCard.vue'
import ProtectionContract from './ProtectionContract.vue'
import { go, restoreScroll, resume, safePath } from '../navigation'
import { avatarForReview } from './memberAvatars.js'
import PlatformIntroduction from './PlatformIntroduction.vue'
import PlatformRechargeHistory from './PlatformRechargeHistory.vue'
import TurnstileChallenge from './TurnstileChallenge.vue'

const { locale, t } = useLocale()

const props = defineProps({ route: { type: Object, required: true }, member: Object, cardBindings: Map })
const screen = computed(() => {
  const path = props.route.path
  if (path.endsWith('/reviews/new')) return 'review'
  if (path.endsWith('/protection')) return 'terms'
  if (path === '/binding' || path === '/bindings') {
    const { query } = props.route
    return query.get('new') === '1' || query.has('platform') || query.has('return') ? 'bind' : 'bindings'
  }
  if (path.startsWith('/bindings/')) return 'bindingDetail'
  return path === '/platforms' ? 'directory' : 'detail'
})
const protectedScreens = ['review', 'bindings', 'bindingDetail', 'bind']
const platformPath = computed(() => '/platforms/' + props.route.params.id)
const target = computed(() => safePath(props.route.query.get('return'), ''))
const directory = ref([])
const selected = ref(null)
const platform = ref(null)
const detailBindingId = computed(() => props.cardBindings?.get(String(platform.value?.id)))
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
const bindingDialog = ref(null)
const pickerBox = ref(null)
const pickerAvailableHeight = ref(null)
const pickerInput = ref(null)
const highlighted = ref(-1)
const ownBindings = ref([])
const bindingPage = ref(1)
const bindingLastPage = ref(1)
const bindingsLoading = ref(false)
const bindingListError = ref('')
const bindingDetail = ref(null)
const bindingTotals = ref(null)
const totalsError = ref('')
const phone = ref('')
const code = ref('')
const defaultRating = 5
const rating = ref(defaultRating)
const reviewBody = ref('')
const busy = ref(false)
const loading = ref(false)
const error = ref('')
const loadError = ref('')
const status = ref('')
let loadRequest
let reviewsRequest
let bindingsRequest
let directoryRequest
let searchTimer
let reviewIntent
let disposed = false
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const date = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }))
const ruleNumbers = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 6 }))
const scoreNumbers = computed(() => new Intl.NumberFormat(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const platformScore = computed(() => platform.value?.rating == null ? '—' : scoreNumbers.value.format(platform.value.rating))
const maxRebate = computed(() => formatRule(
  platform.value?.estimated_rebate_percent ?? platform.value?.max_rebate_percent, '%', '',
))
const rebateWager = computed(() => formatRule(platform.value?.min_rebate_wager_multiplier, '×', ''))
const platformDescription = computed(() => platform.value?.description?.trim())
const activeBinding = computed(() => ownBindings.value.find(item => String(item.platform_id) === String(selected.value?.id)))
const reviewBinding = computed(() => ownBindings.value.some(item => String(item.platform_id) === props.route.params.id))
const requiresCode = computed(() => !props.member?.phone_verified_at || nationalPhone(phone.value) !== nationalPhone(props.member.phone))
const bindingVerification = ref(null)
const bindingCaptcha = ref(null)
const bindingTurnstileToken = ref('')
const bindingTurnstileReset = ref(0)
const captchaLoading = ref(false)
const captchaError = ref('')
const bindingMode = computed(() => bindingVerification.value?.mode)
const bindingUsesImage = computed(() => screen.value === 'bind' && bindingMode.value === 'image')
const bindingUsesCloudflare = computed(() => screen.value === 'bind' && bindingMode.value === 'cloudflare')
const bindingChallengeReady = computed(() => bindingVerification.value && (!bindingUsesImage.value || bindingCaptcha.value)
  && (!bindingUsesCloudflare.value || bindingTurnstileToken.value))
const choices = directory
const registrationNoticeDismissed = ref(false)
const detailActions = ref(null)
const detailActionsHeight = ref(0)

watch(detailActions, (footer, _previous, onCleanup) => {
  if (!footer) {
    detailActionsHeight.value = 0
    return
  }
  const measure = () => { detailActionsHeight.value = Math.ceil(footer.getBoundingClientRect().height) }
  measure()
  const observer = new ResizeObserver(measure)
  observer.observe(footer)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })

async function dismissRegistrationNotice() {
  registrationNoticeDismissed.value = true
  await nextTick()
  detailActions.value?.querySelector('.primary')?.focus({ preventScroll: true })
}

const supportsAutoBinding = computed(() => promotion.value.startsWith('https://'))
const promotion = computed(() => {
  try {
    const url = new URL(platform.value?.promotion_url)
    return /^https?:$/.test(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
})

function registerForPlatform() {
  if (busy.value) return
  if (!props.member) {
    requireLogin()
    return
  }

  const path = platformPath.value + '/registration'
  const tab = window.open('about:blank', '_blank')
  if (tab) tab.opener = null
  run(async current => {
    let opened = false
    try {
      const { data } = await api(path, { method: 'POST' })
      if (!current()) return
      const url = new URL(data.url)
      if (url.protocol !== 'https:') throw new Error(t('推广链接不可用。', 'O link de inscrição está indisponível.'))
      if (tab && !tab.closed) tab.location.replace(url.href)
      else window.location.assign(url.href)
      opened = true
    } finally {
      if (!opened) tab?.close()
    }
  })
}

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
    const result = await api(path + '?' + new URLSearchParams({ search: keyword, page }), { signal: controller.signal, fresh: isBinding, background: isBinding })
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

function fitPickerToViewport() {
  if (!picker.value || !pickerBox.value || !bindingDialog.value) return
  const viewport = window.visualViewport
  const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight
  const sheetBottom = bindingDialog.value.getBoundingClientRect().bottom
  const panelTop = pickerBox.value.getBoundingClientRect().bottom + 4
  pickerAvailableHeight.value = Math.max(50, Math.floor(Math.min(bottom, sheetBottom) - panelTop) - 4) + 'px'
}

function loadMorePicker(event) {
  const panel = event.currentTarget
  if (!listing.value && !listingError.value && listPage.value < listLastPage.value
      && panel.scrollHeight - panel.clientHeight - panel.scrollTop <= 48) {
    listPlatforms(listPage.value + 1)
  }
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
  if (!bindingUsesImage.value) code.value = ''
  error.value = ''
  status.value = ''
}

async function loadBindings(signal, { allPages = false, throughPage = 1, page = 1 } = {}) {
  const items = []
  let currentPage = page
  let result
  do {
    result = await api('/platform-bindings?page=' + currentPage, { signal, fresh: screen.value === 'bind' || screen.value === 'bindings' })
    items.push(...result.data)
    currentPage++
  } while (currentPage <= result.last_page && (allPages || currentPage <= throughPage))
  if (signal.aborted) return
  ownBindings.value = page === 1 ? items : [...ownBindings.value, ...items]
  bindingPage.value = result.current_page
  bindingLastPage.value = result.last_page
}

function saveBindingProgress() {
  history.replaceState({
    ...history.state,
    platformBindingProgress: { memberId: props.member.id, page: bindingPage.value },
  }, '')
}

async function loadBindingList(page = 1, throughPage = page) {
  bindingsRequest?.abort()
  bindingsRequest = new AbortController()
  const { signal } = bindingsRequest
  const routeKey = props.route.key
  bindingsLoading.value = true
  bindingListError.value = ''
  try {
    await loadBindings(signal, { page, throughPage })
    if (!signal.aborted && props.route.key === routeKey) {
      saveBindingProgress()
      if (throughPage > 1 && page === 1) {
        await nextTick()
        if (!signal.aborted) restoreScroll()
      }
    }
  } catch (failure) {
    if (!signal.aborted) bindingListError.value = failureMessage(failure)
  } finally {
    if (!signal.aborted) bindingsLoading.value = false
  }
}

async function loadPlatformReviews(page, path = platformPath.value) {
  reviewsRequest?.abort()
  reviewsRequest = new AbortController()
  const { signal } = reviewsRequest
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
  reviewsRequest?.abort()
  bindingsRequest?.abort()
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
  bindingPage.value = 1
  bindingLastPage.value = 1
  bindingsLoading.value = false
  bindingListError.value = ''
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
    if (mode === 'bind') {
      bindingVerification.value = null
      const [verification] = await Promise.all([
        api('/auth/verification', { signal }),
        loadBindings(signal, { allPages: true }),
      ])
      if (signal.aborted) return
      bindingTurnstileToken.value = ''
      bindingVerification.value = verification.data
      phone.value = props.member.phone ?? ''
      const platformId = props.route.query.get('platform')
      const preset = ownBindings.value.find(item => String(item.platform_id) === platformId)
      if (preset && !target.value) {
        go('/bindings/' + preset.id, { replace: true })
        return
      }
      if (preset) {
        choose({ id: preset.platform_id, name: preset.platform_name, logo_url: preset.logo_url })
      } else if (/^\d+$/.test(platformId ?? '')) {
        const result = await api('/platforms/' + platformId, { signal })
        if (!signal.aborted) choose(result.data)
      }
    } else if (mode === 'bindings') {
      const progress = history.state?.platformBindingProgress
      const ownProgress = progress?.memberId === props.member.id ? progress : null
      loading.value = false
      await loadBindingList(1, ownProgress?.page ?? 1)
    } else if (mode === 'bindingDetail') {
      const result = await api('/platform-bindings/' + props.route.params.id, { signal })
      if (!signal.aborted) {
        bindingDetail.value = result.data
        loading.value = false
        await loadBindingTotals()
      }
    } else if (mode === 'terms') {
      const result = await api(path + '/protection-terms', { signal, fresh: true })
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
        const tasks = [loadPlatformReviews(1, path)]
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
  if (!selected.value || activeBinding.value || !requiresCode.value) return
  return run(async current => {
    await api('/platforms/' + selected.value.id + '/binding/code', { body: { phone: phone.value.trim() } })
    if (current()) status.value = '验证码已发送。'
  })
}

function closeBinding() {
  if (!busy.value) resume(target.value || props.route.path)
}

function finishBinding() {
  resume(target.value || props.route.path)
}

async function refreshBindingCaptcha(signal) {
  const route = props.route
  const current = () => !disposed && props.route === route && !signal?.aborted
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

watch([bindingUsesImage, () => props.route], ([useImage], _previous, onCleanup) => {
  bindingCaptcha.value = null
  captchaLoading.value = false
  captchaError.value = ''
  if (!useImage) return
  const request = new AbortController()
  onCleanup(() => request.abort())
  refreshBindingCaptcha(request.signal)
})

function bindAccount() {
  if (!selected.value || activeBinding.value || !bindingChallengeReady.value) return
  return run(async current => {
    const body = { phone: phone.value.trim() }
    const useImage = bindingUsesImage.value
    const useCloudflare = bindingUsesCloudflare.value
    if (useImage) {
      body.challenge_id = bindingCaptcha.value.challenge_id
      body.code = code.value.trim()
    } else if (useCloudflare) {
      body.turnstile_token = bindingTurnstileToken.value
    } else if (requiresCode.value) {
      body.code = code.value.trim()
    }
    try {
      await api('/platforms/' + selected.value.id + '/binding', { body })
      if (current()) finishBinding()
    } catch (failure) {
      if (useImage && current()) await refreshBindingCaptcha()
      if (useCloudflare && current()) bindingTurnstileReset.value++
      const notFound = '未查到符合条件的推广账号'
      if (failure.status === 422 &&
          (failure.errors?.phone?.includes(notFound) || failure.message === notFound)) {
        throw new Error('没有查询到对应的游戏账号，请检查')
      }
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

watch([() => props.route.key, () => props.member?.id], initialize, { immediate: true })
watch(bindingDialog, dialog => {
  if (dialog && !dialog.open) dialog.showModal()
}, { flush: 'post' })
watch(picker, open => {
  if (open) window.requestAnimationFrame(fitPickerToViewport)
  else pickerAvailableHeight.value = null
}, { flush: 'post' })
onMounted(() => {
  document.addEventListener('pointerdown', outsidePicker)
  window.addEventListener('resize', fitPickerToViewport)
  window.visualViewport?.addEventListener('resize', fitPickerToViewport)
  window.visualViewport?.addEventListener('scroll', fitPickerToViewport)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', outsidePicker)
  window.removeEventListener('resize', fitPickerToViewport)
  window.visualViewport?.removeEventListener('resize', fitPickerToViewport)
  window.visualViewport?.removeEventListener('scroll', fitPickerToViewport)
  disposed = true
  loadRequest?.abort()
  directoryRequest?.abort()
  reviewsRequest?.abort()
  bindingsRequest?.abort()
  clearTimeout(searchTimer)
})

import { watchNotice } from '../feedback'
watchNotice(error, () => screen.value === 'bind' ? '绑定平台提醒' : screen.value === 'review' ? '评价提醒' : '平台操作提醒', 'error')
watchNotice(loadError, '平台数据加载失败', 'error')
watchNotice(totalsError, () => t('平台金额查询失败', 'Falha ao consultar os valores'), 'error')
watchNotice(listingError, '平台搜索失败', 'error')
watchNotice(reviewListError, '评价加载失败', 'error')
watchNotice(captchaError, '验证码加载失败', 'error')
watchNotice(status, text => text?.startsWith('验证码') ? '验证码已发送' : '评价提醒', 'success')
</script>

<template>
  <section class="stack platform-pages" :class="{ 'with-platform-actions': screen === 'detail' && platform }"
           :style="detailActionsHeight ? { '--platform-actions-height': detailActionsHeight + 'px' } : undefined"
           :aria-busy="loading || busy">
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
                      :guarantee-amount="item.guarantee_amount_brl" :max-rebate-percent="item.estimated_rebate_percent ?? item.max_rebate_percent"
                      :promotion-url="item.promotion_url" inline-actions />
      </div>
      <div v-if="!listing && listingError" class="surface stack message">
        <button class="quiet" type="button" @click="listPlatforms(directory.length ? listPage + 1 : 1)">{{ t('重试') }}</button>
      </div>
      <EmptyState v-else-if="!listing && !directory.length" :message="t('未找到匹配的平台。')" />
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
          <button v-if="detailBindingId != null" class="primary" type="button" @click="go('/bindings/' + detailBindingId)">{{ t('绑定详情') }}</button>
          <button v-else class="primary" type="button" @click="go(bindPath(platform.id))">{{ t('绑定平台', 'Vincular conta') }}</button>
          <button class="primary" type="button" @click="go(detailBindingId != null ? '/cashback/' + detailBindingId : '/cashback')">{{ t('查看返利', 'Ver cashback') }}</button>
        </div>
      </header>
      <section class="surface protection-banner">
        <span class="protection-icon"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Z"/><path d="m9 12 2 2 4-4"/></svg></span>
        <div>
          <h2 class="protection-title">
            {{ t('出款保障') }}
            <strong v-if="guaranteeAmount" class="protection-amount">{{ guaranteeAmount }}</strong>
          </h2>
          <p>{{ t('符合保障条款的拒绝出款申诉，将通过线下协商处理。', 'Contestações de saques recusados que atendam aos termos da proteção serão tratadas por negociação fora do site.') }}</p>
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
        <EmptyState v-else-if="!reviewsLoading && !reviews.length"
          :message="t('暂无评价。')">
          <button v-if="!platform.review_count"
            class="quiet" type="button" @click="writeReview">{{ t('写下第一条评价') }}</button>
        </EmptyState>
        <button v-else-if="reviewPage < reviewLastPage" type="button" class="quiet"
          :disabled="reviewsLoading" @click="loadPlatformReviews(reviewPage + 1)">{{ t('加载更多') }}</button>
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
          <EmptyState v-else compact :message="t('暂无平台简介。', 'Descrição indisponível')" />
        </article>
      </section>
      <footer ref="detailActions" class="platform-actions detail-actions">
        <aside v-if="supportsAutoBinding && member && cardBindings && detailBindingId == null && !registrationNoticeDismissed"
               class="registration-notice" :aria-label="t('绑定平台提醒')">
          <div class="registration-notice-text">
            <p>{{ t('请用返利网的手机号注册。注册成功后将尝试自动绑定。', 'Use o mesmo telefone da sua conta de cashback. A vinculação será tentada após o cadastro.') }}</p>
            <button type="button" class="inline-action" @click="go(bindPath(platform.id))">
              {{ t('手动绑定', 'Vincular manualmente') }}
            </button>
          </div>
          <button class="registration-notice-close" type="button" :aria-label="t('关闭')" @click="dismissRegistrationNotice">×</button>
        </aside>
        <button class="quiet" type="button" :aria-pressed="favorite" :disabled="busy || favoriteLoading" @click="toggleFavorite">
          <span aria-hidden="true">{{ favorite ? '★' : '☆' }}</span> {{ favorite ? t('已收藏') : t('收藏') }}
        </button>
        <template v-if="detailBindingId != null">
          <a v-if="promotion" class="primary" :href="promotion" target="_blank" rel="noopener noreferrer">
            {{ t('通过本站打开', 'Abrir pelo site') }} <span aria-hidden="true">↗</span>
          </a>
          <button v-else class="primary" type="button" disabled>{{ t('通过本站打开', 'Abrir pelo site') }}</button>
        </template>
        <button v-else-if="supportsAutoBinding" type="button" class="primary" :disabled="busy" @click="registerForPlatform">
          {{ t('通过本站注册') }} <span aria-hidden="true">↗</span>
        </button>
        <a v-else-if="promotion" class="primary" :href="promotion" target="_blank" rel="noopener noreferrer">{{ t('通过本站注册') }} <span aria-hidden="true">↗</span></a>
        <button v-else class="primary" type="button" disabled>{{ t('通过本站注册') }}</button>
      </footer>
    </template>

    <ProtectionContract v-else-if="screen === 'terms'" :terms="terms" />

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

    <template v-else-if="screen === 'bindings' || screen === 'bind'">
      <button class="primary binding-add" type="button" aria-haspopup="dialog" @click="go(route.path + '?new=1')">
        <span aria-hidden="true">＋</span>{{ t('绑定新平台') }}
      </button>
      <div v-if="ownBindings.length" class="stack">
        <article v-for="item in ownBindings" :key="item.id" class="surface bound-platform">
          <header class="bound-platform-heading">
            <span class="platform-logo bound-platform-logo" aria-hidden="true">
              <img v-if="imageUrl(item.logo_url)" :key="item.logo_url" :src="imageUrl(item.logo_url)" width="48" height="48" alt=""
                   loading="lazy" @error="$event.target.hidden = true">
              <span>{{ item.platform_name.slice(0, 2) }}</span>
            </span>
            <h2>{{ item.platform_name }}</h2>
            <dl class="bound-platform-data bound-platform-account">
              <div><dt>{{ t('平台账号') }}</dt><dd>{{ item.platform_account_id }}</dd></div>
            </dl>
            <span class="bound-platform-status" :class="{ 'binding-protected': item.protection_status === 'active' }">
              <span class="bound-platform-status-dot" aria-hidden="true"></span>
              <span class="bound-platform-status-label">{{ t(protectionStatusLabel(item.protection_status)) }}</span>
            </span>
          </header>
          <footer class="bound-platform-footer">
            <dl class="bound-platform-data bound-platform-time">
              <div><dt>{{ t('绑定时间') }}</dt><dd><time :datetime="item.created_at">{{ formatDate(item.created_at) }}</time></dd></div>
            </dl>
            <a class="bound-platform-details" :href="'#/bindings/' + item.id" @click.prevent="go('/bindings/' + item.id)">
              {{ t('查看明细', 'Ver detalhes') }} <span aria-hidden="true">›</span>
            </a>
          </footer>
        </article>
      </div>
      <p v-if="bindingsLoading" class="muted message" role="status">{{ t('正在加载绑定记录…', 'Carregando contas vinculadas…') }}</p>
      <div v-else-if="bindingListError" class="surface stack message">
        <p class="error" role="alert">{{ bindingListError }}</p>
        <button type="button" class="quiet" @click="loadBindingList(ownBindings.length ? bindingPage + 1 : 1)">{{ t('重试') }}</button>
      </div>
      <EmptyState v-else-if="!ownBindings.length"
        :message="t('暂无已绑定平台。')" />
      <button v-else-if="screen === 'bindings' && bindingPage < bindingLastPage" type="button" class="quiet"
        @click="loadBindingList(bindingPage + 1)">{{ t('加载更多') }}</button>
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
            <div><dt>{{ t('保障状态') }}</dt><dd><button type="button" class="inline-action" @click="go('/protection?binding=' + bindingDetail.id)">{{ t(protectionStatusLabel(bindingDetail.protection_status)) }} ›</button></dd></div>
          </dl>
        </div>
        <button v-if="totalsError" class="quiet" type="button" @click="loadBindingTotals">{{ t('重试') }}</button>
        <button type="button" class="primary" @click="go('/cashback/' + bindingDetail.id)">{{ t('查看返利', 'Ver cashback') }}</button>
      </section>
      <section v-show="bindingTab === 'recharges'" id="binding-panel-recharges" role="tabpanel" aria-labelledby="binding-tab-recharges" tabindex="0">
        <KeepAlive>
          <PlatformRechargeHistory v-if="bindingTab === 'recharges'" :key="bindingDetail.id" :binding-id="bindingDetail.id" />
        </KeepAlive>
      </section>
    </template>

  </section>

  <Teleport v-if="screen === 'bind' && member && !loading && !loadError" to="body">
    <dialog ref="bindingDialog" class="locale-sheet bind-platform-sheet platform-pages" aria-labelledby="bind-platform-title"
            @cancel.prevent="closeBinding" @click.self="closeBinding" @scroll.passive="fitPickerToViewport" @animationend.self="fitPickerToViewport">
      <div class="locale-panel">
        <div class="locale-heading">
          <h2 id="bind-platform-title">{{ t('绑定新平台') }}</h2>
          <button type="button" class="locale-close" :aria-label="t('关闭')" :disabled="busy" autofocus @click="closeBinding">×</button>
        </div>
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
          <div v-show="picker" class="picker-panel"
               :style="{ '--picker-available-height': pickerAvailableHeight }" @scroll.passive="loadMorePicker">
            <div id="platform-options" class="picker-results" role="listbox" :aria-label="t('匹配平台')">
              <button v-for="(item, index) in choices" :id="'platform-option-' + index" :key="item.id" class="binding-row"
                      :class="{ highlighted: index === highlighted }" type="button" role="option" tabindex="-1"
                      :aria-selected="String(selected?.id) === String(item.id)" :disabled="busy" @mousedown.prevent @click="choose(item)">
                <span class="platform-logo small-logo" aria-hidden="true">
                  <span>{{ item.name.slice(0, 2) }}</span>
                  <img v-if="imageUrl(item.logo_url)" :src="imageUrl(item.logo_url)" width="40" height="40" alt=""
                       @error="$event.target.hidden = true" @load="$event.target.hidden = false">
                </span>
                <strong class="picker-name">{{ item.name }}</strong>
                <span v-if="String(selected?.id) === String(item.id)" class="picker-check" aria-hidden="true">✓</span>
              </button>
            </div>
            <div v-if="!listing && listingError" class="stack picker-message">
              <button class="quiet" type="button" @click="listPlatforms(directory.length ? listPage + 1 : 1)">{{ t('重试') }}</button>
            </div>
            <EmptyState v-else-if="!listing && !choices.length" compact :message="screen === 'bind' ? t('未找到可绑定的平台。') : t('未找到匹配的平台。')" />
            <button v-else-if="!listing && listPage < listLastPage" type="button" class="picker-more" @click="listPlatforms(listPage + 1)">{{ t('加载更多') }}</button>
          </div>
        </div>

        <template v-if="activeBinding">
          <div class="field"><span>{{ t('平台账号') }}</span><div class="masked-account">{{ activeBinding.platform_account_id }} <span>{{ t('已绑定') }}</span></div></div>
          <button v-if="target" class="primary" type="button" @click="finishBinding">{{ t('继续') }}</button>
          <button v-else class="quiet" type="button" @click="go('/bindings/' + activeBinding.id)">{{ t('查看绑定详情') }}</button>
        </template>
        <form v-else class="stack" @submit.prevent="bindAccount">
          <label class="field">{{ t('平台账号') }}
            <input v-model.trim="phone" type="tel" maxlength="32" autocomplete="tel" required :disabled="busy" @input="code = ''; status = ''">
          </label>
          <div v-if="bindingMode === 'sms'" class="code-row">
            <label class="field">{{ t('短信验证码') }}
              <input v-model.trim="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"
                     :required="requiresCode" :disabled="busy || !requiresCode"
                     :placeholder="requiresCode ? undefined : t('已验证，无需验证码', 'Celular já verificado')">
            </label>
            <button type="button" class="quiet" :disabled="busy || !selected || !phone || !requiresCode" @click="sendCode">{{ t('获取验证码') }}</button>
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
          <TurnstileChallenge v-if="bindingUsesCloudflare" v-model="bindingTurnstileToken"
                              :site-key="bindingVerification?.turnstile_site_key" :reset-key="bindingTurnstileReset" action="platform_binding" />
          <p class="muted">{{ t('绑定成功后不可更换，请核对平台和账号。') }}</p>
          <button class="primary" :disabled="busy || !selected || !phone || !bindingChallengeReady">{{ t('确认绑定') }}</button>
        </form>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped src="./PlatformPages.css"></style>
