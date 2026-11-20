<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api'
import { showNotice } from '../feedback'
import CheckinCard from './CheckinCard.vue'

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
    state.value = (await api('/check-in')).data
  } catch (failure) {
    report('签到状态加载失败', failure)
  } finally {
    loading.value = false
  }
}

async function act() {
  if (loading.value || working.value || state.value?.checked_in) return
  if (!state.value) return load()
  working.value = true
  try {
    state.value = (await api('/check-in', { method: 'POST' })).data
    showNotice('签到成功', state.value.reward_points > 0
      ? '今日获得 ' + state.value.reward_points + ' 积分'
      : '今日签到已记录', 'success')
    emit('refresh-member')
  } catch (failure) {
    report('签到失败', failure)
  } finally {
    working.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="member-page checkin-screen">
    <CheckinCard :state="state" :loading="loading" :working="working" @action="act" />
    <section class="surface profile-section checkin-rules">
      <h2>签到规则</h2>
      <ol>
        <li>按站点业务时区计算日期，每天可签到一次。</li>
        <li>连续签到达到活动档位后，奖励自动计入可用积分。可在积分钱包查看到账记录。</li>
        <li>中断签到后，下次从第 1 天重新开始。完成本轮最高档后，下次签到开启新一轮。</li>
        <li>各轮奖励按该轮开始时生效的活动规则计算，以实际到账积分为准。</li>
      </ol>
    </section>
  </div>
</template>
