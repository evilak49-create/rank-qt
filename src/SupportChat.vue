<script setup>
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { api, imageUrl } from './api'
import { watchNotice } from './feedback'
import { icons } from './icons'
import { createRequestId } from './requestId'

const props = defineProps({ language: String, topic: String })
const emit = defineEmits(['follow', 'account', 'back'])
const settings = ref(null)
const messages = ref([])
const drafts = ref([])
const threadId = ref(null)
const threadMode = ref('ai')
const threadLoaded = ref(false)
const hasEarlier = ref(false)
const loadingEarlier = ref(false)
const question = ref('')
const busy = ref(false)
const error = ref('')
const copied = ref('')
const handoff = ref(null)
const conversation = ref(null)
const viewportHeight = ref(0)
let session
let pollTimer
let readVersion = 0
let polling = false
const liveChat = computed(() => threadLoaded.value)
const avatar = computed(() => imageUrl(settings.value?.avatar_url))
const humanChannels = computed(() => [...messages.value].reverse().find(item => item.reply?.type === 'human')?.reply.channels
  ?? settings.value?.channels ?? [])
const destinations = { '/orders': '/shop/redemptions', '/withdrawals': '/withdrawal-history', '/wallet': '/cash-wallet' }

const labels = computed(() => props.language === 'pt-BR' ? {
  name: 'Atendimento', online: 'Assistente online', human: 'Canais disponíveis',
  offline: 'Indisponível', placeholder: 'Digite sua mensagem',
  send: 'Enviar', retry: 'Tentar de novo', contact: 'Atendimento humano',
  greeting: 'Olá! Como posso ajudar?', back: 'Voltar',
  records: 'Ver meus registros', close: 'Fechar', copy: 'Copiar',
  earlier: 'Mensagens anteriores', staff: 'Atendimento humano em andamento',
  awaitingStaff: 'Envie uma mensagem para o atendimento',
  notice: 'Atendimento', copyNotice: 'Contato', copied: 'Contato copiado',
  copyFailed: 'Não foi possível copiar. Selecione e copie o contato manualmente.',
  unavailable: 'O atendimento está indisponível no momento. Tente novamente.',
} : {
  name: '返利网客服', online: 'AI 客服在线', human: '人工渠道可联系',
  offline: '暂不可用', placeholder: '输入消息',
  send: '发送', retry: '重试', contact: '联系人工客服',
  greeting: '您好，请问有什么可以帮您？', back: '返回',
  records: '查看个人记录', close: '关闭', copy: '复制',
  earlier: '查看更早消息', staff: '人工客服接待中',
  awaitingStaff: '可留言等待人工客服',
  notice: '客服服务提醒', copyNotice: '联系方式复制提醒', copied: '已复制联系方式',
  copyFailed: '无法自动复制，请手动选择联系方式。',
  unavailable: '客服暂不可用，请稍后重试。',
})
const supportName = computed(() => settings.value?.display_name || labels.value.name)

const availability = computed(() => {
  if (threadMode.value === 'human') return labels.value.staff
  if (liveChat.value) return settings.value?.mode === 'chat' ? labels.value.online : labels.value.awaitingStaff
  if (humanChannels.value.length) return labels.value.human
  return settings.value || error.value ? labels.value.offline : ''
})

watch(() => props.topic, topic => {
  if (topic && !question.value.trim()) question.value = topic.slice(0, 500)
}, { immediate: true })
watchNotice(error, () => labels.value.notice, 'error')
watchNotice(copied, () => labels.value.copyNotice)

async function scrollToLatest() {
  await nextTick()
  const panel = conversation.value
  if (panel) panel.scrollTop = panel.scrollHeight
}

function resizeChat() {
  viewportHeight.value = Math.round(window.visualViewport?.height ?? window.innerHeight)
}

async function copyContact(channel) {
  copied.value = ''
  try {
    await navigator.clipboard.writeText(channel.contact)
    copied.value = labels.value.copied
  } catch {
    copied.value = labels.value.copyFailed
  }
}

function displayError(failure) {
  error.value = props.language === 'pt-BR' ? labels.value.unavailable : failure.message
}

async function load() {
  const signal = session?.signal
  if (!signal || signal.aborted) return
  error.value = ''
  try {
    settings.value = (await api('/support?' + new URLSearchParams({ language: props.language }), { fresh: true, signal, background: true })).data
    await pollThread()
  } catch (failure) {
    if (!signal.aborted) displayError(failure)
  }
}

function mergeThread(data, page) {
  if (threadId.value !== data.id) {
    messages.value = []
    hasEarlier.value = false
  }
  threadId.value = data.id
  threadMode.value = data.mode
  threadLoaded.value = true
  if (data.messages.length) {
    const merged = new Map(messages.value.map(message => [message.id, message]))
    for (const message of data.messages) merged.set(message.id, message)
    messages.value = [...merged.values()].sort((left, right) => left.id - right.id)
    const acknowledged = new Set(data.messages.map(message => message.request_id).filter(Boolean))
    drafts.value = drafts.value.filter(draft => !acknowledged.has(draft.id))
  }
  if (page === 'first' || page === 'earlier') hasEarlier.value = data.has_earlier
}

async function pollThread() {
  const signal = session?.signal
  if (!signal || signal.aborted || polling || busy.value || loadingEarlier.value || document.hidden) return
  const version = readVersion
  polling = true
  try {
    const last = messages.value.at(-1)?.id
    const { data } = await api('/support/conversation' + (last ? '?after=' + last : ''), { signal, background: true })
    if (signal.aborted || readVersion !== version) return
    const panel = conversation.value
    const nearBottom = !panel || panel.scrollHeight - panel.scrollTop - panel.clientHeight < 90
    mergeThread(data, last ? 'newer' : 'first')
    if (data.messages.length && nearBottom) scrollToLatest()
  } catch (failure) {
    if (!signal.aborted && !threadLoaded.value) displayError(failure)
  } finally {
    polling = false
  }
}

async function loadEarlier() {
  const signal = session?.signal
  const first = messages.value[0]?.id
  if (!signal || signal.aborted || !first || loadingEarlier.value || busy.value) return
  const version = ++readVersion
  loadingEarlier.value = true
  const panel = conversation.value
  const previousHeight = panel?.scrollHeight ?? 0
  try {
    const { data } = await api('/support/conversation?before=' + first, { signal, background: true })
    if (signal.aborted || readVersion !== version) return
    mergeThread(data, 'earlier')
    await nextTick()
    if (panel) panel.scrollTop += panel.scrollHeight - previousHeight
  } catch (failure) {
    if (!signal.aborted) displayError(failure)
  } finally {
    loadingEarlier.value = false
  }
}

async function send(item) {
  const signal = session?.signal
  if (!signal || signal.aborted || busy.value || !liveChat.value) return
  readVersion++
  busy.value = true
  error.value = ''
  item.state = 'pending'
  scrollToLatest()
  try {
    const { conversation: updatedThread } = await api('/support/chat', {
      body: { question: item.question, language: props.language, request_id: item.id, conversation_id: threadId.value },
      signal, timeoutMs: 18000, background: true,
    })
    mergeThread(updatedThread, messages.value.length ? 'newer' : 'first')
  } catch (failure) {
    item.state = 'failed'
    if (!signal.aborted) displayError(failure)
  } finally {
    busy.value = false
    scrollToLatest()
  }
}

function ask(text = question.value) {
  const value = text.trim()
  if (!value || busy.value || !liveChat.value) return
  const item = reactive({ id: createRequestId(), question: value, state: 'pending' })
  drafts.value.push(item)
  question.value = ''
  send(item)
}

function enter(event) {
  if (event.isComposing) return
  event.preventDefault()
  ask()
}

function start() {
  if (session) return
  session = new AbortController()
  if (settings.value) pollThread()
  else load()
  pollTimer = window.setInterval(pollThread, 3500)
  resizeChat()
  window.visualViewport?.addEventListener('resize', resizeChat)
}

function stop() {
  session?.abort()
  session = null
  window.clearInterval(pollTimer)
  window.visualViewport?.removeEventListener('resize', resizeChat)
}

onMounted(start)
onActivated(start)
onDeactivated(stop)
onUnmounted(stop)
</script>

<template>
  <div class="support-chat" :style="{ '--chat-height': viewportHeight ? viewportHeight + 'px' : undefined }">
    <header class="chat-top">
      <button class="page-back" :aria-label="labels.back" @click="emit('back')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>
      </button>
      <span class="chat-avatar" aria-hidden="true">
        <img v-if="avatar" :src="avatar" alt="">
        <svg v-else viewBox="0 0 24 24"><path :d="icons.support"/></svg>
      </span>
      <div class="chat-identity">
        <h1>{{ supportName }}</h1>
        <p v-if="availability"><i :class="{ online: liveChat || humanChannels.length }" aria-hidden="true"></i>{{ availability }}</p>
        <p v-if="settings?.description" class="chat-description">{{ settings.description }}</p>
      </div>
      <button v-if="liveChat && humanChannels.length" class="chat-contact" @click="handoff.showModal()">{{ labels.contact }}</button>
    </header>

    <div ref="conversation" class="chat-thread" role="log" aria-live="polite" :aria-label="supportName">
      <div v-if="settings" class="conversation-line">
        <span class="chat-avatar mini" aria-hidden="true">
          <img v-if="avatar" :src="avatar" alt="">
          <svg v-else viewBox="0 0 24 24"><path :d="icons.support"/></svg>
        </span>
        <div class="chat-bubble incoming">{{ liveChat ? settings.welcome || labels.greeting : settings.answer || availability }}</div>
      </div>
      <div v-if="liveChat && threadMode === 'ai' && !messages.length && !drafts.length && settings?.suggestions?.length" class="conversation-suggestions">
        <button v-for="item in settings.suggestions" :key="item.id" @click="ask(item.question)">{{ item.question }}</button>
      </div>
      <button v-if="hasEarlier" class="text-button chat-earlier" :disabled="loadingEarlier || busy" @click="loadEarlier">{{ labels.earlier }}</button>
      <template v-for="item in messages" :key="item.id">
        <div v-if="item.sender === 'visitor'" class="conversation-line outgoing-line"><p class="chat-bubble outgoing">{{ item.body }}</p></div>
        <div v-else class="conversation-line">
          <span class="chat-avatar mini" aria-hidden="true">
            <img v-if="avatar" :src="avatar" alt="">
            <svg v-else viewBox="0 0 24 24"><path :d="icons.support"/></svg>
          </span>
          <div class="chat-bubble incoming">
            <p>{{ item.body }}</p>
            <button v-if="item.reply?.help" class="chat-bubble-link" @click="emit('follow', item.reply.help.link)">{{ item.reply.help.title }} →</button>
            <button v-if="item.reply?.type === 'personal'" class="chat-bubble-link" @click="emit('account', destinations[item.reply.link])">{{ labels.records }} →</button>
            <template v-if="item.reply?.type === 'human'">
              <template v-for="channel in item.reply.channels" :key="channel.name + channel.url">
                <a v-if="imageUrl(channel.url)" class="chat-bubble-link" :href="imageUrl(channel.url)" target="_blank" rel="noopener noreferrer">{{ channel.name }} →</a>
                <button v-else-if="channel.contact" class="chat-bubble-link" @click="copyContact(channel)">{{ channel.name }} · {{ labels.copy }}</button>
              </template>
            </template>
          </div>
        </div>
      </template>
      <template v-for="item in drafts" :key="item.id">
        <div class="conversation-line outgoing-line"><p class="chat-bubble outgoing">{{ item.question }}</p></div>
        <button v-if="item.state === 'failed'" class="chat-retry" :disabled="busy || !liveChat" @click="send(item)">{{ labels.retry }}</button>
      </template>
    </div>

    <form v-if="liveChat" class="chat-composer" @submit.prevent="ask()">
      <textarea v-model="question" rows="1" maxlength="500" :placeholder="labels.placeholder" :aria-label="labels.placeholder" @keydown.enter.exact="enter"></textarea>
      <button class="primary" :disabled="!question.trim() || busy">{{ labels.send }}</button>
    </form>
    <div v-else-if="humanChannels.length || error" class="chat-composer contact-only">
      <button v-if="humanChannels.length" class="primary" @click="handoff.showModal()">{{ labels.contact }}</button>
      <button v-else-if="error && !threadLoaded" class="quiet" @click="load">{{ labels.retry }}</button>
    </div>

    <dialog ref="handoff" :aria-label="labels.contact">
      <div class="panel-header"><h2>{{ labels.contact }}</h2><form method="dialog"><button class="close-button" :aria-label="labels.close">×</button></form></div>
      <ul v-if="humanChannels.length" class="channels row-list">
        <li v-for="(channel, index) in humanChannels" :key="index" class="channel-row">
          <a v-if="imageUrl(channel.url)" :href="imageUrl(channel.url)" target="_blank" rel="noopener noreferrer">{{ channel.name }}</a>
          <strong v-else>{{ channel.name }}</strong>
          <span v-if="channel.contact">{{ channel.contact }}</span>
          <button v-if="channel.contact" class="text-button" @click="copyContact(channel)">{{ labels.copy }}</button>
        </li>
      </ul>
    </dialog>
  </div>
</template>

<style scoped>
.support-chat { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; height: var(--chat-height, 100dvh); background: var(--page-background); }
.chat-top { display: flex; align-items: center; gap: 9px; padding: calc(8px + env(safe-area-inset-top)) 12px 8px; border-bottom: 1px solid var(--line); background: var(--chrome); }
.chat-top .page-back { flex: 0 0 38px; width: 38px; min-height: 43px; }
.chat-avatar { flex: none; display: grid; place-items: center; width: 41px; height: 41px; overflow: hidden; border: 1px solid var(--line-strong); border-radius: 15px; color: var(--on-primary); background: var(--primary); }
.chat-avatar img { width: 100%; height: 100%; object-fit: cover; }
.chat-avatar.mini { width: 30px; height: 30px; border-radius: 10px; }
.chat-avatar svg { width: 22px; fill: none; stroke: currentColor; stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; }
.chat-avatar.mini svg { width: 17px; }
.chat-identity { min-width: 0; }
.chat-identity h1 { margin: 0; font-size: 14px; line-height: 1.2; overflow-wrap: anywhere; }
.chat-identity p { display: flex; align-items: center; gap: 5px; margin-top: 4px; color: var(--muted); font-size: 11px; }
.chat-identity .chat-description { display: block; overflow-wrap: anywhere; }
.chat-identity i { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--text-subtle); }
.chat-identity i.online { background: var(--success); box-shadow: 0 0 8px color-mix(in srgb, var(--success) 40%, transparent); }
.chat-contact { margin-left: auto; flex: none; min-height: 40px; padding: 4px 6px; color: var(--accent); font-size: 11px; }
.chat-thread { min-height: 0; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 12px; padding: 16px 12px; }
.conversation-line { display: flex; align-items: end; gap: 7px; }
.outgoing-line { justify-content: flex-end; }
.chat-bubble { min-width: 0; max-width: 82%; padding: 9px 12px; border-radius: 14px; font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.chat-bubble.incoming { border: 1px solid var(--line); border-bottom-left-radius: 4px; background: var(--surface-raised); }
.chat-bubble.outgoing { border-bottom-right-radius: 4px; color: var(--on-primary); background: var(--primary); }
.chat-bubble-link { display: block; padding: 7px 0 0; color: var(--accent); text-align: left; font-size: 12px; }
.chat-retry { align-self: flex-end; margin-top: -7px; color: var(--danger); font-size: 11px; }
.chat-earlier { align-self: center; }
.conversation-suggestions { display: flex; flex-wrap: wrap; gap: 6px; padding-left: 37px; }
.conversation-suggestions button { min-height: 34px; padding: 4px 9px; border: 1px solid var(--line-strong); border-radius: 14px; color: var(--accent); font-size: 12px; text-align: left; }
.chat-composer { display: flex; align-items: end; gap: 8px; padding: 8px 12px max(8px, env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: var(--chrome); }
.chat-composer textarea { flex: 1; min-height: 44px; max-height: 96px; resize: none; }
.chat-composer .primary { flex: none; }
.chat-composer.contact-only button { width: 100%; }
</style>

