<script setup>
import { computed } from 'vue'
import { useLocale } from '../locale.js'
import { formatBrl } from '../money.js'

const props = defineProps({
  platform: { type: Object, required: true },
  maxRebate: { type: String, required: true },
})

const { t } = useLocale()
const supportUrl = computed(() => {
  try {
    const url = new URL(props.platform.support_url)
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
})

function formatAmount(amount) {
  return amount == null || amount === '' ? '' : formatBrl(Math.round(Number(amount) * 100))
}

const information = computed(() => [
  ['最低存款', 'Depósito mínimo', formatAmount(props.platform.minimum_deposit_brl)],
  ['最低取款', 'Saque mínimo', formatAmount(props.platform.minimum_withdrawal_brl)],
  ['提现速度', 'Prazo de saque', props.platform.withdrawal_time?.trim()],
  ['保障状态', 'Status da proteção', t('保障中', 'Proteção ativa')],
  ['担保金额', 'Valor da garantia', formatAmount(props.platform.guarantee_amount_brl)],
  ['最高返利', 'Cashback máximo', props.maxRebate],
])
</script>

<template>
  <section class="surface stack platform-content" aria-labelledby="platform-intro-facts">
    <h2 id="platform-intro-facts">{{ t('网站信息', 'Informações do site') }}</h2>
    <dl class="intro-information">
      <div v-for="[label, translation, value] in information" :key="label">
        <dt>{{ t(label, translation) }}</dt>
        <dd :class="{ 'intro-unavailable': !value }">{{ value || t('未公布', 'Não informado') }}</dd>
      </div>
      <div>
        <dt>{{ t('在线客服', 'Atendimento online') }}</dt>
        <dd v-if="supportUrl">
          <a :href="supportUrl" target="_blank" rel="noopener noreferrer">{{ t('联系平台客服', 'Falar com o suporte') }} <span aria-hidden="true">↗</span></a>
        </dd>
        <dd v-else class="intro-unavailable">{{ t('未公布', 'Não informado') }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.intro-information { margin: 0; font-size: 13px; }
.intro-information > div { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 3px 8px; border-top: 1px solid var(--line); padding-block: 7px; }
.intro-information dt { color: var(--muted); }
.intro-information dd { margin: 0; color: var(--highlight); font-weight: 750; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.intro-information .intro-unavailable { color: var(--muted); font-weight: 400; }
.intro-information a { color: inherit; text-underline-offset: 3px; }
</style>
