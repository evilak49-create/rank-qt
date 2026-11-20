<script setup>
import { computed, nextTick, onActivated, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { api, imageUrl } from './api'
import { watchNotice } from './feedback'
import { icons } from './icons'

const props = defineProps({ language: String, topic: String })
const emit = defineEmits(['follow', 'account', 'back'])
const settings = ref(null)
const messages = ref([])
const question = ref('')
const busy = ref(false)
const error = ref('')
const copied = ref('')
const handoff = ref(null)
const conversation = ref(null)
const viewportHeight = ref(0)
const liveChat = computed(() => settings.value?.mode === 'chat')
const avatar = computed(() => imageUrl(settings.value?.avatar_url))
const humanChannels = computed(() => messages.value.findLast(item => item.reply?.type === 'human')?.reply.channels
  ?? settings.value?.channels ?? [])
const destinations = { '/orders': '/shop/redemptions', '/withdrawals': '/red-packets', '/wallet': '/wallet' }

const labels = computed(() => props.language === 'pt-BR' ? {
  name: 'Atendimento · 评级网', online: 'Assistente online', human: 'Canais disponíveis',
  offline: 'Indisponível', placeholder: 'Digite sua mensagem',
  send: 'Enviar', retry: 'Tentar de novo', contact: 'Atendimento humano',
  greeting: 'Olá! Como posso ajudar?', back: 'Voltar',
} : {
  name: '评级网客服', online: 'AI 客服在线', human: '人工渠道可联系',
  offline: '暂不可用', placeholder: '输入消息',
  send: '发送', retry: '重试', contact: '联系人工客服',
  greeting: '您好，请问有什么可以帮您？', back: '返回',
})
const supportName = computed(() => settings.value?.display_name || labels.value.name)

const availability = computed(() => {
  if (liveChat.value) return labels.value.online
  if (humanChannels.value.length) return labels.value.human
  return settings.value || error.value ? labels.value.offline : ''
})

watch(() => props.topic, topic => {
  if (topic && !question.value.trim()) question.value = topic.slice(0, 500)
}, { immediate: true })
watchNotice(error, '客服服务提醒', 'error')
watchNotice(copied, '联系方式复制提醒')

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
    copied.value = '已复制 ' + channel.name
  } catch {
    copied.value = '无法自动复制，请手动选择联系方式。'
  }
}

async function load() {
  error.value = ''
  try {
    settings.value = (await api('/support?' + new URLSearchParams({ language: props.language }), { fresh: true })).data
  } catch (failure) {
    error.value = failure.message
  }
}

async function send(item) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  item.state = 'pending'
  scrollToLatest()
  try {
    const { data } = await api('/support/chat', { body: { question: item.question, language: props.language }, timeoutMs: 18000 })
    item.reply = data
    item.state = 'answered'
  } catch (failure) {
    item.state = 'failed'
    error.value = failure.message
  } finally {
    busy.value = false
    scrollToLatest()
  }
}

function ask(text = question.value) {
  const value = text.trim()
  if (!value || busy.value || !liveChat.value) return
  const item = reactive({ question: value, state: 'pending', reply: null })
  messages.value.push(item)
  question.value = ''
  send(item)
}

function enter(event) {
  if (event.isComposing) return
  event.preventDefault()
  ask()
}

onMounted(() => {
  load()
  resizeChat()
  window.visualViewport?.addEventListener('resize', resizeChat)
})
onUnmounted(() => window.visualViewport?.removeEventListener('resize', resizeChat))
onActivated(() => {
  resizeChat()
  scrollToLatest()
})
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
      <div v-if="liveChat && !messages.length && settings.suggestions?.length" class="conversation-suggestions">
        <button v-for="item in settings.suggestions" :key="item.id" @click="ask(item.question)">{{ item.question }}</button>
      </div>
      <template v-for="(item, index) in messages" :key="index">
        <div class="conversation-line outgoing-line"><p class="chat-bubble outgoing">{{ item.question }}</p></div>
        <button v-if="item.state === 'failed'" class="chat-retry" :disabled="busy" @click="send(item)">{{ labels.retry }}</button>
        <div v-if="item.reply" class="conversation-line">
          <span class="chat-avatar mini" aria-hidden="true">
            <img v-if="avatar" :src="avatar" alt="">
            <svg v-else viewBox="0 0 24 24"><path :d="icons.support"/></svg>
          </span>
          <div class="chat-bubble incoming">
            <p>{{ item.reply.answer }}</p>
            <button v-if="item.reply.help" class="chat-bubble-link" @click="emit('follow', item.reply.help.link)">{{ item.reply.help.title }} →</button>
            <button v-if="item.reply.type === 'personal'" class="chat-bubble-link" @click="emit('account', destinations[item.reply.link])">查看个人记录 →</button>
            <button v-if="item.reply.type === 'human' && humanChannels.length" class="chat-bubble-link" @click="handoff.showModal()">{{ labels.contact }} →</button>
          </div>
        </div>
      </template>
    </div>

    <form v-if="liveChat" class="chat-composer" @submit.prevent="ask()">
      <textarea v-model="question" rows="1" maxlength="500" :placeholder="labels.placeholder" :aria-label="labels.placeholder" @keydown.enter.exact="enter"></textarea>
      <button class="primary" :disabled="!question.trim() || busy">{{ labels.send }}</button>
    </form>
    <div v-else-if="humanChannels.length || error" class="chat-composer contact-only">
      <button v-if="humanChannels.length" class="primary" @click="handoff.showModal()">{{ labels.contact }}</button>
      <button v-else-if="error && !settings" class="quiet" @click="load">{{ labels.retry }}</button>
    </div>

    <dialog ref="handoff" :aria-label="labels.contact">
      <div class="panel-header"><h2>{{ labels.contact }}</h2><form method="dialog"><button class="close-button" aria-label="关闭">×</button></form></div>
      <ul v-if="humanChannels.length" class="channels row-list">
        <li v-for="(channel, index) in humanChannels" :key="index" class="channel-row">
          <a v-if="imageUrl(channel.url)" :href="imageUrl(channel.url)" target="_blank" rel="noopener noreferrer">{{ channel.name }}</a>
          <strong v-else>{{ channel.name }}</strong>
          <span v-if="channel.contact">{{ channel.contact }}</span>
          <button v-if="channel.contact" class="text-button" @click="copyContact(channel)">复制</button>
        </li>
      </ul>
    </dialog>
  </div>
</template>

<style scoped>
.support-chat { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; height: var(--chat-height, 100dvh); background: #101622; }
.chat-top { display: flex; align-items: center; gap: 9px; padding: calc(8px + env(safe-area-inset-top)) 12px 8px; border-bottom: 1px solid var(--line); background: #171f30; }
.chat-top .page-back { flex: 0 0 38px; width: 38px; min-height: 43px; }
.chat-avatar { flex: none; display: grid; place-items: center; width: 41px; height: 41px; overflow: hidden; border: 1px solid #7c64b6; border-radius: 15px; color: #efe7ff; background: linear-gradient(140deg,#7954bb,#483379); }
.chat-avatar img { width: 100%; height: 100%; object-fit: cover; }
.chat-avatar.mini { width: 30px; height: 30px; border-radius: 10px; }
.chat-avatar svg { width: 22px; fill: none; stroke: currentColor; stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; }
.chat-avatar.mini svg { width: 17px; }
.chat-identity { min-width: 0; }
.chat-identity h1 { margin: 0; font-size: 14px; line-height: 1.2; overflow-wrap: anywhere; }
.chat-identity p { display: flex; align-items: center; gap: 5px; margin-top: 4px; color: var(--muted); font-size: 11px; }
.chat-identity .chat-description { display: block; overflow-wrap: anywhere; }
.chat-identity i { flex: none; width: 6px; height: 6px; border-radius: 50%; background: #8c95aa; }
.chat-identity i.online { background: #84e5b4; box-shadow: 0 0 8px #84e5b469; }
.chat-contact { margin-left: auto; flex: none; min-height: 40px; padding: 4px 6px; color: var(--accent); font-size: 11px; }
.chat-thread { min-height: 0; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 12px; padding: 16px 12px; }
.conversation-line { display: flex; align-items: end; gap: 7px; }
.outgoing-line { justify-content: flex-end; }
.chat-bubble { min-width: 0; max-width: 82%; padding: 9px 12px; border-radius: 14px; font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.chat-bubble.incoming { border: 1px solid #34415c; border-bottom-left-radius: 4px; background: #202b3e; }
.chat-bubble.outgoing { border-bottom-right-radius: 4px; color: #fff; background: #684bb2; }
.chat-bubble-link { display: block; padding: 7px 0 0; color: #d4bdff; text-align: left; font-size: 12px; }
.chat-retry { align-self: flex-end; margin-top: -7px; color: #ffbdd0; font-size: 11px; }
.conversation-suggestions { display: flex; flex-wrap: wrap; gap: 6px; padding-left: 37px; }
.conversation-suggestions button { min-height: 34px; padding: 4px 9px; border: 1px solid #564574; border-radius: 14px; color: #e2d3ff; font-size: 12px; text-align: left; }
.chat-composer { display: flex; align-items: end; gap: 8px; padding: 8px 12px max(8px, env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: #171f30; }
.chat-composer textarea { flex: 1; min-height: 44px; max-height: 96px; resize: none; }
.chat-composer .primary { flex: none; }
.chat-composer.contact-only button { width: 100%; }
</style>

