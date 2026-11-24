<script setup>
import EmptyState from '../EmptyState.vue'
import { createRequestId } from '../requestId.js'
import { useLocale } from '../locale.js'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { api, imageUrl } from '../api'
import PlatformCard from '../PlatformCard.vue'
import ProtectionContract from './ProtectionContract.vue'
import { currentRoute, go, safePath } from '../navigation'
import MemberPagination from './MemberPagination.vue'

const { locale, t } = useLocale()

const props = defineProps({ route: Object })
const path = props.route.path
const summary = path === '/protection'
const isClaims = path === '/protection/claims'
const isTerms = path.endsWith('/terms')
const isNew = path === '/protection/claims/new'
const rawBindingId = props.route.query.get('binding') ?? ''
const bindingId = /^[1-9]\d*$/.test(rawBindingId) ? rawBindingId : ''
const loading = ref(true)
const working = ref(false)
const error = ref('')
const evidenceError = ref(false)
const selectedBinding = ref(null)
const bindings = ref(null)
const cases = ref(null)
const focused = ref(null)
const item = ref(null)
const files = ref([])
const form = reactive({ amount: '', withdrawn_at: '', description: '' })
const statuses = { pending: '待确认', active: '保障中', inactive: '未生效' }
const caseLabels = {
  pending: ['待处理', 'Pendente'], resolved: ['已解决', 'Resolvida'], unresolved: ['未解决', 'Encerrada sem solução'],
}
const caseStatus = value => t(...(caseLabels[value] ?? caseLabels.pending))
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const currentBindings = computed(() => {
  const list = bindings.value?.data ?? []
  return focused.value && !list.some(binding => binding.id === focused.value.id)
    ? [focused.value, ...list]
    : list
})
let requestId
let previousSubmission

function date(value) {
  return value ? new Date(value).toLocaleString(locale.value) : '—'
}

function showError(failure) {
  error.value = Object.values(failure.errors ?? {}).flat()[0] || failure.message
}

function goPage(key, page) {
  const params = new URLSearchParams(props.route.query)
  if (page === 1) params.delete(key)
  else params.set(key, page)
  go(path + (params.size ? '?' + params : ''), { replace: true })
}

async function load() {
  loading.value = true
  error.value = ''
  evidenceError.value = false
  try {
    if (summary) {
      const bindingPage = await api('/platform-bindings?page=' + (Number(props.route.query.get('bindingsPage')) || 1))
      bindings.value = bindingPage
      if (bindingId && !bindingPage.data.some(binding => String(binding.id) === bindingId)) {
        focused.value = (await api('/platform-bindings/' + bindingId)).data
      }
      if (bindingId) {
        await nextTick()
        selectedBinding.value?.scrollIntoView({ block: 'nearest' })
      }
    } else if (isClaims) {
      cases.value = await api('/protection/claims?page=' + (Number(props.route.query.get('page')) || 1))
    } else if (isNew && bindingId) {
      item.value = (await api('/platform-bindings/' + bindingId)).data
    } else if (isTerms) {
      item.value = (await api('/protection/bindings/' + props.route.params.id + '/terms')).data
    } else if (!isNew) {
      item.value = (await api('/protection/claims/' + props.route.params.id)).data
    }
  } catch (failure) {
    showError(failure)
  } finally {
    loading.value = false
  }
}

function setFiles(event) {
  files.value = Array.from(event.target.files)
}

function evidencePath(value) {
  const path = safePath(value, '')
  return /^\/api\/v1\/protection\/claims\/\d+\/evidence\/\d+\?/.test(path) ? path : ''
}

async function submit() {
  if (working.value || !item.value) return
  error.value = ''
  working.value = true
  try {
    const amount = form.amount.trim().replace(',', '.')
    if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      throw new Error('请输入大于 0 的出款金额，最多两位小数。')
    }
    const time = new Date(form.withdrawn_at)
    if (Number.isNaN(time.getTime()) || time > new Date()) throw new Error('请输入有效且不晚于当前时间的出款时间。')
    if (!form.description.trim()) throw new Error('请填写问题说明。')
    if (files.value.length < 1 || files.value.length > 6) throw new Error('请选择 1 至 6 张凭证图片。')
    if (files.value.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      throw new Error('请使用 JPEG、PNG 或 WebP，每张不超过 5 MiB。')
    }
    const values = { binding_id: bindingId, amount, withdrawn_at: time.toISOString(), description: form.description.trim() }
    const fingerprint = JSON.stringify(values)
    if (previousSubmission?.fingerprint !== fingerprint || previousSubmission.files !== files.value) {
      requestId = createRequestId()
      previousSubmission = { fingerprint, files: files.value }
    }
    const body = new FormData()
    body.set('request_id', requestId)
    for (const [key, value] of Object.entries(values)) body.set(key, value)
    for (const file of files.value) body.append('evidence[]', file)
    const { data } = await api('/protection/claims', { body })
    if (currentRoute.value.key === props.route.key) {
      showNotice('申诉已提交', '可在申诉详情中查看已提交的资料。', 'success')
      go('/protection/claims/' + data.id, { replace: true })
    }
  } catch (failure) {
    showError(failure)
  } finally {
    working.value = false
  }
}

onMounted(load)

import { showNotice, watchNotice } from '../feedback'
watchNotice(error, '保障申诉提醒', 'error')
watchNotice(() => evidenceError.value ? '部分凭证图片无法读取，请重新加载。' : '', '凭证加载失败', 'error')
</script>

<template>
  <div class="member-page" :aria-busy="loading">
    <template v-if="summary">
      <section class="stack">
        <h2>{{ t('平台保障') }}</h2>
        <article v-for="binding in currentBindings" :key="binding.id" class="surface protection-platform"
          :ref="element => { if (String(binding.id) === bindingId) selectedBinding = element }"
          :class="{ 'member-focus': String(binding.id) === bindingId }">
          <div class="protection-logo" aria-hidden="true">
            <img v-if="imageUrl(binding.logo_url)" :key="binding.logo_url" :src="imageUrl(binding.logo_url)"
              width="80" height="80" alt="" loading="lazy" @error="$event.target.hidden = true">
            <span>{{ binding.platform_name.slice(0, 1) }}</span>
          </div>
          <div class="protection-platform-body">
            <PlatformCard row :platform-id="binding.platform_id" :name="binding.platform_name" :promotion-url="binding.promotion_url">
              <h3>{{ binding.platform_name }}</h3><p class="muted">{{ binding.platform_account_id }}</p>
              <p class="member-status">{{ t('保障状态 ·') }} {{ t(statuses[binding.protection_status]) || t('待确认') }}</p>
            </PlatformCard>
            <div class="member-actions protection-platform-actions">
              <button class="quiet" @click="go('/protection/bindings/' + binding.id + '/terms')">{{ t('保障条款') }}</button>
              <button class="primary" @click="go('/protection/claims/new?binding=' + binding.id)">{{ t('申请保障') }}</button>
            </div>
          </div>
        </article>
        <EmptyState v-if="bindings && !currentBindings.length" :message="t('暂无已绑定平台。')" />
        <MemberPagination :page="bindings" :busy="loading" @page="goPage('bindingsPage', $event)" />
      </section>
    </template>

    <section v-else-if="isClaims && !loading && !error" class="surface stack" :aria-label="t('申诉记录')">
      <ul v-if="cases?.data.length" class="row-list">
        <li v-for="record in cases.data" :key="record.id">
          <button type="button" @click="go('/protection/claims/' + record.id)">
            <span><strong>{{ record.platform_name }}</strong><small>{{ date(record.created_at) }}</small></span>
            <span>{{ brl.format(record.amount_cents / 100) }}<small>{{ caseStatus(record.case_status) }} ›</small></span>
          </button>
        </li>
      </ul>
      <EmptyState v-else-if="cases" :message="t('暂无申诉记录。')" />
      <MemberPagination :page="cases" :busy="loading" @page="goPage('page', $event)" />
    </section>

    <ProtectionContract v-else-if="isTerms && !loading && !error" :terms="item" />

    <section v-else-if="isNew" class="surface stack">
      <template v-if="item">
        <p class="member-claim-account">{{ item.platform_name }} · {{ item.platform_account_id }}</p>
        <form class="stack" @submit.prevent="submit">
          <label class="field">{{ t('出款金额（BRL）') }}<input v-model="form.amount" inputmode="decimal" maxlength="12" required :disabled="working"></label>
          <label class="field">{{ t('出款时间（本地时间）') }}<input v-model="form.withdrawn_at" type="datetime-local" required :disabled="working"></label>
          <label class="field">{{ t('问题说明') }}<textarea v-model="form.description" maxlength="5000" required :disabled="working" /></label>
          <label class="field">{{ t('凭证图片') }}
            <input class="member-file-picker" type="file" accept="image/jpeg,image/png,image/webp" multiple required :disabled="working" @change="setFiles">
          </label>
          <p class="muted">{{ t('上传 1 至 6 张 JPEG、PNG 或 WebP 图片，每张最多 5 MiB。') }}</p>
          <button class="primary" :disabled="working">{{ t('提交申诉') }}</button>
        </form>
      </template>
      <button v-else-if="!bindingId" class="quiet" @click="go('/protection')">{{ t('返回选择平台') }}</button>
    </section>

    <section v-else-if="item" class="surface stack">
      <dl class="member-definition">
        <div><dt>{{ t('平台') }}</dt><dd>{{ item.platform_name }}</dd></div>
        <div><dt>{{ t('平台账号') }}</dt><dd>{{ item.platform_account_id }}</dd></div>
        <div><dt>{{ t('提交时保障状态') }}</dt><dd>{{ t(statuses[item.protection_status]) || t('待确认') }}</dd></div>
        <div><dt>{{ t('案件状态', 'Situação da solicitação') }}</dt><dd>{{ caseStatus(item.case_status) }}</dd></div>
        <div><dt>{{ t('出款金额') }}</dt><dd>{{ brl.format(item.amount_cents / 100) }}</dd></div>
        <div><dt>{{ t('出款时间') }}</dt><dd>{{ date(item.withdrawn_at) }}</dd></div>
        <div><dt>{{ t('提交时间') }}</dt><dd>{{ date(item.created_at) }}</dd></div>
        <div><dt>{{ t('问题说明') }}</dt><dd class="member-paragraph">{{ item.description }}</dd></div>
      </dl>
      <template v-if="item.evidence?.length">
        <h3>{{ t('凭证图片') }}</h3>
        <div class="member-evidence">
          <template v-for="file in item.evidence" :key="file.id">
            <a v-if="evidencePath(file.url)" :href="evidencePath(file.url)" target="_blank" rel="noopener">
              <img :src="evidencePath(file.url)" :alt="t('凭证 ') + file.position" @error="evidenceError = true">
            </a>
          </template>
        </div>
        <button v-if="evidenceError" class="quiet" @click="load">{{ t('重新加载凭证') }}</button>
      </template>
    </section>
    <div v-if="error" class="stack">
      <button v-if="!item && !working" class="quiet" @click="load">{{ t('重新加载') }}</button>
    </div>
  </div>
</template>

<style scoped>
.protection-platform {
  display: grid;
  grid-template-columns: clamp(58px, 19vw, 80px) minmax(0, 1fr);
  align-items: center;
  gap: clamp(10px, 3vw, 16px);
}
.protection-logo {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background: var(--surface-recessed);
  color: var(--highlight);
  font-size: 24px;
  font-weight: 800;
}
.protection-logo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.protection-logo img[hidden] { display: none; }
.protection-logo img:not([hidden]) + span { display: none; }
.protection-platform-body { display: grid; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
.member-page .protection-platform-actions { align-items: stretch; }
.protection-platform-actions > button { flex: 1 1 auto; min-width: 0; padding-inline: 10px; }
</style>
