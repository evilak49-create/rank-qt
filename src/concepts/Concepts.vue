<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { api } from '../api'
import brandLogo from '../assets/pingji-logo.svg'
import { designs } from './designs'
import HomeConcept from './HomeConcept.vue'
import DataLoading from '../DataLoading.vue'

const selected = ref(null)
const activeDesign = computed(() => designs.find(design => design.id === selected.value))
const platforms = ref([])
const announcement = ref(null)
const state = ref('loading')
const dialog = ref(null)
const panel = reactive({ title: '', status: 'loading', data: null })
let panelRequest

const content = {
  platforms: { title: '平台目录', path: '/platforms' },
  platform: { title: '平台详情', path: '/platforms/' },
  help: { title: '返利指南', path: '/content/help' },
  article: { title: '指南详情', path: '/content/help/' },
  shop: { title: '积分商城', path: '/shop/products' },
  support: { title: '客服支持', path: '/support?language=zh-CN' },
  announcement: { title: '站点公告', path: '/content/announcements/' },
}

async function loadFeatured() {
  state.value = 'loading'
  try {
    platforms.value = (await api('/platforms/featured')).data
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}

function readSelection() {
  const id = location.hash.slice(1)
  selected.value = designs.some(design => design.id === id) ? id : null
}

async function choose(id) {
  location.hash = id || 'all'
  selected.value = id
  await nextTick()
  window.scrollTo(0, 0)
  document.querySelector('#concept-title')?.focus({ preventScroll: true })
}

async function view(kind, id) {
  panelRequest?.abort()
  const request = new AbortController()
  panelRequest = request
  const section = content[kind]
  Object.assign(panel, { kind, title: section.title, status: 'loading', data: null })
  if (!dialog.value.open) dialog.value.showModal()
  const path = kind === 'announcement' && !id ? section.path.slice(0, -1) : section.path + (id ?? '')
  try {
    const { data } = await api(path, { signal: request.signal })
    if (!request.signal.aborted) Object.assign(panel, { status: 'ready', data, title: data?.title || data?.name || section.title })
  } catch (error) {
    if (!request.signal.aborted) panel.status = error.status === 404 ? 'empty' : 'error'
  }
}

function openItem(item) {
  if (panel.kind === 'platforms') view('platform', item.id)
  if (panel.kind === 'help') view('article', item.id)
  if (panel.kind === 'announcement') view('announcement', item.id)
}

onMounted(() => {
  readSelection()
  window.addEventListener('hashchange', readSelection)
  loadFeatured()
  api('/content/announcements/latest').then(result => { announcement.value = result.data }).catch(() => {})
})
</script>

<template>
  <header class="studio-header">
    <div class="studio-wrap studio-bar">
      <a href="./" class="studio-brand"><img :src="brandLogo" alt="" width="27" height="27">评级网</a>
      <span>手机版首页方案</span>
      <a href="./" class="studio-home">当前首页 ↗</a>
    </div>
  </header>

  <main class="studio-wrap">
    <template v-if="!activeDesign">
      <header class="studio-intro">
        <h1 id="concept-title" tabindex="-1">20 款手机版首页</h1>
        <p>选择任意方案，查看完整页面和线上平台数据。</p>
      </header>
      <div class="concept-grid">
        <article v-for="design in designs" :key="design.id" class="concept-tile">
          <button class="tile-hit" :aria-label="design.number + ' ' + design.name + ' · ' + design.layout" @click="choose(design.id)"></button>
          <span class="tile-caption">
            <span class="design-number">{{ design.number }}</span>
            <span><b>{{ design.name }}</b><small>{{ design.layout }}</small></span>
            <span class="swatches" :style="design.style" aria-hidden="true"><i></i><i></i><i></i></span>
          </span>
          <div class="tile-viewport" inert aria-hidden="true">
            <HomeConcept :design="design" :platforms="platforms" :announcement="announcement" :state="state" />
          </div>
        </article>
      </div>
    </template>
    <template v-else>
      <div class="preview-controls">
        <button @click="choose(null)">← 全部方案</button>
        <label>
          <span class="visually-hidden">切换首页方案</span>
          <select :value="activeDesign.id" @change="choose($event.target.value)">
            <option v-for="design in designs" :key="design.id" :value="design.id">
              {{ design.number }} {{ design.name }} · {{ design.layout }}
            </option>
          </select>
        </label>
      </div>
      <header class="preview-heading">
        <h1 id="concept-title" tabindex="-1">{{ activeDesign.name }}</h1>
        <span>{{ activeDesign.layout }}</span>
      </header>
      <div class="phone-preview">
        <HomeConcept :design="activeDesign" :platforms="platforms" :announcement="announcement" :state="state"
                     @open="view" @retry="loadFeatured" />
      </div>
    </template>
  </main>

  <dialog ref="dialog" class="concept-dialog" aria-labelledby="detail-title" @close="panelRequest?.abort()">
    <header><h2 id="detail-title">{{ panel.title }}</h2><form method="dialog"><button aria-label="关闭">×</button></form></header>
    <template v-if="panel.status === 'loading'"></template>
    <p v-else-if="panel.status === 'error'" role="status">暂时无法加载，请稍后重试。</p>
    <p v-else-if="panel.status === 'empty' || !panel.data || (Array.isArray(panel.data) && !panel.data.length)">暂无相关内容。</p>
    <ul v-else-if="Array.isArray(panel.data)" class="dialog-list">
      <li v-for="item in panel.data" :key="item.id">
        <template v-if="panel.kind === 'shop'">
          <strong>{{ item.name }}</strong><span>{{ item.points_price }} 积分</span>
        </template>
        <button v-else @click="openItem(item)">
          <strong>{{ item.title || item.name }}</strong><span>{{ item.rating == null ? '→' : '★ ' + item.rating }}</span>
        </button>
      </li>
    </ul>
    <div v-else class="dialog-article">
      <p v-if="panel.data.rating != null">★ {{ panel.data.rating }} · {{ panel.data.review_count ?? 0 }} 条评价</p>
      <p v-if="panel.data.body || panel.data.description || panel.data.answer">{{ panel.data.body || panel.data.description || panel.data.answer }}</p>
      <article v-for="(step, index) in panel.data.steps" :key="index"><strong>{{ step.title }}</strong><p>{{ step.body }}</p></article>
    </div>
  </dialog>
  <DataLoading />
</template>
