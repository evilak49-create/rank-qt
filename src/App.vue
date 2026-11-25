
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { api } from './api'
import { provideLocale } from './locale.js'
import HomePage from './HomePage.vue'
import DataLoading from './DataLoading.vue'
import FeedbackDialog from './FeedbackDialog.vue'
import { watchNotice } from './feedback'
import SupportChat from './SupportChat.vue'
import { homeCopy } from './homeCopy'
import { icons } from './icons'
import { back, currentRoute, go, lockPageScroll, restoreScroll, resume, safePath } from './navigation'
import AuthPages from './pages/AuthPages.vue'
import ContentPages from './pages/ContentPages.vue'
import CashWalletPage from './pages/CashWalletPage.vue'
import CheckinPage from './pages/CheckinPage.vue'
import FundRecordsPage from './pages/FundRecordsPage.vue'
import RescueFundPage from './pages/RescueFundPage.vue'
import WithdrawalHistoryPage from './pages/WithdrawalHistoryPage.vue'
import CashbackPage from './pages/CashbackPage.vue'
import PlatformPages from './pages/PlatformPages.vue'
import ShopPages from './pages/ShopPages.vue'
import MemberPages from './pages/MemberPages.vue'

const route = currentRoute
const member = ref(null)
const cardBindings = shallowRef(null)
const sessionState = ref('loading')
const sessionError = ref('')
const authPhone = ref('')
const accountNotice = ref('')
const language = ref('zh-CN')
const { t } = provideLocale(language)
let sessionVersion = 0
const navbar = {
  '/': 'home', '/platforms': 'platforms', '/shop': 'shop', '/red-packets': 'redPackets', '/member': 'member',
}
const authTitles = { '/login': '会员登录', '/register': '注册账号', '/reset-password': '修改密码' }
const pages = [
  [/^\/platforms$/, '平台目录', PlatformPages],
  [/^\/platforms\/\d+$/, '平台详情', PlatformPages],
  [/^\/platforms\/\d+\/reviews\/new$/, '写评价', PlatformPages, true],
  [/^\/platforms\/\d+\/protection$/, '保障条款', PlatformPages],
  [/^\/binding$/, '绑定平台', PlatformPages, true],
  [/^\/(?:cashback|points)$/, '现金返利', CashbackPage, true],
  [/^\/cashback\/records$/, '返利记录', CashbackPage, true],
  [/^\/cashback\/\d+$/, '返利明细', CashbackPage, true],
  [/^\/rescue-fund$/, '救援金', RescueFundPage, true],
  [/^\/bindings$/, '绑定平台', PlatformPages, true],
  [/^\/bindings\/\d+$/, '绑定详情', PlatformPages, true],
  [/^\/shop$/, '兑换', ShopPages],
  [/^\/shop\/funds\/\d+$/, '平台资金兑换', ShopPages, true],
  [/^\/shop\/redemptions$/, '兑换记录', ShopPages, true],
  [/^\/shop\/redemptions\/\d+$/, '兑换详情', ShopPages, true],
  [/^\/member$/, '个人中心', MemberPages, true],
  [/^\/check-in$/, '每日签到', CheckinPage, true],
  [/^\/cash-wallet(?:\/withdraw)?$/, '余额提现', CashWalletPage, true],
  [/^\/fund-records$/, '资金明细', FundRecordsPage, true],
  [/^\/withdrawal-history$/, '提现订单', WithdrawalHistoryPage, true],
  [/^\/pix$/, 'Pix 收款账户', MemberPages, true],
  [/^\/protection$/, '我的保障', MemberPages, true],
  [/^\/protection\/bindings\/\d+\/terms$/, '保障条款', MemberPages, true],
  [/^\/protection\/claims$/, '申诉记录', MemberPages, true],
  [/^\/protection\/claims\/new$/, '申请保障', MemberPages, true],
  [/^\/protection\/claims\/\d+$/, '申诉详情', MemberPages, true],
  [/^\/red-packets$/, '我的红包', MemberPages, true],
  [/^\/red-packets\/invites$/, '邀请明细', MemberPages, true],
  [/^\/red-packets\/withdraw$/, '申请提现', MemberPages, true],
  [/^\/red-packets\/withdrawals\/\d+$/, '提现详情', MemberPages, true],
  [/^\/announcements$/, '站点公告', ContentPages],
  [/^\/announcements\/\d+$/, '公告详情', ContentPages],
  [/^\/help$/, '帮助中心', ContentPages],
  [/^\/help\/\d+$/, '图文教程', ContentPages],
]
try {
  const preference = localStorage.getItem('cash-club-language')
  if (Object.hasOwn(homeCopy, preference)) language.value = preference
} catch {}

const copy = computed(() => homeCopy[language.value])
const auth = computed(() => Object.hasOwn(authTitles, route.value.path))
const authDialog = ref(null)
const homeRoute = { path: '/', fullPath: '/', query: new URLSearchParams(), params: {}, key: 'auth-home' }
const lastView = shallowRef(homeRoute)
const viewRoute = computed(() => {
  if (!auth.value) return route.value
  const previous = lastView.value
  return !member.value && requiresMember(previous) ? homeRoute : previous
})
watch([() => viewRoute.value.path === '/' || /^\/platforms(?:\/\d+)?$/.test(viewRoute.value.path), () => member.value?.id], async ([needsBindings, memberId], _, onCleanup) => {
  cardBindings.value = null
  if (!needsBindings || memberId == null) return
  const controller = new AbortController()
  const { signal } = controller
  onCleanup(() => controller.abort())
  try {
    const bindings = new Map()
    for (let page = 1; ; page += 1) {
      const result = await api('/platform-bindings?page=' + page, { signal })
      for (const item of result.data) bindings.set(String(item.platform_id), item.id)
      if (page >= result.last_page) break
    }
    if (!signal.aborted) cardBindings.value = bindings
  } catch {
    // Public cards stay usable if the member's bindings cannot be read.
  }
}, { immediate: true })
const viewConfiguration = computed(() => pages.find(([pattern]) => pattern.test(viewRoute.value.path)))
const page = computed(() => viewConfiguration.value?.[2])
const requiresSession = computed(() => requiresMember(route.value))
const title = computed(() => t(authTitles[route.value.path] || pageTitle(viewRoute.value, viewConfiguration.value)))
const viewTitle = computed(() => t(pageTitle(viewRoute.value, viewConfiguration.value)))
const navActive = computed(() => navbar[viewRoute.value.path])
const recordsLinks = {
  '/cash-wallet': ['/withdrawal-history', '提现记录'],
  '/cash-wallet/withdraw': ['/withdrawal-history', '提现记录'],
  '/cashback': ['/cashback/records', '返利记录'],
  '/points': ['/cashback/records', '返利记录'],
  '/protection': ['/protection/claims', '申诉记录'],
}
const recordsLink = computed(() => recordsLinks[viewRoute.value.path])
const ready = computed(() => !requiresSession.value || (sessionState.value === 'ready' && Boolean(member.value)))
const viewReady = computed(() => (auth.value || ready.value) &&
  (viewRoute.value.path !== '/support' || sessionState.value === 'ready'))
const cachedView = computed(() => page.value === ContentPages && !viewRoute.value.params.id)
function requiresMember(value) {
  return pages.some(([pattern, , , protectedPage]) => protectedPage === true && pattern.test(value.path))
    || (value.path === '/' && value.query.get('tab') === 'favorites')
}
function pageTitle(value, entry) {
  return value.path === '/support' ? copy.value.support : entry?.[1] || '页面未找到'
}
function switchAuth(path) {
  if (path !== route.value.path) go(path + (route.value.query.size ? '?' + route.value.query : ''), { replace: true })
}
watch([route, ready], ([current, available]) => {
  if (!auth.value && available) lastView.value = current
}, { flush: 'sync', immediate: true })
watch([auth, authDialog], ([open, dialog], _, onCleanup) => {
  if (!open || !dialog) return
  const unlock = lockPageScroll()
  dialog.showModal()
  const viewport = window.visualViewport
  const body = dialog.querySelector('.auth-sheet-body')
  let frame

  function fitToViewport() {
    if (viewport) {
      const root = document.documentElement
      const offset = viewport.offsetTop
      const bottom = Math.max(0, root.clientHeight - viewport.height - offset)
      root.style.setProperty('--auth-viewport-top', offset + 'px')
      dialog.style.setProperty('--auth-viewport-bottom', bottom + 'px')
      dialog.style.setProperty('--auth-viewport-height', viewport.height + 'px')
    }

    const field = document.activeElement
    if (!body.contains(field) || !field.matches('input, textarea, select')) return
    const fieldRect = field.getBoundingClientRect()
    const bounds = body.getBoundingClientRect()
    if (fieldRect.bottom > bounds.bottom - 8) body.scrollTop += fieldRect.bottom - bounds.bottom + 8
    else if (fieldRect.top < bounds.top + 8) body.scrollTop -= bounds.top + 8 - fieldRect.top
  }

  function scheduleFit() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(fitToViewport)
  }

  window.addEventListener('resize', scheduleFit)
  viewport?.addEventListener('resize', scheduleFit)
  viewport?.addEventListener('scroll', scheduleFit)
  dialog.addEventListener('focusin', scheduleFit)
  fitToViewport()

  onCleanup(() => {
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', scheduleFit)
    viewport?.removeEventListener('resize', scheduleFit)
    viewport?.removeEventListener('scroll', scheduleFit)
    dialog.removeEventListener('focusin', scheduleFit)
    dialog.close()
    document.documentElement.style.removeProperty('--auth-viewport-top')
    dialog.style.removeProperty('--auth-viewport-bottom')
    dialog.style.removeProperty('--auth-viewport-height')
    unlock()
  })
}, { flush: 'post' })
const loginPath = (next = route.value.fullPath) => '/login?' + new URLSearchParams({ next })
watchNotice(sessionError, '账户状态提醒', 'error')
watchNotice(accountNotice, '密码已更新', 'success')

watch(language, locale => {
  document.documentElement.lang = locale
  try { localStorage.setItem('cash-club-language', locale) } catch {}
}, { immediate: true })

watch([route, sessionState, member], () => {
  if (requiresSession.value && sessionState.value === 'ready' && !member.value) {
    go(loginPath(), { replace: true })
  }
}, { immediate: true })

watch([route, title, language], () => {
  document.title = route.value.path === '/' ? '返利网' : title.value + t(' · 返利网')
}, { immediate: true })

watch(route, async (current, previous) => {
  if (current.path === '/member' && previous && member.value) refreshMember()
  if (route.value.path !== '/login') accountNotice.value = ''
  await nextTick()
  if (!auth.value) restoreScroll()
}, { immediate: true })

async function refreshMember() {
  const attempt = ++sessionVersion
  sessionError.value = ''
  try {
    const profile = await api('/auth/me')
    if (attempt !== sessionVersion) return
    member.value = profile
    sessionState.value = 'ready'
  } catch (failure) {
    if (attempt !== sessionVersion) return
    if (failure.status === 401 || failure.status === 403) member.value = null
    sessionState.value = failure.status === 401 || failure.status === 403 || member.value ? 'ready' : 'error'
    if (sessionState.value === 'error') sessionError.value = '暂时无法确认登录状态，请重试。'
  }
}

function signedIn(profile, path) {
  sessionVersion++
  member.value = profile
  sessionState.value = 'ready'
  authPhone.value = ''
  resume(safePath(path, '/member'))
}

function sessionExpired() {
  sessionVersion++
  member.value = null
  sessionState.value = 'ready'
}

async function logout() {
  sessionError.value = ''
  try {
    await api('/auth/logout', { method: 'POST' })
    sessionExpired()
    authPhone.value = ''
    go('/', { replace: true })
  } catch (error) {
    if (error.status === 401) sessionExpired()
    else sessionError.value = error.message
  }
}

function passwordReset(path) {
  sessionExpired()
  go(loginPath(path), { replace: true })
  nextTick(() => { accountNotice.value = '密码已更新，请重新登录。' })
}

function fallback() {
  const path = route.value.path
  if (path.includes('/reviews/new') || path.endsWith('/protection') && route.value.params.id) return '/platforms/' + route.value.params.id
  if (path.startsWith('/platforms/')) return '/platforms'
  if (path.startsWith('/shop/redemptions/')) return '/shop/redemptions'
  if (path.startsWith('/shop/')) return '/shop'
  if (path.startsWith('/cashback/')) return '/cashback'
  if (path.startsWith('/bindings/')) return '/binding'
  if (/^\/protection\/claims\/\d+$/.test(path)) return '/protection/claims'
  if (path.startsWith('/protection/')) return '/protection'
  if (path.startsWith('/red-packets/')) return '/red-packets'
  if (path.startsWith('/help/')) return '/help'
  if (path.startsWith('/announcements/')) return '/announcements'
  if (requiresSession.value) return '/member'
  return '/'
}

onMounted(() => {
  window.addEventListener('cash-club-session-expired', sessionExpired)
  refreshMember()
})
onBeforeUnmount(() => window.removeEventListener('cash-club-session-expired', sessionExpired))
</script>

<template>
  <HomePage v-if="viewRoute.path === '/' && viewReady" :route="viewRoute" :language="language" :copy="copy" :member="member" :card-bindings="cardBindings"
            @language="language = $event" />
  <template v-else>
    <header v-if="viewRoute.path !== '/support'" class="page-topbar">
      <div class="wrap page-header" :class="{ 'has-page-action': viewRoute.path === '/rescue-fund', 'has-records-link': recordsLink }">
        <button class="page-back" :aria-label="t('返回')" @click="back(fallback())">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>
        </button>
        <h1>{{ viewRoute.path === '/' ? copy.favorites : viewTitle }}</h1>
        <div v-if="viewRoute.path === '/rescue-fund'" id="rescue-fund-actions" class="page-action"></div>
        <a v-else-if="recordsLink" class="page-action page-records-link" :href="'#' + recordsLink[0]"
           @click.prevent="go(recordsLink[0])">{{ t(recordsLink[1]) }}</a>
        <a v-else class="page-home" href="#/" :aria-label="t('返回首页')" @click.prevent="go('/')">✦</a>
      </div>
    </header>
    <main class="wrap screen" :class="{ 'with-navigation': navActive, 'support-screen': viewRoute.path === '/support' }">
      <template v-if="!viewReady">
        <div v-if="sessionState === 'error'" class="state"><button class="text-button" @click="refreshMember">{{ t('重试') }}</button></div>
      </template>
      <template v-else>
        <SupportChat v-if="viewRoute.path === '/support'" :key="(member?.id ?? 'guest') + ':' + language" :language="language" :topic="viewRoute.query.get('topic')"
                     @follow="go" @account="go($event || '/member')" @back="back('/')" />
        <KeepAlive :max="8">
          <component :is="page" v-if="cachedView" :key="viewRoute.fullPath" :route="viewRoute" :language="language" />
        </KeepAlive>
        <component :is="page" v-if="page && !cachedView" :key="viewRoute.path" :route="viewRoute" :member="member" :language="language"
                   v-bind="page === PlatformPages ? { cardBindings } : {}"
                   @logout="logout" @refresh-member="refreshMember" />
        <div v-else-if="!page && viewRoute.path !== '/support'" class="state">
          <p>{{ t('这个页面不存在。') }}</p><button class="text-button" @click="go('/')">{{ t('返回首页') }}</button>
        </div>
      </template>
    </main>
  </template>

  <nav v-if="navActive" class="bottom-nav" :class="{ 'home-bottom-nav': navActive === 'home' }" :aria-label="t('底部导航')">
    <button v-for="(icon, path) in navbar" :key="path" :aria-current="navActive === icon ? 'page' : undefined" @click="go(path)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="icons[icon]"/></svg>
      {{ copy[icon] }}
    </button>
  </nav>
  <dialog ref="authDialog" class="auth-sheet" :aria-label="title" @cancel.prevent="back('/')" @click.self="back('/')">
    <div class="auth-sheet-panel">
      <header class="auth-sheet-heading">
        <div class="auth-sheet-tabs" role="group" :aria-label="t('会员登录')">
          <button v-for="[path, label] in [['/login', '登录'], ['/register', '注册']]" :key="path"
                  type="button" :aria-pressed="route.path === path" @click="switchAuth(path)">{{ t(label) }}</button>
        </div>
        <button class="auth-sheet-close" type="button" :aria-label="t('关闭')" autofocus @click="back('/')">×</button>
      </header>
      <div class="auth-sheet-body">
        <h2 v-if="route.path === '/reset-password'" class="auth-sheet-title">{{ title }}</h2>
        <AuthPages v-if="auth" :key="route.path" :route="route" :member="member" :draft-phone="authPhone"
                   @phone="authPhone = $event" @signed-in="signedIn" @reset="passwordReset" @change="switchAuth" />
      </div>
    </div>
  </dialog>
  <DataLoading :language="language" />
  <FeedbackDialog :language="language" />
</template>
