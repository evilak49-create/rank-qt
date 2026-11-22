<script setup>
import { computed } from 'vue'
import { useLocale } from '../locale.js'

const props = defineProps({
  platform: { type: Object, required: true },
  guaranteeAmount: { type: String, required: true },
  maxRebate: { type: String, required: true },
})

const { t } = useLocale()
const description = computed(() => props.platform.description?.trim())
const information = computed(() => [
  ['本站担保', 'Garantia do site', props.guaranteeAmount],
  ['平台标注最高返利', 'Cashback máximo anunciado', props.maxRebate === '—' ? '' : props.maxRebate],
].filter(([, , value]) => value))
</script>

<template>
  <section class="surface stack platform-content">
    <h2>{{ platform.name }}</h2>
    <p v-if="description" class="preserved">{{ description }}</p>
    <dl v-if="information.length" class="intro-information">
      <div v-for="[label, translation, value] in information" :key="label">
        <dt>{{ t(label, translation) }}</dt>
        <dd>{{ value }}</dd>
      </div>
    </dl>
    <p v-if="!description && !information.length" class="muted">{{ t('暂无平台简介', 'Descrição indisponível') }}</p>
  </section>
</template>

<style scoped>
.intro-information { margin: 0; font-size: 13px; }
.intro-information > div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 3px 8px; border-top: 1px solid var(--line); padding-block: 7px; }
.intro-information dt { color: var(--muted); }
.intro-information dd { margin: 0; color: var(--highlight); font-weight: 750; font-variant-numeric: tabular-nums; }
</style>
