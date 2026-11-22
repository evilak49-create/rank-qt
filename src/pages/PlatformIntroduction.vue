<script setup>
import { computed } from 'vue'
import { useLocale } from '../locale.js'
import { formatBrl } from '../money.js'

const props = defineProps({
  platform: { type: Object, required: true },
  guaranteeAmount: { type: String, required: true },
  maxRebate: { type: String, required: true },
})

const { t } = useLocale()
const description = computed(() => props.platform.description?.trim())
const supportUrl = computed(() => {
  try {
    const url = new URL(props.platform.support_url)
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
})

function formatMinimum(amount) {
  return amount == null || amount === '' ? '' : formatBrl(Math.round(Number(amount) * 100))
}

const information = computed(() => [
  ['最低存款', 'Depósito mínimo', formatMinimum(props.platform.minimum_deposit_brl)],
  ['最低提现', 'Saque mínimo', formatMinimum(props.platform.minimum_withdrawal_brl)],
  ['提现时间', 'Prazo de saque', props.platform.withdrawal_time?.trim()],
  ['担保金额', 'Valor da garantia', props.guaranteeAmount],
])
</script>

<template>
  <div class="stack">
    <section class="surface stack platform-content" aria-labelledby="platform-intro-facts">
      <h2 id="platform-intro-facts">{{ t('平台信息', 'Informações da plataforma') }}</h2>
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
        <div v-if="maxRebate && maxRebate !== '—'">
          <dt>{{ t('平台标注最高返利', 'Cashback máximo anunciado') }}</dt>
          <dd>{{ maxRebate }}</dd>
        </div>
      </dl>
    </section>

    <section class="surface stack platform-content" aria-labelledby="platform-intro-description">
      <h2 id="platform-intro-description">{{ t('平台详细介绍', 'Sobre a plataforma') }}</h2>
      <p v-if="description" class="preserved">{{ description }}</p>
      <p v-else class="muted">{{ t('暂无平台简介。', 'Descrição indisponível') }}</p>
    </section>
  </div>
</template>

<style scoped>
.intro-information { margin: 0; font-size: 13px; }
.intro-information > div { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 3px 8px; border-top: 1px solid var(--line); padding-block: 7px; }
.intro-information dt { color: var(--muted); }
.intro-information dd { margin: 0; color: var(--highlight); font-weight: 750; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.intro-information .intro-unavailable { color: var(--muted); font-weight: 400; }
.intro-information a { color: inherit; text-underline-offset: 3px; }
</style>
