<script setup>
import { useLocale } from '../locale.js'
import { ref, watch } from 'vue'
import { api } from '../api'
import { formatBrl } from '../money'

const { locale, t } = useLocale()

const props = defineProps({ route: Object })
const quote = ref(null)
const error = ref('')
const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const format = cents => cents == null ? '—' : formatter.format(Number(cents) / 100)
const statuses = { pending: '待确认', confirmed: '已确认', expired: '已过期' }

async function load(id = props.route.params.id, signal) {
  error.value = ''
  quote.value = null
  try {
    const { data } = await api('/point-quotes/' + id, { signal })
    if (!signal?.aborted) quote.value = data
  } catch (failure) {
    if (!signal?.aborted) error.value = failure.message
  }
}

watch(() => props.route.params.id, (id, _previous, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  load(id, controller.signal)
}, { immediate: true })

import { watchNotice } from '../feedback'
watchNotice(error, '积分明细加载失败', 'error')
</script>

<template>
  <dl v-if="quote" class="surface summary-list">
    <div><dt>{{ t('状态') }}</dt><dd>{{ t(statuses[quote.status]) || t('处理中') }}</dd></div>
    <div v-if="!quote.cash_only"><dt>{{ quote.status === 'confirmed' ? t('实兑积分') : t('预计积分') }}</dt><dd>{{ quote.estimated_points }}</dd></div>
    <div v-if="quote.rebate_enabled || quote.rebate_cents > 0"><dt>{{ quote.status === 'confirmed' ? t('已到账返利') : t('预计返利') }}</dt><dd>{{ formatBrl(quote.rebate_cents) }}</dd></div>
    <div><dt>{{ t('本期待兑存款') }}</dt><dd>{{ format(quote.deposit_cents) }}</dd></div>
    <div><dt>{{ t('本期有效投注') }}</dt><dd>{{ format(quote.valid_bet_cents) }}</dd></div>
    <div><dt>{{ t('所需投注额') }}</dt><dd>{{ format(quote.required_bet_cents) }}</dd></div>
    <div v-if="quote.confirmed_at"><dt>{{ t('入账时间') }}</dt><dd>{{ new Date(quote.confirmed_at).toLocaleString(locale) }}</dd></div>
  </dl>
  <div v-else-if="error" class="state">
    <button class="text-button" @click="load()">{{ t('重试') }}</button>
  </div>
</template>
