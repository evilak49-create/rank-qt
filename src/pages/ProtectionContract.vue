<script setup>
import EmptyState from '../EmptyState.vue'
import { useLocale } from '../locale'
import seal from '../assets/protection-contract-seal.png'

defineProps({ terms: Object })
const { t } = useLocale()
</script>

<template>
  <article class="protection-contract">
    <header class="contract-heading">
      <h2>{{ terms?.title || t('保障条款') }}</h2>
      <img v-if="terms" :src="seal" alt="" width="112" height="112" class="contract-seal">
    </header>
    <div v-if="terms?.body_html" class="contract-content" v-html="terms.body_html"></div>
    <p v-else-if="terms" class="contract-content contract-plain">{{ terms.body }}</p>
    <EmptyState v-else compact class="contract-empty" :message="t('该平台暂无公开保障条款。')" />
  </article>
</template>

<style scoped>
.protection-contract {
  box-sizing: border-box;
  width: 100%;
  max-width: 48rem;
  margin-inline: auto;
  padding: clamp(1rem, 5vw, 2.75rem);
  border: 1px solid #cbb797;
  border-radius: .4rem;
  background: #fffaf0;
  box-shadow: 0 .4rem 1.25rem #160e0780, inset 0 0 0 .32rem #eee0c955;
  color: #332719;
}

.contract-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: clamp(.45rem, 3vw, 1.5rem);
  padding: .5rem 0 1.1rem;
  border-top: .2rem double #9a744d;
  border-bottom: 1px solid #cbb797;
}

.contract-heading h2 {
  align-self: center;
  margin: 0;
  color: #2e1b13;
  font: 700 clamp(1.45rem, 4vw, 2.3rem)/1.23 Georgia, 'Songti SC', SimSun, serif;
  overflow-wrap: anywhere;
}

.contract-seal {
  display: block;
  width: clamp(4.5rem, 22vw, 7rem);
  height: auto;
  transform: rotate(-8deg);
}

.contract-content,
.contract-empty {
  margin: 1.35rem 0 0;
  font: 400 1rem/1.85 Georgia, 'Songti SC', SimSun, serif;
  overflow-wrap: anywhere;
}

.contract-empty { color: #695540; }
.contract-plain { white-space: pre-wrap; }
.contract-content :deep(h2),
.contract-content :deep(h3),
.contract-content :deep(h4) {
  margin: 1.25em 0 .45em;
  color: #432919;
  font-weight: 700;
  line-height: 1.4;
}
.contract-content :deep(p) { margin: 0 0 .9em; }
.contract-content :deep(ol),
.contract-content :deep(ul) { margin: .3em 0 1em; padding-inline-start: 1.65em; }
.contract-content :deep(li) { padding-inline-start: .2em; }
.contract-content :deep(blockquote) {
  margin: .9em 0;
  padding-inline-start: .9em;
  border-inline-start: .18rem solid #bb9670;
}
.contract-content :deep(a) { color: #7a2922; text-decoration: underline; }
.contract-content :deep(img) { max-width: 100%; height: auto; }
.contract-content :deep(> :first-child) { margin-block-start: 0; }
.contract-content :deep(> :last-child) { margin-block-end: 0; }
</style>
