<script setup>
import { useLocale } from '../locale.js'
import { computed } from 'vue'

const { t } = useLocale()

const props = defineProps({ state: Object, entry: Boolean, loading: Boolean, working: Boolean })
defineEmits(['action'])
const tiers = computed(() => Array.isArray(props.state?.tiers) ? props.state.tiers : null)
const days = computed(() => {
  if (!props.state) return []
  const count = Math.max(0, Number(props.state.streak) || 0)
  const today = props.state.checked_in ? count : count + 1
  const lastTier = tiers.value?.at(-1)?.days
  const first = Math.max(1, today - 6)
  const end = props.state.completed_round ? count : Math.max(today, Math.min(first + 6, lastTier || first + 6))
  return Array.from({ length: Math.max(0, end - first + 1) }, (_, index) => {
    const day = first + index
    return { day, checked: day <= count, today: day === today }
  })
})
const actionLabel = computed(() => {
  if (props.loading) return '立即签到'
  if (!props.state) return '重新加载'
  return props.state.checked_in ? '今日已签到' : '立即签到'
})
</script>

<template>
  <section class="profile-checkin" :class="{ 'profile-checkin-entry': entry }" aria-labelledby="checkin-title">
    <header>
      <p v-if="entry" id="checkin-title">{{ t('已连续签到') }} <strong>{{ state?.streak ?? '—' }}</strong> {{ t('天') }}</p>
      <div v-else><h2 id="checkin-title">{{ t('每日签到') }}</h2><p v-if="state" role="status">{{ t('已连续签到') }} <strong>{{ state.streak }}</strong> {{ t('天') }}</p></div>
      <a v-if="entry" href="#/check-in" class="checkin-detail-link" @click.prevent="$emit('action')">{{ t('查看详情') }} <span aria-hidden="true">›</span></a>
      <span v-else-if="state?.completed_round" class="checkin-badge">{{ t('本轮已完成') }}</span>
      <span v-else-if="state?.business_date" class="checkin-date">{{ state.business_date }}</span>
    </header>
    <ol v-if="days.length" class="checkin-track" :style="{ '--step-count': days.length }" :aria-label="t('连续签到进度')">
      <li v-for="step in days" :key="step.day" :class="{ checked: step.checked, today: step.today }"
          :aria-current="step.today ? 'step' : undefined">
        <span class="checkin-step" aria-hidden="true">{{ step.checked ? '✓' : step.today ? '✦' : '·' }}</span>
        <small :class="{ 'visually-hidden': entry }">{{ t('第' + step.day + '天', 'Dia ' + step.day) }}</small>
        <span class="visually-hidden">{{ step.checked ? t('已签到') : step.today ? t('今日待签到') : t('待签到') }}</span>
      </li>
    </ol>
    <div v-if="!entry && state" class="checkin-tiers">
      <h3>{{ t('连续签到奖励') }}</h3>
      <ul v-if="tiers?.length">
        <li v-for="tier in tiers" :key="tier.days">
          <span>{{ tier.days }} {{ t('天') }}</span><strong>+{{ tier.points }} {{ t('积分') }}</strong>
        </li>
      </ul>
      <p v-else>{{ tiers ? t('暂无奖励档位') : t('暂未获取奖励档位') }}</p>
    </div>
    <p v-if="!entry && state?.checked_in" class="checkin-reward" role="status">
      {{ state.reward_points > 0 ? t('今日获得 ') + state.reward_points + t(' 积分') : t('今日签到已记录') }}
    </p>
    <button v-if="!entry" class="checkin-action" :disabled="loading || working || state?.checked_in" @click="$emit('action')">{{ t(actionLabel) }}</button>
  </section>
</template>
