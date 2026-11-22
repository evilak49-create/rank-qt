<script setup>
import { useLocale } from '../locale.js'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '../api'
import { showNotice, watchNotice } from '../feedback'
import { go, safePath } from '../navigation'

const { t } = useLocale()
const passwordRequirement = '密码须包含字母和数字，长度为 8–20 位。'
const newPasswordPattern = '(?=.*[A-Za-z])(?=.*[0-9]).{8,20}'
const validNewPassword = new RegExp('^(?:' + newPasswordPattern + ')$', 'u')
const brazilianMobile = /^(?:1[1-9]|2[12478]|3[1-57-8]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])9[0-9]{8}$/

const props = defineProps({ route: Object, member: Object, draftPhone: String })
const emit = defineEmits(['signed-in', 'reset', 'phone', 'change'])
const type = computed(() => props.route.path)
const signingIn = computed(() => type.value === '/login')
const registering = computed(() => type.value === '/register')
const phone = ref(nationalPhone(props.member?.phone || props.draftPhone || ''))
const phoneDigits = computed(() => phone.value.replace(/\D/g, ''))
const phoneChecked = ref(false)
const registrationPhoneValid = computed(() => /^[0-9 ()-]+$/.test(phone.value) && brazilianMobile.test(phoneDigits.value))
const showPhoneError = computed(() => registering.value && phoneChecked.value && !registrationPhoneValid.value)
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

function nationalPhone(value) {
  const number = value.trimStart()
  if (number.startsWith('+55')) return number.slice(3).trimStart()
  if (!/^[0-9 ()-]+$/.test(number)) return number
  const digits = number.replace(/\D/g, '')
  return digits.length === 13 && digits.startsWith('55') ? digits.slice(2) : number
}

function updatePhone(event) {
  const input = event.target
  const number = nationalPhone(input.value)
  if (number !== input.value) input.value = number
  phone.value = number
  if (!number.trim()) phoneChecked.value = false
  else if (registering.value && phoneDigits.value.length >= 11) checkRegistrationPhone()
}

function checkRegistrationPhone() {
  phoneChecked.value = true
  return registrationPhoneValid.value
}

function normalizedPhone() {
  const number = phoneDigits.value
  if (registering.value) return number
  if (/^[1-9]\d9\d{8}$/.test(number)) return number
  throw new Error('请输入含区号的 11 位巴西手机号。')
}

function showError(failure) {
  const title = signingIn.value ? '登录提醒' : registering.value ? '注册提醒' : '密码修改提醒'
  showNotice(title, Object.values(failure.errors ?? {}).flat()[0] || failure.message, 'error')
}

function change(path) {
  emit('change', path)
}

async function sms() {
  if (smsBusy.value || wait.value > 0) return
  if (registering.value && !checkRegistrationPhone()) return
  smsBusy.value = true
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
  if (registering.value && !checkRegistrationPhone()) return
  busy.value = true
  info.value = ''
  try {
    const credentials = { phone: normalizedPhone(), password: password.value }
    if (signingIn.value || created.value) {
      emit('signed-in', await api('/auth/login', { body: credentials }), destination.value)
      return
    }
    if (repeat.value !== password.value) throw new Error('两次输入的密码不一致。')
    if (!validNewPassword.test(password.value)) throw new Error(passwordRequirement)
    if (new TextEncoder().encode(password.value).length > 72 || password.value.includes('\0')) {
      throw new Error('密码最多 72 字节，且不能包含空字符。')
    }
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

watchNotice(info, text => text?.startsWith('验证码') ? '验证码已发送' : '注册成功', 'success')
</script>

<template>
  <div class="surface auth-surface">
    <form class="stack" @submit.prevent="submit">
      <div class="field">
        <label for="auth-phone">{{ registering ? t('真实手机号码') : t('巴西手机号') }}</label>
        <div class="auth-phone-row">
          <span id="auth-country-code" class="auth-country-code">+55</span>
          <input id="auth-phone" :value="phone" type="tel" autocomplete="username" :aria-invalid="showPhoneError || undefined"
                 :aria-describedby="showPhoneError ? 'auth-country-code auth-phone-error' : 'auth-country-code'"
                 :placeholder="registering ? t('手机号码') : t('地区区号 + 手机号')" required :readonly="type === '/reset-password' && Boolean(member)"
                 @input="updatePhone" @blur="registering && phone.trim() && checkRegistrationPhone()">
        </div>
        <p v-if="showPhoneError" id="auth-phone-error" class="auth-phone-error" role="status">{{ t('手机号码不正确') }}</p>
      </div>
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
      <div class="field">
        <label for="auth-password">{{ signingIn || registering ? t('密码') : t('新密码') }}</label>
        <input id="auth-password" v-model="password" type="password" :autocomplete="signingIn || created ? 'current-password' : 'new-password'"
               :aria-describedby="!signingIn && !created ? 'auth-password-rules' : undefined"
               :pattern="signingIn || created ? undefined : newPasswordPattern"
               :title="signingIn || created ? undefined : t(passwordRequirement)"
               :maxlength="signingIn || created ? 72 : 20" required>
        <small v-if="!signingIn && !created" id="auth-password-rules" class="muted">{{ t(passwordRequirement) }}</small>
      </div>
      <label v-if="!signingIn && !created" class="field">{{ t('确认密码') }}
        <input v-model="repeat" type="password" autocomplete="new-password" minlength="8" maxlength="20" required>
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
