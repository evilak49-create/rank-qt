<script setup>
import { useLocale } from '../locale.js'
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '../api'
import { showNotice } from '../feedback'
import { formatBrl } from '../money'
import CheckinCard from './CheckinCard.vue'

const { t } = useLocale()

const emit = defineEmits(['refresh-member'])
const state = ref(null)
const loading = ref(true)
const working = ref(false)

function report(title, failure) {
  showNotice(title, Object.values(failure.errors ?? {}).flat()[0] || failure.message, 'error')
}

async function load() {
  loading.value = true
  try {
    state.value = (await api('/check-in', { fresh: true })).data
  } catch (failure) {
    report('签到状态加载失败', failure)
  } finally {
    loading.value = false
  }
}

async function act() {
  if (loading.value || working.value || state.value?.checked_in) return
  if (!state.value) return load()
  if (!state.value.tiers?.length) return
  working.value = true
  try {
    state.value = (await api('/check-in', { method: 'POST' })).data
    showNotice('签到成功', state.value.reward_cents > 0
      ? t('今日获得 ', 'Recebido hoje: ') + formatBrl(state.value.reward_cents)
      : '今日签到已记录', 'success')
    emit('refresh-member')
  } catch (failure) {
    report('签到失败', failure)
  } finally {
    working.value = false
  }
}

function refreshWhenVisible() {
  if (!document.hidden && !working.value && !loading.value) load()
}

onMounted(() => {
  load()
  document.addEventListener('visibilitychange', refreshWhenVisible)
})
onUnmounted(() => document.removeEventListener('visibilitychange', refreshWhenVisible))
</script>

<template>
  <div class="member-page checkin-screen">
    <CheckinCard :state="state" :loading="loading" :working="working" @action="act" />
    <section class="surface profile-section checkin-rules">
      <h2>{{ t('签到规则') }}</h2>
      <ol>
        <li>{{ t('按站点业务时区计算日期，每天可签到一次。') }}</li>
        <li>{{ t('连续签到达到活动档位后，现金奖励自动计入可用余额。', 'A recompensa em dinheiro é creditada no saldo disponível ao atingir uma meta de check-ins consecutivos.') }}</li>
        <li>{{ t('中断签到后，下次从第 1 天重新开始。完成本轮最高档后，下次签到开启新一轮。') }}</li>
        <li>{{ t('各轮奖励按该轮开始时生效的活动规则计算，可在资金明细查看到账记录。', 'Cada ciclo segue as regras em vigor no início. Consulte as movimentações para ver os créditos.') }}</li>
      </ol>
    </section>
  </div>
</template>
