
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { api, imageUrl } from './api'
import heroArt from './assets/home-banner-gold.jpg'
import brandLogo from './assets/pingji-logo.svg'
import PlatformCard from './PlatformCard.vue'
import { icons } from './icons'
import { go } from './navigation'
import './home.css'

const props = defineProps({ route: Object, member: Object, language: String, copy: Object })
const emit = defineEmits(['language'])
const blocks = reactive({
  banners: { path: '/content/banners', data: [], state: 'loading' },
  featured: { path: '/platforms/featured', data: [], state: 'loading' },
  favorites: { path: '/platform-favorites', data: [], state: 'loading' },
})
const shortcuts = { bind: '/binding', points: '/points', protection: '/protection', support: '/support' }
const languages = [
  { id: 'zh-CN', name: '简体中文' },
  { id: 'pt-BR', name: 'Português' },
]
const localeSheet = ref(null)
const currentLanguage = computed(() => languages.find(item => item.id === props.language))
const slide = ref(0)
const brokenBanners = ref(new Set())
const loadedBanner = ref('')
const banners = computed(() => blocks.banners.data.filter(item => imageUrl(item.image_url)).slice(0, 5))
const banner = computed(() => banners.value[slide.value])
const bannerSource = computed(() => banner.value && !brokenBanners.value.has(banner.value.id)
  ? imageUrl(banner.value.image_url) : '')
const managedBanner = computed(() => Boolean(bannerSource.value) && loadedBanner.value === bannerSource.value)
watch(bannerSource, () => { loadedBanner.value = '' }, { flush: 'sync' })
const selection = computed(() => props.member && props.route.query.get('tab') === 'favorites' ? 'favorites' : 'featured')
const selectedBlock = computed(() => blocks[selection.value])
const rulePlatformId = computed(() => (blocks.featured.data[0] ?? blocks.favorites.data[0])?.id)
const rebateRate = ref(null)
const rateFormat = computed(() => new Intl.NumberFormat(props.language, { maximumFractionDigits: 6 }))
let touchStart

watch(rulePlatformId, async (id, _, onCleanup) => {
  if (!id) return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const { signal } = controller
  const path = '/platforms/' + id
  try {
    const result = await api(path + '/point-rule', { signal }).catch(async error => {
      if (error.status !== 404 || signal.aborted) throw error
      return { data: (await api(path, { signal })).data?.point_rule }
    })
    if (!signal.aborted) rebateRate.value = result.data?.rebate_percent ?? null
  } catch {}
})

function rebateLabel(platform) {
  const rate = Number(platform.point_rule?.rebate_percent ?? rebateRate.value)
  return Number.isFinite(rate) && rate > 0 ? rateFormat.value.format(rate) + '%' : ''
}

function selectLanguage(id) {
  emit('language', id)
  localeSheet.value.close()
}

function changeSlide(step) {
  const count = banners.value.length
  if (count > 1) slide.value = (slide.value + step + count) % count
}

function endSwipe(event) {
  if (!touchStart || !event.changedTouches.length) return
  const { clientX, clientY } = event.changedTouches[0]
  const delta = clientX - touchStart.clientX
  if (Math.abs(delta) > 45 && Math.abs(delta) > Math.abs(clientY - touchStart.clientY)) changeSlide(delta > 0 ? -1 : 1)
  touchStart = null
}

async function loadBlock(block) {
  block.state = 'loading'
  try {
    block.data = (await api(block.path)).data
    block.state = 'ready'
  } catch {
    block.state = 'error'
  }
}

function chooseFavorites() {
  const path = '/?tab=favorites'
  go(props.member ? path : '/login?' + new URLSearchParams({ next: path }))
}

for (const name of ['banners', 'featured']) loadBlock(blocks[name])
watch(() => [props.route.key, props.member?.id], () => {
  if (selection.value === 'favorites') loadBlock(blocks.favorites)
}, { immediate: true })

import { watchNotice } from './feedback'
watchNotice(() => selectedBlock.value.state === 'error' ? copyTextForError() : '', () => selection.value === 'favorites' ? '收藏加载失败' : '推荐平台加载失败', 'error')
function copyTextForError() { return props.copy.error }
</script>

<template>
  <div class="home-gold">
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="brand" href="#/" aria-label="评级网首页" @click.prevent="go('/')">
        <img :src="brandLogo" alt="" width="34" height="34">
        <span class="home-wordmark">
          <strong>评级<span>网</span></strong>
          <small>{{ copy.brandLine }}</small>
        </span>
      </a>
      <button type="button" class="language-switch" aria-haspopup="dialog" :aria-label="copy.locale + ' · ' + currentLanguage.name"
              @click="localeSheet.showModal()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg>
        {{ currentLanguage.name }}
        <svg class="language-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
    </div>
  </header>

  <main class="wrap">
    <h1 class="visually-hidden">{{ copy.title }}</h1>
    <section class="hero" :class="{ 'managed-banner': managedBanner }" :aria-label="copy.slides"
             @touchstart.passive="touchStart = $event.touches[0]" @touchend.passive="endSwipe">
      <button class="hero-area" @click="go(banner?.target || '/platforms')" :aria-label="banner?.name || copy.browse">
        <img v-if="!managedBanner" class="hero-art hero-default" :src="heroArt" alt="">
        <img v-if="bannerSource" :key="bannerSource" class="hero-art hero-managed" :src="bannerSource" alt=""
             @load="loadedBanner = bannerSource" @error="brokenBanners.add(banner.id)">
        <span v-if="!managedBanner" class="hero-content">
          <strong v-if="banner">{{ banner.name }}</strong>
          <template v-else>
            <strong>{{ copy.heroLead }} <em>{{ copy.heroAccent }}</em></strong>
            <small>{{ copy.subtitle }}</small>
            <span class="hero-promise">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.protection"/></svg>
              {{ copy.protection }}
            </span>
          </template>
        </span>
      </button>
      <div v-if="banners.length > 1" class="carousel" :aria-label="copy.slides">
        <button :aria-label="copy.previous" @click="changeSlide(-1)">‹</button>
        <button v-for="(item, index) in banners" :key="item.id" :aria-label="item.name"
                :aria-pressed="slide === index" @click="slide = index"></button>
        <button :aria-label="copy.next" @click="changeSlide(1)">›</button>
      </div>
    </section>

    <div class="shortcuts" :aria-label="copy.shortcuts">
      <button v-for="type in Object.keys(shortcuts)" :key="type" class="shortcut" :data-shortcut="type" @click="go(shortcuts[type])">
        <span class="tile-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path :d="icons[type]"/></svg></span>
        <strong>{{ copy[type] }}</strong>
      </button>
    </div>

    <section class="featured" :aria-label="copy.selection">
      <div class="selection-tabs" :aria-label="copy.selection">
        <button :aria-pressed="selection === 'featured'" @click="go('/')">{{ copy.recommended }}</button>
        <button :aria-pressed="selection === 'favorites'" @click="chooseFavorites">{{ copy.favorites }} <span aria-hidden="true">♡</span></button>
      </div>
      <div v-if="selectedBlock.state === 'ready' && selectedBlock.data.length" class="platform-grid">
        <PlatformCard v-for="(platform, index) in selection === 'featured' ? selectedBlock.data.slice(0, 10) : selectedBlock.data"
                      :key="platform.id" :platform-id="platform.id" :name="platform.name" :logo-url="platform.logo_url"
                      :rating="platform.rating" :rank="selection === 'featured' && index < 3 ? index + 1 : undefined"
                      :promotion-url="platform.promotion_url" inline-actions>
          <template #summary>
            <div class="home-platform-meta">
              <a class="home-platform-protection" :href="'#/platforms/' + platform.id + '/protection'"
                 @click.prevent="go('/platforms/' + platform.id + '/protection')">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="icons.protection"/></svg>{{ copy.protectionTerms }}
              </a>
              <span v-if="rebateLabel(platform)" class="home-platform-rebate">{{ copy.rebate }} <strong>{{ rebateLabel(platform) }}</strong></span>
            </div>
          </template>
        </PlatformCard>
      </div>
      <div v-else-if="selectedBlock.state !== 'loading'" class="state" role="status">
        <span>{{ selectedBlock.state === 'error' ? copy.error : selection === 'favorites' ? copy.noFavorites : copy.empty }}</span>
        <button v-if="selectedBlock.state === 'error'" class="text-button" @click="loadBlock(selectedBlock)">{{ copy.retry }}</button>
      </div>
    </section>
  </main>

  <dialog ref="localeSheet" class="locale-sheet" aria-labelledby="locale-title" @click.self="localeSheet.close()">
    <div class="locale-panel">
      <div class="locale-heading">
        <h2 id="locale-title">{{ copy.chooseLanguage }}</h2>
        <form method="dialog"><button class="locale-close" :aria-label="copy.close">×</button></form>
      </div>
      <button v-for="item in languages" :key="item.id" class="locale-option" :lang="item.id"
              :aria-pressed="language === item.id" @click="selectLanguage(item.id)">
        <span class="locale-mark" aria-hidden="true">
          <svg v-if="item.id === 'zh-CN'" viewBox="0 0 30 20">
            <path fill="#de2910" d="M0 0h30v20H0z"/>
            <g fill="#ffde00">
              <path d="m5 2 .71 2.18H8l-1.85 1.35.7 2.17L5 6.36 3.15 7.7l.7-2.17L2 4.18h2.29z"/>
              <path d="m10 1 .24.72H11l-.62.45.24.72-.62-.44-.62.44.24-.72L9 1.72h.76z" transform="rotate(25 10 2)"/>
              <path d="m12 3 .24.72H13l-.62.45.24.72-.62-.44-.62.44.24-.72L11 3.72h.76z" transform="rotate(40 12 4)"/>
              <path d="m12 6 .24.72H13l-.62.45.24.72-.62-.44-.62.44.24-.72L11 6.72h.76z" transform="rotate(15 12 7)"/>
              <path d="m10 8 .24.72H11l-.62.45.24.72-.62-.44-.62.44.24-.72L9 8.72h.76z" transform="rotate(35 10 9)"/>
            </g>
          </svg>
          <svg v-else viewBox="0 0 30 20">
            <path fill="#009c3b" d="M0 0h30v20H0z"/>
            <path fill="#ffdf00" d="m15 2.2 12.3 7.8L15 17.8 2.7 10z"/>
            <circle cx="15" cy="10" r="5.1" fill="#002776"/>
            <path fill="none" stroke="#fff" stroke-width="1.25" d="M10.1 9a14 14 0 0 1 9.4 3.4"/>
            <g fill="#fff">
              <circle cx="13" cy="11.5" r=".28"/><circle cx="14.7" cy="12.4" r=".31"/><circle cx="16.8" cy="11.9" r=".24"/>
              <circle cx="16.1" cy="8.2" r=".28"/><circle cx="17.5" cy="13" r=".25"/><circle cx="15.4" cy="13.8" r=".23"/>
            </g>
          </svg>
        </span>
        <strong>{{ item.name }}</strong>
        <span class="locale-check" aria-hidden="true">{{ language === item.id ? '✓' : '' }}</span>
      </button>
    </div>
  </dialog>
  </div>
</template>
