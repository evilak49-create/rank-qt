import { shallowRef } from 'vue'
import { createRequestId } from './requestId.js'

const aliases = {
  '': '/', '#': '/', '#register/invite': '/register',
}
const scrollPositions = new Map()
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
let currentKey = history.state?.cashClubKey || createRequestId()
history.replaceState({ ...history.state, cashClubKey: currentKey }, '')
let stopRestoring

export function safePath(value, fallback = '/') {
  if (typeof value !== 'string' || !/^\/(?!\/)/.test(value) || /[\\#\u0000-\u001f]/.test(value)) return fallback
  return value
}

function readRoute() {
  const fullPath = safePath(aliases[location.hash] ?? location.hash.slice(1))
  const [path, query] = fullPath.split(/\?(.*)/s, 2)
  return { fullPath, path, query: new URLSearchParams(query), params: { id: path.match(/(?:^|\/)(\d+)(?:\/|$)/)?.[1] }, key: currentKey }
}

export const currentRoute = shallowRef(readRoute())

function update() {
  const key = history.state?.cashClubKey
  if (key === currentKey && readRoute().fullPath === currentRoute.value.fullPath) return
  stopRestoring?.()
  scrollPositions.set(currentKey, window.scrollY)
  const newEntry = !key || key === currentKey
  currentKey = newEntry ? createRequestId() : key
  if (newEntry) history.replaceState({ ...history.state, cashClubKey: currentKey }, '')
  currentRoute.value = readRoute()
}

window.addEventListener('popstate', update)
window.addEventListener('hashchange', update)

export function go(value, { replace = false } = {}) {
  const path = safePath(value)
  if (path === currentRoute.value.fullPath) return
  const key = createRequestId()
  const depth = history.state?.cashClubDepth ?? 0
  const previous = replace ? history.state?.cashClubPrevious : currentRoute.value.fullPath
  const state = { cashClubKey: key, cashClubDepth: replace ? depth : depth + 1, cashClubPrevious: previous }
  const url = '#' + path
  if (replace) history.replaceState(state, '', url)
  else history.pushState(state, '', url)
  update()
}

export function back(fallback = '/') {
  if (history.state?.cashClubDepth > 0) history.back()
  else go(fallback, { replace: true })
}

export function resume(value) {
  const path = safePath(value)
  if (history.state?.cashClubDepth > 0 && history.state.cashClubPrevious === path) history.back()
  else go(path, { replace: true })
}

export function restoreScroll() {
  stopRestoring?.()
  const top = scrollPositions.get(currentRoute.value.key) ?? 0
  window.scrollTo(0, top)
  if (!top || window.scrollY >= top - 1) return
  const observer = new ResizeObserver(() => {
    window.scrollTo(0, top)
    if (window.scrollY >= top - 1) stop()
  })
  const timer = setTimeout(stop, 2000)
  function stop() {
    observer.disconnect()
    clearTimeout(timer)
    window.removeEventListener('pointerdown', stop)
    window.removeEventListener('wheel', stop)
    stopRestoring = null
  }
  stopRestoring = stop
  observer.observe(document.body)
  window.addEventListener('pointerdown', stop, { once: true })
  window.addEventListener('wheel', stop, { once: true })
}
