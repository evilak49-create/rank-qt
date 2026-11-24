<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api } from '../api'
import { useLocale } from '../locale.js'
import { formatBrl } from '../money'
import { go } from '../navigation'
import { createRequestId } from '../requestId.js'

const props = defineProps({ member: Object })
const emit = defineEmits(['refresh-member'])
const { locale, t } = useLocale()
const rules = ref(null)
const platforms = ref([])
const unavailable = ref([])
const settings = ref(null)
const loading = ref(true)
const loadFailed = ref(false)
const submitting = ref(false)
const claimFailure = ref('')
const creditedAmount = ref(null)
const attempt = ref(null)
const attemptKey = 'cash-club:rescue-fund:' + props.member.id
let request
let active = true

try {
  const previous = JSON.parse(sessionStorage.getItem(attemptKey) || 'null')
  if (Number.isSafeInteger(previous?.bindingId) && previous.bindingId > 0 && typeof previous.requestId === 'string') {
    attempt.value = previous
  }
} catch {}

const hasPendingCard = computed(() => platforms.value.some(platform => Number(platform.binding_id) === attempt.value?.bindingId))
const scale = 1_000_000

function formatRate(micros) {
  return new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 6 }).format(micros / scale / 100)
}

function formatTier(micros) {
  const tier = new Intl.NumberFormat(locale.value, { maximumFractionDigits: 6 }).format(micros / scale)
  return t(tier + ' 倍', tier + '×')
}

async function load() {
  request?.abort()
  request = new AbortController()
  const { signal } = request
  loading.value = true
  loadFailed.value = false
  try {
    const result = await api('/rescue-fund', { signal, fresh: true, timeoutMs: 55_000 })
    if (signal.aborted) return
    platforms.value = result.data
    unavailable.value = result.unavailable ?? []
    settings.value = result.settings
  } catch {
    if (!signal.aborted) loadFailed.value = true
  } finally {
    if (!signal.aborted) loading.value = false
  }
}

function saveAttempt(value) {
  attempt.value = value
  try {
    if (value) sessionStorage.setItem(attemptKey, JSON.stringify(value))
    else sessionStorage.removeItem(attemptKey)
  } catch {}
}

async function claim(bindingId) {
  if (submitting.value || (attempt.value && attempt.value.bindingId !== bindingId)) return
  submitting.value = true
  creditedAmount.value = null
  claimFailure.value = ''
  if (!attempt.value) saveAttempt({ bindingId, requestId: createRequestId() })
  try {
    const { data } = await api('/rescue-fund/' + bindingId + '/claim', { body: { request_id: attempt.value.requestId } })
    if (!active) return
    saveAttempt(null)
    creditedAmount.value = data.amount_cents
    const claimedPlatform = platforms.value.find(platform => Number(platform.binding_id) === bindingId)
    if (claimedPlatform) {
      unavailable.value.push({ binding_id: claimedPlatform.binding_id, platform_name: claimedPlatform.platform_name })
    }
    platforms.value = platforms.value.filter(platform => Number(platform.binding_id) !== bindingId)
    emit('refresh-member')
  } catch (failure) {
    if (!active) return
    if ([400, 403, 404, 409, 422].includes(failure.status)) {
      saveAttempt(null)
      claimFailure.value = '当前无法领取，请查看更新后的可领取平台。'
      await load()
    } else {
      claimFailure.value = '暂时无法确认领取结果，请重试。'
    }
  } finally {
    submitting.value = false
  }
}

onMounted(load)
onUnmounted(() => {
  active = false
  request?.abort()
})
</script>

<template>
  <Teleport to="#rescue-fund-actions">
    <button class="text-button rescue-rules-trigger" type="button" aria-haspopup="dialog" @click="rules.showModal()">{{ t('领取规则') }}</button>
  </Teleport>

  <div class="member-page rescue-fund-page">
    <section v-if="creditedAmount != null" class="surface stack rescue-result" role="status">
      <h2>{{ t('救援金已到账') }} · {{ formatBrl(creditedAmount) }}</h2>
      <p class="muted">{{ t('领取后即时进入现金钱包，可提现。') }}</p>
      <a href="#/fund-records" @click.prevent="go('/fund-records')">{{ t('查看资金明细') }}</a>
    </section>
    <p v-if="claimFailure" class="error" role="alert">{{ t(claimFailure) }}</p>
    <section v-if="attempt && (!hasPendingCard || loadFailed) && !loading" class="surface stack">
      <p class="muted">{{ t('有一笔领取结果待确认。') }}</p>
      <button class="quiet" type="button" :disabled="submitting" @click="claim(attempt.bindingId)">{{ t(submitting ? '正在领取…' : '重试领取') }}</button>
    </section>
    <section class="stack" aria-labelledby="rescue-platforms-title" :aria-busy="loading">
      <h2 id="rescue-platforms-title">{{ t('已绑定的平台', 'Plataformas vinculadas') }}</h2>
      <p v-if="loading" class="state" role="status">{{ t('正在加载…', 'Carregando…') }}</p>
      <div v-else-if="loadFailed" class="state">
        <p>{{ t('暂时无法读取救援金，请重试。') }}</p>
        <button class="text-button" type="button" @click="load">{{ t('重试') }}</button>
      </div>
      <p v-else-if="!platforms.length && !unavailable.length" class="state">{{ t('暂无已绑定的平台。', 'Nenhuma plataforma vinculada.') }}</p>
      <template v-else>
        <article v-for="platform in platforms" :key="platform.binding_id" class="surface stack rescue-card">
          <h3>{{ platform.platform_name }}</h3>
          <dl class="summary-list">
            <div><dt>{{ t('本期充值') }}</dt><dd>{{ formatBrl(platform.deposit_cents) }}</dd></div>
            <div><dt>{{ t('本期净亏损') }}</dt><dd>{{ formatBrl(platform.net_loss_cents) }}</dd></div>
            <div><dt>{{ t('打码档位') }}</dt><dd>{{ formatTier(platform.wager_tier_micros) }}</dd></div>
            <div><dt>{{ t('救援金比例') }}</dt><dd>{{ formatRate(settings.percent_micros) }}</dd></div>
            <div class="rescue-amount"><dt>{{ t('可领救援金') }}</dt><dd>{{ formatBrl(platform.amount_cents) }}</dd></div>
          </dl>
          <button class="primary" type="button"
                  :disabled="submitting || Boolean(attempt && attempt.bindingId !== Number(platform.binding_id))"
                  @click="claim(Number(platform.binding_id))">
            {{ t(attempt?.bindingId === Number(platform.binding_id) ? submitting ? '正在领取…' : '重试领取' : '领取救援金') }}
          </button>
        </article>
        <article v-for="platform in unavailable" :key="platform.binding_id" class="surface rescue-unavailable">
          <h3>{{ platform.platform_name }}</h3>
          <span class="muted">{{ platform.query_unavailable
            ? t('暂时无法核验', 'Verificação indisponível')
            : t('暂不可领取', 'Auxílio indisponível') }}</span>
        </article>
        <p v-if="platforms.length" class="muted">{{ t('领取后即时进入现金钱包，可提现。') }}</p>
      </template>
    </section>
  </div>

  <dialog ref="rules" class="rescue-rules-sheet" aria-labelledby="rescue-rules-title" @click.self="rules.close()">
    <div class="rescue-rules-content">
      <header>
        <h2 id="rescue-rules-title">{{ t('领取规则') }}</h2>
        <form method="dialog"><button class="close-button" :aria-label="t('关闭')" autofocus>×</button></form>
      </header>
      <ol>
        <li>{{ t('首次从绑定时记录的盈亏快照起算。没有绑定快照的账号，从首次取得有效快照起算。之后从上次成功领取起算。') }}</li>
        <li>{{ t('本期净亏损须达到同期充值总额，且打码档位须在可领取上限以内，含上限档。') }}</li>
        <li>{{ t('救援金按本期充值总额乘以适用比例计算。各担保平台统一使用同一个档位上限和救援金比例。') }}</li>
        <li>{{ t('领取后即时进入现金钱包，可提现。到账后可在「个人中心 → 资金记录」查询。') }}</li>
      </ol>
      <dl v-if="settings?.enabled" class="summary-list">
        <div><dt>{{ t('最高可领档位') }}</dt><dd>{{ formatTier(settings.max_wager_tier_micros) }}</dd></div>
        <div><dt>{{ t('救援金比例') }}</dt><dd>{{ formatRate(settings.percent_micros) }}</dd></div>
      </dl>
    </div>
  </dialog>
</template>

<style scoped>
.rescue-rules-trigger { color: var(--highlight); font-size: 13px; white-space: nowrap; }
.rescue-fund-page > .stack { gap: 10px; }
.rescue-fund-page .error { padding-inline: 2px; }
.rescue-result a { color: var(--highlight); text-decoration: underline; }
.rescue-unavailable { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.rescue-unavailable h3 { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.rescue-unavailable span { flex-shrink: 0; font-size: 13px; }
.rescue-card .summary-list { font-size: 13px; }
.rescue-card .summary-list dd { color: var(--text); text-align: end; }
.rescue-card .rescue-amount { align-items: center; border-bottom: 0; padding: 9px 0 0; }
.rescue-card .rescue-amount dd { color: var(--highlight); font-size: 23px; font-weight: 750; }
.rescue-rules-sheet {
  position: fixed;
  inset: auto 0 0;
  width: min(480px, 100%);
  max-width: none;
  max-height: 90dvh;
  margin: 0 auto;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-bottom: 0;
  border-radius: 22px 22px 0 0;
  overscroll-behavior: contain;
}
.rescue-rules-content { padding: 12px 16px calc(17px + env(safe-area-inset-bottom)); }
.rescue-rules-content header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.rescue-rules-content h2 { margin: 0; }
.rescue-rules-content ol { display: grid; gap: 9px; margin: 8px 0 12px; padding-inline-start: 22px; }
</style>
