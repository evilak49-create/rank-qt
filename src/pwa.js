import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

const base = '/api/v1/pwa'

export function isStandalone(displayMode, navigator) {
  return displayMode.matches || navigator.standalone === true
}

export function installationUrl(host, currentHost, locale) {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(host) || host === currentHost) return null
  try {
    const target = new URL('https://' + host)
    if (target.hostname !== host.toLowerCase()) return null
    target.searchParams.set('install-pwa', '1')
    if (locale === 'zh-CN' || locale === 'pt-BR') target.searchParams.set('pwa-lang', locale)
    return target.href
  } catch {
    return null
  }
}

export function usePwa() {
  const displayMode = window.matchMedia('(display-mode: standalone)')
  const standalone = ref(isStandalone(displayMode, navigator))
  const settings = shallowRef(null)
  const installPrompt = shallowRef(null)
  const controller = new AbortController()
  const events = { signal: controller.signal }
  const updateDisplay = () => { standalone.value = isStandalone(displayMode, navigator) }

  displayMode.addEventListener('change', updateDisplay, events)
  window.addEventListener('pageshow', updateDisplay, events)
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    installPrompt.value = event
  }, events)
  window.addEventListener('appinstalled', () => { installPrompt.value = null }, events)
  onBeforeUnmount(() => controller.abort())

  onMounted(async () => {
    try {
      const response = await fetch(base + '/config', { cache: 'no-store', credentials: 'omit', ...events })
      if (!response.ok) return
      const data = await response.json()
      if (typeof data.enabled !== 'boolean' || typeof data.host !== 'string' || !data.copy) return
      settings.value = data
      if (data.host !== location.hostname && !standalone.value) return

      addLink('manifest', base + '/manifest.webmanifest')
      addLink('apple-touch-icon', base + '/icons/apple.png?v=' + encodeURIComponent(data.icon_version))
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', data.theme_color)
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register(base + '/worker.js', { scope: '/', updateViaCache: 'none' })
        registration.active?.postMessage('refresh-offline-page')
      }
    } catch {
      // Installation resources may be temporarily unavailable. The regular site still works.
    }
  })

  return { settings, standalone, installPrompt }
}

function addLink(rel, href) {
  const link = document.createElement('link')
  link.rel = rel
  link.href = href
  document.head.append(link)
}
