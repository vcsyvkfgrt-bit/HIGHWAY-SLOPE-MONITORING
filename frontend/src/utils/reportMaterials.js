import { API_DATA } from '../config/api'

export async function resolveReportMaterials(scope) {
  const response = await fetch(`${API_DATA}/api/report-materials/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
    },
    body: JSON.stringify({ scope }),
  })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.message || '加载报告素材失败')
  return result.data
}

async function reportMaterialRequest(path, options = {}) {
  const response = await fetch(`${API_DATA}/api/report-materials${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
      ...(options.headers || {}),
    },
  })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.message || '智能初稿请求失败')
  return result.data
}

export function getReportAiStatus() {
  return reportMaterialRequest('/ai-status')
}

export function generateReportAiDraft(report, materialPackage) {
  return reportMaterialRequest('/ai-draft', {
    method: 'POST',
    body: JSON.stringify({ report, materialPackage }),
  })
}

export function absoluteAssetUrl(path) {
  if (!path) return ''
  if (/^(data:|blob:|https?:)/i.test(path)) return path
  return `${API_DATA}${path.startsWith('/') ? '' : '/'}${path}`
}

export function resolveBindingMaterial(packageData, binding, fallbackKey = '') {
  if (!packageData) return null
  const placeholder = binding?.placeholderKey || binding?.key || fallbackKey
  const indexed = packageData.bindingIndex?.[placeholder]
    || packageData.bindingIndex?.[`{${String(placeholder || '').replace(/^\{|\}$/g, '')}}`]
  if (indexed?.materialKey) return packageData.materials?.[indexed.materialKey] || null
  if (indexed?.kind === 'text') return { key: placeholder, kind: 'text', title: binding?.childName || '', value: indexed.value }
  const field = binding?.field || binding?.materialKey
  if (field && packageData.materials?.[field]) return packageData.materials[field]
  const fieldAliases = {
    slopeLedgerTable: 'slopeSummary',
    surfaceTrendChart: 'monitoringTrend',
    monitoringRateChart: 'monitoringRate',
    rainfallOverlayChart: 'rainfallOverlay',
    inclinometerProfileChart: 'deepProfile',
    surfaceSummaryTable: 'surfaceSummary',
    frequencySummaryTable: 'frequencySummary',
    inspectionProblems: 'inspectionProblems',
    alarmActions: 'alarmActions',
    layoutMap: 'layoutMaps',
    geoLocationTable: 'geoLocations',
    meetingOverviewTable: 'meetingOverview',
    meetingProgressList: 'meetingProgressList',
    meetingProgressText: 'meetingProgressText',
    meetingSlopeSections: 'meetingSlopeSections',
    meetingConclusion: 'meetingConclusion',
    meetingSuggestions: 'meetingSuggestions',
  }
  if (fieldAliases[field]) return packageData.materials?.[fieldAliases[field]] || null
  const sourceDefaults = {
    slope_ledger: 'slopeSummary',
    monitoring_data: binding?.childType === 'table' || binding?.type === 'table' ? 'surfaceSummary' : 'monitoringTrend',
    inclinometer_data: 'deepProfile',
    inspections: 'inspectionProblems',
    alarms: 'alarmActions',
    slope_ledger_map: 'layoutMaps',
    weather_rainfall: 'rainfallOverlay',
    map_overview: 'geoLocations',
    supervision_meeting: 'meetingSlopeSections',
  }
  if (sourceDefaults[binding?.dataSource || binding?.source]) return packageData.materials?.[sourceDefaults[binding.dataSource || binding.source]] || null
  return null
}

export function findBindingForChild(templateSelect, module, child) {
  const bindings = templateSelect?.preview?.dataBindings || {}
  const directKey = module?.id && child?.id ? `${module.id}.${child.id}` : ''
  if (directKey && bindings[directKey]) return bindings[directKey]
  return Object.values(bindings).find(item => item?.moduleName === module?.name && item?.childName === child?.name)
    || (child?.placeholderKey ? { placeholderKey: child.placeholderKey, childName: child.name, childType: child.type } : null)
}
