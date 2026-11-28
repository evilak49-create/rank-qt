<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { installationUrl } from './pwa'

const props = defineProps({ settings: Object, locale: String, prompt: Object })
const emit = defineEmits(['consume-prompt', 'dismiss'])
const dialog = ref(null)
const portuguese = computed(() => props.locale === 'pt-BR')
const copy = computed(() => props.settings?.copy[props.locale])
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const android = /Android/.test(navigator.userAgent)
const instructions = computed(() => {
  if (ios) return portuguese.value
    ? 'No Safari, toque em Compartilhar → Adicionar à Tela de Início. Se aparecer “Abrir como App da Web”, mantenha essa opção ativada e toque em Adicionar.'
    : '在 Safari 打开，点「分享」→「添加到主屏幕」。如果看到「作为网页 App 打开」，保持开启，再点「添加」。'
  if (android) return portuguese.value
    ? 'No Chrome, abra o menu ⋮, toque em “Instalar e criar atalho” ou “Instalar app” e confirme a instalação.'
    : '在 Chrome 打开右上角 ⋮ 菜单，选择「安装并创建快捷方式」或「安装应用」，再确认安装。'
  return portuguese.value
    ? 'Abra o menu do navegador e procure a opção de instalar o QVIP.'
    : '打开浏览器菜单，找到安装 QVIP 的选项。'
})

async function install() {
  const target = installationUrl(props.settings.host, location.hostname, props.locale)
  if (target) {
    location.assign(target)
    return
  }
  if (props.prompt && !ios) {
    const prompt = props.prompt
    emit('consume-prompt')
    try {
      const { outcome } = await prompt.prompt()
      if (outcome === 'accepted') dialog.value?.close()
      return
    } catch {
      // The browser can withdraw its install prompt. Show its manual path instead.
    }
  }
  if (dialog.value && !dialog.value.open) dialog.value.showModal()
}

function showAfterRedirect() {
  if (!props.settings?.enabled || props.settings.host !== location.hostname || !dialog.value) return
  const url = new URL(location.href)
  if (url.searchParams.get('install-pwa') !== '1') return
  url.searchParams.delete('install-pwa')
  url.searchParams.delete('pwa-lang')
  history.replaceState(history.state, '', url)
  if (!dialog.value.open) dialog.value.showModal()
}

onMounted(showAfterRedirect)
watch(() => props.settings, showAfterRedirect, { flush: 'post' })
</script>

<template>
  <div v-if="settings?.enabled && copy" class="pwa-banner">
    <div class="wrap pwa-banner-inner">
      <p>{{ copy.message }}</p>
      <div class="pwa-banner-actions">
        <button type="button" @click="install">{{ copy.button }}</button>
        <button type="button" class="pwa-banner-dismiss"
                :aria-label="portuguese ? 'Fechar aviso de instalação' : '关闭安装提示'"
                @click="emit('dismiss')">×</button>
      </div>
    </div>
    <dialog ref="dialog" class="pwa-install-dialog" aria-labelledby="pwa-install-title" @click.self="dialog.close()">
      <section>
        <h2 id="pwa-install-title">{{ portuguese ? 'Instalar QVIP' : '安装 QVIP' }}</h2>
        <p>{{ instructions }}</p>
        <button v-if="prompt && !ios" type="button" @click="install">{{ copy.button }}</button>
        <button type="button" class="quiet" @click="dialog.close()">{{ portuguese ? 'Fechar' : '关闭' }}</button>
      </section>
    </dialog>
  </div>
</template>

<style scoped>
.pwa-banner { padding-top: env(safe-area-inset-top); background: #261e13; color: #fff4dc; border-bottom: 1px solid #5f4a2e; }
.pwa-banner + :global(.home-gold .site-header), .pwa-banner + :global(.page-topbar) { padding-top: 0; }
.pwa-banner-inner { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 7px; }
.pwa-banner p { margin: 0; font-size: .875rem; overflow-wrap: anywhere; }
.pwa-banner button:not(.quiet):not(.pwa-banner-dismiss) { min-height: 40px; padding-inline: 12px; border: 0; border-radius: 8px; color: #211507; background: #f5c66e; font-weight: 700; }
.pwa-banner-actions { display: flex; flex: 0 1 auto; align-items: center; gap: 4px; max-width: 62%; min-width: 0; }
.pwa-banner-actions > button:first-child { min-width: 0; overflow-wrap: anywhere; }
.pwa-banner-dismiss {
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  color: #fff4dc;
  font-size: 23px;
  line-height: 1;
}
.pwa-banner-dismiss:hover, .pwa-banner-dismiss:focus-visible { background: #45351f; }
.pwa-install-dialog { width: min(calc(100% - 32px), 420px); padding: 0; border: 1px solid #5f4a2e; border-radius: 14px; background: #18181b; color: #fafafa; }
.pwa-install-dialog::backdrop { background: #000b; }
.pwa-install-dialog section { padding: 20px; }
.pwa-install-dialog h2 { margin: 0 0 12px; font-size: 1.15rem; }
.pwa-install-dialog p { margin-bottom: 16px; line-height: 1.6; }
.pwa-install-dialog button + button { margin-inline-start: 8px; }
</style>
