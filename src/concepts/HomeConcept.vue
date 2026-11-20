<script setup>
import brandLogo from '../assets/pingji-logo.svg'
import { imageUrl } from '../api'
import PlatformCard from '../PlatformCard.vue'
import cobalt from '../assets/slots-cobalt.jpg'
import cherry from '../assets/slots-cherry.jpg'
import violet from '../assets/slots-violet.jpg'
import jade from '../assets/slots-jade.jpg'

defineProps({
  design: { type: Object, required: true },
  platforms: { type: Array, required: true },
  announcement: { type: Object, default: null },
  state: { type: String, required: true },
})
defineEmits(['open', 'retry'])

const links = [
  { icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z', label: '平台目录', action: 'platforms' },
  { icon: 'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4', label: '返利指南', action: 'help' },
  { icon: 'M3 8h18v4H3zM5 12v8h14v-8M12 8v12M12 8C5 8 5 3 8 3c2 0 4 5 4 5s2-5 4-5c3 0 3 5-4 5Z', label: '积分商城', action: 'shop' },
  { icon: 'M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v6H4zM17 13h3v6h-3zM20 19c0 2-2 2-5 2', label: '客服支持', action: 'support' },
]
const artwork = { reels: cobalt, prism: cherry, orbit: violet, coin: jade, photo: cherry, shield: jade }
</script>

<template>
  <div class="prototype" :data-design="design.id" :data-hero="design.hero" :data-list="design.list"
       :data-art="design.art" :style="design.style">
    <header class="proto-header">
      <span class="proto-brand"><img :src="brandLogo" alt="" width="31" height="31">评级网</span>
      <button class="header-link" @click="$emit('open', 'platforms')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></svg>
        查平台
      </button>
    </header>
    <div class="proto-body">
      <template v-for="section in design.sections" :key="section">
        <section v-if="section === 'hero'" class="proto-hero">
          <div class="hero-copy">
            <h1>Slots 平台<br><em>评级与返利</em></h1>
            <p>平台评分 · 会员口碑 · 返利规则</p>
            <button class="proto-cta" @click="$emit('open', 'platforms')">浏览平台 <span aria-hidden="true">↗</span></button>
          </div>
          <div class="hero-visual" aria-hidden="true">
            <img :src="artwork[design.art]" alt="">
          </div>
          <div v-if="design.hero === 'score' && platforms[0]?.rating != null" class="hero-score">
            <strong>★ {{ platforms[0].rating }}</strong><span>{{ platforms[0].name }}</span>
          </div>
        </section>

        <div v-else-if="section === 'links'" class="proto-links" aria-label="热门入口">
          <button v-for="link in links" :key="link.action" @click="$emit('open', link.action)">
            <span class="link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path :d="link.icon"/></svg></span><b>{{ link.label }}</b>
          </button>
        </div>

        <section v-else-if="section === 'ranking'" class="proto-ranking">
          <header><h2>{{ design.list === 'table' ? '精选平台榜' : '精选平台' }}</h2><button @click="$emit('open', 'platforms')">查看全部 <span aria-hidden="true">↗</span></button></header>
          <div v-if="platforms.length" class="proto-list">
            <PlatformCard v-for="(platform, index) in platforms" :key="platform.id" class="proto-platform"
                          :row="design.list !== 'cards'" :platform-id="platform.id" :name="platform.name"
                          :promotion-url="platform.promotion_url" :detail-href="'./#/platforms/' + platform.id">
              <span v-if="design.list === 'table'" class="position">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="proto-logo">
                {{ platform.name.slice(0, 1) }}
                <img v-if="imageUrl(platform.logo_url)" :src="imageUrl(platform.logo_url)" alt="" loading="lazy"
                     @error="event => event.target.hidden = true">
              </span>
              <span class="proto-platform-label"><b>{{ platform.name }}</b><small>{{ platform.review_count ?? 0 }} 条评价</small></span>
              <strong v-if="platform.rating != null" class="proto-rating">★ {{ platform.rating }}</strong>
            </PlatformCard>
          </div>
          <div v-else class="proto-status">
            <span v-if="state !== 'loading'">{{ state === 'error' ? '暂时无法加载平台' : '暂无精选平台' }}</span>
            <button v-if="state === 'error'" @click="$emit('retry')">重试</button>
          </div>
        </section>

        <button v-else class="proto-notice" @click="$emit('open', 'announcement', announcement?.id)">
          <strong>公告</strong><span>{{ announcement?.title || '查看站点公告' }}</span><span aria-hidden="true">→</span>
        </button>
      </template>
    </div>
    <footer class="proto-footer">评级网 <span>Slots 平台评级与返利</span></footer>
  </div>
</template>
