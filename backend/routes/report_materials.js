const express = require('express')
const pool = require('../config/database')
const auth = require('../middleware/auth')
const { generateAiReportDraft, getAiStatus } = require('../utils/reportAiDraft')

const router = express.Router()
router.use(auth)

const RATE_REFERENCE = 2
const SURFACE_DISPLACEMENT_REFERENCE = 20
const MAX_SLOPES = 200
const MAX_ROWS = 50000
const MAX_DEEP_PROFILE_PERIODS = 8
const DEEP_DISPLACEMENT_REFERENCE = 20
const MAX_TREND_LINE_SERIES = 12
const MAX_RATE_LINE_SERIES = 8
const RATE_NEAR_RATIO = 0.8
const RATE_HEATMAP_THRESHOLD = 20
const MAX_RATE_HEATMAP_POINTS = 30

function list(value) {
  return Array.isArray(value) ? value.filter(item => item !== '' && item !== null && item !== undefined) : []
}

function dateText(value) {
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function round(value, precision = 3) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  const factor = 10 ** precision
  return Math.round(number * factor) / factor
}

function dayDiff(start, end) {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86400000))
}

function shiftDate(date, days) {
  const timestamp = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(timestamp)) return ''
  return new Date(timestamp + days * 86400000).toISOString().slice(0, 10)
}

async function safeQuery(sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params)
    return rows
  } catch (error) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) return []
    throw error
  }
}

function tableMaterial(key, title, columns, rows, source, note = '') {
  return { key, kind: 'table', title, columns, rows, source, note }
}

function chartMaterial(key, title, chartType, series, source, extra = {}) {
  return { key, kind: 'chart', title, chartType, series, source, ...extra }
}

function selectRepresentativeSurveys(surveys, limit = MAX_DEEP_PROFILE_PERIODS) {
  const sorted = [...surveys].sort((a, b) => a.surveyDate.localeCompare(b.surveyDate))
  if (sorted.length <= limit) return sorted
  const indexes = new Set()
  for (let index = 0; index < limit; index += 1) {
    indexes.add(Math.round(index * (sorted.length - 1) / (limit - 1)))
  }
  return [...indexes].sort((a, b) => a - b).map(index => sorted[index])
}

function makeDeepProfileChart(pointProfile, metric = 'cumulative') {
  const isRelative = metric === 'relative'
  const dataKey = isRelative ? 'relativeData' : 'cumulativeData'
  const available = pointProfile.surveys.filter(survey => (survey[dataKey] || []).length)
  const selected = selectRepresentativeSurveys(available)
  const latestDate = available.at(-1)?.surveyDate || ''
  const omitted = Math.max(0, available.length - selected.length)
  const metricTitle = isRelative ? '相对水平位移' : '累计水平位移'
  const subtitle = omitted
    ? `共${available.length}期，均匀选取${selected.length}个代表期（含首、末期）`
    : `共${available.length}期监测成果`

  return chartMaterial(
    `deep-${metric}-${pointProfile.pointId}`,
    `${pointProfile.slopeName} ${pointProfile.pointName}${metricTitle}—深度曲线`,
    'depth-profile',
    selected.map((survey, index) => ({
      name: `${survey.surveyDate}${survey.surveyDate === latestDate ? '（最新）' : ''}`,
      surveyDate: survey.surveyDate,
      isBaseline: index === 0,
      isLatest: survey.surveyDate === latestDate,
      data: survey[dataKey],
    })),
    'inclinometer_surveys + inclinometer_survey_readings',
    {
      xName: `${metricTitle} (mm)`,
      yName: '深度 (m)',
      inverseY: true,
      profileMetric: metric,
      pointName: pointProfile.pointName,
      subtitle,
      totalPeriodCount: available.length,
      displayedPeriodCount: selected.length,
      xMin: -40,
      xMax: 40,
      referenceLinesX: [-DEEP_DISPLACEMENT_REFERENCE, 0, DEEP_DISPLACEMENT_REFERENCE],
      referenceLabel: '参考值',
    }
  )
}

function extremeProfilePoint(data = []) {
  return data.reduce((selected, item) => {
    const value = Number(item?.[0])
    const depth = Number(item?.[1])
    if (!Number.isFinite(value) || !Number.isFinite(depth)) return selected
    if (!selected || Math.abs(value) > selected.absValue) return { value, depth, absValue: Math.abs(value) }
    return selected
  }, null)
}

function maxSameDepthChange(previousData = [], currentData = []) {
  const previousByDepth = new Map(previousData.map(item => [Number(item?.[1]).toFixed(3), Number(item?.[0])]))
  return currentData.reduce((selected, item) => {
    const value = Number(item?.[0])
    const depth = Number(item?.[1])
    const previous = previousByDepth.get(depth.toFixed(3))
    if (!Number.isFinite(value) || !Number.isFinite(depth) || !Number.isFinite(previous)) return selected
    const change = value - previous
    if (!selected || Math.abs(change) > selected.absChange) return { change, depth, absChange: Math.abs(change) }
    return selected
  }, null)
}

function makeDeepAnalysisMaterial(pointProfile) {
  const surveys = [...pointProfile.surveys].sort((a, b) => a.surveyDate.localeCompare(b.surveyDate))
  const latest = surveys.at(-1)
  const previous = surveys.at(-2)
  if (!latest) {
    return textMaterial(`deep-analysis-${pointProfile.pointId}`, `${pointProfile.pointName}深部水平位移分析`, '当前测斜孔暂无可用于分析的有效测斜成果。', 'inclinometer_data')
  }

  const cumulativeExtreme = extremeProfilePoint(latest.cumulativeData)
  const relativeExtreme = extremeProfilePoint(latest.relativeData)
  const periodChange = previous ? maxSameDepthChange(previous.cumulativeData, latest.cumulativeData) : null
  const extremeValues = [cumulativeExtreme?.absValue, relativeExtreme?.absValue].filter(Number.isFinite)
  const reachesReference = extremeValues.some(value => value >= DEEP_DISPLACEMENT_REFERENCE)
  const sentences = [
    `截至${latest.surveyDate}，${pointProfile.pointName}共录入${surveys.length}期深部水平位移成果。`,
  ]
  if (cumulativeExtreme) {
    sentences.push(`最新一期累计水平位移绝对值最大为${round(cumulativeExtreme.absValue, 3)}mm，对应深度${round(cumulativeExtreme.depth, 2)}m，原值为${round(cumulativeExtreme.value, 3)}mm。`)
  }
  if (relativeExtreme) {
    sentences.push(`相对水平位移绝对值最大为${round(relativeExtreme.absValue, 3)}mm，对应深度${round(relativeExtreme.depth, 2)}m，原值为${round(relativeExtreme.value, 3)}mm。`)
  }
  if (periodChange && previous) {
    sentences.push(`与上一期${previous.surveyDate}按相同深度对比，累计水平位移最大期际变化绝对值为${round(periodChange.absChange, 3)}mm，位于${round(periodChange.depth, 2)}m深度。`)
  } else {
    sentences.push('当前缺少可在相同深度配对的上一期成果，暂不作期际变化判断。')
  }
  sentences.push(reachesReference
    ? `最新曲线存在达到或超过±${DEEP_DISPLACEMENT_REFERENCE}mm参考线的测值，应优先复核原始读数、测斜孔状态和相邻深度曲线连续性。`
    : `最新累计及相对位移曲线均未达到±${DEEP_DISPLACEMENT_REFERENCE}mm参考线。`)
  if (relativeExtreme) {
    sentences.push(`相对位移绝对值最大位置集中在${round(relativeExtreme.depth, 2)}m附近，该位置可作为后续连续观测的重点深度，但不能仅凭单个极值直接判定潜在滑移带。`)
  }

  return {
    ...textMaterial(`deep-analysis-${pointProfile.pointId}`, `${pointProfile.pointName}深部水平位移分析`, sentences.join(''), 'inclinometer_surveys + inclinometer_survey_readings'),
    draft: true,
    editable: true,
    note: '依据最新一期、上一期及同深度测值自动生成，导出前请由技术人员结合孔口状态、施工工况和完整曲线人工确认。',
    metrics: {
      latestDate: latest.surveyDate,
      previousDate: previous?.surveyDate || null,
      cumulativeExtreme,
      relativeExtreme,
      periodChange,
      referenceMm: DEEP_DISPLACEMENT_REFERENCE,
      reachesReference,
    },
  }
}

function textMaterial(key, title, value, source = 'report_materials') {
  return { key, kind: 'text', title, value, source }
}

function sectionListMaterial(key, title, sections, source = 'report_materials') {
  return { key, kind: 'section-list', title, sections, source }
}

function groupMonitoring(rows) {
  const points = new Map()
  rows.forEach(row => {
    const pointId = String(row.point_id)
    if (!points.has(pointId)) {
      points.set(pointId, {
        point_id: row.point_id,
        point_name: row.point_name,
        point_type: row.point_type || row.monitor_type,
        slope_id: row.slope_id,
        slope_name: row.slope_name,
        section: row.section,
        unit: row.unit || '',
        observations: [],
      })
    }
    points.get(pointId).observations.push({ date: row.monitor_date, value: Number(row.value) })
  })

  return [...points.values()].map(point => {
    point.observations.sort((a, b) => a.date.localeCompare(b.date))
    const intervals = []
    const rates = []
    for (let index = 1; index < point.observations.length; index += 1) {
      const previous = point.observations[index - 1]
      const current = point.observations[index]
      const days = dayDiff(previous.date, current.date)
      if (days > 0) {
        intervals.push(days)
        rates.push({ date: current.date, value: round((current.value - previous.value) / days), days })
      }
    }
    const latest = point.observations[point.observations.length - 1] || null
    const previous = point.observations[point.observations.length - 2] || null
    const latestRate = rates[rates.length - 1] || null
    return {
      ...point,
      first_date: point.observations[0]?.date || '',
      last_date: latest?.date || '',
      latest_value: latest?.value ?? null,
      adjacent_change: latest && previous ? round(latest.value - previous.value) : null,
      latest_rate: latestRate?.value ?? null,
      max_abs_rate: rates.length ? round(Math.max(...rates.map(item => Math.abs(item.value)))) : null,
      avg_interval_days: intervals.length ? round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length, 1) : null,
      rates,
    }
  })
}

function makeTrendMaterial(pointStats) {
  return makeSurfaceCollection('monitoringTrend', '地表变形累计变化曲线', pointStats, 'trend')
}

function makeRateMaterial(pointStats) {
  return makeSurfaceCollection('monitoringRate', `地表变形变化速率（参考值 ±${RATE_REFERENCE} mm/d）`, pointStats, 'rate')
}

function makeRainOverlay(pointStats, rainRows) {
  const dateValues = new Map()
  pointStats.forEach(point => point.observations.forEach(item => {
    if (!dateValues.has(item.date)) dateValues.set(item.date, [])
    dateValues.get(item.date).push(item.value)
  }))
  const displacement = [...dateValues.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => [
    date,
    round(values.reduce((sum, value) => sum + value, 0) / values.length),
  ])
  const rainfall = rainRows.map(item => [item.rain_date, Number(item.amount_mm)])
  return chartMaterial('rainfallOverlay', '雨量—监测值时间叠加', 'rainfall-overlay', [
    { name: '监测均值', unit: 'mm', axis: 0, type: 'line', data: displacement },
    { name: '日雨量', unit: 'mm', axis: 1, type: 'bar', data: rainfall },
  ], 'rainfall_daily_records + monitoring_data', { xName: '日期', yName: '监测均值 (mm)', yNameSecondary: '日雨量 (mm)' })
}

function isDeepPointType(type = '') {
  return /深部|测斜/.test(String(type))
}

function isSettlementType(type = '') {
  return /沉降|沉降板/.test(String(type))
}

function isAnchorStressType(type = '') {
  return /锚索|应力|测力/.test(String(type))
}

function pointCategory(type = '') {
  if (isDeepPointType(type)) return 'inclinometer'
  if (isSettlementType(type)) return 'settlement'
  if (isAnchorStressType(type)) return 'anchor'
  return 'displacement'
}

function rangeText(values, unit = 'mm') {
  const numbers = values.map(Number).filter(Number.isFinite)
  if (!numbers.length) return '暂无有效数据'
  return `${round(Math.min(...numbers), 1)}${unit}~${round(Math.max(...numbers), 1)}${unit}`
}

function makeSlopeChart(key, title, chartType, slopePointStats, source, extra = {}) {
  return chartMaterial(
    key,
    title,
    chartType,
    slopePointStats.map(point => ({
      name: point.point_name,
      unit: chartType === 'rate' ? 'mm/d' : (point.unit || 'mm'),
      monitoringType: point.point_type,
      data: (chartType === 'rate' ? point.rates : point.observations)
        .map(item => [item.date, item.value]),
    })),
    source,
    extra
  )
}

function surfaceCategoryMeta(category) {
  return category === 'settlement'
    ? { label: '沉降', yName: '累计沉降 (mm)', rateYName: '沉降变化速率 (mm/d)' }
    : { label: '地表水平位移', yName: '累计水平位移 (mm)', rateYName: '水平位移变化速率 (mm/d)' }
}

function rateStatus(maxAbsRate) {
  if (!Number.isFinite(maxAbsRate)) return '无有效速率'
  if (maxAbsRate >= RATE_REFERENCE) return '达到参考值'
  if (maxAbsRate >= RATE_REFERENCE * RATE_NEAR_RATIO) return '接近参考值'
  return '未达到参考值'
}

function rankRatePoints(points) {
  return points
    .filter(point => point.rates.length && Number.isFinite(point.max_abs_rate))
    .sort((a, b) => b.max_abs_rate - a.max_abs_rate || String(a.point_name).localeCompare(String(b.point_name), 'zh-CN'))
}

function makeSurfaceTrendChart(key, slopeName, category, points) {
  const meta = surfaceCategoryMeta(category)
  const ranked = [...points].sort((a, b) => {
    const amplitude = point => {
      const values = point.observations.map(item => Number(item.value)).filter(Number.isFinite)
      return values.length ? Math.max(...values) - Math.min(...values) : 0
    }
    return amplitude(b) - amplitude(a) || String(a.point_name).localeCompare(String(b.point_name), 'zh-CN')
  })
  const selected = ranked.length > MAX_TREND_LINE_SERIES ? ranked.slice(0, MAX_TREND_LINE_SERIES) : points
  const omitted = Math.max(0, points.length - selected.length)
  return makeSlopeChart(
    key,
    `${slopeName}${meta.label}累计变化曲线`,
    'line',
    selected,
    'monitoring_data',
    {
      xName: '监测日期',
      yName: meta.yName,
      connectNulls: false,
      surfaceCategory: category,
      totalSeriesCount: points.length,
      displayedSeriesCount: selected.length,
      selectionMode: omitted ? 'amplitude-ranked' : 'all',
      subtitle: omitted
        ? `共${points.length}个测点，显示累计变化幅度前${selected.length}个；完整结果见统计表`
        : `显示全部${points.length}个测点`,
    }
  )
}

function makeSurfaceRateChart(key, slopeName, category, points) {
  const meta = surfaceCategoryMeta(category)
  const ranked = rankRatePoints(points)
  const selected = ranked.length > MAX_RATE_LINE_SERIES ? ranked.slice(0, MAX_RATE_LINE_SERIES) : ranked
  const omitted = Math.max(0, ranked.length - selected.length)
  return chartMaterial(
    key,
    `${slopeName}${meta.label}变化速率曲线（参考值 ±${RATE_REFERENCE} mm/d）`,
    'rate',
    selected.map(point => ({
      name: point.point_name,
      unit: 'mm/d',
      monitoringType: point.point_type,
      maxAbsRate: point.max_abs_rate,
      riskLevel: point.max_abs_rate >= RATE_REFERENCE
        ? 'exceeded'
        : point.max_abs_rate >= RATE_REFERENCE * RATE_NEAR_RATIO
          ? 'near'
          : 'normal',
      data: point.rates.map(item => [item.date, item.value]),
    })),
    'monitoring_data',
    {
      xName: '监测日期',
      yName: meta.rateYName,
      referenceLines: [RATE_REFERENCE, -RATE_REFERENCE],
      referenceLabel: '参考速率',
      connectNulls: false,
      surfaceCategory: category,
      totalSeriesCount: ranked.length,
      displayedSeriesCount: selected.length,
      selectionMode: omitted ? 'risk-ranked' : 'all',
      subtitle: omitted
        ? `共${ranked.length}个有效测点，显示最大绝对速率前${selected.length}个；完整结果见排序表`
        : `显示全部${ranked.length}个有效测点`,
    }
  )
}

function makeRateHeatmap(key, slopeName, category, points) {
  const meta = surfaceCategoryMeta(category)
  const ranked = rankRatePoints(points)
  if (ranked.length <= RATE_HEATMAP_THRESHOLD) return null
  const selected = ranked.slice(0, MAX_RATE_HEATMAP_POINTS)
  const values = selected.flatMap(point => point.rates.map(item => [item.date, point.point_name, item.value]))
  const dates = [...new Set(values.map(item => item[0]))].sort()
  const absoluteRates = values.map(item => Math.abs(Number(item[2])) || 0).sort((a, b) => a - b)
  const percentile95 = absoluteRates.length
    ? absoluteRates[Math.floor((absoluteRates.length - 1) * 0.95)]
    : RATE_REFERENCE
  const maxAbs = Math.max(RATE_REFERENCE, percentile95)
  return chartMaterial(
    key,
    `${slopeName}${meta.label}变化速率时空分布`,
    'rate-heatmap',
    [{ name: '变化速率', unit: 'mm/d', data: values }],
    'monitoring_data',
    {
      xName: '监测日期',
      yName: '监测点',
      xCategories: dates,
      yCategories: selected.map(point => point.point_name),
      visualMin: -round(maxAbs),
      visualMax: round(maxAbs),
      visualScale: '95th-percentile',
      referenceValue: RATE_REFERENCE,
      subtitle: ranked.length > selected.length
        ? `按最大绝对速率显示前${selected.length}个测点，红色和蓝色分别表示正、负变化方向`
        : `显示${selected.length}个测点，红色和蓝色分别表示正、负变化方向`,
    }
  )
}

function makeRateRankingTable(key, slopeName, points) {
  const rows = rankRatePoints(points).map((point, index) => ({
    index: index + 1,
    point_name: point.point_name,
    point_type: point.point_type,
    latest_rate: point.latest_rate,
    max_abs_rate: point.max_abs_rate,
    max_rate_date: point.rates.find(item => Math.abs(item.value) === point.max_abs_rate)?.date || '',
    avg_interval_days: point.avg_interval_days,
    status: rateStatus(point.max_abs_rate),
  }))
  return tableMaterial(
    key,
    `${slopeName}变化速率排序表`,
    [
      { key: 'index', label: '序号' },
      { key: 'point_name', label: '监测点' },
      { key: 'point_type', label: '监测类型' },
      { key: 'latest_rate', label: '最新速率(mm/d)' },
      { key: 'max_abs_rate', label: '最大绝对速率(mm/d)' },
      { key: 'max_rate_date', label: '最大速率日期' },
      { key: 'avg_interval_days', label: '平均间隔(d)' },
      { key: 'status', label: '参考值判定' },
    ],
    rows,
    'monitoring_data',
    `按最大绝对速率降序排列；±${RATE_REFERENCE} mm/d 为当前筛查参考值。`
  )
}

function makeSurfaceCategoryAnalysis({
  slope,
  category,
  configuredPoints,
  pointStats,
  activityRows,
  alarms,
  reportStart,
  weekStart,
  monthStart,
  endDate,
}) {
  const meta = surfaceCategoryMeta(category)
  const categoryPoints = pointStats.filter(point => pointCategory(point.point_type) === category)
  const categoryConfigured = configuredPoints.filter(point => pointCategory(point.point_type) === category)
  const categoryActivity = activityRows.filter(row => Number(row.slope_id) === Number(slope.id) && pointCategory(row.point_type || row.monitor_type) === category)
  const weeklyRows = categoryActivity.filter(row => row.monitor_date >= weekStart && row.monitor_date <= endDate)
  const monthlyRows = categoryActivity.filter(row => row.monitor_date >= monthStart && row.monitor_date <= endDate)
  const weekDates = new Set(weeklyRows.map(row => row.monitor_date))
  const monthDates = new Set(monthlyRows.map(row => row.monitor_date))
  const weekPointIds = new Set(weeklyRows.map(row => String(row.point_id)))
  const monthPointIds = new Set(monthlyRows.map(row => String(row.point_id)))

  const periodChanges = categoryPoints.map(point => {
    const first = point.observations.at(0)
    const latest = point.observations.at(-1)
    if (!first || !latest || first.date === latest.date) return null
    return { pointName: point.point_name, value: latest.value - first.value, absValue: Math.abs(latest.value - first.value) }
  }).filter(Boolean).sort((a, b) => b.absValue - a.absValue)
  const maxPeriodChange = periodChanges[0] || null

  const observedValues = categoryPoints.flatMap(point => point.observations.map(item => ({
    pointName: point.point_name,
    date: item.date,
    value: Number(item.value),
    absValue: Math.abs(Number(item.value)),
  }))).filter(item => Number.isFinite(item.value)).sort((a, b) => b.absValue - a.absValue)
  const maxObserved = observedValues[0] || null

  const rateValues = categoryPoints.flatMap(point => point.rates.map(item => ({
    pointName: point.point_name,
    date: item.date,
    value: Number(item.value),
    absValue: Math.abs(Number(item.value)),
  }))).filter(item => Number.isFinite(item.value)).sort((a, b) => b.absValue - a.absValue)
  const maxRate = rateValues[0] || null
  const deformationExceeded = categoryPoints.filter(point => point.observations.some(item => Math.abs(Number(item.value)) >= SURFACE_DISPLACEMENT_REFERENCE))
  const rateExceeded = categoryPoints.filter(point => point.rates.some(item => Math.abs(Number(item.value)) >= RATE_REFERENCE))
  const categoryAlarms = alarms.filter(alarm => Number(alarm.slope_id) === Number(slope.id) && pointCategory(alarm.point_type) === category)

  const sentences = [
    `${slope.slope_name}共配置${categoryConfigured.length}个${meta.label}监测点，报告期（${reportStart}至${endDate}）有有效数据的测点为${categoryPoints.length}个。`,
    `本周（${weekStart}至${endDate}）完成${weekDates.size}个有效监测批次（按监测日期计），覆盖${weekPointIds.size}个测点，形成${weeklyRows.length}条测点记录；本月（${monthStart}至${endDate}）完成${monthDates.size}个有效监测批次，覆盖${monthPointIds.size}个测点，形成${monthlyRows.length}条测点记录。`,
  ]
  if (maxPeriodChange) {
    sentences.push(`报告期首末期变化绝对值最大测点为${maxPeriodChange.pointName}，变化量${round(maxPeriodChange.value, 3)}mm。`)
  } else {
    sentences.push('报告期内有效期次不足两期，暂不能计算首末期变化量。')
  }
  if (maxObserved) {
    sentences.push(`报告期最大绝对监测值出现在${maxObserved.pointName}（${maxObserved.date}），为${round(maxObserved.absValue, 3)}mm，原值${round(maxObserved.value, 3)}mm。`)
  }
  if (maxRate) {
    sentences.push(`最大绝对变化速率出现在${maxRate.pointName}（${maxRate.date}），为${round(maxRate.absValue, 3)}mm/d，原值${round(maxRate.value, 3)}mm/d。`)
  } else {
    sentences.push('当前缺少可由相邻有效日期计算的变化速率。')
  }
  sentences.push(`按系统当前筛查参考值，达到或超过±${SURFACE_DISPLACEMENT_REFERENCE}mm变形参考值的测点${deformationExceeded.length}个，达到或超过±${RATE_REFERENCE}mm/d速率参考值的测点${rateExceeded.length}个，系统内该类型未关闭预警记录${categoryAlarms.length}条。`)
  sentences.push(deformationExceeded.length || rateExceeded.length || categoryAlarms.length
    ? '存在需要关注的超限或预警信息，建议复核原始记录、基准点稳定性、仪器状态及同期施工和降雨影响，确认后再形成技术结论。'
    : '当前录入数据未发现达到上述参考值或形成未关闭预警的情况，建议继续按既定频率监测并结合现场巡查综合判断。')

  return {
    ...textMaterial(`meeting-${category}-analysis-${slope.id}`, `${meta.label}监测分析`, sentences.join(''), 'monitoring_data + alarms'),
    draft: true,
    editable: true,
    note: '“监测批次”按存在有效数据的不同监测日期统计；参考值用于系统筛查，导出前请由技术人员确认。',
    metrics: {
      configuredPointCount: categoryConfigured.length,
      reportObservedPointCount: categoryPoints.length,
      weeklyBatchCount: weekDates.size,
      weeklyRecordCount: weeklyRows.length,
      monthlyBatchCount: monthDates.size,
      monthlyRecordCount: monthlyRows.length,
      maxPeriodChange,
      maxObserved,
      maxRate,
      deformationExceededPointCount: deformationExceeded.length,
      rateExceededPointCount: rateExceeded.length,
      activeAlarmCount: categoryAlarms.length,
    },
  }
}

function makeWeeklySurfaceChangeTable({ slope, configuredPoints, pointSummaries, activityRows, alarms, weekStart, endDate }) {
  const formatValue = value => (Number.isFinite(value) ? round(value, 2) : '-')
  const pointResult = point => {
    const pointId = Number(point.id || point.point_id)
    const summary = pointSummaries.find(item => Number(item.point_id) === pointId)
    const datedValues = new Map()
    activityRows
      .filter(row => Number(row.point_id) === pointId && row.monitor_date >= weekStart && row.monitor_date <= endDate)
      .forEach(row => {
        const value = Number(row.value)
        if (Number.isFinite(value)) datedValues.set(row.monitor_date, value)
      })
    const values = [...datedValues.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date))
    const latest = values.at(-1)
    const hasPrevious = summary?.previous_value !== null && summary?.previous_value !== undefined && summary?.previous_value !== '' && summary?.previous_date
    const baseline = hasPrevious
      ? { date: summary.previous_date, value: Number(summary.previous_value) }
      : (values.length > 1 ? values.at(0) : null)
    const intervalDays = baseline && latest ? dayDiff(baseline.date, latest.date) : 0
    const weeklyChange = baseline && latest && intervalDays > 0 ? latest.value - baseline.value : null
    const weeklyRate = Number.isFinite(weeklyChange) && intervalDays > 0 ? weeklyChange / intervalDays : null
    const hasFirst = summary?.initial_value !== null && summary?.initial_value !== undefined && summary?.initial_value !== ''
    const hasLatest = summary?.current_value !== null && summary?.current_value !== undefined && summary?.current_value !== ''
    const cumulativeChange = hasFirst && hasLatest ? Number(summary.current_value) - Number(summary.initial_value) : null
    const activeAlarmCount = alarms.filter(alarm => Number(alarm.point_id) === pointId).length
    const remarks = []
    if (!Number.isFinite(weeklyChange)) remarks.push('本周有效期次不足')
    if (Number.isFinite(cumulativeChange) && Math.abs(cumulativeChange) >= SURFACE_DISPLACEMENT_REFERENCE) remarks.push('达到变形参考值')
    if (Number.isFinite(weeklyRate) && Math.abs(weeklyRate) >= RATE_REFERENCE) remarks.push('达到速率参考值')
    if (activeAlarmCount) remarks.push(`${activeAlarmCount}条未关闭预警`)
    if (!remarks.length) remarks.push('未见超参考值')
    return { point_name: point.point_name, weekly_change: formatValue(weeklyChange), cumulative_change: formatValue(cumulativeChange), weekly_rate: formatValue(weeklyRate), remark: remarks.join('；') }
  }
  const sortPoints = points => [...points].sort((a, b) => String(a.point_name).localeCompare(String(b.point_name), 'zh-CN', { numeric: true }))
  const displacement = sortPoints(configuredPoints.filter(point => pointCategory(point.point_type) === 'displacement')).map(pointResult)
  const settlement = sortPoints(configuredPoints.filter(point => pointCategory(point.point_type) === 'settlement')).map(pointResult)
  const rowCount = Math.max(displacement.length, settlement.length)
  if (!rowCount) return null
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const horizontal = displacement[index] || {}
    const vertical = settlement[index] || {}
    return {
      displacement_point: horizontal.point_name || '', displacement_weekly: horizontal.weekly_change || '', displacement_cumulative: horizontal.cumulative_change || '', displacement_rate: horizontal.weekly_rate || '', displacement_remark: horizontal.remark || '',
      settlement_point: vertical.point_name || '', settlement_weekly: vertical.weekly_change || '', settlement_cumulative: vertical.cumulative_change || '', settlement_rate: vertical.weekly_rate || '', settlement_remark: vertical.remark || '',
    }
  })
  return {
    ...tableMaterial(`meeting-weekly-change-${slope.id}`, `${slope.slope_name}边坡监测周报表`, [
      { key: 'displacement_point', label: '水平点号', width: 0.8 }, { key: 'displacement_weekly', label: '水平本周变化(mm)', width: 0.9 },
      { key: 'displacement_cumulative', label: '水平累计变化(mm)', width: 0.9 }, { key: 'displacement_rate', label: '水平周变化速率(mm/d)', width: 1.1 },
      { key: 'displacement_remark', label: '水平备注', width: 1.25 }, { key: 'settlement_point', label: '沉降点号', width: 0.8 },
      { key: 'settlement_weekly', label: '沉降本周变化(mm)', width: 0.9 }, { key: 'settlement_cumulative', label: '沉降累计变化(mm)', width: 0.9 },
      { key: 'settlement_rate', label: '沉降周变化速率(mm/d)', width: 1.1 }, { key: 'settlement_remark', label: '沉降备注', width: 1.25 },
    ], rows, 'monitoring_points + monitoring_data + alarms', `统计周期：${weekStart}至${endDate}。本周变化按本周最新有效值相对本周前最近一期有效值计算（无前期时按本周首末有效值计算）；累计变化按首期有效值至统计截止日最新有效值计算；周变化速率按对应两期的实际间隔天数计算。参考值：变形±${SURFACE_DISPLACEMENT_REFERENCE}mm、变化速率±${RATE_REFERENCE}mm/d。`),
    tableLayout: 'paired-surface-weekly', projectName: `${slope.section || ''} ${slope.slope_name}`.trim(), dateRange: `${weekStart}～${endDate}`,
  }
}

function makeSurfaceCollection(key, title, pointStats, mode) {
  const slopeGroups = new Map()
  pointStats.forEach(point => {
    const category = pointCategory(point.point_type)
    if (!['displacement', 'settlement'].includes(category)) return
    const slopeId = Number(point.slope_id)
    if (!slopeGroups.has(slopeId)) slopeGroups.set(slopeId, {
      slopeId,
      slopeName: point.slope_name,
      displacement: [],
      settlement: [],
    })
    slopeGroups.get(slopeId)[category].push(point)
  })

  const sections = [...slopeGroups.values()].map(group => {
    const blocks = []
    for (const category of ['displacement', 'settlement']) {
      const points = group[category]
      if (!points.length) continue
      if (mode === 'trend') {
        blocks.push(makeSurfaceTrendChart(`${key}-${group.slopeId}-${category}`, group.slopeName, category, points))
      } else {
        const rateChart = makeSurfaceRateChart(`${key}-${group.slopeId}-${category}`, group.slopeName, category, points)
        if (rateChart.series.length) blocks.push(rateChart)
        const heatmap = makeRateHeatmap(`${key}-heatmap-${group.slopeId}-${category}`, group.slopeName, category, points)
        if (heatmap) blocks.push(heatmap)
      }
    }
    if (mode === 'rate') blocks.push(makeRateRankingTable(`${key}-ranking-${group.slopeId}`, group.slopeName, [...group.displacement, ...group.settlement]))
    return {
      key: `${key}-slope-${group.slopeId}`,
      title: group.slopeName,
      meta: { slopeId: group.slopeId, slopeName: group.slopeName },
      blocks,
    }
  }).filter(section => section.blocks.length)

  return sectionListMaterial(key, title, sections, 'monitoring_data')
}

function topItems(items, limit, formatter) {
  const selected = items.slice(0, limit).map(formatter).filter(Boolean)
  if (!selected.length) return '无'
  const suffix = items.length > limit ? `等${items.length}项` : ''
  return `${selected.join('；')}${suffix}`
}

function levelLabel(level = '') {
  return ({ info: '提示', warning: '预警', serious: '严重', critical: '危急' })[level] || level || '预警'
}

function statusLabel(status = '') {
  return ({
    data_abnormal: '数据异常',
    alarming: '预警中',
    confirmed: '已确认',
    field_review: '现场复核',
    processing: '处置中',
    closed: '已关闭',
  })[status] || status || '待跟踪'
}

function problemLevelLabel(level = '') {
  return ({
    general: '一般',
    important: '重要',
    serious: '严重',
    critical: '危急',
  })[level] || level || '问题'
}

function inferConclusionGrade({ rateRiskCount, nearRateCount, inspections, alarms, rainReviewCount }) {
  const hasHighAlarm = alarms.some(item => ['serious', 'critical'].includes(item.alarm_level))
  const activeAlarmCount = alarms.length
  if (hasHighAlarm || (rateRiskCount > 0 && (activeAlarmCount > 0 || inspections.length > 0))) {
    return { grade: '需重点复核', tone: 'warning' }
  }
  if (rateRiskCount > 0 || activeAlarmCount > 0 || inspections.length > 0 || rainReviewCount > 0 || nearRateCount > 0) {
    return { grade: '需关注', tone: 'attention' }
  }
  return { grade: '总体可控', tone: 'stable' }
}

function buildConclusionAndSuggestionDraft({
  sections,
  slopes,
  pointStats,
  monitoringRows,
  totalPoints,
  observedPoints,
  inspections,
  alarms,
  rainRows,
  deepGroups,
  rateReference,
  endDate,
}) {
  const rateStats = pointStats
    .filter(item => Number.isFinite(item.max_abs_rate))
    .sort((a, b) => Math.abs(b.max_abs_rate) - Math.abs(a.max_abs_rate))
  const rateRiskPoints = rateStats.filter(item => Math.abs(item.max_abs_rate) >= rateReference)
  const nearRatePoints = rateStats.filter(item => Math.abs(item.max_abs_rate) < rateReference && Math.abs(item.max_abs_rate) >= rateReference * 0.75)
  const latestChanges = pointStats
    .filter(item => Number.isFinite(item.adjacent_change))
    .sort((a, b) => Math.abs(b.adjacent_change) - Math.abs(a.adjacent_change))
  const rainReviewRows = rainRows.filter(item => item.needs_review)
  const activeAlarmRows = alarms.filter(item => item.status !== 'closed')
  const { grade } = inferConclusionGrade({
    rateRiskCount: rateRiskPoints.length,
    nearRateCount: nearRatePoints.length,
    inspections,
    alarms: activeAlarmRows,
    rainReviewCount: rainReviewRows.length,
  })

  const sectionText = sections.join('、') || '所选标段'
  const observedRate = totalPoints ? `${round(observedPoints / totalPoints * 100, 1)}%` : '暂无可计算'
  const rateRiskText = rateRiskPoints.length
    ? `共有${rateRiskPoints.length}处测点变化速率达到或超过±${rateReference}mm/d参考值，重点测点为${topItems(rateRiskPoints, 5, item => `${item.slope_name}-${item.point_name}（${round(item.max_abs_rate, 2)}mm/d）`)}。`
    : `各有效测点变化速率未达到±${rateReference}mm/d参考值。`
  const nearRateText = nearRatePoints.length
    ? `另有${nearRatePoints.length}处测点变化速率接近参考值，建议纳入后续复核清单，代表测点为${topItems(nearRatePoints, 3, item => `${item.slope_name}-${item.point_name}（${round(item.max_abs_rate, 2)}mm/d）`)}。`
    : ''
  const changeText = latestChanges.length
    ? `相邻期变化量较大的测点包括${topItems(latestChanges, 5, item => `${item.slope_name}-${item.point_name}（${round(item.adjacent_change, 2)}${item.unit || 'mm'}）`)}。`
    : '本期暂无可计算相邻期变化量的测点。'
  const inspectionText = inspections.length
    ? `报告期内巡检模块记录${inspections.length}项需处置或关注的问题，重点包括${topItems(inspections, 5, item => `${item.slope_name}${item.problem_location ? ` ${item.problem_location}` : ''}（${problemLevelLabel(item.problem_level)}：${String(item.problems || '现场问题').slice(0, 38)}）`)}。`
    : '报告期内巡检模块未记录需处置的问题。'
  const alarmText = activeAlarmRows.length
    ? `当前存在${activeAlarmRows.length}条未关闭预警记录，重点包括${topItems(activeAlarmRows, 5, item => `${item.slope_name}-${item.point_name}（${levelLabel(item.alarm_level)}，${statusLabel(item.status)}）`)}。`
    : '当前未检索到未关闭预警记录。'
  const rainfallText = rainRows.length
    ? `报告期内录入雨量记录${rainRows.length}日${rainReviewRows.length ? `，其中${rainReviewRows.length}日雨量需复核或重点关注` : '，未发现需复核雨量记录'}。`
    : '报告期内未录入雨量记录，暂不开展雨量—变形响应判断。'

  const conclusionDraft = [
    '【系统生成初稿，需人工确认】',
    `3 监测结论`,
    `截至${endDate || '统计截止日'}，本次对${sectionText}共${slopes.length}处边坡进行统计分析。系统纳入有效监测点${observedPoints}处，监测数据${monitoringRows.length}条，测点覆盖率为${observedRate}；深部水平位移测斜成果${deepGroups.size}期。`,
    `从监测数据和变化速率看，${rateRiskText}${nearRateText}${changeText}`,
    `从现场巡检和预警记录看，${inspectionText}${alarmText}${rainfallText}`,
    `综合监测数据、变化速率、巡检问题和预警记录，系统建议本期综合判断为“${grade}”。该判断仅作为会议材料初稿，应由技术负责人结合原始记录、施工扰动、降雨过程和现场复核情况进行最终确认。`,
  ].join('\n')

  const suggestionItems = [
    `对变化速率达到或接近±${rateReference}mm/d参考值的测点，优先复核原始观测记录、观测日期间隔、仪器状态和现场施工扰动，必要时加密监测频率。`,
    inspections.length
      ? '对巡检模块记录的问题建立闭环台账，明确责任人、整改期限和复核意见；未闭合问题应在下一期会议材料中持续跟踪。'
      : '继续保持常规巡检频率，重点关注坡面裂缝、坡脚排水、平台堆载、支护结构外观和施工扰动变化。',
    activeAlarmRows.length
      ? '对未关闭预警记录逐条核查处置状态，完成现场复核后及时更新预警状态、处置措施和关闭说明。'
      : '当前未关闭预警较少或为空，建议继续执行预警阈值复核和异常数据人工确认机制。',
    rainReviewRows.length
      ? '对雨量突增或需复核日期开展雨后专项巡查，并对比降雨前后监测曲线变化，判断是否存在雨量响应。'
      : '建议持续补齐日雨量记录，后续用于雨量—位移响应分析和雨后加密监测决策。',
    '报告导出前建议由人工复核本节结论等级、重点边坡名称、测点编号和建议措施，避免系统初稿中的统计口径与现场实际不一致。',
  ]
  const suggestionDraft = [
    '【系统生成初稿，需人工确认】',
    '4 工作建议',
    ...suggestionItems.map((item, index) => `${index + 1}）${item}`),
  ].join('\n')

  return { conclusionDraft, suggestionDraft, conclusionGrade: grade }
}

router.get('/ai-status', (_req, res) => {
  res.json({ success: true, data: getAiStatus() })
})

router.post('/ai-draft', async (req, res) => {
  try {
    const draft = await generateAiReportDraft({
      report: req.body?.report || {},
      materialPackage: req.body?.materialPackage || {},
    })
    res.json({ success: true, data: draft })
  } catch (error) {
    console.error('生成智能报告初稿失败:', error)
    const isOpenRouterRateLimit = error?.status === 429
      && /rate.?limit|shared_pool|temporarily/i.test(String(error?.error?.metadata?.raw || error?.message))
    res.status(error.statusCode || error.status || 500).json({
      success: false,
      message: error.statusCode === 503
        ? error.message
        : isOpenRouterRateLimit
          ? '当前 OpenRouter 免费模型线路繁忙，系统已自动重试；请稍后再试或更换可用模型'
          : /^智能初稿/.test(String(error?.message || ''))
            ? error.message
            : '生成智能报告初稿失败，请检查服务配置或稍后重试',
    })
  }
})

router.post('/resolve', async (req, res) => {
  try {
    const scope = req.body?.scope || {}
    const requestedSlopeIds = list(scope.slopeIds).map(Number).filter(Number.isFinite).slice(0, MAX_SLOPES)
    const requestedSections = list(scope.sections).map(item => String(item).trim()).filter(Boolean)
    const monitoringTypes = list(scope.monitoringTypes).map(String)
    const dateRange = list(scope.dateRange)
    const startDate = dateText(dateRange[0])
    const endDate = dateText(dateRange[1]) || dateText(scope.cutoff) || new Date().toISOString().slice(0, 10)
    const weekStart = startDate && dayDiff(startDate, endDate) <= 10 ? startDate : shiftDate(endDate, -6)
    const monthStart = `${endDate.slice(0, 8)}01`
    const activityStart = [weekStart, monthStart].filter(Boolean).sort()[0]
    const reportStart = startDate || weekStart
    const section = String(scope.section || '').trim()
    const reportType = String(scope.reportType || scope.report_type || '').trim()

    const slopeWhere = []
    const slopeParams = []
    if (requestedSlopeIds.length) {
      slopeWhere.push(`s.id IN (${requestedSlopeIds.map(() => '?').join(',')})`)
      slopeParams.push(...requestedSlopeIds)
    } else if (requestedSections.length) {
      slopeWhere.push(`s.section IN (${requestedSections.map(() => '?').join(',')})`)
      slopeParams.push(...requestedSections)
    } else if (section) {
      slopeWhere.push('s.section = ?')
      slopeParams.push(section)
    }
    if (!requestedSlopeIds.length && reportType === 'supervision_meeting') {
      slopeWhere.push('COALESCE(s.include_in_meeting, 1) = 1')
    }
    const slopes = await safeQuery(
      `SELECT s.id, s.slope_name, s.section, s.start_stake, s.end_stake, s.slope_type, s.max_height,
         s.slope_length, s.slope_position, s.design_displacement_piles, s.design_settlement_plates,
         s.design_anchor_dynamometers, s.design_inclinometer_length, s.construction_status,
         s.meeting_work_progress, s.meeting_remark, s.include_in_meeting, s.meeting_display_order
       FROM slopes s ${slopeWhere.length ? `WHERE ${slopeWhere.join(' AND ')}` : ''}
       ORDER BY s.section, COALESCE(s.meeting_display_order, s.id), s.id LIMIT ${MAX_SLOPES}`,
      slopeParams
    )
    const slopeIds = slopes.map(item => Number(item.id))
    if (!slopeIds.length) {
      return res.json({ success: true, data: { scope: { ...scope, resolvedAt: new Date().toISOString() }, summary: {}, materials: {}, bindingIndex: {} } })
    }
    const slopePlaceholders = slopeIds.map(() => '?').join(',')

    const monitoringWhere = [`s.id IN (${slopePlaceholders})`]
    const monitoringParams = [...slopeIds]
    if (monitoringTypes.length) {
      monitoringWhere.push(`COALESCE(p.point_type, md.monitor_type) IN (${monitoringTypes.map(() => '?').join(',')})`)
      monitoringParams.push(...monitoringTypes)
    }
    if (startDate) { monitoringWhere.push('md.monitor_date >= ?'); monitoringParams.push(startDate) }
    if (endDate) { monitoringWhere.push('md.monitor_date <= ?'); monitoringParams.push(endDate) }
    const monitoringRows = await safeQuery(
      `SELECT md.id, md.point_id, DATE_FORMAT(md.monitor_date, '%Y-%m-%d') monitor_date,
         md.value, md.unit, md.monitor_type, p.point_name, p.point_type, p.slope_id,
         s.slope_name, s.section
       FROM monitoring_data md
       JOIN monitoring_points p ON p.id = md.point_id
       JOIN slopes s ON s.id = p.slope_id
       WHERE ${monitoringWhere.join(' AND ')}
       ORDER BY p.id, md.monitor_date LIMIT ${MAX_ROWS}`,
      monitoringParams
    )
    const pointStats = groupMonitoring(monitoringRows)

    const activityWhere = [
      `p.slope_id IN (${slopePlaceholders})`,
      'md.monitor_date >= ?',
      'md.monitor_date <= ?',
    ]
    const activityParams = [...slopeIds, activityStart, endDate]
    if (monitoringTypes.length) {
      activityWhere.push(`COALESCE(p.point_type, md.monitor_type) IN (${monitoringTypes.map(() => '?').join(',')})`)
      activityParams.push(...monitoringTypes)
    }
    const monitoringActivityRows = await safeQuery(
      `SELECT md.point_id, p.slope_id, p.point_name, p.point_type, md.monitor_type, md.value, md.unit,
         DATE_FORMAT(md.monitor_date, '%Y-%m-%d') monitor_date
       FROM monitoring_data md
       JOIN monitoring_points p ON p.id = md.point_id
       WHERE ${activityWhere.join(' AND ')}
       ORDER BY p.slope_id, md.monitor_date, md.point_id LIMIT ${MAX_ROWS}`,
      activityParams
    )

    const pointCountRows = await safeQuery(
      `SELECT COUNT(*) total_points FROM monitoring_points p WHERE p.slope_id IN (${slopePlaceholders}) AND COALESCE(p.archived, 0) = 0`,
      slopeIds
    )
    const pointRows = await safeQuery(
      `SELECT p.id, p.slope_id, p.point_name, p.point_type
       FROM monitoring_points p
       WHERE p.slope_id IN (${slopePlaceholders}) AND COALESCE(p.archived, 0) = 0
       ORDER BY p.slope_id, p.point_type, p.point_name`,
      slopeIds
    )
    const pointSummaryRows = await safeQuery(
      `SELECT p.id point_id, p.slope_id, p.point_name, p.point_type,
         DATE_FORMAT(first_md.monitor_date, '%Y-%m-%d') first_date, first_md.value initial_value,
         DATE_FORMAT(latest_md.monitor_date, '%Y-%m-%d') latest_date, latest_md.value current_value,
         DATE_FORMAT(previous_md.monitor_date, '%Y-%m-%d') previous_date, previous_md.value previous_value,
         latest_md.unit
       FROM monitoring_points p
       LEFT JOIN monitoring_data first_md ON first_md.id = (
         SELECT md1.id FROM monitoring_data md1
         WHERE md1.point_id = p.id AND md1.monitor_date <= ?
         ORDER BY md1.monitor_date ASC, md1.id ASC LIMIT 1
       )
       LEFT JOIN monitoring_data latest_md ON latest_md.id = (
         SELECT md2.id FROM monitoring_data md2
         WHERE md2.point_id = p.id AND md2.monitor_date <= ?
         ORDER BY md2.monitor_date DESC, md2.id DESC LIMIT 1
       )
       LEFT JOIN monitoring_data previous_md ON previous_md.id = (
         SELECT md3.id FROM monitoring_data md3
         WHERE md3.point_id = p.id AND md3.monitor_date < ?
         ORDER BY md3.monitor_date DESC, md3.id DESC LIMIT 1
       )
       WHERE p.slope_id IN (${slopePlaceholders}) AND COALESCE(p.archived, 0) = 0
       ORDER BY p.slope_id, p.point_type, p.point_name`,
      [endDate, endDate, weekStart, ...slopeIds]
    )
    const totalPoints = Number(pointCountRows[0]?.total_points || 0)
    const observedPoints = pointStats.length
    const averageIntervals = pointStats.map(item => item.avg_interval_days).filter(Number.isFinite)

    const inspectionParams = [...slopeIds]
    let inspectionDateWhere = ''
    if (startDate) { inspectionDateWhere += ' AND i.inspection_date >= ?'; inspectionParams.push(`${startDate} 00:00:00`) }
    if (endDate) { inspectionDateWhere += ' AND i.inspection_date <= ?'; inspectionParams.push(`${endDate} 23:59:59`) }
    const inspections = await safeQuery(
      `SELECT i.id, s.section, s.slope_name, DATE_FORMAT(i.inspection_date, '%Y-%m-%d %H:%i') inspection_date,
         i.inspector, i.inspection_type, i.problem_level, i.problem_location, i.problems,
         i.responsible_person, DATE_FORMAT(i.rectification_deadline, '%Y-%m-%d') rectification_deadline,
         i.rectification_status, i.rainfall_mm
       FROM inspections i JOIN slopes s ON s.id = i.slope_id
       WHERE i.slope_id IN (${slopePlaceholders}) AND i.has_problem = 1 ${inspectionDateWhere}
       ORDER BY i.inspection_date DESC LIMIT 500`,
      inspectionParams
    )

    const alarmParams = [...slopeIds]
    let alarmDateWhere = ''
    if (endDate) { alarmDateWhere += ' AND a.created_at <= ?'; alarmParams.push(`${endDate} 23:59:59`) }
    const alarms = await safeQuery(
      `SELECT a.id, p.id point_id, p.slope_id, p.point_type, s.section, s.slope_name, p.point_name, a.alarm_type, a.alarm_level,
         a.abnormal_value, a.threshold_value, a.status, a.description, a.measures,
         DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') created_at
       FROM alarms a JOIN monitoring_points p ON p.id = a.point_id JOIN slopes s ON s.id = p.slope_id
       WHERE p.slope_id IN (${slopePlaceholders}) AND a.status <> 'closed' ${alarmDateWhere}
       ORDER BY a.created_at DESC LIMIT 500`,
      alarmParams
    )

    const deepParams = [...slopeIds]
    let deepDateWhere = ''
    if (startDate) { deepDateWhere += ' AND sv.survey_date >= ?'; deepParams.push(startDate) }
    if (endDate) { deepDateWhere += ' AND sv.survey_date <= ?'; deepParams.push(endDate) }
    const deepRows = await safeQuery(
      `SELECT sv.id survey_id, sv.point_id, DATE_FORMAT(sv.survey_date, '%Y-%m-%d') survey_date,
         p.point_name, p.slope_id, s.slope_name, r.depth_m, r.cumulative_displacement, r.relative_displacement
       FROM inclinometer_surveys sv JOIN inclinometer_survey_readings r ON r.survey_id = sv.id
       JOIN monitoring_points p ON p.id = sv.point_id JOIN slopes s ON s.id = p.slope_id
       WHERE p.slope_id IN (${slopePlaceholders}) ${deepDateWhere}
       ORDER BY p.id, sv.survey_date, r.depth_m LIMIT ${MAX_ROWS}`,
      deepParams
    )
    const deepGroups = new Map()
    deepRows.forEach(row => {
      const key = String(row.survey_id)
      if (!deepGroups.has(key)) deepGroups.set(key, {
        slopeId: Number(row.slope_id),
        slopeName: row.slope_name,
        pointId: Number(row.point_id),
        pointName: row.point_name,
        name: row.survey_date,
        surveyDate: row.survey_date,
        cumulativeData: [],
        relativeData: [],
      })
      const group = deepGroups.get(key)
      const depth = Number(row.depth_m)
      const hasCumulative = row.cumulative_displacement !== null && row.cumulative_displacement !== ''
      const hasRelative = row.relative_displacement !== null && row.relative_displacement !== ''
      const cumulative = Number(row.cumulative_displacement)
      const relative = Number(row.relative_displacement)
      if (Number.isFinite(depth) && hasCumulative && Number.isFinite(cumulative)) group.cumulativeData.push([cumulative, depth])
      if (Number.isFinite(depth) && hasRelative && Number.isFinite(relative)) group.relativeData.push([relative, depth])
    })

    const deepPointGroups = new Map()
    ;[...deepGroups.values()].forEach(survey => {
      const pointId = Number(survey.pointId)
      if (!deepPointGroups.has(pointId)) deepPointGroups.set(pointId, {
        pointId,
        pointName: survey.pointName,
        slopeId: Number(survey.slopeId),
        slopeName: survey.slopeName,
        surveys: [],
      })
      deepPointGroups.get(pointId).surveys.push(survey)
    })
    const deepPointProfiles = [...deepPointGroups.values()].map(profile => ({
      ...profile,
      surveys: profile.surveys.sort((a, b) => a.surveyDate.localeCompare(b.surveyDate)),
    }))

    const sections = [...new Set(slopes.map(item => item.section).filter(Boolean))]
    let rainRows = []
    if (sections.length) {
      const rainParams = [...sections]
      const rainWhere = [`section IN (${sections.map(() => '?').join(',')})`]
      if (startDate) { rainWhere.push('rain_date >= ?'); rainParams.push(startDate) }
      if (endDate) { rainWhere.push('rain_date <= ?'); rainParams.push(endDate) }
      rainRows = await safeQuery(
        `SELECT section, DATE_FORMAT(rain_date, '%Y-%m-%d') rain_date, amount_mm, needs_review
         FROM rainfall_daily_records WHERE ${rainWhere.join(' AND ')} ORDER BY rain_date`,
        rainParams
      )
    }

    const maps = await safeQuery(
      `SELECT m.id, m.slope_id, s.slope_name, f.file_path, f.original_name, f.mime_type, m.created_at
       FROM slope_ledger_maps m JOIN slopes s ON s.id = m.slope_id JOIN file_assets f ON f.id = m.file_asset_id
       WHERE m.slope_id IN (${slopePlaceholders}) AND m.is_current = 1 ORDER BY s.slope_name`,
      slopeIds
    )
    const geoRows = await safeQuery(
      `SELECT g.slope_id, s.slope_name, g.longitude, g.latitude, g.coordinate_system, g.accuracy_m, g.source_layer_id
       FROM slope_geo_locations g JOIN slopes s ON s.id = g.slope_id
       WHERE g.slope_id IN (${slopePlaceholders}) ORDER BY s.slope_name`,
      slopeIds
    )

    const surfaceRows = pointStats.map(item => ({
      section: item.section, slope_name: item.slope_name, point_name: item.point_name, point_type: item.point_type,
      first_date: item.first_date, last_date: item.last_date, latest_value: item.latest_value,
      adjacent_change: item.adjacent_change, latest_rate: item.latest_rate,
      max_abs_rate: item.max_abs_rate, avg_interval_days: item.avg_interval_days,
      rate_status: Number.isFinite(item.max_abs_rate) && item.max_abs_rate >= RATE_REFERENCE ? '达到参考值' : '未达到参考值', unit: item.unit,
    }))
    const slopeTableRows = slopes.map(item => ({
      section: item.section, slope_name: item.slope_name, start_stake: item.start_stake, end_stake: item.end_stake,
      slope_type: item.slope_type, max_height: item.max_height,
      point_count: pointStats.filter(point => Number(point.slope_id) === Number(item.id)).length,
    }))
    const rectificationLabels = { not_required: '无需整改', pending: '待整改', processing: '整改中', pending_review: '待复核', closed: '已闭环' }
    const alarmLevelLabels = { info: '提示', warning: '预警', serious: '严重', critical: '危急' }
    const alarmStatusLabels = { data_abnormal: '数据异常', alarming: '预警中', confirmed: '已确认', field_review: '现场复核', processing: '处置中', closed: '已关闭' }
    const inspectionTableRows = inspections.map(item => ({ ...item, rectification_status_text: rectificationLabels[item.rectification_status] || item.rectification_status || '-' }))
    const alarmTableRows = alarms.map(item => ({ ...item, alarm_level_text: alarmLevelLabels[item.alarm_level] || item.alarm_level || '-', status_text: alarmStatusLabels[item.status] || item.status || '-' }))
    const rainfallTableRows = rainRows.map(item => ({ ...item, quality_review: item.needs_review ? '待复核' : '正常' }))

    const pointRowsBySlope = new Map()
    const pointCountsBySlope = new Map()
    pointRows.forEach(point => {
      const slopeId = Number(point.slope_id)
      if (!pointRowsBySlope.has(slopeId)) pointRowsBySlope.set(slopeId, [])
      pointRowsBySlope.get(slopeId).push(point)
      if (!pointCountsBySlope.has(slopeId)) {
        pointCountsBySlope.set(slopeId, { displacement: 0, settlement: 0, anchor: 0, inclinometer: 0, total: 0 })
      }
      const counts = pointCountsBySlope.get(slopeId)
      counts[pointCategory(point.point_type)] += 1
      counts.total += 1
    })

    const pointStatsBySlope = new Map()
    pointStats.forEach(point => {
      const slopeId = Number(point.slope_id)
      if (!pointStatsBySlope.has(slopeId)) pointStatsBySlope.set(slopeId, [])
      pointStatsBySlope.get(slopeId).push(point)
    })
    const deepProfilesBySlope = new Map()
    deepPointProfiles.forEach(profile => {
      const slopeId = Number(profile.slopeId)
      if (!deepProfilesBySlope.has(slopeId)) deepProfilesBySlope.set(slopeId, [])
      deepProfilesBySlope.get(slopeId).push(profile)
    })

    const preferManualNumber = (value, fallback = '') => {
      if (value === null || value === undefined || value === '') return fallback
      const number = Number(value)
      return Number.isFinite(number) ? number : fallback
    }
    const positiveNumberOrBlank = (value) => {
      const number = preferManualNumber(value, '')
      return number !== '' && Number(number) > 0 ? number : ''
    }
    const formatLengthHeight = (slope) => {
      const length = positiveNumberOrBlank(slope.slope_length)
      const height = positiveNumberOrBlank(slope.max_height)
      if (length !== '' && height !== '') return `${length}/${height}`
      if (length !== '') return `${length}/-`
      if (height !== '') return `-/${height}`
      return '-'
    }
    const meetingOverviewRows = slopes.map(slope => {
      const counts = pointCountsBySlope.get(Number(slope.id)) || {}
      const stakeRange = [slope.start_stake, slope.end_stake].filter(Boolean).join('～') || '-'
      const lengthHeight = formatLengthHeight(slope)
      const progressParts = []
      const surfaceCount = Number(counts.displacement || 0) + Number(counts.settlement || 0)
      if (surfaceCount) progressParts.push(`地表测点${surfaceCount}处`)
      if (counts.inclinometer) progressParts.push(`测斜${counts.inclinometer}处`)
      if (counts.anchor) progressParts.push(`锚索应力${counts.anchor}处`)
      return {
        section: slope.section || '-',
        stake_range: stakeRange,
        length_height: lengthHeight,
        position: slope.slope_position || '-',
        displacement_count: preferManualNumber(slope.design_displacement_piles, counts.displacement || ''),
        settlement_count: preferManualNumber(slope.design_settlement_plates, counts.settlement || ''),
        anchor_count: preferManualNumber(slope.design_anchor_dynamometers, counts.anchor || ''),
        inclinometer_count: preferManualNumber(slope.design_inclinometer_length, counts.inclinometer || ''),
        remark: slope.meeting_remark || slope.slope_type || slope.slope_name || '',
        work_progress: slope.meeting_work_progress || slope.construction_status || progressParts.join('，') || '暂未维护测点',
      }
    })

    const meetingProgressRows = slopes.map((slope, index) => {
      const counts = pointCountsBySlope.get(Number(slope.id)) || {}
      const surfaceCount = Number(counts.displacement || 0) + Number(counts.settlement || 0) + Number(counts.anchor || 0)
      return {
        index: index + 1,
        section: slope.section || '-',
        slope_name: slope.slope_name,
        surface_point_count: surfaceCount,
        inclinometer_count: counts.inclinometer || 0,
        progress_text: `${slope.section || ''}${slope.slope_name}：已布${surfaceCount}个监测点，测斜${counts.inclinometer || 0}处。`,
      }
    })

    const meetingProgressText = meetingProgressRows
      .map(item => `（${item.index}）${item.progress_text}`)
      .join('\n')

    const slopeSections = slopes.map((slope, index) => {
      const slopeId = Number(slope.id)
      const slopeStats = pointStatsBySlope.get(slopeId) || []
      const slopeMaps = maps.filter(item => Number(item.slope_id) === slopeId)
      const slopeMapBlock = {
        key: `meeting-layout-map-${slopeId}`,
        kind: 'image-list',
        title: `${slope.slope_name}监测布点图`,
        source: 'slope_ledger_maps + file_assets',
        items: slopeMaps.map(item => ({ ...item, caption: `${slope.slope_name}监测布点图` })),
        note: slopeMaps.length ? '当前使用版本' : '当前边坡尚未维护监测布点图',
      }
      const surfaceStats = slopeStats.filter(point => !isDeepPointType(point.point_type))
      const displacementStats = surfaceStats.filter(point => pointCategory(point.point_type) === 'displacement')
      const settlementStats = surfaceStats.filter(point => pointCategory(point.point_type) === 'settlement')
      const configuredSlopePoints = pointRows.filter(point => Number(point.slope_id) === slopeId && !isDeepPointType(point.point_type))
      const slopePointSummaries = pointSummaryRows.filter(point => Number(point.slope_id) === slopeId)
      const weeklyChangeTable = makeWeeklySurfaceChangeTable({
        slope,
        configuredPoints: configuredSlopePoints,
        pointSummaries: slopePointSummaries,
        activityRows: monitoringActivityRows,
        alarms,
        weekStart,
        endDate,
      })
      const deepProfiles = deepProfilesBySlope.get(slopeId) || []
      const deepPeriodCount = deepProfiles.reduce((sum, profile) => sum + profile.surveys.length, 0)
      const deepChartBlocks = deepProfiles.flatMap(profile => {
        const charts = [
          makeDeepProfileChart(profile, 'cumulative'),
          makeDeepProfileChart(profile, 'relative'),
        ].filter(chart => chart.series.some(series => series.data.length))
        return [...charts, makeDeepAnalysisMaterial(profile)]
      })
      const surfaceChartBlocks = []
      for (const [category, points] of [['displacement', displacementStats], ['settlement', settlementStats]]) {
        const configuredCategoryPoints = configuredSlopePoints.filter(point => pointCategory(point.point_type) === category)
        if (!points.length && !configuredCategoryPoints.length) continue
        if (points.length) {
          surfaceChartBlocks.push(makeSurfaceTrendChart(`meeting-trend-${category}-${slopeId}`, slope.slope_name, category, points))
          const rateChart = makeSurfaceRateChart(`meeting-rate-${category}-${slopeId}`, slope.slope_name, category, points)
          if (rateChart.series.length) surfaceChartBlocks.push(rateChart)
          const heatmap = makeRateHeatmap(`meeting-rate-heatmap-${category}-${slopeId}`, slope.slope_name, category, points)
          if (heatmap) surfaceChartBlocks.push(heatmap)
        }
        surfaceChartBlocks.push(makeSurfaceCategoryAnalysis({ slope, category, configuredPoints: configuredSlopePoints, pointStats: surfaceStats, activityRows: monitoringActivityRows, alarms, reportStart, weekStart, monthStart, endDate }))
      }
      const rateRankingTable = makeRateRankingTable(`meeting-rate-ranking-${slopeId}`, slope.slope_name, [...displacementStats, ...settlementStats])
      const cutoffText = endDate || '统计截止日'
      const deepText = deepProfiles.length
        ? `本期${slope.slope_name}纳入${deepProfiles.length}个测斜孔、共${deepPeriodCount}期深部水平位移成果。各测斜孔分别绘制累计水平位移和相对水平位移曲线；期次较多时均匀选取含首、末期在内的代表期，以保证图件清晰并保留完整时间跨度。`
        : `本期${slope.slope_name}未录入深部水平位移测斜成果。`

      return {
        key: `meeting-slope-${slopeId}`,
        title: `2.${index + 1} ${slope.section || ''}${slope.slope_name}布点及变形监测`,
        meta: { slopeId, section: slope.section, slopeName: slope.slope_name, cutoff: cutoffText },
        blocks: [
          slopeMapBlock,
          textMaterial(`meeting-surface-intro-${slopeId}`, '地表变形监测', `至${cutoffText}，地表水平位移和沉降按不同变形方向分别绘图；变化速率曲线优先展示风险较高的测点，完整结果见排序表。`, 'monitoring_data'),
          ...(weeklyChangeTable ? [weeklyChangeTable] : []),
          ...surfaceChartBlocks,
          ...(rateRankingTable.rows.length ? [rateRankingTable] : []),
          textMaterial(`meeting-deep-intro-${slopeId}`, '深部水平位移监测详情', deepText, 'inclinometer_data'),
          ...deepChartBlocks,
        ],
      }
    })

    const rateRiskCount = pointStats.filter(item => Number.isFinite(item.max_abs_rate) && Math.abs(item.max_abs_rate) >= RATE_REFERENCE).length
    const {
      conclusionDraft: meetingConclusion,
      suggestionDraft: meetingSuggestions,
      conclusionGrade,
    } = buildConclusionAndSuggestionDraft({
      sections,
      slopes,
      pointStats,
      monitoringRows,
      totalPoints,
      observedPoints,
      inspections,
      alarms,
      rainRows,
      deepGroups,
      rateReference: RATE_REFERENCE,
      endDate,
    })

    const materials = {
      meetingOverview: tableMaterial('meetingOverview', '高边坡施工现状及监测工作进展', [
        { key: 'section', label: '土建标段' }, { key: 'stake_range', label: '边坡里程桩号' }, { key: 'length_height', label: '边坡长度/坡高（m）' },
        { key: 'position', label: '位置' }, { key: 'displacement_count', label: '位移桩（个）' }, { key: 'settlement_count', label: '沉降板（个）' },
        { key: 'anchor_count', label: '锚测力计（个）' }, { key: 'inclinometer_count', label: '测斜孔（处）' }, { key: 'remark', label: '备注' },
        { key: 'work_progress', label: '工作进展' },
      ], meetingOverviewRows, 'slopes + monitoring_points', '优先采用边坡台账中维护的施工与监控概况字段；未维护时由系统已维护测点类型统计兜底。'),
      meetingProgressList: tableMaterial('meetingProgressList', '本月边坡监控进展清单', [
        { key: 'index', label: '序号' }, { key: 'section', label: '标段' }, { key: 'slope_name', label: '边坡名称' },
        { key: 'surface_point_count', label: '地表/锚索监测点' }, { key: 'inclinometer_count', label: '测斜孔' }, { key: 'progress_text', label: '汇报表述' },
      ], meetingProgressRows, 'slopes + monitoring_points'),
      meetingProgressText: textMaterial('meetingProgressText', '本月边坡监控进展', meetingProgressText, 'slopes + monitoring_points'),
      meetingSlopeSections: sectionListMaterial('meetingSlopeSections', '分边坡监测进展', slopeSections, 'monitoring_data + inclinometer_data'),
      meetingConclusion: { ...textMaterial('meetingConclusion', '第3节 监测结论初稿', meetingConclusion, 'monitoring_data + inspections + alarms + rainfall_daily_records'), draft: true, editable: true, note: '系统根据监测数据、变化速率、巡检问题和预警记录自动生成，导出前请人工确认。' },
      meetingSuggestions: { ...textMaterial('meetingSuggestions', '第4节 工作建议初稿', meetingSuggestions, 'monitoring_data + inspections + alarms + rainfall_daily_records'), draft: true, editable: true, note: '系统生成建议清单，导出前请结合现场情况人工删改。' },
      slopeSummary: tableMaterial('slopeSummary', '本次报告边坡范围', [
        { key: 'section', label: '标段' }, { key: 'slope_name', label: '边坡名称' }, { key: 'start_stake', label: '起点桩号' },
        { key: 'end_stake', label: '终点桩号' }, { key: 'slope_type', label: '边坡类型' }, { key: 'point_count', label: '有数据测点' },
      ], slopeTableRows, 'slopes + monitoring_points'),
      frequencySummary: tableMaterial('frequencySummary', '平均监测频率统计', [
        { key: 'slope_name', label: '边坡' }, { key: 'point_name', label: '测点' }, { key: 'point_type', label: '监测类型' },
        { key: 'first_date', label: '首期日期' }, { key: 'last_date', label: '末期日期' }, { key: 'avg_interval_days', label: '平均间隔(d)' },
      ], surfaceRows, 'monitoring_data', '同一测点相邻两次有效观测日期的平均间隔。'),
      surfaceSummary: tableMaterial('surfaceSummary', '监测变化与速率统计', [
        { key: 'slope_name', label: '边坡' }, { key: 'point_name', label: '测点' }, { key: 'point_type', label: '监测类型' },
        { key: 'last_date', label: '最新日期' }, { key: 'latest_value', label: '最新值' }, { key: 'adjacent_change', label: '相邻期变化' },
        { key: 'latest_rate', label: '最新速率(mm/d)' }, { key: 'max_abs_rate', label: '最大速率(mm/d)' }, { key: 'rate_status', label: '参考值判定' },
      ], surfaceRows, 'monitoring_data', `变化速率参考配置为 ${RATE_REFERENCE} mm/d，仅用于筛查，结论需结合现场情况。`),
      monitoringTrend: makeTrendMaterial(pointStats),
      monitoringRate: makeRateMaterial(pointStats),
      rainfallOverlay: makeRainOverlay(pointStats, rainRows),
      deepProfile: sectionListMaterial(
        'deepProfile',
        '深部水平位移测斜曲线',
        deepPointProfiles.map((profile, index) => ({
          key: `deep-profile-${profile.pointId}`,
          title: `${index + 1}. ${profile.slopeName} ${profile.pointName}`,
          meta: { slopeId: profile.slopeId, pointId: profile.pointId, pointName: profile.pointName },
          blocks: [
            ...[
              makeDeepProfileChart(profile, 'cumulative'),
              makeDeepProfileChart(profile, 'relative'),
            ].filter(chart => chart.series.some(series => series.data.length)),
            makeDeepAnalysisMaterial(profile),
          ],
        })),
        'inclinometer_surveys + inclinometer_survey_readings'
      ),
      inspectionProblems: tableMaterial('inspectionProblems', '巡查问题及整改情况', [
        { key: 'inspection_date', label: '巡查日期' }, { key: 'slope_name', label: '边坡' }, { key: 'problem_level', label: '问题等级' },
        { key: 'problem_location', label: '问题位置' }, { key: 'problems', label: '问题描述' }, { key: 'responsible_person', label: '责任人' },
        { key: 'rectification_deadline', label: '整改期限' }, { key: 'rectification_status_text', label: '整改状态' },
      ], inspectionTableRows, 'inspections'),
      alarmActions: tableMaterial('alarmActions', '活动预警及处置记录', [
        { key: 'created_at', label: '预警时间' }, { key: 'slope_name', label: '边坡' }, { key: 'point_name', label: '测点' },
        { key: 'alarm_level_text', label: '等级' }, { key: 'abnormal_value', label: '异常值' }, { key: 'threshold_value', label: '阈值' },
        { key: 'status_text', label: '状态' }, { key: 'description', label: '说明' }, { key: 'measures', label: '处置措施' },
      ], alarmTableRows, 'alarms + alarm_events'),
      rainfallTable: tableMaterial('rainfallTable', '报告期雨量记录', [
        { key: 'section', label: '标段' }, { key: 'rain_date', label: '日期' }, { key: 'amount_mm', label: '日雨量(mm)' }, { key: 'quality_review', label: '质量复核' },
      ], rainfallTableRows, 'rainfall_daily_records'),
      layoutMaps: { key: 'layoutMaps', kind: 'image-list', title: '监测布点图', source: 'slope_ledger_maps + file_assets', items: maps.map(item => ({ ...item, caption: `${item.slope_name}监测布点图` })) },
      geoLocations: tableMaterial('geoLocations', '边坡空间位置', [
        { key: 'slope_name', label: '边坡' }, { key: 'longitude', label: '经度' }, { key: 'latitude', label: '纬度' },
        { key: 'coordinate_system', label: '坐标系' }, { key: 'source_layer_id', label: '来源图层' }, { key: 'accuracy_m', label: '精度(m)' },
      ], geoRows, 'slope_geo_locations'),
    }

    const bindingIndex = {
      '{汇报月份}': { kind: 'text', value: (startDate || endDate || '').slice(0, 7) || '-' },
      '{统计截止日期}': { kind: 'text', value: endDate || '-' },
      '{监理例会标题}': { kind: 'text', value: `${sections.join('、') || '边坡'}高边坡监测月度例会汇报材料` },
      '{监测对象概况表}': { materialKey: 'meetingOverview' },
      '{本月监测进展清单}': { materialKey: 'meetingProgressList' },
      '{本月监测进展}': { materialKey: 'meetingProgressText' },
      '{分边坡监测进展}': { materialKey: 'meetingSlopeSections' },
      '{单边坡监测分析}': { materialKey: 'meetingSlopeSections' },
      '{单边坡地表变形图}': { materialKey: 'meetingSlopeSections' },
      '{单边坡深部测斜图}': { materialKey: 'meetingSlopeSections' },
      '{月度监测结论}': { materialKey: 'meetingConclusion' },
      '{月度工作建议}': { materialKey: 'meetingSuggestions' },
      '{第3节监测结论初稿}': { materialKey: 'meetingConclusion' },
      '{第4节工作建议初稿}': { materialKey: 'meetingSuggestions' },
      '{标段}': { kind: 'text', value: sections.join('、') },
      '{边坡名称}': { kind: 'text', value: slopes.map(item => item.slope_name).join('、') },
      '{边坡监测台账表}': { materialKey: 'slopeSummary' },
      '{本期监测完成率}': { kind: 'text', value: totalPoints ? `${round(observedPoints / totalPoints * 100, 1)}%` : '-' },
      '{地表位移趋势图}': { materialKey: 'monitoringTrend' },
      '{变化速率图}': { materialKey: 'monitoringRate' },
      '{雨量位移叠加图}': { materialKey: 'rainfallOverlay' },
      '{深部测斜曲线}': { materialKey: 'deepProfile' },
      '{地表位移统计表}': { materialKey: 'surfaceSummary' },
      '{平均监测频率统计}': { materialKey: 'frequencySummary' },
      '{巡检问题汇总}': { materialKey: 'inspectionProblems' },
      '{预警处置记录}': { materialKey: 'alarmActions' },
      '{监测布点图}': { materialKey: 'layoutMaps' },
      '{边坡空间位置表}': { materialKey: 'geoLocations' },
    }

    res.json({ success: true, data: {
      scope: { ...scope, slopeIds, sections, startDate: startDate || null, endDate, resolvedAt: new Date().toISOString(), rateReferenceMmPerDay: RATE_REFERENCE },
      summary: {
        slopeCount: slopes.length, totalPointCount: totalPoints, observedPointCount: observedPoints, observationCount: monitoringRows.length,
        averageIntervalDays: averageIntervals.length ? round(averageIntervals.reduce((sum, value) => sum + value, 0) / averageIntervals.length, 1) : null,
        rateExceededPointCount: pointStats.filter(item => Number.isFinite(item.max_abs_rate) && Math.abs(item.max_abs_rate) >= RATE_REFERENCE).length,
        inspectionProblemCount: inspections.length, activeAlarmCount: alarms.length, rainfallDayCount: rainRows.length, deepSurveyCount: deepGroups.size,
        conclusionGrade,
      },
      materials,
      bindingIndex,
      provenance: { generatedAt: new Date().toISOString(), rowLimit: MAX_ROWS, rateReferenceMmPerDay: RATE_REFERENCE },
    } })
  } catch (error) {
    console.error('生成报告素材失败:', error)
    res.status(500).json({ success: false, message: '生成报告素材失败', detail: error.message })
  }
})

module.exports = router
