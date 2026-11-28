import { computed, ref } from 'vue'

const pending = ref(0)
export const apiLoading = computed(() => pending.value > 0)

const responses = new Map()
const cacheLimit = 100
const queryPosts = new Set(['/support/chat', '/auth/captcha', '/platform-funds/preview'])
let cacheVersion = 0
let writesInProgress = 0
let authenticated = false

function invalidateResponses() {
  responses.clear()
  cacheVersion++
}

function responseKey(path) {
  const url = new URL(path, 'https://cache.invalid')
  url.searchParams.sort()
  return url.pathname + url.search
}

function canCache(path) {
  const resource = path.split('?', 1)[0]
  return resource.startsWith('/content/')
    || /^\/(?:platforms(?:\/featured|\/\d+(?:\/(?:point-rule|reviews|protection-terms))?)?|shop\/products(?:\/\d+)?)$/.test(resource)
}

export async function api(path, options = {}) {
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST')
  const key = method === 'GET' && canCache(path) ? responseKey(path) : ''
  const writes = method !== 'GET' && !queryPosts.has(path)
  if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Request aborted', 'AbortError')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('当前网络不可用，请联网后重试')

  if (key && !options.fresh && !writesInProgress && responses.has(key)) {
    return structuredClone(responses.get(key))
  }

  if (writes) {
    writesInProgress++
    invalidateResponses()
  }
  const version = cacheVersion
  if (!options.background) pending.value++
  try {
    const result = await request(path, options)
    if (key && result !== null && !writesInProgress && version === cacheVersion && !options.signal?.aborted) {
      if (!responses.has(key) && responses.size >= cacheLimit) responses.delete(responses.keys().next().value)
      responses.set(key, structuredClone(result))
    }
    return result
  } finally {
    if (!options.background) pending.value--
    if (writes) {
      writesInProgress--
      invalidateResponses()
    }
  }
}

async function request(path, { body, signal, timeoutMs = 10000, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const multipart = body instanceof FormData
  const headers = { Accept: 'application/json' }
  if (method !== 'GET') {
    try {
      await request('/auth/csrf-cookie', { signal })
    } catch (error) {
      if (error.status !== 404 && error.status !== 405) throw error
      await request('/health', { signal })
    }
    const token = document.cookie.split('; ').find(cookie => cookie.startsWith('XSRF-TOKEN='))
    if (!token) throw new Error('无法初始化会话，请刷新后重试。')
    headers['X-XSRF-TOKEN'] = decodeURIComponent(token.slice('XSRF-TOKEN='.length))
    if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json'
  }

  const options = {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    headers,
    body: multipart ? body : JSON.stringify(body),
  }
  const { response, result, json } = await fetchResponse('/api/v1' + path, options, signal, timeoutMs)
  if (response.status === 204) {
    if (path === '/auth/logout' || path === '/auth/reset-password') authenticated = false
    return null
  }

  if (!response.ok || !json) {
    if ((response.status === 401 && (!path.startsWith('/auth/') || (path === '/auth/me' && authenticated)))
      || result?.code === 'member_disabled') {
      authenticated = false
      invalidateResponses()
    }
    if (response.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('cash-club-session-expired'))
    }
    throw Object.assign(new Error(result?.message || '服务暂不可用，请稍后重试。'), {
      status: response.status,
      code: result?.code,
      errors: result?.errors,
      data: result?.data,
    })
  }
  if (path === '/auth/me' || path === '/auth/login') authenticated = true
  return result
}

async function fetchResponse(url, options, signal, timeoutMs) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const json = response.status !== 204 && response.headers.get('content-type')?.includes('application/json')
    return { response, json, result: json ? await response.json() : null }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export function imageUrl(value) {
  if (!value) return ''
  try {
    const url = new URL(value, window.location.origin)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}
