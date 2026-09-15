function finiteNumber(value) {
  const number = Number(value)
  return value !== null && value !== '' && Number.isFinite(number) ? number : null
}

function normalizedWindow(size, length) {
  if (length <= 1) return 1
  let window = Math.max(3, Math.min(Math.round(Number(size) || 3), length))
  if (window % 2 === 0) window = window === length ? window - 1 : window + 1
  return Math.max(1, window)
}

function roundValue(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : null
}

export function countFiniteValues(values = []) {
  return values.reduce((count, value) => count + (finiteNumber(value) === null ? 0 : 1), 0)
}

/** 居中移动平均。端点使用实际可用窗口，不虚构边界外数据。 */
export function movingAverage(values, windowSize = 3) {
  const window = normalizedWindow(windowSize, values.length)
  const radius = Math.floor(window / 2)
  return values.map((value, index) => {
    if (finiteNumber(value) === null) return null
    const local = values
      .slice(Math.max(0, index - radius), Math.min(values.length, index + radius + 1))
      .map(finiteNumber)
      .filter(Number.isFinite)
    return local.length ? roundValue(local.reduce((sum, item) => sum + item, 0) / local.length) : null
  })
}

/** 一次指数平滑。空值保持为空，后续有效值延续上一平滑状态。 */
export function exponentialSmoothing(values, alpha = 0.3) {
  const factor = Math.min(Math.max(Number(alpha) || 0.3, 0.05), 1)
  let previous = null
  return values.map(value => {
    const current = finiteNumber(value)
    if (current === null) return null
    previous = previous === null ? current : factor * current + (1 - factor) * previous
    return roundValue(previous)
  })
}

/** 居中中值滤波，适合抑制单个孤立毛刺。 */
export function medianFilter(values, windowSize = 3) {
  const window = normalizedWindow(windowSize, values.length)
  const radius = Math.floor(window / 2)
  return values.map((value, index) => {
    if (finiteNumber(value) === null) return null
    const local = values
      .slice(Math.max(0, index - radius), Math.min(values.length, index + radius + 1))
      .map(finiteNumber)
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
    if (!local.length) return null
    const middle = Math.floor(local.length / 2)
    return roundValue(local.length % 2 ? local[middle] : (local[middle - 1] + local[middle]) / 2)
  })
}

function largestTriangleThreeBuckets(points, threshold) {
  if (threshold >= points.length || threshold <= 2) return threshold <= 2 ? [points[0], points.at(-1)].filter(Boolean) : points
  const sampled = [points[0]]
  const every = (points.length - 2) / (threshold - 2)
  let anchorIndex = 0

  for (let bucket = 0; bucket < threshold - 2; bucket += 1) {
    const averageStart = Math.floor((bucket + 1) * every) + 1
    const averageEnd = Math.min(Math.floor((bucket + 2) * every) + 1, points.length)
    const averagePoints = points.slice(averageStart, averageEnd)
    const average = averagePoints.length
      ? averagePoints.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 })
      : points[Math.min(averageStart, points.length - 1)]
    const averageX = averagePoints.length ? average.x / averagePoints.length : average.x
    const averageY = averagePoints.length ? average.y / averagePoints.length : average.y

    const rangeStart = Math.floor(bucket * every) + 1
    const rangeEnd = Math.min(Math.floor((bucket + 1) * every) + 1, points.length - 1)
    const anchor = points[anchorIndex]
    let maxArea = -1
    let nextPoint = points[rangeStart]
    let nextIndex = rangeStart
    for (let index = rangeStart; index < rangeEnd; index += 1) {
      const point = points[index]
      const area = Math.abs((anchor.x - averageX) * (point.y - anchor.y) - (anchor.x - point.x) * (averageY - anchor.y))
      if (area > maxArea) { maxArea = area; nextPoint = point; nextIndex = index }
    }
    sampled.push(nextPoint)
    anchorIndex = nextIndex
  }
  sampled.push(points.at(-1))
  return sampled
}

/** LTTB 抽稀保留首尾点和曲线主要转折，结果仍与原日期数组对齐。 */
export function lttbDownsample(values, xValues = [], targetPoints = 120) {
  const points = values
    .map((value, index) => ({ index, x: Number(xValues[index]), y: finiteNumber(value) }))
    .filter(point => point.y !== null)
    .map((point, order) => ({ ...point, x: Number.isFinite(point.x) ? point.x : order }))
  const target = Math.max(3, Math.round(Number(targetPoints) || 120))
  if (points.length <= target) return values.map(finiteNumber)
  const keep = new Set(largestTriangleThreeBuckets(points, target).map(point => point.index))
  return values.map((value, index) => keep.has(index) ? finiteNumber(value) : null)
}

export function processTimeSeries(values, options = {}) {
  const method = options.method || 'raw'
  if (method === 'moving_average') return movingAverage(values, options.windowSize)
  if (method === 'exponential') return exponentialSmoothing(values, options.alpha)
  if (method === 'median') return medianFilter(values, options.windowSize)
  if (method === 'lttb') return lttbDownsample(values, options.xValues, options.targetPoints)
  return values.map(finiteNumber)
}
