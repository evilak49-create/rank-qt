<script setup>
import { useLocale } from '../locale.js'
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { formatBrl } from '../money'
import { currentRoute, go, resume, safePath } from '../navigation'
import { icons } from '../icons'
import MemberPagination from './MemberPagination.vue'
import CheckinCard from './CheckinCard.vue'
import MemberAvatar from './MemberAvatar.vue'

const { locale, t } = useLocale()

const props = defineProps({ route: Object, member: Object })
const emit = defineEmits(['logout'])
const path = props.route.path
const query = props.route.query
const destination = safePath(query.get('next'), '')
const isWallet = path === '/wallet'
const isAddress = path === '/address'
const isCenter = path === '/member'
const direction = ['credit', 'debit'].includes(query.get('direction')) ? query.get('direction') : ''
const platformId = /^[1-9]\d*$/.test(query.get('platform_id') ?? '') ? query.get('platform_id') : ''
const loading = ref(!isCenter)
const error = ref('')
const working = ref(false)
const balance = ref(null)
const records = ref(null)
const entry = ref(null)
const address = ref(null)
const checkin = ref(null)
const edit = ref(null)
const message = ref('')
const fields = [
  ['recipient', '收件人', 'name', 120], ['phone', '联系电话', 'tel', 20],
  ['postal_code', '邮编（CEP）', 'postal-code', 9], ['state', '州', 'address-level1', 2],
  ['city', '城市', 'address-level2', 120], ['district', '街区', 'address-level3', 120],
  ['street', '街道', 'street-address', 200], ['number', '门牌号', 'off', 32],
  ['complement', '地址补充信息（选填）', 'address-line2', 200],
]
const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const shieldIcon = 'M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Z M9 12l2 2 4-4'
const quickLinks = [
  ['/red-packets', '我的红包', icons.redPackets, 'red'],
  ['/protection', '我的保障', shieldIcon, 'mint'],
  ['/shop/redemptions', '兑换记录', icons.shop, 'gold'],
]
const accountLinks = [
  ['/bindings', '已绑定平台', icons.bind],
  ['/withdrawal-history', '提现订单', 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6m-6 4h6'],
  ['/address', '收货地址', 'M20 10c0 5-8 10-8 10S4 15 4 10a8 8 0 1 1 16 0ZM14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z'],
  ['/pix', '收款账户', 'M4 5h16v14H4zM4 10h16m-12 5h3'],
]
const entryStatuses = {
  confirmed: '已到账', pending: '待处理', shipped: '已发货', cancelled: '已取消', processing: '处理中',
  paid: '已到账', rejected: '未通过', failed: '未成功', unresolved: '结果待确认', expired: '已过期',
}
const relatedPath = computed(() => {
  const related = entry.value?.related
  if (!related) return ''
  if (related.type === 'deposit') return '/points/quotes/' + related.id
  const type = related.type === 'shop_order' ? 'goods' : 'funds'
  return '/shop/redemptions/' + related.id + '?type=' + type
})
function date(value) {
  return value ? new Date(value).toLocaleString(locale.value) : '—'
}

function showError(failure) {
  error.value = Object.values(failure.errors ?? {}).flat()[0] || failure.message
}

function walletQuery(nextDirection, page, nextPlatform = platformId) {
  const params = new URLSearchParams()
  if (nextDirection) params.set('direction', nextDirection)
  if (nextPlatform) params.set('platform_id', nextPlatform)
  if (page > 1) params.set('page', page)
  return params.toString()
}

function walletPage(nextDirection, page = 1, nextPlatform = platformId) {
  const params = walletQuery(nextDirection, page, nextPlatform)
  go('/wallet' + (params ? '?' + params : ''), { replace: true })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (isCenter) checkin.value = (await api('/check-in')).data
    else if (isAddress) address.value = (await api('/shipping-address')).data
    else if (isWallet) {
      const [wallet, page] = await Promise.all([
        api('/wallet'), api('/wallet/entries?' + walletQuery(direction, Number(query.get('page')) || 1)),
      ])
      balance.value = wallet.data.points_balance
      records.value = page
    } else entry.value = (await api('/wallet/entries/' + props.route.params.id)).data
  } catch (failure) {
    showError(failure)
  } finally {
    loading.value = false
  }
}

async function editAddress() {
  if (working.value) return
  working.value = true
  error.value = ''
  message.value = ''
  try {
    const current = address.value ? (await api('/shipping-address?for_edit=1')).data : null
    edit.value = Object.fromEntries(fields.map(([key]) => [key, current?.[key] ?? '']))
  } catch (failure) {
    showError(failure)
  } finally {
    working.value = false
  }
}

async function saveAddress() {
  if (working.value) return
  working.value = true
  error.value = ''
  try {
    address.value = (await api('/shipping-address', { method: 'PUT', body: { ...edit.value } })).data
    edit.value = null
    if (destination && currentRoute.value.key === props.route.key) resume(destination)
    else message.value = '收货地址已保存。'
  } catch (failure) {
    showError(failure)
  } finally {
    working.value = false
  }
}

onMounted(load)

import { watchNotice } from '../feedback'
watchNotice(error, () => isCenter ? '签到状态加载失败' : isAddress ? '收货地址提醒' : '积分钱包提醒', 'error')
watchNotice(message, '收货地址已保存', 'success')
</script>

<template>
  <div class="member-page" :class="{ 'profile-page': isCenter }" :aria-busy="loading">
    <template v-if="isCenter">
      <section class="profile-balance">
        <div class="member-account-head">
          <MemberAvatar :account-id="member?.id" />
          <strong>{{ member?.phone || '—' }}</strong>
        </div>
        <div class="profile-balance-grid">
          <section class="profile-asset">
            <h2>{{ t('可用积分') }}</h2>
            <strong class="profile-points">{{ member?.points_balance ?? '—' }}</strong>
            <button class="quiet" type="button" @click="go('/wallet')">{{ t('积分钱包') }}</button>
          </section>
          <section class="profile-asset profile-cash-balance">
            <h2>{{ t('可用余额') }}</h2>
            <strong>{{ formatBrl(member?.available_balance_cents) }}</strong>
            <button class="primary" type="button" @click="go('/cash-wallet/withdraw')">{{ t('提现') }}</button>
          </section>
        </div>
      </section>

      <CheckinCard entry :state="checkin" @action="go('/check-in')" />

      <nav class="profile-section surface" :aria-label="t('常用功能')">
        <h2>{{ t('常用功能') }}</h2>
        <div class="profile-shortcuts">
          <button v-for="[link, label, icon, color] in quickLinks" :key="link" @click="go(link)">
            <span class="profile-icon" :data-color="color" aria-hidden="true"><svg viewBox="0 0 24 24"><path :d="icon"/></svg></span>
            {{ t(label) }}
          </button>
        </div>
      </nav>
      <nav class="profile-section surface" :aria-label="t('账户管理')">
        <h2>{{ t('账户管理') }}</h2>
        <ul class="profile-menu">
          <li v-for="[link, label, icon] in accountLinks" :key="link">
            <button @click="go(link)"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="icon"/></svg>{{ t(label) }}<span aria-hidden="true">›</span></button>
          </li>
        </ul>
      </nav>
      <section class="profile-section surface">
        <h2>{{ t('账户安全') }}</h2>
        <ul class="profile-menu"><li><button @click="go('/reset-password')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></svg>{{ t('修改密码') }}<span aria-hidden="true">›</span></button></li></ul>
      </section>
      <button class="profile-logout quiet" @click="emit('logout')">{{ t('退出登录') }}</button>
    </template>

    <template v-else-if="isWallet">
      <section class="surface member-hero stack">
        <p>{{ t('可用积分') }}</p><strong>{{ balance ?? '—' }}</strong>
        <div class="member-actions">
          <button class="primary" @click="go('/points')">{{ t('兑换积分') }}</button>
          <button class="quiet" @click="go('/shop')">{{ t('去商城') }}</button>
        </div>
      </section>
      <section class="surface stack">
        <h2>{{ t('积分明细') }}</h2>
        <div class="segmented" :aria-label="t('积分明细筛选')">
          <button v-for="[key, label] in [['', t('全部')], ['credit', t('获得')], ['debit', t('支出')]]"
            :key="key" :aria-pressed="direction === key" @click="walletPage(key)">{{ t(label) }}</button>
        </div>
        <div v-if="platformId" class="member-actions">
          <span class="muted">{{ t('当前按平台筛选') }}</span>
          <button class="quiet" @click="walletPage(direction, 1, '')">{{ t('清除平台筛选') }}</button>
        </div>
        <ul v-if="records?.data.length" class="row-list">
          <li v-for="record in records.data" :key="record.id">
            <button @click="go('/wallet/' + record.id)">
              <span><strong>{{ t(record.source_label) }}</strong><small>{{ date(record.created_at) }}</small></span>
              <span :class="{ 'member-positive': record.direction === 'credit' }">{{ record.direction === 'credit' ? '+' : '−' }}{{ record.amount }} {{ t('积分 ›') }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="records" class="muted">{{ t('暂无积分明细。') }}</p>
        <MemberPagination :page="records" :busy="loading" @page="walletPage(direction, $event)" />
      </section>
    </template>

    <section v-else-if="isAddress" class="stack">
      <form v-if="edit" class="surface stack" @submit.prevent="saveAddress">
        <label v-for="[key, label, autocomplete, maxlength] in fields" :key="key" class="field">
          {{ t(label) }}
          <select v-if="key === 'state'" v-model="edit.state" required :autocomplete="autocomplete" :disabled="working">
            <option value="">{{ t('选择州') }}</option><option v-for="state in states" :key="state">{{ state }}</option>
          </select>
          <input v-else v-model.trim="edit[key]" :type="key === 'phone' ? 'tel' : 'text'"
            :inputmode="key === 'postal_code' ? 'numeric' : undefined" :required="key !== 'complement'"
            :maxlength="maxlength" :autocomplete="autocomplete" :disabled="working">
        </label>
        <div class="member-actions centered-actions">
          <button class="primary" :disabled="working">{{ t('保存地址') }}</button>
          <button class="quiet" type="button" :disabled="working" @click="edit = null; error = ''">{{ t('取消') }}</button>
        </div>
      </form>
      <template v-else-if="!loading">
        <div v-if="address || !error" class="surface stack">
          <template v-if="address">
            <p>{{ address.recipient }} · {{ address.masked_phone }}</p>
            <p class="muted">{{ address.street }} {{ address.number }} · {{ address.district }}<br>
              {{ address.city }} / {{ address.state }} · CEP {{ address.postal_code }}<br v-if="address.complement">
              {{ address.complement }}</p>
          </template>
          <p v-else class="muted">{{ t('暂无收货地址。') }}</p>
        </div>
        <button v-if="address || !error || working" class="primary" :disabled="working" @click="editAddress">{{ address ? t('编辑') : t('添加收货地址') }}</button>
      </template>
    </section>

    <section v-else-if="entry" class="surface stack">
      <h2>{{ t(entry.source_label) }}</h2>
      <dl class="member-definition">
        <div><dt>{{ t('积分变动') }}</dt><dd>{{ entry.direction === 'credit' ? '+' : '−' }}{{ entry.amount }} {{ t('积分') }}</dd></div>
        <div><dt>{{ t('变动前余额') }}</dt><dd>{{ entry.balance_before }}</dd></div>
        <div><dt>{{ t('变动后余额') }}</dt><dd>{{ entry.balance_after }}</dd></div>
        <div><dt>{{ t('时间') }}</dt><dd>{{ date(entry.created_at) }}</dd></div>
        <div v-if="entry.related?.name"><dt>{{ t('平台或商品') }}</dt><dd>{{ entry.related.name }}</dd></div>
        <div v-if="entry.related?.status"><dt>{{ t('处理状态') }}</dt><dd>{{ t(entryStatuses[entry.related.status]) || entry.related.status }}</dd></div>
      </dl>
      <button v-if="relatedPath" class="quiet" @click="go(relatedPath)">{{ t('查看关联兑换记录') }}</button>
    </section>

    <div v-if="error" class="stack">
      <button v-if="!edit && !working" class="quiet" @click="load">{{ t('重新加载') }}</button>
    </div>
  </div>
</template>
