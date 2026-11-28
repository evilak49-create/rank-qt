import { api } from './api'

export async function openPlatformRegistration(platformPath, isCurrent, invalidLinkMessage) {
  const tab = window.open('about:blank', '_blank')
  let opened = false
  try {
    if (tab) tab.opener = null
    const { data } = await api(platformPath + '/registration', { method: 'POST' })
    if (!isCurrent()) return

    const url = new URL(data.url)
    if (url.protocol !== 'https:') throw new Error(invalidLinkMessage)
    if (tab && !tab.closed) tab.location.replace(url.href)
    else window.location.assign(url.href)
    opened = true
  } finally {
    if (!opened) tab?.close()
  }
}
