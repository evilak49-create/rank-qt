<script setup>
import { useLocale } from '../locale.js'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '../api'
import { go, safePath } from '../navigation'

const { t } = useLocale()

const props = defineProps({ route: Object, member: Object, draftPhone: String })
const emit = defineEmits(['signed-in', 'reset', 'phone'])
const type = computed(() => props.route.path)
const signingIn = computed(() => type.value === '/login')
const registering = computed(() => type.value === '/register')
const phone = ref(props.member?.phone || props.draftPhone || '')
const code = ref('')
const verification = ref(null)
const challenge = ref(null)
const imageBusy = ref(false)
const currentPassword = ref('')
const password = ref('')
const repeat = ref('')
const busy = ref(false)
const smsBusy = ref(false)
const wait = ref(0)
const error = ref('')
const info = ref('')
const created = ref(false)
const imageMode = computed(() => verification.value?.mode === 'image')
const resetUnavailable = computed(() => !registering.value && !signingIn.value && verification.value?.can_reset_password === false)
const destination = computed(() => safePath(props.route.query.get('next'), '/member'))
let timer

watch(phone, value => emit('phone', value))
onBeforeUnmount(() => clearInterval(timer))
watch(type, async (path, previous, onCleanup) => {
  const request = new AbortController()
  onCleanup(() => request.abort())
  verification.value = null
  challenge.value = null
  code.value = ''
  currentPassword.value = ''
  if (path === '/login') return
  try {
    const result = await api('/auth/verification', { signal: request.signal })
    verification.value = result.data
    if (imageMode.value && !resetUnavailable.value) await refreshCaptcha(request.signal)
  } catch (failure) {
    if (!request.signal.aborted) showError(failure)
  }
}, { immediate: true })

function normalizedPhone() {
  const number = phone.value.replace(/\D/g, '')
  if (number.length === 11) return number
  if (number.length === 13 && number.startsWith('55')) return '+' + number
  throw new Error('请输入含区号的 11 位巴西手机号。')
}

function showError(failure) {
  error.value = Object.values(failure.errors ?? {}).flat()[0] || failure.message
}

function change(path) {
  go(path + '?' + new URLSearchParams({ next: destination.value }), { replace: true })
}

async function sms() {
  if (smsBusy.value || wait.value > 0) return
  smsBusy.value = true
  error.value = ''
  try {
    await api('/auth/sms-code', { body: { phone: normalizedPhone(), purpose: registering.value ? 'register' : 'reset_password' } })
    info.value = '验证码已发送。'
    wait.value = 60
    timer = setInterval(() => {
      if (--wait.value <= 0) clearInterval(timer)
    }, 1000)
  } catch (failure) {
    showError(failure)
  } finally {
    smsBusy.value = false
  }
}

async function refreshCaptcha(signal) {
  imageBusy.value = true
  challenge.value = null
  code.value = ''
  try {
    const result = await api('/auth/captcha', {
      body: { purpose: registering.value ? 'register' : 'reset_password' }, signal,
    })
    challenge.value = result.data
  } catch (failure) {
    if (!signal?.aborted) showError(failure)
  } finally {
    imageBusy.value = false
  }
}

async function submit() {
  if (busy.value || smsBusy.value || (!signingIn.value && !created.value
    && (!verification.value || resetUnavailable.value || (imageMode.value && !challenge.value)))) return
  busy.value = true
  error.value = ''
  info.value = ''
  try {
    const credentials = { phone: normalizedPhone(), password: password.value }
    if (signingIn.value || created.value) {
      emit('signed-in', await api('/auth/login', { body: credentials }), destination.value)
      return
    }
    if (repeat.value !== password.value) throw new Error('两次输入的密码不一致。')
    if (new TextEncoder().encode(password.value).length > 72) throw new Error('密码不能超过 72 字节。')
    const body = { ...credentials, code: code.value.trim() }
    if (imageMode.value) {
      body.challenge_id = challenge.value.challenge_id
      if (!registering.value) body.current_password = currentPassword.value
    }
    if (registering.value) {
      const invitation = props.route.query.get('invite_code') || new URLSearchParams(location.search).get('invite_code')
      if (/^[a-f\d]{32}$/i.test(invitation ?? '')) body.invite_code = invitation
      await api('/auth/register', { body })
      created.value = true
      try {
        emit('signed-in', await api('/auth/login', { body: credentials }), destination.value)
      } catch (failure) {
        info.value = '注册成功。请继续登录。'
        showError(failure)
      }
    } else {
      await api('/auth/reset-password', { body })
      emit('reset', destination.value)
    }
  } catch (failure) {
    showError(failure)
    if (imageMode.value && !created.value && !resetUnavailable.value) await refreshCaptcha()
  } finally {
    busy.value = false
  }
}

import { watchNotice } from '../feedback'
watchNotice(error, () => signingIn.value ? '登录提醒' : registering.value ? '注册提醒' : '密码修改提醒', 'error')
watchNotice(info, text => text?.startsWith('验证码') ? '验证码已发送' : '注册成功', 'success')
</script>

<template>
  <div class="surface auth-surface">
    <form class="stack" @submit.prevent="submit">
      <label class="field">{{ t('巴西手机号') }}
        <input v-model="phone" type="tel" autocomplete="username" placeholder="+55" required :readonly="type === '/reset-password' && Boolean(member)">
      </label>
      <p v-if="resetUnavailable" class="muted" role="status">{{ t('短信找回暂不可用，请联系人工客服。') }}</p>
      <div v-if="!signingIn && !created && verification?.mode === 'sms'" class="field">
        <label for="auth-code">{{ t('短信验证码') }}</label>
        <div class="inline-form">
          <input id="auth-code" v-model="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
          <button class="quiet" type="button" :disabled="busy || smsBusy || wait > 0" @click="sms">{{ wait ? wait + t(' 秒') : t('获取验证码') }}</button>
        </div>
      </div>
      <div v-if="!signingIn && !created && imageMode && !resetUnavailable" class="field">
        <label for="image-code">{{ t('图片验证码') }}</label>
        <div class="inline-form">
          <input id="image-code" v-model="code" autocomplete="off" pattern="[A-Za-z2-9]{4}" maxlength="4" required>
          <button class="quiet" type="button" :disabled="imageBusy || busy" @click="refreshCaptcha()" :aria-label="t('换一张验证码')">
            <img v-if="challenge" :src="challenge.image" width="150" height="45" :alt="t('图片验证码')">
            <span v-else>{{ t('获取图片') }}</span>
          </button>
        </div>
      </div>
      <label v-if="!registering && !signingIn && imageMode && !resetUnavailable" class="field">{{ t('当前密码') }}
        <input v-model="currentPassword" type="password" autocomplete="current-password" maxlength="72" required>
      </label>
      <label class="field">{{ signingIn || registering ? t('密码') : t('新密码') }}
        <input v-model="password" type="password" :autocomplete="signingIn || created ? 'current-password' : 'new-password'"
               :minlength="signingIn || created ? undefined : 8" maxlength="72" required>
      </label>
      <label v-if="!signingIn && !created" class="field">{{ t('确认密码') }}
        <input v-model="repeat" type="password" autocomplete="new-password" minlength="8" maxlength="72" required>
      </label>
      <div v-if="signingIn" class="action-row"><button type="button" class="text-button" @click="change('/reset-password')">{{ t('忘记密码') }}</button></div>
      <button class="primary" :disabled="busy || smsBusy || (!signingIn && !created && (!verification || resetUnavailable || (imageMode && !challenge)))">{{ signingIn || created ? t('登录') : registering ? t('注册') : t('确认修改') }}</button>
    </form>
    <div class="action-row auth-links">
      <button v-if="signingIn" class="text-button" @click="change('/register')">{{ t('去注册') }}</button>
      <button v-else class="text-button" @click="change('/login')">{{ t('去登录') }}</button>
      <button class="text-button" @click="go('/support')">{{ t('在线客服') }}</button>
    </div>
  </div>
</template>
