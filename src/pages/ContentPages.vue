<script setup>
import { useLocale } from '../locale.js'
import { ref, watch } from 'vue'
import { api, imageUrl } from '../api'
import { go } from '../navigation'

const { t } = useLocale()

const props = defineProps({ route: Object, language: String })
const data = ref(null)
const pagination = ref(null)
const error = ref('')
const busy = ref(false)
const photo = ref(null)
const photoDialog = ref(null)

async function load(route = props.route, signal) {
  busy.value = true
  error.value = ''
  const page = route.query.get('page') || 1
  try {
    const result = await api('/content' + route.path + (route.params.id ? '' : '?page=' + page), { signal })
    if (signal?.aborted) return
    data.value = result.data
    pagination.value = route.params.id ? null : result
  } catch (failure) {
    if (!signal?.aborted) error.value = failure.status === 404 ? '这篇文章已下架或不存在。' : failure.message
  } finally {
    if (!signal?.aborted) busy.value = false
  }
}

watch(() => props.route.fullPath, (_next, _old, onCleanup) => {
  const request = new AbortController()
  onCleanup(() => request.abort())
  load(props.route, request.signal)
}, { immediate: true })

function date(value) {
  return value ? new Date(value).toLocaleDateString(props.language) : ''
}

function enlarge(step) {
  photo.value = step
  photoDialog.value.showModal()
}

import { watchNotice } from '../feedback'
watchNotice(error, () => props.route.path.startsWith('/help') ? '帮助中心加载失败' : '公告加载失败', 'error')
</script>

<template>
  <div class="stack">
    <div v-if="!busy && error" class="state"><button class="text-button" @click="load()">{{ t('重试') }}</button></div>
    <template v-else-if="!busy && Array.isArray(data)">
      <ul v-if="data.length" class="row-list">
        <li v-for="item in data" :key="item.id">
          <button @click="go(route.path + '/' + item.id)">
            <span><strong>{{ item.title }}</strong><small>{{ date(item.published_at) }}</small></span><span aria-hidden="true">›</span>
          </button>
        </li>
      </ul>
      <p v-else class="state">{{ t('暂无内容。') }}</p>
      <div v-if="pagination?.last_page > 1" class="pagination">
        <button class="quiet" :disabled="pagination.current_page <= 1" @click="go(route.path + '?page=' + (pagination.current_page - 1))">{{ t('上一页') }}</button>
        <span>{{ pagination.current_page }} / {{ pagination.last_page }}</span>
        <button class="quiet" :disabled="pagination.current_page >= pagination.last_page" @click="go(route.path + '?page=' + (pagination.current_page + 1))">{{ t('下一页') }}</button>
      </div>
    </template>
    <article v-else-if="!busy && data" class="surface stack content-article">
      <h2>{{ data.title }}</h2>
      <time v-if="data.published_at" class="muted" :datetime="data.published_at">{{ date(data.published_at) }}</time>
      <div v-if="data.body_html" class="content-rich" v-html="data.body_html"></div>
      <p v-else-if="data.body">{{ data.body }}</p>
      <section v-for="(step, index) in data.steps" :key="index" class="stack">
        <h3 v-if="step.title">{{ step.title }}</h3>
        <p v-if="step.body">{{ step.body }}</p>
        <button v-if="imageUrl(step.image_url)" class="content-image" @click="enlarge(step)" :aria-label="t('放大步骤图片')">
          <img :src="imageUrl(step.image_url)" :alt="step.title || ''">
        </button>
        <p v-if="step.caption" class="muted">{{ step.caption }}</p>
      </section>
      <div class="action-row">
        <button v-if="data.action_target" class="primary" @click="go(data.action_target)">{{ t('查看相关内容') }}</button>
        <button v-if="route.path.startsWith('/help/')" class="quiet" @click="go('/support?' + new URLSearchParams({ topic: data.title }))">{{ t('联系在线客服') }}</button>
      </div>
    </article>
    <dialog ref="photoDialog" class="photo-dialog" :aria-label="t('教程图片')">
      <form method="dialog"><button class="close-button" :aria-label="t('关闭')">×</button></form>
      <img v-if="photo" :src="imageUrl(photo.image_url)" :alt="photo.title || ''">
    </dialog>
  </div>
</template>
