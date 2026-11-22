<script setup>
import { computed, ref } from 'vue'
import { imageUrl } from '../api.js'
import { icons } from '../icons.js'
import { useLocale } from '../locale.js'

const props = defineProps({
  platform: { type: Object, required: true },
  guaranteeAmount: { type: String, required: true },
  maxRebate: { type: String, required: true },
})

const { t } = useLocale()
const unavailable = computed(() => t('待补充（占位）', 'Dados pendentes'))
const unverified = computed(() => t('待核实（占位）', 'Verificação pendente'))
const logo = computed(() => imageUrl(props.platform.logo_url))
const failedLogo = ref('')
const initials = computed(() => Array.from(props.platform.name).slice(0, 2).join(''))
const description = computed(() => props.platform.description?.trim())

// The public detail response has no dedicated fields for this metadata or verified credentials.
const facts = [
  ['成立时间', 'Fundação', 'M7 3v4m10-4v4M4 9h16M4 5h16v15H4z'],
  ['运营地区', 'Regiões', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 4-5 14 0 18 5-4 5-14 0-18Z'],
  ['游戏类型', 'Tipos de jogos', 'M7 8h10a3 3 0 0 1 3 2l2 6a2 2 0 0 1-3 2l-3-3H8l-3 3a2 2 0 0 1-3-2l2-6a3 3 0 0 1 3-2Zm0 3v4m-2-2h4m7 0h.01m2-2h.01'],
  ['支持语言', 'Idiomas', 'M4 5h16v11h-9l-5 4v-4H4zM8 10h.01m4 0h.01m4 0h.01'],
]
const benefits = computed(() => [
  ['本站担保', 'Garantia do site', icons.protection, props.guaranteeAmount],
  ['平台标注最高返利', 'Cashback máximo anunciado', icons.points, props.maxRebate === '—' ? '' : props.maxRebate],
])
const credentials = [
  ['监管牌照', 'Licença regulatória', icons.document],
  ['安全资质', 'Certificações de segurança', 'M5 10h14v10H5zM8 10V7a4 4 0 0 1 8 0v3m-4 4v2'],
]
</script>

<template>
  <div class="stack">
    <section class="intro-section" aria-labelledby="intro-brand">
      <h2 id="intro-brand">{{ t('品牌介绍', 'Sobre a marca') }}</h2>
      <div class="intro-brand">
        <div class="intro-logo">
          <img v-if="logo && logo !== failedLogo" :key="logo" :src="logo" :alt="platform.name"
            width="84" height="72" @error="failedLogo = logo">
          <template v-else>
            <span aria-hidden="true">{{ initials }}</span>
            <small>{{ t('标识待补充', 'Logo pendente') }}</small>
          </template>
        </div>
        <div class="intro-description">
          <h3>{{ platform.name }}</h3>
          <p v-if="description">{{ description }}</p>
          <p v-else class="intro-placeholder">{{ unavailable }}</p>
        </div>
      </div>
    </section>

    <section class="intro-section" aria-labelledby="intro-facts">
      <h2 id="intro-facts">{{ t('平台信息', 'Informações da plataforma') }}</h2>
      <dl class="intro-grid intro-facts">
        <div v-for="[label, translation, icon] in facts" :key="label" class="intro-fact">
          <dt>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="icon" /></svg>
            {{ t(label, translation) }}
          </dt>
          <dd class="intro-placeholder">{{ unavailable }}</dd>
        </div>
      </dl>
    </section>

    <section class="intro-section" aria-labelledby="intro-benefits">
      <h2 id="intro-benefits">{{ t('平台优势', 'Benefícios da plataforma') }}</h2>
      <dl class="intro-grid intro-pair">
        <div v-for="[label, translation, icon, value] in benefits" :key="label" class="intro-benefit">
          <dt>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="icon" /></svg>
            {{ t(label, translation) }}
          </dt>
          <dd :class="{ 'intro-placeholder': !value }">{{ value || unavailable }}</dd>
        </div>
      </dl>
    </section>

    <section class="intro-section" aria-labelledby="intro-credentials">
      <h2 id="intro-credentials">{{ t('牌照与安全', 'Licenças e segurança') }}</h2>
      <dl class="intro-grid intro-pair">
        <div v-for="[label, translation, icon] in credentials" :key="label" class="intro-credential">
          <dt>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="icon" /></svg>
            {{ t(label, translation) }}
          </dt>
          <dd class="intro-placeholder">{{ unverified }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.intro-section {
  min-width: 0;
  padding: clamp(10px, 3vw, 15px);
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background: radial-gradient(ellipse at left top, #3b2919 0, transparent 72%), var(--surface-gradient);
  overflow-wrap: anywhere;
}

.intro-section h2 {
  margin-bottom: 10px;
  padding-inline-start: 8px;
  border-inline-start: 3px solid var(--highlight);
  color: var(--highlight);
  font-size: 16px;
  line-height: 1.25;
}

.intro-brand {
  display: grid;
  grid-template-columns: clamp(68px, 23vw, 92px) minmax(0, 1fr);
  align-items: start;
  gap: 11px;
}

.intro-logo {
  display: grid;
  align-content: center;
  justify-items: center;
  min-height: 72px;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: linear-gradient(145deg, var(--surface-highlight), var(--surface-recessed));
  color: var(--highlight);
  font-size: 22px;
  font-weight: 800;
  text-align: center;
}

.intro-logo img { display: block; width: 100%; height: 72px; object-fit: contain; }
.intro-logo small { padding-inline: 3px; color: var(--text-subtle); font-size: 10px; font-weight: 600; }
.intro-description h3 { margin-bottom: 3px; font-size: 14px; }
.intro-description p { color: var(--muted); font-size: 13px; white-space: pre-wrap; }

.intro-grid { display: grid; margin: 0; }
.intro-grid dt { font-weight: 700; }
.intro-grid dd { margin: 0; }
.intro-grid svg {
  display: block;
  width: 22px;
  height: 22px;
  color: var(--highlight);
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

.intro-facts {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding-block: 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-recessed);
  text-align: center;
}

.intro-fact { display: grid; grid-template-rows: 1fr auto; gap: 4px; padding-inline: 3px; font-size: 11px; }
.intro-fact + .intro-fact { border-inline-start: 1px solid var(--line); }
.intro-fact dt,
.intro-credential dt { display: grid; justify-items: center; align-content: start; gap: 4px; }
.intro-fact svg { width: 19px; height: 19px; }

.intro-pair { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.intro-benefit,
.intro-credential {
  display: grid;
  gap: 3px 7px;
  align-content: start;
  padding: 9px 7px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-recessed);
  font-size: 12px;
  line-height: 1.35;
}

.intro-benefit {
  position: relative;
  padding-inline-start: 39px;
  background: linear-gradient(135deg, var(--surface-highlight), var(--surface-recessed) 80%);
}

.intro-benefit svg {
  position: absolute;
  inset: 50% auto auto 7px;
  width: 25px;
  height: 25px;
  transform: translateY(-50%);
}

.intro-benefit dd { color: var(--highlight); font-weight: 750; font-variant-numeric: tabular-nums; }
.intro-credential { justify-items: center; gap: 4px; text-align: center; }
.intro-section .intro-placeholder { color: var(--text-subtle); font-size: 11px; font-weight: 500; }
</style>
