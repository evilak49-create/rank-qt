<script setup>
import { useLocale } from '../locale.js'
import { formatBrl } from '../money'
import { go } from '../navigation'
import { icons } from '../icons'
import MemberAvatar from './MemberAvatar.vue'

const { t } = useLocale()

defineProps({ route: Object, member: Object })
const emit = defineEmits(['logout'])
const quickLinks = [
  ['/binding', '绑定平台', icons.bind],
  ['/cashback', '现金返利', icons.cashWallet],
  ['/rescue-fund', '救援金', icons.protection],
]
const accountLinks = [
  ['/shop/redemptions', '兑换记录', icons.shop],
  ['/withdrawal-history', '提现订单', 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6m-6 4h6'],
  ['/protection', '我的保障', icons.protection],
  ['/help', '帮助中心', icons.help],
  ['/fund-records', '资金记录', 'M5 4h14v16H5zM8 8h8m-8 4h8m-8 4h4'],
  ['/pix', '收款账户', 'M4 5h16v14H4zM4 10h16m-12 5h3'],
]
</script>

<template>
  <div class="member-page profile-page">
    <section class="profile-balance">
      <div class="member-account-head">
        <MemberAvatar :account-id="member?.id" />
        <strong>{{ member?.phone || '—' }}</strong>
      </div>
      <div class="profile-balance-grid">
        <section class="profile-asset profile-cash-balance">
          <h2>{{ t('可用余额') }}</h2>
          <strong>{{ formatBrl(member?.available_balance_cents) }}</strong>
          <button class="primary" type="button" @click="go('/cash-wallet/withdraw')">{{ t('提现') }}</button>
        </section>
      </div>
    </section>

    <nav class="profile-section surface" :aria-label="t('常用功能')">
      <h2>{{ t('常用功能') }}</h2>
      <div class="profile-shortcuts">
        <button v-for="[link, label, icon] in quickLinks" :key="link" :data-shortcut="link" @click="go(link)">
          <span class="profile-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path :d="icon"/></svg></span>
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
  </div>
</template>
