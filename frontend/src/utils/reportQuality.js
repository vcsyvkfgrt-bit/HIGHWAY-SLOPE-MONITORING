import { API_DATA } from '../config/api'

function headers(extra = {}) {
  return { ...extra, Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
}

async function qualityRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers: headers(options.headers || {}) })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.message || '报告质量检查失败')
  return result.data
}

export function inspectReportQualityPreview(report) {
  return qualityRequest(`${API_DATA}/api/reports/quality-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  })
}

export function inspectSavedReportQuality(id) {
  return qualityRequest(`${API_DATA}/api/reports/${id}/quality`)
}

export function qualityLevelLabel(level) {
  return ({ blocked: '需修正', review: '待复核', ready: '可导出' })[level] || '待检查'
}

export function qualitySeverityType(severity) {
  return ({ error: 'danger', warning: 'warning', info: 'info' })[severity] || 'info'
}
