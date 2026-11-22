
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from './api'
import { provideLocale } from './locale.js'
import HomePage from './HomePage.vue'
import DataLoading from './DataLoading.vue'
import FeedbackDialog from './FeedbackDialog.vue'
import { watchNotice } from './feedback'
import SupportChat from './SupportChat.vue'
import { homeCopy } from './homeCopy'
import { icons } from './icons'
import { back, currentRoute, go, restoreScroll, resume, safePath } from './navigation'
import AuthPages from './pages/AuthPages.vue'
import ContentPages from './pages/ContentPages.vue'
import PointQuotePage from './pages/PointQuotePage.vue'
import CashWalletPage from './pages/CashWalletPage.vue'
import WithdrawalHistoryPage from './pages/WithdrawalHistoryPage.vue'
import PlatformPages from './pages/PlatformPages.vue'
import ShopPages from './pages/ShopPages.vue'
import MemberPages from './pages/MemberPages.vue'
import CheckinPage from './pages/CheckinPage.vue'

const route = currentRoute
const member = ref(null)
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
  [/^\/points$/, '兑换积分与返利', PlatformPages, true],
  [/^\/points\/quotes\/\d+$/, '存款换积分详情', PointQuotePage, true],
  [/^\/bindings$/, '已绑定平台', PlatformPages, true],
  [/^\/bindings\/\d+$/, '绑定详情', PlatformPages, true],
  [/^\/shop$/, '积分商城', ShopPages],
  [/^\/shop\/products\/\d+$/, '商品详情', ShopPages],
  [/^\/shop\/funds\/\d+$/, '平台资金兑换', ShopPages, true],
  [/^\/shop\/redemptions$/, '商城兑换记录', ShopPages, true],
  [/^\/shop\/redemptions\/\d+$/, '兑换详情', ShopPages, true],
  [/^\/member$/, '个人中心', MemberPages, true],
  [/^\/check-in$/, '每日签到', CheckinPage, true],
  [/^\/wallet$/, '积分钱包', MemberPages, true],
  [/^\/cash-wallet(?:\/withdraw)?$/, '余额提现', CashWalletPage, true],
  [/^\/withdrawal-history$/, '提现订单', WithdrawalHistoryPage, true],
  [/^\/wallet\/\d+$/, '积分明细', MemberPages, true],
  [/^\/address$/, '收货地址', MemberPages, true],
  [/^\/pix$/, 'Pix 收款账户', MemberPages, true],
  [/^\/protection$/, '我的保障', MemberPages, true],
  [/^\/protection\/bindings\/\d+\/terms$/, '保障条款', MemberPages, true],
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
const configuration = computed(() => pages.find(([pattern]) => pattern.test(route.value.path)))
const page = computed(() => configuration.value?.[2])
const requiresSession = computed(() => configuration.value?.[3] === true
  || (route.value.path === '/' && route.value.query.get('tab') === 'favorites'))
const auth = computed(() => Object.hasOwn(authTitles, route.value.path))
const title = computed(() => t(authTitles[route.value.path] || (route.value.path === '/support' ? copy.value.support : configuration.value?.[1]) || '页面未找到'))
const navActive = computed(() => navbar[route.value.path])
const ready = computed(() => !requiresSession.value || (sessionState.value === 'ready' && Boolean(member.value)))
const cachedView = computed(() => page.value === ContentPages && !route.value.params.id)
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
  restoreScroll()
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
  if (path.startsWith('/shop/redemptions/')) return '/shop/redemptions'
  if (path.startsWith('/shop/')) return '/shop'
  if (path.includes('/reviews/new') || path.endsWith('/protection') && route.value.params.id) return '/platforms/' + route.value.params.id
  if (path.startsWith('/platforms/')) return '/platforms'
  if (path.startsWith('/bindings/')) return '/bindings'
  if (path.startsWith('/points/quotes/')) return '/wallet'
  if (path.startsWith('/wallet/')) return '/wallet'
  if (path.startsWith('/protection/')) return '/protection'
  if (path.startsWith('/red-packets/')) return '/red-packets'
  if (path.startsWith('/help/')) return '/help'
  if (path.startsWith('/announcements/')) return '/announcements'
  if (configuration.value?.[3]) return '/member'
  return '/'
}

onMounted(() => {
  window.addEventListener('cash-club-session-expired', sessionExpired)
  refreshMember()
})
onBeforeUnmount(() => window.removeEventListener('cash-club-session-expired', sessionExpired))
</script>

<template>
  <HomePage v-if="route.path === '/' && ready" :route="route" :language="language" :copy="copy" :member="member"
            @language="language = $event" />
  <template v-else>
    <header v-if="route.path !== '/support'" class="page-topbar">
      <div class="wrap page-header">
        <button class="page-back" :aria-label="t('返回')" @click="back(fallback())">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>
        </button>
        <h1>{{ route.path === '/' ? copy.favorites : title }}</h1>
        <a class="page-home" href="#/" :aria-label="t('返回首页')" @click.prevent="go('/')">✦</a>
      </div>
    </header>
    <main class="wrap screen" :class="{ 'with-navigation': navActive, 'support-screen': route.path === '/support' }">
      <template v-if="!ready">
        <div v-if="sessionState === 'error'" class="state"><button class="text-button" @click="refreshMember">{{ t('重试') }}</button></div>
      </template>
      <template v-else>
        <AuthPages v-if="auth" :key="route.path" :route="route" :member="member" :draft-phone="authPhone"
                   @phone="authPhone = $event" @signed-in="signedIn" @reset="passwordReset" />
        <KeepAlive>
          <SupportChat v-if="route.path === '/support'" :key="language" :language="language" :topic="route.query.get('topic')"
                       @follow="go" @account="go($event || '/member')" @back="back('/')" />
        </KeepAlive>
        <KeepAlive :max="8">
          <component :is="page" v-if="cachedView" :key="route.fullPath" :route="route" :language="language" />
        </KeepAlive>
        <component :is="page" v-if="page && !cachedView" :key="route.path" :route="route" :member="member" :language="language"
                   @logout="logout" @refresh-member="refreshMember" @credited="refreshMember" />
        <div v-else-if="!page && !auth && route.path !== '/support'" class="state">
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
  <DataLoading :language="language" />
  <FeedbackDialog :language="language" />
</template>
