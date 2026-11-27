<script setup>
import EmptyState from '../EmptyState.vue'
import { createRequestId } from '../requestId.js'
import { useLocale } from '../locale.js'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../api'
import { icons } from '../icons'
import { currentRoute, go, resume, safePath } from '../navigation'
import MemberPagination from './MemberPagination.vue'
import packetClosed from '../assets/red-packet-closed.png'
import packetOpened from '../assets/red-packet-opened.png'

const { locale, t } = useLocale()

const props = defineProps({ route: Object, member: Object })
const path = props.route.path
const home = '/red-packets'
const withdraw = home + '/withdraw'
const isHome = path === home
const isInvites = path === home + '/invites'
const isWithdraw = path === withdraw
const isPix = path === '/pix'
const next = safePath(props.route.query.get('next'), '')
const loading = ref(true)
const working = ref(false)
const error = ref('')
const info = ref('')
const packets = ref(null)
const records = ref(null)
const order = ref(null)
const account = ref(null)
const editing = ref(false)
const cpf = ref('')
const recipientName = ref('')
const pixComplete = computed(() => Boolean(account.value?.cpf && account.value?.recipient_name))
const inviteInput = ref(null)
const linkVisible = ref(false)
const reveal = ref(null)
let revealTimer
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const statuses = { pending: '待审核', processing: '处理中', paid: '已到账', rejected: '未通过', cancelled: '已取消，款项已退回', failed: '提现失败', unresolved: '结果待确认' }
const withdrawalStatusLabel = order => t(order.rejection_deducted ? '已拒绝，款项已扣除' : statuses[order.status]) || order.status
const round = computed(() => packets.value?.round)
const pageCopy = computed(() => packets.value?.page_copy)
const ready = computed(() => canWithdraw(round.value))
const inviteLink = computed(() => {
  const relative = packets.value?.invite_url
  if (typeof relative !== 'string') return ''
  try {
    const url = new URL(relative, location.origin)
    return url.origin === location.origin ? url.href : ''
  } catch {
    return ''
  }
})
const openKey = 'cash-club:red-packet-open:' + props.member?.id
const attempts = new Map()

function date(value, timeZone) {
  return value ? new Date(value).toLocaleString(locale.value, { timeZone }) : '—'
}

function money(value) {
  return currency.format(Number(value) / 100)
}

function canWithdraw(value) {
  return Boolean(value && !value.closed_at && value.remaining_cents <= 0 && value.frozen_cents === 0 && value.available_cents > 0)
}

function showError(failure) {
  error.value = Object.values(failure.errors ?? {}).flat()[0] || failure.message
}

function getAttempt(key) {
  try {
    const previous = sessionStorage.getItem(key)
    if (previous) return previous
  } catch {}
  if (attempts.has(key)) return attempts.get(key)
  const id = createRequestId()
  attempts.set(key, id)
  try { sessionStorage.setItem(key, id) } catch {}
  return id
}

function clearAttempt(key) {
  attempts.delete(key)
  try { sessionStorage.removeItem(key) } catch {}
}

function pageLink(page) {
  go(path + (page > 1 ? '?page=' + page : ''), { replace: true })
}

function bindPix() {
  if (currentRoute.value.key === props.route.key) {
    go('/pix?' + new URLSearchParams({ next: withdraw }), { replace: true })
  }
}

async function load() {
  error.value = ''
  loading.value = true
  const page = Number(props.route.query.get('page')) || 1
  try {
    if (isHome) {
      packets.value = (await api(home, { fresh: true })).data
      if (round.value) clearAttempt(openKey)
    } else if (isInvites) {
      records.value = await api(home + '/invites?page=' + page)
    } else if (isPix) {
      account.value = (await api('/pix-account')).data
      if ((next === '/cash-wallet/withdraw' || next === withdraw) && !pixComplete.value) editPix()
    } else if (isWithdraw) {
      const [activity, pix] = await Promise.all([api(home), api('/pix-account')])
      packets.value = activity.data
      account.value = pix.data
      if (ready.value && !pixComplete.value) bindPix()
    } else {
      order.value = (await api('/pix-withdrawals/' + props.route.params.id)).data
    }
  } catch (failure) {
    showError(failure)
  } finally {
    loading.value = false
  }
}

async function open() {
  if (working.value || round.value || !packets.value) return
  error.value = ''
  info.value = ''
  working.value = true
  try {
    const { data } = await api(home + '/open', { body: { request_id: getAttempt(openKey) } })
    clearAttempt(openKey)
    if (data.closed_at) {
      await load()
      return
    }
    if (currentRoute.value.key !== props.route.key) return
    function finish() {
      packets.value = { ...packets.value, round: data }
      info.value = t('已拆开红包，初始奖励 ') + money(data.initial_cents) + t('。', '.')
      reveal.value = null
      working.value = false
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish()
    else {
      reveal.value = data
      revealTimer = setTimeout(finish, 1550)
    }
  } catch (failure) {
    showError(failure)
  } finally {
    if (!reveal.value) working.value = false
  }
}

async function copyInvite() {
  if (!inviteLink.value) return
  info.value = ''
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    info.value = '邀请链接已复制。'
  } catch {
    info.value = '请选中并复制邀请链接。'
    linkVisible.value = true
    requestAnimationFrame(() => { inviteInput.value?.focus(); inviteInput.value?.select() })
  }
}

async function shareInvite() {
  if (!inviteLink.value) return
  if (navigator.share) {
    try { await navigator.share({ title: t(pageCopy.value?.opening_title || '现金红包邀请'), url: inviteLink.value }); return }
    catch (failure) { if (failure.name === 'AbortError') return }
  }
  linkVisible.value = true
  requestAnimationFrame(() => inviteInput.value?.focus())
}

function editPix() {
  cpf.value = account.value?.cpf ?? ''
  recipientName.value = account.value?.recipient_name ?? ''
  info.value = ''
  editing.value = true
}

async function savePix() {
  if (working.value) return
  error.value = ''
  info.value = ''
  working.value = true
  try {
    const name = recipientName.value.trim()
    if (!name || name.length > 120 || !/\p{L}/u.test(name) || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new Error('请输入有效的真实姓名。')
    }
    const value = cpf.value.trim()
    if (!/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(value)) throw new Error('请输入有效的 11 位 CPF。')
    account.value = (await api('/pix-account', { method: 'PUT', body: { cpf: value, recipient_name: name } })).data
    cpf.value = ''
    recipientName.value = ''
    editing.value = false
    if (next && currentRoute.value.key === props.route.key) resume(next)
    else info.value = 'Pix 收款账户已保存。'
  } catch (failure) {
    showError(failure)
  } finally {
    working.value = false
  }
}

function cancelPixEdit() {
  if (next === '/cash-wallet/withdraw' && !pixComplete.value) {
    resume('/member')
    return
  }
  if (next === withdraw) {
    resume(home)
    return
  }
  editing.value = false
  cpf.value = ''
  recipientName.value = ''
  error.value = ''
}

async function confirmWithdrawal() {
  if (working.value || !ready.value || !pixComplete.value) return
  error.value = ''
  working.value = true
  const snapshot = { id: round.value.id, amount: round.value.available_cents, cpf: account.value.cpf, name: account.value.recipient_name }
  try {
    const [activity, pix] = await Promise.all([api(home, { fresh: true }), api('/pix-account', { fresh: true })])
    packets.value = activity.data
    account.value = pix.data
    if (!ready.value) throw new Error('当前红包余额不可提现，请返回查看处理记录。')
    if (!pixComplete.value) {
      bindPix()
      return
    }
    if (round.value.id !== snapshot.id || round.value.available_cents !== snapshot.amount || account.value.cpf !== snapshot.cpf || account.value.recipient_name !== snapshot.name) {
      throw new Error('红包金额或收款账户已更新，请重新核对后确认。')
    }
    if (currentRoute.value.key !== props.route.key) return
    const key = ['cash-club:pix-withdrawal', props.member.id, snapshot.id, snapshot.amount, snapshot.cpf].join(':')
    await api('/pix-withdrawals', { body: { request_id: getAttempt(key) } })
    clearAttempt(key)
    if (currentRoute.value.key === props.route.key) {
      showNotice('提现申请已提交', '可在提现订单中查看处理进度。', 'success')
      resume(home)
    }
  } catch (failure) {
    showError(failure)
  } finally {
    working.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => clearTimeout(revealTimer))

import { showNotice, watchNotice } from '../feedback'
watchNotice(error, () => isPix ? 'Pix 收款账户提醒' : isWithdraw ? '提现提醒' : '红包活动提醒', 'error')
watchNotice(info, text => text?.startsWith(t('已拆开红包，初始奖励 ')) ? '红包已拆开' : text?.startsWith('Pix') ? '收款账户已保存' : '邀请链接提醒')
</script>

<template>
  <div class="member-page" :class="{ 'reward-page': isHome }" :aria-busy="loading">
    <template v-if="isHome">
      <section v-if="packets && !round" class="reward-opening" :data-phase="reveal ? 'reveal' : working ? 'waiting' : 'idle'">
        <h2>{{ t(pageCopy?.opening_title || '现金红包') }}</h2>
        <p v-if="pageCopy?.opening_description" class="reward-opening-description">{{ pageCopy.opening_description }}</p>
        <button class="reward-stage" :disabled="working" @click="open">
          <span class="reward-scene" aria-hidden="true">
            <span class="reward-halo"></span>
            <img class="reward-envelope sealed" :src="packetClosed" alt="">
            <img class="reward-envelope opened" :src="packetOpened" alt="">
            <span v-if="reveal" class="reward-sparks">
              <i v-for="index in 12" :key="index" :style="{ '--ray': index * 30 + 'deg', '--delay': (index % 3) * 40 + 'ms' }"></i>
            </span>
          </span>
          <span v-if="!reveal" class="reward-cta">{{ t(pageCopy?.open_label || '拆开红包') }}</span>
        </button>
        <p v-if="reveal" class="reward-reveal" role="status"><span>{{ t('初始奖励') }}</span><strong>{{ money(reveal.initial_cents) }}</strong></p>
      </section>

      <section v-else-if="round" class="reward-board">
        <div class="reward-balance">
          <img :src="packetOpened" alt="">
          <div>
            <h2>{{ t(pageCopy?.balance_title || '累计红包') }}</h2>
            <strong>{{ money(round.balance_cents) }}</strong>
          </div>
        </div>
        <div class="reward-panel">
          <div class="reward-target">
            <strong v-if="round.frozen_cents > 0">{{ t('提现处理中') }}</strong>
            <strong v-else-if="round.remaining_cents > 0">{{ t('还差') }} <em>{{ money(round.remaining_cents) }}</em> {{ t('可提现') }}</strong>
            <strong v-else>{{ t('已达到提现目标') }}</strong>
          </div>
          <progress class="reward-progress" :value="round.balance_cents" :max="round.threshold_cents" :aria-label="t('提现进度')"></progress>
          <div class="reward-progress-values">
            <span>{{ t('已累计', 'Acumulado') }} {{ money(round.balance_cents) }}</span>
            <span>{{ t('提现门槛', 'Meta de saque') }} {{ money(round.threshold_cents) }}</span>
          </div>
          <button class="reward-cta" :disabled="ready ? working : !inviteLink" @click="ready ? go(withdraw) : shareInvite()">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="ready ? icons.cashWallet : 'M15 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m10-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm5 1v6m-3-3h6'"/></svg>
            {{ ready ? t('申请提现') : t(pageCopy?.invite_label || '邀请好友') }}
          </button>
          <div class="reward-options">
            <button v-if="ready" :disabled="!inviteLink" @click="shareInvite">{{ t(pageCopy?.invite_label || '邀请好友') }}</button>
            <button :disabled="!inviteLink" @click="copyInvite">{{ t('复制链接') }}</button>
            <button @click="go(home + '/invites')">{{ t('邀请明细') }}</button>
          </div>
          <label v-if="linkVisible" class="field">{{ t('邀请链接') }}
            <input ref="inviteInput" :value="inviteLink" readonly @focus="$event.target.select()">
          </label>
        </div>
        <a v-if="round.latest_invite_reward_cents > 0" class="reward-credit surface" href="#/red-packets/invites"
           @click.prevent="go(home + '/invites')">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.shop"/></svg>
          <span>
            <strong>{{ t('好友奖励已到账', 'Recompensa de convite creditada') }}</strong>
            <small>{{ t('邀请明细') }}</small>
          </span>
          <strong>+{{ money(round.latest_invite_reward_cents) }}</strong>
        </a>
      </section>

      <section v-if="pageCopy?.rules_html" class="surface stack reward-rules">
        <details open>
          <summary>{{ t(pageCopy.rules_title) }}</summary>
          <div class="reward-rule-copy" v-html="t(pageCopy.rules_html)"></div>
        </details>
      </section>
    </template>

    <section v-else-if="isPix" class="stack">
      <form v-if="editing" class="surface stack" @submit.prevent="savePix">
        <label class="field">{{ t('真实姓名', 'Nome completo') }}
          <input v-model.trim="recipientName" type="text" autocomplete="name" maxlength="120" required :disabled="working"
                 :placeholder="t('请输入真实姓名', 'Informe seu nome completo')">
        </label>
        <label class="field">CPF ID
          <input v-model="cpf" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" maxlength="14" required :disabled="working">
        </label>
        <p class="muted">{{ t('请填写 CPF 持有人的真实姓名和已注册为 Pix 收款键的 CPF。', 'Informe o nome do titular e o CPF cadastrado como chave Pix.') }}</p>
        <div class="member-actions centered-actions">
          <button class="primary" :disabled="working">{{ t('保存') }}</button>
          <button class="quiet" type="button" :disabled="working" @click="cancelPixEdit">{{ t('取消') }}</button>
        </div>
      </form>
      <template v-else-if="account">
        <template v-if="pixComplete">
          <dl class="surface summary-list">
            <div><dt>{{ t('真实姓名', 'Nome completo') }}</dt><dd>{{ account.recipient_name }}</dd></div>
            <div><dt>CPF ID</dt><dd>{{ account.cpf }}</dd></div>
          </dl>
          <button class="primary" @click="editPix">{{ t('修改 Pix 收款资料', 'Editar dados Pix') }}</button>
        </template>
        <EmptyState v-else :message="account.cpf ? t('请补填 CPF 持有人的真实姓名。', 'Informe o nome completo do titular do CPF.') : t('尚未绑定 Pix 收款账户。')">
          <button class="primary" @click="editPix">{{ account.cpf ? t('补全 Pix 收款资料', 'Completar dados Pix') : t('绑定 Pix') }}</button>
        </EmptyState>
        <button v-if="next === withdraw" class="quiet" @click="resume(home)">{{ t('返回红包') }}</button>
      </template>
    </section>

    <section v-else-if="isWithdraw" class="surface stack">
      <h2>{{ t('确认提现') }}</h2>
      <template v-if="ready && pixComplete">
        <dl class="member-definition">
          <div><dt>{{ t('提现金额') }}</dt><dd>{{ money(round.available_cents) }}</dd></div>
          <div><dt>{{ t('收款方式') }}</dt><dd>Pix</dd></div>
          <div><dt>{{ t('真实姓名', 'Nome completo') }}</dt><dd>{{ account.recipient_name }}</dd></div>
          <div><dt>CPF ID</dt><dd>{{ account.cpf }}</dd></div>
        </dl>
        <button class="primary" :disabled="working || loading" @click="confirmWithdrawal">{{ t('确认提现') }}</button>
      </template>
      <EmptyState v-else-if="packets && !loading" :message="t('当前没有可提现的红包余额。')" />
      <button class="quiet" :disabled="working" @click="resume(home)">{{ t('返回红包') }}</button>
    </section>

    <section v-else-if="isInvites" class="surface stack">
      <table v-if="records?.data.length" class="member-invite-table">
        <thead>
          <tr>
            <th scope="col">{{ t('手机号码') }}</th>
            <th scope="col">{{ t('注册时间', 'Data de cadastro') }}</th>
            <th scope="col">{{ t('邀请奖励', 'Recompensa') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="invite in records.data" :key="invite.id" class="member-invite-row">
            <td><strong>{{ invite.invitee_phone || '—' }}</strong></td>
            <td><time :datetime="invite.registered_at">{{ date(invite.registered_at, 'America/Sao_Paulo') }}</time></td>
            <td>
              <strong v-if="invite.settled_at && invite.reward_cents != null" class="member-positive">{{ money(invite.reward_cents) }}</strong>
              <strong v-else>{{ t('待结算') }}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-else-if="records" :message="t('暂无邀请记录。')" />
      <MemberPagination :page="records" :busy="loading" @page="pageLink" />
    </section>

    <section v-else-if="order" class="surface stack">
      <dl class="member-definition">
        <div><dt>{{ t('订单号') }}</dt><dd>{{ order.order_number }}</dd></div>
        <div><dt>{{ t('申请金额') }}</dt><dd>{{ money(order.amount_cents) }}</dd></div>
        <div v-if="order.recipient_name"><dt>{{ t('真实姓名', 'Nome completo') }}</dt><dd>{{ order.recipient_name }}</dd></div>
        <div><dt>CPF ID</dt><dd>{{ order.cpf }}</dd></div>
        <div><dt>{{ t('申请时间') }}</dt><dd>{{ date(order.created_at) }}</dd></div>
        <div><dt>{{ t('处理状态') }}</dt><dd>{{ withdrawalStatusLabel(order) }}</dd></div>
        <div v-if="order.paid_at"><dt>{{ t('到账时间') }}</dt><dd>{{ date(order.paid_at) }}</dd></div>
        <div v-if="order.review_reason"><dt>{{ t('处理说明') }}</dt><dd>{{ order.review_reason }}</dd></div>
      </dl>
      <div v-if="!order.rejection_deducted && ['failed', 'rejected', 'cancelled'].includes(order.status)" class="member-actions">
        <button class="quiet" @click="go('/pix')">{{ t('核对收款账户') }}</button>
        <button class="quiet" @click="go(home)">{{ t('返回红包') }}</button>
      </div>
    </section>
    <div v-if="error" class="stack">
      <button v-if="!working && !editing && (isHome || !round) && !order" class="quiet" @click="load">{{ t('重新加载') }}</button>
    </div>
  </div>
</template>

<style scoped>
.reward-opening-description { text-align: center; white-space: pre-line; overflow-wrap: anywhere; }
.reward-rule-copy { display: grid; gap: 0.65rem; margin-top: 0.75rem; overflow-wrap: anywhere; }
.reward-rule-copy :deep(ul) { list-style: disc; padding-inline-start: 1.4rem; }
.reward-rule-copy :deep(ol) { list-style: decimal; padding-inline-start: 1.4rem; }
.reward-rule-copy :deep(blockquote) { border-inline-start: 2px solid var(--line); padding-inline-start: 0.75rem; }
.reward-rule-copy :deep(a) { color: var(--accent); text-decoration: underline; }
</style>
