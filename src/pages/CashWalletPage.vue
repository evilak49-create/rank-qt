<script setup>
import { createRequestId } from '../requestId.js'
import { useLocale } from '../locale.js'
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { showNotice, watchNotice } from '../feedback'
import { formatBrl, parseBrl } from '../money'
import { currentRoute, go } from '../navigation'
import MemberPagination from './MemberPagination.vue'

const { locale, t } = useLocale()

const props = defineProps({ member: Object })
const emit = defineEmits(['refresh-member'])
const wallet = ref(null)
const history = ref(null)
const amount = ref('')
const error = ref('')
const loading = ref(true)
const pending = ref(false)
const cents = computed(() => parseBrl(amount.value))
const busy = computed(() => loading.value || pending.value)
const attemptKey = 'cash-club:cash-withdrawal:' + props.member.id
const attempt = ref(null)
try {
  const previous = JSON.parse(sessionStorage.getItem(attemptKey) || 'null')
  if (Number.isSafeInteger(previous?.amount) && previous.amount > 0 && typeof previous.id === 'string') {
    attempt.value = previous
    const digits = String(previous.amount).padStart(3, '0')
    amount.value = digits.slice(0, -2) + ',' + digits.slice(-2)
  }
} catch {}
const canSubmit = computed(() => Boolean(attempt.value || (
  wallet.value?.cpf && cents.value && cents.value <= wallet.value.available_balance_cents
)))

const statuses = {
  pending: '待审核', processing: '出款处理中', unresolved: '结果待确认',
  paid: '已到账', failed: '出款失败，已退回', rejected: '已驳回，已退回', cancelled: '已取消，款项已退回',
}

function showError(failure) {
  error.value = Object.values(failure.errors ?? {}).flat()[0] || failure.message
}

async function load(page = 1) {
  loading.value = true
  error.value = ''
  try {
    const [summary, orders] = await Promise.allSettled([
      api('/cash-wallet', { fresh: true }),
      api('/cash-wallet/withdrawals?page=' + page, { fresh: true }),
    ])
    if (summary.status === 'fulfilled') wallet.value = summary.value.data
    if (orders.status === 'fulfilled') history.value = orders.value
    if (summary.status === 'rejected') throw summary.reason
    if (orders.status === 'rejected') throw orders.reason
  } catch (failure) {
    showError(failure)
  } finally {
    loading.value = false
  }
}

function clearAttempt() {
  attempt.value = null
  try { sessionStorage.removeItem(attemptKey) } catch {}
}

async function submit() {
  if (busy.value || !wallet.value || !canSubmit.value) return
  const requested = attempt.value?.amount ?? cents.value
  const routeKey = currentRoute.value.key
  pending.value = true
  error.value = ''
  let submitted = false
  try {
    if (!attempt.value) {
      const displayedCpf = wallet.value.cpf
      wallet.value = (await api('/cash-wallet', { fresh: true })).data
      if (currentRoute.value.key !== routeKey) return
      if (wallet.value.cpf !== displayedCpf) throw new Error('Pix 收款账户已更新，请核对后重新确认。')
      if (requested > wallet.value.available_balance_cents) throw new Error('可用余额已更新，请重新输入提现金额。')
      attempt.value = { amount: requested, id: createRequestId() }
      try { sessionStorage.setItem(attemptKey, JSON.stringify(attempt.value)) } catch {}
    }
    submitted = true
    await api('/cash-wallet/withdrawals', { body: { request_id: attempt.value.id, amount_cents: requested } })
    clearAttempt()
    amount.value = ''
    showNotice('提现申请已提交', '请在下方查看审核进度。', 'success')
    emit('refresh-member')
    await load()
  } catch (failure) {
    if (submitted && [400, 403, 404, 409, 422].includes(failure.status)) clearAttempt()
    showError(failure)
  } finally {
    pending.value = false
  }
}

onMounted(() => load())
watchNotice(error, '余额提现提醒', 'error')
</script>

<template>
  <div class="stack" :aria-busy="busy">
    <button v-if="error && !pending" type="button" class="quiet" :disabled="loading" @click="load()">{{ t('刷新余额与记录') }}</button>

    <section v-if="wallet" class="surface stack">
      <dl class="summary-list">
        <div><dt>{{ t('可用余额') }}</dt><dd>{{ formatBrl(wallet.available_balance_cents) }}</dd></div>
        <div v-if="wallet.held_balance_cents > 0"><dt>{{ t('提现处理中') }}</dt><dd>{{ formatBrl(wallet.held_balance_cents) }}</dd></div>
        <div v-if="wallet.cpf"><dt>{{ t('Pix 收款账户') }}</dt><dd>{{ wallet.cpf }}</dd></div>
      </dl>
      <button v-if="!wallet.cpf && !attempt" type="button" class="primary" @click="go('/pix?next=%2Fcash-wallet%2Fwithdraw')">{{ t('绑定 Pix 收款账户') }}</button>
      <form v-else class="stack" @submit.prevent="submit">
        <label class="field">{{ t('提现金额（BRL）') }}
          <input v-model="amount" maxlength="18" inputmode="decimal" autocomplete="off" :disabled="busy || !!attempt" required>
        </label>
        <p v-if="!attempt && amount && (!cents || cents > wallet.available_balance_cents)" class="muted">{{ t('请输入不超过可用余额的金额，最多两位小数。') }}</p>
        <button class="primary" :disabled="busy || !canSubmit">{{ t('确认申请提现') }}</button>
      </form>
    </section>

    <section v-if="history" class="surface stack">
      <div class="member-actions">
        <h2>{{ t('余额提现记录') }}</h2>
        <button class="quiet" type="button" @click="go('/withdrawal-history')">{{ t('全部提现订单') }}</button>
      </div>
      <p v-if="!history.data.length" class="muted">{{ t('暂无余额提现记录。') }}</p>
      <article v-for="order in history.data" :key="order.id" class="stack">
        <strong>{{ formatBrl(order.amount_cents) }} · {{ t(order.rejection_deducted ? '已拒绝，款项已扣除' : statuses[order.status]) || order.status }}</strong>
        <time class="muted" :datetime="order.created_at">{{ new Date(order.created_at).toLocaleString(locale) }}</time>
        <p v-if="order.review_reason">{{ order.review_reason }}</p>
      </article>
      <MemberPagination :page="history" :busy="busy" @page="load" />
    </section>
  </div>
</template>
