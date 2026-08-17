import { API_APP, API_DATA } from '../config/api'

function getToken() {
  return localStorage.getItem('token') || ''
}

function normalizeUrl(baseUrl, path) {
  if (/^https?:\/\//i.test(path)) return path
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

async function parseResponse(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch (_error) {
    return { success: false, message: text }
  }
}

export async function apiRequest(url, options = {}) {
  const headers = new Headers(options.headers || {})
  const body = options.body

  if (body && !(body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body:
      body && typeof body === 'object' && !(body instanceof FormData)
        ? JSON.stringify(body)
        : body,
  })

  const data = await parseResponse(response)

  if (!response.ok || data.success === false) {
    if (response.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (window.location.pathname !== '/login') {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
      }
    }

    throw new Error(data.message || data.error || '请求失败')
  }

  return data
}

export function dataRequest(path, options = {}) {
  return apiRequest(normalizeUrl(API_DATA, path), options)
}

export function appRequest(path, options = {}) {
  return apiRequest(normalizeUrl(API_APP, path), options)
}
