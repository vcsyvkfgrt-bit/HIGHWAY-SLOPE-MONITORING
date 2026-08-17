const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const auth = require('../middleware/auth')
const multer = require('multer')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.IMPORT_MAX_SIZE || 5 * 1024 * 1024),
    files: 1,
  },
  fileFilter(_req, file, cb) {
    const allowed = ['text/csv', 'application/vnd.ms-excel', 'text/plain']
    if (!allowed.includes(file.mimetype) && !file.originalname.toLowerCase().endsWith('.csv')) {
      return cb(new Error('仅支持 CSV 文件'))
    }
    cb(null, true)
  },
})

// 与前端和监测点管理模块口径一致
const ALLOWED_POINT_TYPES = ['地表位移监测点', '沉降监测点', '深部位移测斜孔', '位移计', '测斜仪', '雨量计']
const VALUE_RANGE_BY_TYPE = {
  '地表位移监测点': [-10000000, 10000000],
  '沉降监测点': [-10000000, 10000000],
  '深部位移测斜孔': [-10000000, 10000000],
  '位移计': [-10000000, 10000000],
  '测斜仪': [-10000000, 10000000],
  '雨量计': [0, 10000000],
}

function normalizeMonitorDate(input) {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()

  // 允许：YYYY-MM-DD HH:mm / YYYY-MM-DD HH:mm:ss / YYYY-MM-DD
  const dt1 = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/
  const dt2 = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):\d{2}$/
  const d1 = /^(\d{4}-\d{2}-\d{2})$/

  let datePart
  let timePart

  if (dt1.test(trimmed)) {
    const m = trimmed.match(dt1)
    datePart = m[1]
    timePart = m[2]
    return `${datePart} ${timePart}:00`
  }

  if (dt2.test(trimmed)) {
    const m = trimmed.match(dt2)
    datePart = m[1]
    timePart = m[2]
    return `${datePart} ${timePart}:00`
  }

  if (d1.test(trimmed)) {
    const m = trimmed.match(d1)
    datePart = m[1]
    return `${datePart} 00:00:00`
  }

  return null
}

function normalizeDateRangeEnd(input) {
  const normalized = normalizeMonitorDate(input)
  if (!normalized) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(input || '').trim())) {
    return `${String(input).trim()} 23:59:59`
  }
  return normalized
}

function parseAndRoundValue(v) {
  const num = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(num)) return null
  // 保留 2 位小数（四舍五入）
  return Math.round(num * 100) / 100
}

function validateValueByPointType(pointType, value) {
  const range = VALUE_RANGE_BY_TYPE[pointType]
  if (!range) return null
  const [min, max] = range
  if (value < min || value > max) return `数值超出允许范围 ${min}~${max}（mm）`
  return null
}

// 获取某个监测点的历史数据
function csvCell(value) {
  if (value === undefined || value === null) return ''
  const text = String(value).replace(/"/g, '""')
  return `"${text}"`
}

let matrixTableReady = false

async function ensureMatrixTables(db = pool) {
  if (matrixTableReady) return
  const [pointStartColumns] = await db.query("SHOW COLUMNS FROM monitoring_points LIKE 'monitor_start_date'")
  if (!pointStartColumns.length) {
    await db.query('ALTER TABLE monitoring_points ADD COLUMN monitor_start_date DATE NULL AFTER install_date')
  }
  const [pointStopColumns] = await db.query("SHOW COLUMNS FROM monitoring_points LIKE 'monitor_stop_date'")
  if (!pointStopColumns.length) {
    await db.query('ALTER TABLE monitoring_points ADD COLUMN monitor_stop_date DATE NULL AFTER monitor_start_date')
  }
  const [pointStatusColumns] = await db.query("SHOW COLUMNS FROM monitoring_points LIKE 'monitor_status'")
  if (!pointStatusColumns.length) {
    await db.query("ALTER TABLE monitoring_points ADD COLUMN monitor_status VARCHAR(50) NULL DEFAULT '监测中' AFTER monitor_stop_date")
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS monitoring_data_revisions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      data_id INT NOT NULL,
      batch_id BIGINT,
      old_value DECIMAL(10, 2),
      new_value DECIMAL(10, 2),
      old_remark TEXT,
      new_remark TEXT,
      reason VARCHAR(500),
      updated_by INT,
      updated_by_name VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_data_id (data_id),
      INDEX idx_batch_id (batch_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS monitoring_missing_records (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      batch_id BIGINT NOT NULL,
      slope_id INT NOT NULL,
      point_id INT NOT NULL,
      monitor_type VARCHAR(50) NOT NULL,
      monitor_date DATETIME NOT NULL,
      reason VARCHAR(100),
      remark VARCHAR(500),
      created_by INT,
      created_by_name VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_batch_id (batch_id),
      INDEX idx_point_date (point_id, monitor_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  matrixTableReady = true
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  cells.push(current.trim())
  return cells
}

function parseCsv(text) {
  const normalizedText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalizedText.split('\n').filter((line) => line.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim())
  const rows = lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line)
    const row = {}
    headers.forEach((header, headerIndex) => {
      row[header] = cells[headerIndex] ?? ''
    })
    return {
      row_number: index + 2,
      raw: row,
    }
  })

  return { headers, rows }
}

function pickField(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== '') return row[name]
  }
  return ''
}

function createBatchNo() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  return `MDI-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function userName(req) {
  return req.user?.real_name || req.user?.username || null
}

function isSameDate(a, b) {
  return String(a || '').slice(0, 10) === String(b || '').slice(0, 10)
}

function dateOnly(value) {
  return String(value || '').slice(0, 10)
}

function isBeforeDate(a, b) {
  const left = dateOnly(a)
  const right = dateOnly(b)
  return left && right && left < right
}

function isAfterDate(a, b) {
  const left = dateOnly(a)
  const right = dateOnly(b)
  return left && right && left > right
}

function anomalyMessages({ value, previousValue, baselineValue }) {
  const messages = []
  if (previousValue !== null && previousValue !== undefined && Math.abs(value - previousValue) >= 10) {
    messages.push(`单次变化量 ${Math.abs(value - previousValue).toFixed(2)}mm 较大`)
  }
  if (baselineValue !== null && baselineValue !== undefined && Math.abs(value - baselineValue) >= 20) {
    messages.push(`累计变化量 ${Math.abs(value - baselineValue).toFixed(2)}mm 达到20mm预警参考值`)
  }
  return messages
}

async function buildMatrixPreview({ slopeId, pointType, rows, pointId = null, compact = false, damagedPointIds = [] }) {
  await ensureMatrixTables()
  if (!slopeId) return { error: '缺少边坡' }
  if (!pointType) return { error: '缺少监测类型' }
  if (!['地表位移监测点', '沉降监测点'].includes(pointType)) return { error: '该接口仅用于地表位移/沉降数据录入' }
  if (!Array.isArray(rows) || rows.length === 0) return { error: '没有可预览的数据' }

  const pointParams = [slopeId, pointType]
  let pointFilter = ''
  if (pointId) {
    pointFilter = ' AND id = ?'
    pointParams.push(pointId)
  }
  const [points] = await pool.query(
    `SELECT id, point_name, point_type, archived,
        DATE_FORMAT(install_date, '%Y-%m-%d') AS install_date,
        DATE_FORMAT(monitor_start_date, '%Y-%m-%d') AS monitor_start_date,
        DATE_FORMAT(monitor_stop_date, '%Y-%m-%d') AS monitor_stop_date,
        monitor_status
     FROM monitoring_points
     WHERE slope_id = ? AND point_type = ? AND archived = 0 ${pointFilter}
     ORDER BY point_name ASC`,
    pointParams
  )
  if (!points.length) return { error: pointId ? '当前测点不属于所选边坡或监测类型' : '当前边坡该类型下暂无测点' }

  const pointMap = new Map(points.map((point) => [Number(point.id), point]))
  const pointIds = points.map((point) => Number(point.id))
  const damagedPointSet = new Set(
    (Array.isArray(damagedPointIds) ? damagedPointIds : [])
      .map((id) => Number(id))
      .filter((id) => pointIds.includes(id))
  )
  const normalizedRows = []
  const issues = []
  const missing = []
  const notStarted = []
  const stopped = []
  const damaged = []
  const firstValueDateByPoint = new Map()
  const fileKeys = new Set()
  const dates = new Set()

  rows.forEach((row, rowIndex) => {
    const monitorDate = normalizeMonitorDate(String(row.monitor_date || '').slice(0, 10))
    if (!monitorDate) {
      issues.push({ level: 'error', type: 'format', row: rowIndex + 1, message: '监测日期格式不正确' })
      return
    }
    dates.add(monitorDate)

    pointIds.forEach((pointId) => {
      const raw = row.values?.[pointId] ?? row.values?.[String(pointId)]
      const point = pointMap.get(pointId)
      if (raw === null || raw === undefined || raw === '') {
        if (damagedPointSet.has(pointId) || point?.monitor_status === '已破坏') {
          damaged.push({
            row: rowIndex + 1,
            point_id: pointId,
            point_name: point?.point_name,
            monitor_date: monitorDate,
            monitor_stop_date: dateOnly(monitorDate),
            message: '测点已标记为破坏，本期不计为缺测',
          })
          return
        }
        if (!point?.monitor_start_date) {
          missing.push({
            row: rowIndex + 1,
            point_id: pointId,
            point_name: point?.point_name,
            monitor_date: monitorDate,
            reason: row.missing_reasons?.[pointId] || row.missing_reasons?.[String(pointId)] || '',
            pending_start_inference: true,
          })
          return
        }
        if (point?.monitor_start_date && isBeforeDate(monitorDate, point.monitor_start_date)) {
          notStarted.push({
            row: rowIndex + 1,
            point_id: pointId,
            point_name: point?.point_name,
            monitor_date: monitorDate,
            monitor_start_date: point.monitor_start_date,
            message: '观测日期早于启测日期，不计为缺测',
          })
          return
        }
        if (point?.monitor_stop_date && isAfterDate(monitorDate, point.monitor_stop_date)) {
          stopped.push({
            row: rowIndex + 1,
            point_id: pointId,
            point_name: point?.point_name,
            monitor_date: monitorDate,
            monitor_stop_date: point.monitor_stop_date,
            message: '观测日期晚于停测日期，不计为缺测',
          })
          return
        }
        missing.push({
          row: rowIndex + 1,
          point_id: pointId,
          point_name: point?.point_name,
          monitor_date: monitorDate,
          reason: row.missing_reasons?.[pointId] || row.missing_reasons?.[String(pointId)] || '',
        })
        return
      }

      const value = parseAndRoundValue(raw)
      if (value === null) {
        issues.push({ level: 'error', type: 'format', row: rowIndex + 1, point_id: pointId, point_name: point?.point_name, monitor_date: monitorDate, message: '监测值必须是数字' })
        return
      }
      const rangeErr = validateValueByPointType(pointType, value)
      if (rangeErr) {
        issues.push({ level: 'error', type: 'range', row: rowIndex + 1, point_id: pointId, point_name: point?.point_name, monitor_date: monitorDate, message: rangeErr })
        return
      }
      if (damagedPointSet.has(pointId) || point?.monitor_status === '已破坏') {
        issues.push({
          level: 'warning',
          type: 'damaged_with_value',
          row: rowIndex + 1,
          point_id: pointId,
          point_name: point?.point_name,
          monitor_date: monitorDate,
          value,
          message: '测点已标记为破坏，但本期填写了有效值；保存后仍会保留该值',
        })
      }
      const key = `${pointId}|${monitorDate}`
      if (fileKeys.has(key)) {
        issues.push({ level: 'error', type: 'duplicate_in_input', row: rowIndex + 1, point_id: pointId, point_name: point?.point_name, monitor_date: monitorDate, message: '本次录入中存在重复测点日期' })
        return
      }
      fileKeys.add(key)
      const existingFirst = firstValueDateByPoint.get(pointId)
      if (!existingFirst || monitorDate < existingFirst) firstValueDateByPoint.set(pointId, monitorDate)
      normalizedRows.push({
        row: rowIndex + 1,
        point_id: pointId,
        point_name: point?.point_name,
        monitor_type: pointType,
        monitor_date: monitorDate,
        value,
        unit: 'mm',
        remark: row.remark || null,
      })
    })
  })

  const existingMap = new Map()
  const historyMap = new Map()
  if (normalizedRows.length) {
    const [history] = await pool.query(
      `SELECT point_id, DATE_FORMAT(monitor_date, '%Y-%m-%d %H:%i:%s') AS monitor_date, value, remark, id
       FROM monitoring_data
       WHERE point_id IN (?)
       ORDER BY monitor_date ASC`,
      [pointIds]
    )
    history.forEach((item) => {
      const key = `${Number(item.point_id)}|${item.monitor_date}`
      existingMap.set(key, item)
      const list = historyMap.get(Number(item.point_id)) || []
      list.push(item)
      historyMap.set(Number(item.point_id), list)
    })
  }

  normalizedRows.forEach((row) => {
    const existing = existingMap.get(`${row.point_id}|${row.monitor_date}`)
    if (existing) {
      issues.push({
        level: 'warning',
        type: 'duplicate_existing',
        row: row.row,
        point_id: row.point_id,
        point_name: row.point_name,
        monitor_date: row.monitor_date,
        old_value: Number(existing.value),
        new_value: row.value,
        message: '数据库中已存在该测点同日期数据',
      })
    }

    const history = historyMap.get(row.point_id) || []
    const before = history.filter((item) => String(item.monitor_date) < row.monitor_date)
    const previous = before[before.length - 1]
    const baseline = history[0]
    anomalyMessages({
      value: row.value,
      previousValue: previous ? Number(previous.value) : null,
      baselineValue: baseline ? Number(baseline.value) : null,
    }).forEach((message) => {
      issues.push({
        level: 'warning',
        type: 'anomaly',
        row: row.row,
        point_id: row.point_id,
        point_name: row.point_name,
        monitor_date: row.monitor_date,
        value: row.value,
        message,
      })
    })
  })

  const inferredNotStarted = []
  const realMissing = []
  missing.forEach((item) => {
    const point = pointMap.get(Number(item.point_id))
    const inferredStartDate = firstValueDateByPoint.get(Number(item.point_id))
    if (!point?.monitor_start_date && !inferredStartDate) {
      inferredNotStarted.push({
        ...item,
        monitor_start_date: null,
        message: '测点尚未设置启测日期，且本次无有效数据，按未启测处理',
      })
      return
    }
    if (!point?.monitor_start_date && inferredStartDate && isBeforeDate(item.monitor_date, inferredStartDate)) {
      inferredNotStarted.push({
        ...item,
        monitor_start_date: inferredStartDate,
        message: '早于本次导入首次有效数据，建议按未启测处理',
      })
      return
    }
    realMissing.push(item)
  })
  notStarted.push(...inferredNotStarted)

  // 首次校核只传输测点级摘要。明细在用户展开某一测点时再单独生成，避免大批量导入时
  // 将所有日期 × 测点的单元格同时传给浏览器并渲染。
  const pointStats = new Map(points.map((point) => [Number(point.id), {
    point_id: Number(point.id),
    point_name: point.point_name,
    monitor_start_date: point.monitor_start_date || null,
    data_rows: 0,
    data_dates: new Set(),
    first_data_date: null,
    latest_data_date: null,
    missing_rows: 0,
    not_started_rows: 0,
    stopped_rows: 0,
    error_rows: 0,
    warning_rows: 0,
    duplicate_rows: 0,
    anomaly_rows: 0,
  }]))
  normalizedRows.forEach((row) => {
    const stat = pointStats.get(Number(row.point_id))
    if (!stat) return
    stat.data_rows += 1
    stat.data_dates.add(row.monitor_date)
    if (!stat.first_data_date || row.monitor_date < stat.first_data_date) stat.first_data_date = row.monitor_date
    if (!stat.latest_data_date || row.monitor_date > stat.latest_data_date) stat.latest_data_date = row.monitor_date
  })
  realMissing.forEach((item) => {
    const stat = pointStats.get(Number(item.point_id))
    if (stat) stat.missing_rows += 1
  })
  notStarted.forEach((item) => {
    const stat = pointStats.get(Number(item.point_id))
    if (stat) stat.not_started_rows += 1
  })
  stopped.forEach((item) => {
    const stat = pointStats.get(Number(item.point_id))
    if (stat) stat.stopped_rows += 1
  })
  damaged.forEach((item) => {
    const stat = pointStats.get(Number(item.point_id))
    if (stat) {
      stat.damaged_rows = (stat.damaged_rows || 0) + 1
      stat.stopped_rows += 1
    }
  })
  issues.forEach((item) => {
    const stat = pointStats.get(Number(item.point_id))
    if (!stat) return
    if (item.level === 'error') stat.error_rows += 1
    else stat.warning_rows += 1
    if (item.type === 'duplicate_existing') stat.duplicate_rows += 1
    if (item.type === 'anomaly') stat.anomaly_rows += 1
  })
  const point_summaries = Array.from(pointStats.values()).map((stat) => {
    const suggestedStartDate = firstValueDateByPoint.get(stat.point_id) || null
    const status = stat.error_rows > 0
      ? 'error'
      : stat.warning_rows > 0 || stat.missing_rows > 0
        ? 'warning'
        : stat.data_rows > 0
          ? 'passed'
          : 'not_started'
    return {
      ...stat,
      data_dates: stat.data_dates.size,
      suggested_start_date: !stat.monitor_start_date ? suggestedStartDate : null,
      status,
    }
  })

  let point_detail = null
  if (pointId) {
    const itemByDate = new Map()
    const detailMessageMap = new Map()
    const addDetailMessage = (item, status) => {
      const key = item?.monitor_date
      if (!key) return
      const entry = detailMessageMap.get(key) || { status: 'valid', messages: [] }
      const priority = { valid: 0, not_started: 1, stopped: 1, missing: 2, warning: 3, error: 4 }
      if ((priority[status] || 0) > (priority[entry.status] || 0)) entry.status = status
      if (item.message) entry.messages.push(item.message)
      detailMessageMap.set(key, entry)
    }
    normalizedRows.forEach((row) => itemByDate.set(row.monitor_date, row))
    realMissing.forEach((item) => addDetailMessage(item, 'missing'))
    notStarted.forEach((item) => addDetailMessage(item, 'not_started'))
    stopped.forEach((item) => addDetailMessage(item, 'stopped'))
    damaged.forEach((item) => addDetailMessage(item, 'damaged'))
    issues.forEach((item) => addDetailMessage(item, item.level === 'error' ? 'error' : 'warning'))
    point_detail = Array.from(dates).sort().map((monitorDate) => {
      const dataRow = itemByDate.get(monitorDate)
      const detail = detailMessageMap.get(monitorDate)
      return {
        monitor_date: monitorDate,
        value: dataRow?.value ?? null,
        status: detail?.status || (dataRow ? 'valid' : 'not_started'),
        messages: detail?.messages || [],
      }
    })
  }

  return {
    rows: compact ? [] : normalizedRows,
    missing: compact ? [] : realMissing,
    not_started: compact ? [] : notStarted,
    stopped: compact ? [] : stopped,
    damaged: compact ? [] : damaged,
    suggested_start_dates: Array.from(firstValueDateByPoint.entries()).map(([pointId, startDate]) => ({
      point_id: pointId,
      point_name: pointMap.get(pointId)?.point_name,
      monitor_start_date: startDate,
      current_start_date: pointMap.get(pointId)?.monitor_start_date || null,
    })),
    issues: compact ? [] : issues,
    point_summaries,
    point_detail,
    summary: {
      input_rows: rows.length,
      date_count: dates.size,
      data_rows: normalizedRows.length,
      missing_rows: realMissing.length,
      not_started_rows: notStarted.length,
      stopped_rows: stopped.length + damaged.length,
      damaged_rows: damaged.length,
      error_rows: issues.filter((item) => item.level === 'error').length,
      warning_rows: issues.filter((item) => item.level !== 'error').length,
      duplicate_rows: issues.filter((item) => item.type === 'duplicate_existing').length,
      anomaly_rows: issues.filter((item) => item.type === 'anomaly').length,
    },
  }
}

const VIEW_POINT_TYPES = ['地表位移监测点', '沉降监测点', '深部位移测斜孔']
const SHARED_SURFACE_TYPES = new Set(['地表位移监测点', '沉降监测点', 'surface'])

function viewDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function daysBefore(dateText, days) {
  const date = new Date(`${dateText}T00:00:00`)
  date.setDate(date.getDate() - days)
  return viewDate(date)
}

function physicalViewPointKey(point) {
  if (!SHARED_SURFACE_TYPES.has(point.point_type)) return `point:${point.id}`
  const location = String(point.location || '').trim().toLowerCase()
  if (location) return `surface-settlement:${point.slope_id}:${location}`
  const suffix = String(point.point_name || '').match(/(\d+)$/)?.[1]
  return suffix ? `surface-settlement:${point.slope_id}:index-${Number(suffix)}` : `point:${point.id}`
}

function alarmPriority(level) {
  return ({ info: 1, warning: 2, serious: 3, critical: 4 })[level] || 0
}

async function loadLatestViewMeasurements(points, cutoff) {
  const result = new Map()
  const regularIds = points
    .filter((point) => point.point_type !== '深部位移测斜孔' && point.point_type !== 'deep')
    .map((point) => Number(point.id))
  const deepIds = points
    .filter((point) => point.point_type === '深部位移测斜孔' || point.point_type === 'deep')
    .map((point) => Number(point.id))

  if (regularIds.length > 0) {
    const [rows] = await pool.query(
      `WITH daily_latest AS (
         SELECT m.point_id, DATE(m.monitor_date) AS monitor_day, m.value, m.unit,
                ROW_NUMBER() OVER (
                  PARTITION BY m.point_id, DATE(m.monitor_date)
                  ORDER BY m.monitor_date DESC, m.id DESC
                ) AS daily_rank
         FROM monitoring_data m
         WHERE m.point_id IN (?) AND m.monitor_date < DATE_ADD(?, INTERVAL 1 DAY)
       ), ranked AS (
         SELECT point_id, monitor_day, value, unit,
                ROW_NUMBER() OVER (PARTITION BY point_id ORDER BY monitor_day DESC) AS period_rank
         FROM daily_latest
         WHERE daily_rank = 1
       )
       SELECT point_id,
              DATE_FORMAT(MAX(CASE WHEN period_rank = 1 THEN monitor_day END), '%Y-%m-%d') AS latest_date,
              MAX(CASE WHEN period_rank = 1 THEN value END) AS latest_value,
              MAX(CASE WHEN period_rank = 1 THEN unit END) AS unit,
              DATE_FORMAT(MAX(CASE WHEN period_rank = 2 THEN monitor_day END), '%Y-%m-%d') AS previous_date,
              MAX(CASE WHEN period_rank = 2 THEN value END) AS previous_value
       FROM ranked
       WHERE period_rank <= 2
       GROUP BY point_id`,
      [regularIds, cutoff]
    )
    rows.forEach((row) => result.set(Number(row.point_id), row))
  }

  if (deepIds.length > 0) {
    const [rows] = await pool.query(
      `WITH ranked AS (
         SELECT s.point_id, s.survey_date, s.max_cumulative, s.max_relative,
                ROW_NUMBER() OVER (
                  PARTITION BY s.point_id ORDER BY s.survey_date DESC, s.id DESC
                ) AS period_rank
         FROM inclinometer_surveys s
         WHERE s.point_id IN (?) AND s.survey_date <= ?
       )
       SELECT point_id,
              DATE_FORMAT(MAX(CASE WHEN period_rank = 1 THEN survey_date END), '%Y-%m-%d') AS latest_date,
              MAX(CASE WHEN period_rank = 1 THEN max_cumulative END) AS latest_value,
              MAX(CASE WHEN period_rank = 1 THEN max_relative END) AS latest_relative,
              DATE_FORMAT(MAX(CASE WHEN period_rank = 2 THEN survey_date END), '%Y-%m-%d') AS previous_date,
              MAX(CASE WHEN period_rank = 2 THEN max_cumulative END) AS previous_value
       FROM ranked
       WHERE period_rank <= 2
       GROUP BY point_id`,
      [deepIds, cutoff]
    )
    rows.forEach((row) => result.set(Number(row.point_id), { ...row, unit: 'mm' }))
  }

  return result
}

async function loadViewAlarmMap(pointIds) {
  const map = new Map()
  if (pointIds.length === 0) return map
  const [rows] = await pool.query(
    `SELECT point_id, alarm_level
     FROM alarms
     WHERE point_id IN (?) AND status <> 'closed'`,
    [pointIds]
  )
  rows.forEach((row) => {
    const current = map.get(Number(row.point_id)) || { count: 0, level: '' }
    current.count += 1
    if (alarmPriority(row.alarm_level) > alarmPriority(current.level)) current.level = row.alarm_level
    map.set(Number(row.point_id), current)
  })
  return map
}

function buildViewPointSummary(point, measurementMap, alarmMap, cutoff) {
  const measurement = measurementMap.get(Number(point.id)) || {}
  const latestValue = measurement.latest_value === null || measurement.latest_value === undefined
    ? null
    : Number(measurement.latest_value)
  const previousValue = measurement.previous_value === null || measurement.previous_value === undefined
    ? null
    : Number(measurement.previous_value)
  const hasChange = latestValue !== null && previousValue !== null
  const changeValue = hasChange ? latestValue - previousValue : null
  const alarm = alarmMap.get(Number(point.id)) || { count: 0, level: '' }
  return {
    id: Number(point.id),
    slope_id: Number(point.slope_id),
    slope_name: point.slope_name,
    section: point.section || '',
    point_name: point.point_name,
    point_type: point.point_type,
    location: point.location || '',
    latest_date: measurement.latest_date || null,
    latest_value: latestValue,
    latest_relative: measurement.latest_relative === null || measurement.latest_relative === undefined
      ? null
      : Number(measurement.latest_relative),
    previous_date: measurement.previous_date || null,
    previous_value: previousValue,
    change_value: changeValue,
    abs_change: hasChange ? Math.abs(changeValue) : null,
    has_change: hasChange,
    unit: measurement.unit || 'mm',
    missing: !measurement.latest_date || measurement.latest_date < daysBefore(cutoff, 30),
    alarm_count: alarm.count,
    alarm_level: alarm.level,
  }
}

router.get('/overview', async (req, res) => {
  try {
    const cutoff = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.cutoff || ''))
      ? String(req.query.cutoff)
      : viewDate()
    const slopeId = Number(req.query.slope_id) || null
    const section = String(req.query.section || '').trim()
    const pointType = String(req.query.point_type || '').trim()

    let pointSql = `
      SELECT p.id, p.slope_id, p.point_name, p.point_type, p.location,
             s.slope_name, s.section, s.slope_type
      FROM monitoring_points p
      JOIN slopes s ON s.id = p.slope_id
      WHERE p.archived = 0 AND p.point_type IN (?)
    `
    const params = [VIEW_POINT_TYPES]
    if (slopeId) {
      pointSql += ' AND p.slope_id = ?'
      params.push(slopeId)
    }
    if (section) {
      pointSql += ' AND s.section = ?'
      params.push(section)
    }
    if (pointType) {
      pointSql += ' AND p.point_type = ?'
      params.push(pointType)
    }
    pointSql += ' ORDER BY s.section ASC, s.slope_name ASC, p.point_type ASC, p.point_name ASC'

    const [points] = await pool.query(pointSql, params)
    const measurementMap = await loadLatestViewMeasurements(points, cutoff)
    const alarmMap = await loadViewAlarmMap(points.map((point) => Number(point.id)))
    const pointSummaries = points.map((point) => buildViewPointSummary(point, measurementMap, alarmMap, cutoff))

    const slopeMap = new Map()
    pointSummaries.forEach((point) => {
      if (!slopeMap.has(point.slope_id)) {
        slopeMap.set(point.slope_id, {
          slope_id: point.slope_id,
          slope_name: point.slope_name,
          section: point.section,
          point_keys: new Set(),
          missing_keys: new Set(),
          alarm_keys: new Set(),
          latest_monitor_date: null,
          max_change: null,
          max_change_point_name: '',
          max_change_type: '',
          alarm_level: '',
        })
      }
      const slope = slopeMap.get(point.slope_id)
      const physicalKey = physicalViewPointKey(point)
      slope.point_keys.add(physicalKey)
      if (point.missing) slope.missing_keys.add(physicalKey)
      if (point.alarm_count > 0) slope.alarm_keys.add(physicalKey)
      if (!slope.latest_monitor_date || (point.latest_date && point.latest_date > slope.latest_monitor_date)) {
        slope.latest_monitor_date = point.latest_date
      }
      if (point.has_change && (slope.max_change === null || point.abs_change > Math.abs(slope.max_change))) {
        slope.max_change = point.change_value
        slope.max_change_point_name = point.point_name
        slope.max_change_type = point.point_type
      }
      if (alarmPriority(point.alarm_level) > alarmPriority(slope.alarm_level)) slope.alarm_level = point.alarm_level
    })

    const slopes = [...slopeMap.values()].map((slope) => ({
      slope_id: slope.slope_id,
      slope_name: slope.slope_name,
      section: slope.section,
      total_points: slope.point_keys.size,
      missing_points: slope.missing_keys.size,
      abnormal_points: slope.alarm_keys.size,
      latest_monitor_date: slope.latest_monitor_date,
      max_change: slope.max_change,
      max_change_point_name: slope.max_change_point_name,
      max_change_type: slope.max_change_type,
      alarm_level: slope.alarm_level,
    })).sort((a, b) => {
      const changeDiff = Math.abs(Number(b.max_change) || 0) - Math.abs(Number(a.max_change) || 0)
      return changeDiff || String(a.slope_name).localeCompare(String(b.slope_name), 'zh-CN', { numeric: true })
    })

    const rankings = {}
    VIEW_POINT_TYPES.forEach((type) => {
      rankings[type] = pointSummaries
        .filter((point) => point.point_type === type && point.has_change)
        .sort((a, b) => b.abs_change - a.abs_change)
        .slice(0, 3)
    })

    const allPhysicalKeys = new Set(pointSummaries.map(physicalViewPointKey))
    const missingPhysicalKeys = new Set(pointSummaries.filter((point) => point.missing).map(physicalViewPointKey))
    const alarmPhysicalKeys = new Set(pointSummaries.filter((point) => point.alarm_count > 0).map(physicalViewPointKey))
    res.json({
      success: true,
      data: {
        cutoff,
        summary: {
          slope_count: slopes.length,
          point_count: allPhysicalKeys.size,
          missing_count: missingPhysicalKeys.size,
          alarm_count: alarmPhysicalKeys.size,
        },
        rankings,
        slopes,
      },
    })
  } catch (error) {
    console.error('获取数据查看概况失败:', error)
    res.status(500).json({ success: false, message: '获取数据查看概况失败' })
  }
})

router.get('/overview/slopes/:slopeId/points', async (req, res) => {
  try {
    const slopeId = Number(req.params.slopeId)
    const cutoff = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.cutoff || '')) ? String(req.query.cutoff) : viewDate()
    const pointType = String(req.query.point_type || '').trim()
    let sql = `
      SELECT p.id, p.slope_id, p.point_name, p.point_type, p.location,
             s.slope_name, s.section
      FROM monitoring_points p
      JOIN slopes s ON s.id = p.slope_id
      WHERE p.archived = 0 AND p.slope_id = ? AND p.point_type IN (?)
    `
    const params = [slopeId, VIEW_POINT_TYPES]
    if (pointType) {
      sql += ' AND p.point_type = ?'
      params.push(pointType)
    }
    sql += ' ORDER BY p.point_type ASC, p.point_name ASC'
    const [points] = await pool.query(sql, params)
    const measurementMap = await loadLatestViewMeasurements(points, cutoff)
    const alarmMap = await loadViewAlarmMap(points.map((point) => Number(point.id)))
    const rows = points
      .map((point) => buildViewPointSummary(point, measurementMap, alarmMap, cutoff))
      .filter((point) => point.has_change)
      .sort((a, b) => b.abs_change - a.abs_change)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取边坡测点摘要失败:', error)
    res.status(500).json({ success: false, message: '获取边坡测点摘要失败' })
  }
})

router.get('/overview/points/:pointId', async (req, res) => {
  try {
    const pointId = Number(req.params.pointId)
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(10, Math.max(5, Number(req.query.page_size) || 10))
    const cutoff = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.cutoff || '')) ? String(req.query.cutoff) : viewDate()
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? String(req.query.from) : daysBefore(cutoff, 30)
    const [[point]] = await pool.query(
      `SELECT p.id, p.slope_id, p.point_name, p.point_type, p.location, s.slope_name
       FROM monitoring_points p
       JOIN slopes s ON s.id = p.slope_id
       WHERE p.id = ? AND p.archived = 0`,
      [pointId]
    )
    if (!point) return res.status(404).json({ success: false, message: '测点不存在' })

    if (point.point_type === '深部位移测斜孔' || point.point_type === 'deep') {
      const [surveys] = await pool.query(
        `SELECT id, survey_no, DATE_FORMAT(survey_date, '%Y-%m-%d') AS monitor_date,
                max_cumulative AS value, max_relative, source_file, created_at
         FROM inclinometer_surveys
         WHERE point_id = ? AND survey_date <= ?
         ORDER BY survey_date DESC, id DESC`,
        [pointId, cutoff]
      )
      const trend = [...surveys].reverse().map((row) => ({
        date: row.monitor_date,
        value: Number(row.value) || 0,
        relative: Number(row.max_relative) || 0,
      }))
      const start = (page - 1) * pageSize
      return res.json({
        success: true,
        data: {
          point,
          kind: 'deep',
          trend,
          records: surveys.slice(start, start + pageSize),
          total: surveys.length,
          page,
          page_size: pageSize,
        },
      })
    }

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM monitoring_data
       WHERE point_id = ? AND monitor_date >= ? AND monitor_date < DATE_ADD(?, INTERVAL 1 DAY)`,
      [pointId, from, cutoff]
    )
    const [records] = await pool.query(
      `SELECT id, DATE_FORMAT(monitor_date, '%Y-%m-%d %H:%i:%s') AS monitor_date,
              value, unit, remark
       FROM monitoring_data
       WHERE point_id = ? AND monitor_date >= ? AND monitor_date < DATE_ADD(?, INTERVAL 1 DAY)
       ORDER BY monitor_date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [pointId, from, cutoff, pageSize, (page - 1) * pageSize]
    )
    const [trend] = await pool.query(
      `WITH daily_latest AS (
         SELECT DATE(monitor_date) AS monitor_day, value,
                ROW_NUMBER() OVER (
                  PARTITION BY DATE(monitor_date) ORDER BY monitor_date DESC, id DESC
                ) AS daily_rank
         FROM monitoring_data
         WHERE point_id = ? AND monitor_date >= ? AND monitor_date < DATE_ADD(?, INTERVAL 1 DAY)
       )
       SELECT DATE_FORMAT(monitor_day, '%Y-%m-%d') AS date, value
       FROM daily_latest
       WHERE daily_rank = 1
       ORDER BY monitor_day ASC`,
      [pointId, from, cutoff]
    )
    res.json({
      success: true,
      data: {
        point,
        kind: 'surface',
        trend: trend.map((row) => ({ date: row.date, value: Number(row.value) || 0 })),
        records,
        total: Number(countRow.total) || 0,
        page,
        page_size: pageSize,
      },
    })
  } catch (error) {
    console.error('获取测点查看明细失败:', error)
    res.status(500).json({ success: false, message: '获取测点查看明细失败' })
  }
})

router.get('/overview/trends', async (req, res) => {
  try {
    const allHistory = String(req.query.all_history || '') === 'true'
    const cutoff = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || '')) ? String(req.query.to) : viewDate()
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || ''))
      ? String(req.query.from)
      : (allHistory ? '' : daysBefore(cutoff, 30))
    const slopeId = Number(req.query.slope_id) || null
    const pointType = String(req.query.point_type || '').trim()

    if (pointType === '深部位移测斜孔' || pointType === 'deep') {
      let deepSql = `
        SELECT s.id, p.slope_id, sl.slope_name, s.point_id, p.point_name,
               p.point_type AS monitor_type,
               DATE_FORMAT(s.survey_date, '%Y-%m-%d') AS monitor_date,
               s.max_cumulative AS value, 'mm' AS unit,
               s.max_relative
        FROM inclinometer_surveys s
        JOIN monitoring_points p ON p.id = s.point_id
        JOIN slopes sl ON sl.id = p.slope_id
        WHERE p.archived = 0
      `
      const deepParams = []
      if (from) {
        deepSql += ' AND s.survey_date >= ?'
        deepParams.push(from)
      }
      if (!allHistory || req.query.to) {
        deepSql += ' AND s.survey_date <= ?'
        deepParams.push(cutoff)
      }
      if (slopeId) {
        deepSql += ' AND p.slope_id = ?'
        deepParams.push(slopeId)
      }
      deepSql += ' ORDER BY s.survey_date ASC, p.point_name ASC'
      const [deepRows] = await pool.query(deepSql, deepParams)
      return res.json({ success: true, data: deepRows })
    }

    let sql = `
      WITH daily_latest AS (
        SELECT m.id, p.slope_id, s.slope_name, m.point_id, p.point_name,
               p.point_type AS monitor_type, DATE(m.monitor_date) AS monitor_day,
               m.value, m.unit,
               ROW_NUMBER() OVER (
                 PARTITION BY m.point_id, DATE(m.monitor_date)
                 ORDER BY m.monitor_date DESC, m.id DESC
               ) AS daily_rank
        FROM monitoring_data m
        JOIN monitoring_points p ON p.id = m.point_id
        JOIN slopes s ON s.id = p.slope_id
        WHERE p.archived = 0
    `
    const params = []
    if (from) {
      sql += ' AND m.monitor_date >= ?'
      params.push(from)
    }
    if (!allHistory || req.query.to) {
      sql += ' AND m.monitor_date < DATE_ADD(?, INTERVAL 1 DAY)'
      params.push(cutoff)
    }
    if (slopeId) {
      sql += ' AND p.slope_id = ?'
      params.push(slopeId)
    }
    if (pointType) {
      sql += ' AND p.point_type = ?'
      params.push(pointType)
    }
    sql += `
      )
      SELECT id, slope_id, slope_name, point_id, point_name, monitor_type,
             DATE_FORMAT(monitor_day, '%Y-%m-%d') AS monitor_date, value, unit
      FROM daily_latest
      WHERE daily_rank = 1
      ORDER BY monitor_day ASC, point_name ASC
    `
    const [rows] = await pool.query(sql, params)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取精简趋势数据失败:', error)
    res.status(500).json({ success: false, message: '获取精简趋势数据失败' })
  }
})

router.get('/', async (req, res) => {
  try {
    const { point_id, slope_id, point_type, from, to, limit = '50' } = req.query

    const lim = Math.min(Number(limit) || 5000, 20000)
    const fromNorm = from ? normalizeMonitorDate(from) : null
    const toNorm = to ? normalizeDateRangeEnd(to) : null

    let sql = `
      SELECT
        m.id,
        p.slope_id,
        s.slope_name,
        m.point_id,
        p.point_name,
        m.monitor_type,
        DATE_FORMAT(m.monitor_date, '%Y-%m-%d %H:%i:%s') AS monitor_date,
        m.value,
        m.unit,
        m.remark
      FROM monitoring_data m
      LEFT JOIN monitoring_points p ON m.point_id = p.id
      LEFT JOIN slopes s ON p.slope_id = s.id
    `

    const params = []
    const where = []

    if (point_id) {
      where.push('m.point_id = ?')
      params.push(point_id)
    }
    if (slope_id) {
      where.push('p.slope_id = ?')
      params.push(slope_id)
    }
    if (point_type) {
      where.push('p.point_type = ?')
      params.push(point_type)
    }
    if (fromNorm) {
      where.push('m.monitor_date >= ?')
      params.push(fromNorm)
    }
    if (toNorm) {
      where.push('m.monitor_date <= ?')
      params.push(toNorm)
    }

    if (where.length > 0) {
      sql += ' WHERE ' + where.join(' AND ')
    }

    sql += ' ORDER BY m.monitor_date DESC LIMIT ?'
    params.push(lim)

    const [rows] = await pool.query(sql, params)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取监测数据失败:', error)
    res.status(500).json({ success: false, message: '获取监测数据失败' })
  }
})

// 单条录入
router.get('/export/csv', auth, async (req, res) => {
  try {
    const { point_id, slope_id, point_type, from, to, limit = '5000' } = req.query

    const lim = Math.min(Number(limit) || 5000, 20000)
    const fromNorm = from ? normalizeMonitorDate(from) : null
    const toNorm = to ? normalizeDateRangeEnd(to) : null

    let sql = `
      SELECT
        s.slope_name,
        p.point_name,
        m.monitor_type,
        DATE_FORMAT(m.monitor_date, '%Y-%m-%d %H:%i:%s') AS monitor_date,
        m.value,
        m.unit,
        m.remark
      FROM monitoring_data m
      LEFT JOIN monitoring_points p ON m.point_id = p.id
      LEFT JOIN slopes s ON p.slope_id = s.id
    `

    const params = []
    const where = []

    if (point_id) {
      where.push('m.point_id = ?')
      params.push(point_id)
    }
    if (slope_id) {
      where.push('p.slope_id = ?')
      params.push(slope_id)
    }
    if (point_type) {
      where.push('p.point_type = ?')
      params.push(point_type)
    }
    if (fromNorm) {
      where.push('m.monitor_date >= ?')
      params.push(fromNorm)
    }
    if (toNorm) {
      where.push('m.monitor_date <= ?')
      params.push(toNorm)
    }

    if (where.length > 0) {
      sql += ' WHERE ' + where.join(' AND ')
    }

    sql += ' ORDER BY m.monitor_date DESC LIMIT ?'
    params.push(lim)

    const [rows] = await pool.query(sql, params)
    const header = ['边坡名称', '测点名称', '监测类型', '监测时间', '监测值', '单位', '备注']
    const lines = [
      header.map(csvCell).join(','),
      ...rows.map((row) => [
        row.slope_name,
        row.point_name,
        row.monitor_type,
        row.monitor_date,
        row.value,
        row.unit,
        row.remark,
      ].map(csvCell).join(',')),
    ]

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="monitoring-data.csv"')
    res.send(`\uFEFF${lines.join('\n')}`)
  } catch (error) {
    console.error('导出监测数据失败:', error)
    res.status(500).json({ success: false, message: '导出监测数据失败' })
  }
})

router.post('/import/preview', auth, upload.single('file'), async (req, res) => {
  const conn = await pool.getConnection()

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传 CSV 文件' })
    }

    const text = req.file.buffer.toString('utf8')
    const { rows } = parseCsv(text)

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'CSV 文件没有可导入的数据行' })
    }
    if (rows.length > 5000) {
      return res.status(400).json({ success: false, message: '单次预校验最多支持 5000 行' })
    }

    const pointIds = [...new Set(rows.map(({ raw }) => Number(pickField(raw, ['point_id', '测点ID', '测点编号ID']))).filter(Boolean))]
    const pointMap = new Map()

    if (pointIds.length > 0) {
      const [points] = await conn.query(
        'SELECT id, point_name, point_type, archived FROM monitoring_points WHERE id IN (?)',
        [pointIds]
      )
      points.forEach((point) => pointMap.set(Number(point.id), point))
    }

    const existingKeys = new Set()
    const normalizedRows = []
    const errors = []
    const fileKeys = new Set()

    for (const { row_number, raw } of rows) {
      const pointId = Number(pickField(raw, ['point_id', '测点ID', '测点编号ID']))
      const monitorDateRaw = pickField(raw, ['monitor_date', '监测时间', '时间'])
      const valueRaw = pickField(raw, ['value', '监测值', '数值'])
      const remark = pickField(raw, ['remark', '备注'])

      const rowErrors = []
      const point = pointMap.get(pointId)
      const monitorDate = normalizeMonitorDate(monitorDateRaw)
      const value = parseAndRoundValue(valueRaw)

      if (!pointId) rowErrors.push({ field_name: 'point_id', error_message: '缺少测点ID' })
      else if (!point) rowErrors.push({ field_name: 'point_id', error_message: '测点不存在' })
      else if (point.archived) rowErrors.push({ field_name: 'point_id', error_message: '测点已归档' })

      if (!monitorDateRaw) rowErrors.push({ field_name: 'monitor_date', error_message: '缺少监测时间' })
      else if (!monitorDate) rowErrors.push({ field_name: 'monitor_date', error_message: '监测时间格式应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm' })

      if (valueRaw === '') rowErrors.push({ field_name: 'value', error_message: '缺少监测值' })
      else if (value === null) rowErrors.push({ field_name: 'value', error_message: '监测值必须是数字' })

      if (point && value !== null) {
        const rangeErr = validateValueByPointType(point.point_type, value)
        if (rangeErr) rowErrors.push({ field_name: 'value', error_message: rangeErr })
      }

      const key = pointId && monitorDate ? `${pointId}|${monitorDate}` : ''
      if (key) {
        if (fileKeys.has(key)) {
          rowErrors.push({ field_name: 'monitor_date', error_message: '文件内存在重复测点和监测时间' })
        }
        fileKeys.add(key)
      }

      if (rowErrors.length > 0) {
        rowErrors.forEach((error) => errors.push({ row_number, raw_data: raw, ...error }))
        continue
      }

      normalizedRows.push({
        row_number,
        point_id: pointId,
        point_name: point.point_name,
        monitor_type: point.point_type,
        monitor_date: monitorDate,
        value,
        unit: 'mm',
        remark: remark || null,
        raw,
      })
    }

    if (normalizedRows.length > 0) {
      const keys = normalizedRows.map((row) => [row.point_id, row.monitor_date])
      const conditions = keys.map(() => '(point_id = ? AND monitor_date = ?)').join(' OR ')
      const params = keys.flat()
      const [existing] = await conn.query(
        `SELECT point_id, DATE_FORMAT(monitor_date, '%Y-%m-%d %H:%i:%s') AS monitor_date
         FROM monitoring_data
         WHERE ${conditions}`,
        params
      )
      existing.forEach((row) => existingKeys.add(`${row.point_id}|${row.monitor_date}`))
    }

    const validRows = []
    normalizedRows.forEach((row) => {
      const key = `${row.point_id}|${row.monitor_date}`
      if (existingKeys.has(key)) {
        errors.push({
          row_number: row.row_number,
          field_name: 'monitor_date',
          error_message: '数据库中已存在该测点同一时间的数据',
          raw_data: row.raw,
        })
      } else {
        validRows.push(row)
      }
    })

    const batchNo = createBatchNo()
    const status = errors.length > 0 ? 'validation_failed' : 'pending_import'

    await conn.beginTransaction()
    const [batchResult] = await conn.query(
      `INSERT INTO monitoring_import_batches
        (batch_no, file_name, file_size, status, total_rows, valid_rows, error_rows, duplicate_rows, uploader_id, uploader_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batchNo,
        req.file.originalname,
        req.file.size,
        status,
        rows.length,
        validRows.length,
        errors.length,
        errors.filter((error) => error.error_message.includes('重复') || error.error_message.includes('已存在')).length,
        req.user?.userId || null,
        req.user?.username || null,
      ]
    )

    if (errors.length > 0) {
      const values = errors.map((error) => [
        batchResult.insertId,
        error.row_number,
        error.field_name || null,
        error.error_message,
        JSON.stringify(error.raw_data || {}),
      ])
      const placeholders = values.map(() => '(?, ?, ?, ?, ?)').join(',')
      await conn.query(
        `INSERT INTO monitoring_import_errors (batch_id, source_row_number, field_name, error_message, raw_data)
         VALUES ${placeholders}`,
        values.flat()
      )
    }

    await conn.commit()

    res.json({
      success: true,
      message: errors.length > 0 ? '预校验完成，存在错误行' : '预校验通过，等待确认入库',
      data: {
        batch_id: batchResult.insertId,
        batch_no: batchNo,
        status,
        total_rows: rows.length,
        valid_rows: validRows.length,
        error_rows: errors.length,
        duplicate_rows: errors.filter((error) => error.error_message.includes('重复') || error.error_message.includes('已存在')).length,
        preview_rows: validRows.slice(0, 20),
        errors: errors.slice(0, 50),
      },
    })
  } catch (error) {
    await conn.rollback()
    console.error('监测数据导入预校验失败:', error)
    res.status(500).json({ success: false, message: error.message || '监测数据导入预校验失败' })
  } finally {
    conn.release()
  }
})

router.post('/matrix/preview', auth, async (req, res) => {
  try {
    const { slope_id, point_type, rows, damaged_point_ids = [] } = req.body
    const preview = await buildMatrixPreview({ slopeId: slope_id, pointType: point_type, rows, compact: true, damagedPointIds: damaged_point_ids })
    if (preview.error) return res.status(400).json({ success: false, message: preview.error })
    res.json({ success: true, message: '预览校核完成', data: preview })
  } catch (error) {
    console.error('矩阵录入预览失败:', error)
    res.status(500).json({ success: false, message: '矩阵录入预览失败' })
  }
})

router.post('/matrix/preview-point', auth, async (req, res) => {
  try {
    const { slope_id, point_type, point_id, rows, damaged_point_ids = [] } = req.body
    if (!point_id) return res.status(400).json({ success: false, message: '缺少测点' })
    const preview = await buildMatrixPreview({ slopeId: slope_id, pointType: point_type, pointId: point_id, rows, damagedPointIds: damaged_point_ids })
    if (preview.error) return res.status(400).json({ success: false, message: preview.error })
    res.json({ success: true, data: { point_detail: preview.point_detail || [] } })
  } catch (error) {
    console.error('测点校核明细查询失败:', error)
    res.status(500).json({ success: false, message: '测点校核明细查询失败' })
  }
})

router.get('/matrix/slope-summary', auth, async (req, res) => {
  try {
    const { slope_id, point_type } = req.query
    if (!slope_id) return res.status(400).json({ success: false, message: '缺少边坡' })

    const params = [slope_id]
    let typeFilter = ''
    if (point_type) {
      typeFilter = ' AND p.point_type = ?'
      params.push(point_type)
    }

    const [typeRows] = await pool.query(
      `SELECT
          p.point_type,
          COUNT(DISTINCT p.id) AS point_count,
          COUNT(m.id) AS data_count,
          COUNT(DISTINCT DATE(m.monitor_date)) AS date_count,
          DATE_FORMAT(MIN(m.monitor_date), '%Y-%m-%d') AS first_date,
          DATE_FORMAT(MAX(m.monitor_date), '%Y-%m-%d') AS latest_date,
          DATE_FORMAT(MAX(m.created_at), '%Y-%m-%d %H:%i') AS latest_upload_time
       FROM monitoring_points p
       LEFT JOIN monitoring_data m ON m.point_id = p.id
       WHERE p.slope_id = ? AND p.archived = 0 ${typeFilter}
       GROUP BY p.point_type
       ORDER BY p.point_type ASC`,
      params
    )

    const [dateRows] = await pool.query(
      `SELECT
          p.point_type,
          DATE_FORMAT(m.monitor_date, '%Y-%m-%d') AS monitor_date,
          COUNT(DISTINCT m.point_id) AS point_count,
          COUNT(m.id) AS data_count,
          DATE_FORMAT(MAX(m.created_at), '%Y-%m-%d %H:%i') AS latest_upload_time
       FROM monitoring_data m
       JOIN monitoring_points p ON p.id = m.point_id
       WHERE p.slope_id = ? AND p.archived = 0 ${typeFilter}
       GROUP BY p.point_type, DATE_FORMAT(m.monitor_date, '%Y-%m-%d')
       ORDER BY monitor_date DESC, p.point_type ASC
       LIMIT 120`,
      params
    )

    res.json({
      success: true,
      data: {
        by_type: typeRows.map((row) => ({
          point_type: row.point_type,
          point_count: Number(row.point_count) || 0,
          data_count: Number(row.data_count) || 0,
          date_count: Number(row.date_count) || 0,
          first_date: row.first_date || null,
          latest_date: row.latest_date || null,
          latest_upload_time: row.latest_upload_time || null,
        })),
        by_date: dateRows.map((row) => ({
          point_type: row.point_type,
          monitor_date: row.monitor_date,
          point_count: Number(row.point_count) || 0,
          data_count: Number(row.data_count) || 0,
          latest_upload_time: row.latest_upload_time || null,
        })),
      },
    })
  } catch (error) {
    console.error('矩阵录入已录入概况查询失败:', error)
    res.status(500).json({ success: false, message: '已录入概况查询失败' })
  }
})

router.delete('/matrix/slope/:slope_id/all-data', auth, async (req, res) => {
  const conn = await pool.getConnection()
  try {
    await ensureMatrixTables(conn)
    const { slope_id } = req.params
    const { password } = req.body || {}
    const expectedPassword = process.env.CLEAR_SLOPE_DATA_PASSWORD || process.env.ADMIN_CLEAR_SLOPE_DATA_PASSWORD

    if (!expectedPassword) {
      return res.status(500).json({ success: false, message: '后端未配置清空数据密码' })
    }
    if (!password || String(password) !== String(expectedPassword)) {
      return res.status(403).json({ success: false, message: '清空密码不正确' })
    }

    const [slopeRows] = await conn.query('SELECT id, slope_name FROM slopes WHERE id = ? LIMIT 1', [slope_id])
    if (!slopeRows.length) return res.status(404).json({ success: false, message: '边坡不存在' })

    const [points] = await conn.query('SELECT id FROM monitoring_points WHERE slope_id = ?', [slope_id])
    const pointIds = points.map((point) => Number(point.id)).filter(Boolean)
    if (!pointIds.length) {
      return res.json({
        success: true,
        message: '该边坡没有测点，无需清空',
        data: { slope_id: Number(slope_id), deleted_data: 0, deleted_missing: 0, deleted_revisions: 0 },
      })
    }

    await conn.beginTransaction()
    const [dataRows] = await conn.query('SELECT id FROM monitoring_data WHERE point_id IN (?)', [pointIds])
    const dataIds = dataRows.map((row) => Number(row.id)).filter(Boolean)

    let deletedRevisions = 0
    if (dataIds.length) {
      const [revisionResult] = await conn.query('DELETE FROM monitoring_data_revisions WHERE data_id IN (?)', [dataIds])
      deletedRevisions = revisionResult.affectedRows || 0
    }

    const [dataResult] = await conn.query('DELETE FROM monitoring_data WHERE point_id IN (?)', [pointIds])
    const [missingResult] = await conn.query('DELETE FROM monitoring_missing_records WHERE slope_id = ?', [slope_id])

    await conn.commit()
    res.json({
      success: true,
      message: '该边坡监测数据已清空',
      data: {
        slope_id: Number(slope_id),
        slope_name: slopeRows[0].slope_name,
        deleted_data: dataResult.affectedRows || 0,
        deleted_missing: missingResult.affectedRows || 0,
        deleted_revisions: deletedRevisions,
      },
    })
  } catch (error) {
    await conn.rollback()
    console.error('清空边坡监测数据失败:', error)
    res.status(500).json({ success: false, message: error.message || '清空边坡监测数据失败' })
  } finally {
    conn.release()
  }
})

router.post('/matrix/commit', auth, async (req, res) => {
  const conn = await pool.getConnection()
  try {
    await ensureMatrixTables(conn)
    const {
      slope_id,
      point_type,
      rows,
      duplicate_action = 'skip',
      batch_remark = '',
      overwrite_reason = '',
      source_file_name = '手工录入',
      source_file_size = 0,
      auto_set_start_date = false,
      damaged_point_ids = [],
    } = req.body

    const preview = await buildMatrixPreview({ slopeId: slope_id, pointType: point_type, rows, damagedPointIds: damaged_point_ids })
    if (preview.error) return res.status(400).json({ success: false, message: preview.error })
    if (preview.summary.error_rows > 0) {
      return res.status(400).json({ success: false, message: '存在格式错误，请修正后再保存', data: preview })
    }

    const duplicateKeys = new Set(
      preview.issues
        .filter((item) => item.type === 'duplicate_existing')
        .map((item) => `${item.point_id}|${item.monitor_date}`)
    )
    const historicalOverwrite = preview.issues.some((item) => item.type === 'duplicate_existing' && !isSameDate(item.monitor_date, new Date().toISOString().slice(0, 10)))
    if (duplicate_action === 'overwrite' && historicalOverwrite && !String(overwrite_reason || '').trim()) {
      return res.status(400).json({ success: false, message: '覆盖历史数据必须填写原因' })
    }

    const batchNo = createBatchNo()
    await conn.beginTransaction()
    const normalizedDamagedPointIds = (Array.isArray(damaged_point_ids) ? damaged_point_ids : [])
      .map((id) => Number(id))
      .filter(Boolean)
    if (normalizedDamagedPointIds.length) {
      const damageDate = rows
        .map((row) => dateOnly(row.monitor_date))
        .filter(Boolean)
        .sort()[0] || new Date().toISOString().slice(0, 10)
      await conn.query(
        `UPDATE monitoring_points
         SET monitor_status = '已破坏',
             monitor_stop_date = COALESCE(monitor_stop_date, ?)
         WHERE slope_id = ? AND point_type = ? AND id IN (?)`,
        [damageDate, slope_id, point_type, normalizedDamagedPointIds]
      )
    }
    if (auto_set_start_date && preview.suggested_start_dates?.length) {
      for (const item of preview.suggested_start_dates) {
        if (!item.point_id || !item.monitor_start_date) continue
        await conn.query(
          `UPDATE monitoring_points
           SET monitor_start_date = COALESCE(monitor_start_date, ?),
               monitor_status = CASE WHEN monitor_status IS NULL OR monitor_status = '' THEN '监测中' ELSE monitor_status END
           WHERE id = ?`,
          [item.monitor_start_date, item.point_id]
        )
      }
    }
    const [batchResult] = await conn.query(
      `INSERT INTO monitoring_import_batches
        (batch_no, file_name, file_size, data_type, status, total_rows, valid_rows, error_rows, duplicate_rows, uploader_id, uploader_name)
       VALUES (?, ?, ?, ?, 'imported', ?, ?, ?, ?, ?, ?)`,
      [
        batchNo,
        source_file_name || '手工录入',
        Number(source_file_size) || 0,
        point_type,
        preview.summary.input_rows,
        preview.summary.data_rows,
        preview.summary.error_rows,
        preview.summary.duplicate_rows,
        req.user?.userId || null,
        userName(req),
      ]
    )
    const batchId = batchResult.insertId

    if (preview.issues.length) {
      const values = preview.issues.map((issue) => [
        batchId,
        issue.row || 0,
        issue.type || null,
        issue.message,
        JSON.stringify(issue),
      ])
      await conn.query(
        `INSERT INTO monitoring_import_errors (batch_id, source_row_number, field_name, error_message, raw_data)
         VALUES ${values.map(() => '(?, ?, ?, ?, ?)').join(',')}`,
        values.flat()
      )
    }

    let inserted = 0
    let skipped = 0
    let overwritten = 0
    for (const row of preview.rows) {
      const isDuplicate = duplicateKeys.has(`${row.point_id}|${row.monitor_date}`)
      if (isDuplicate && duplicate_action !== 'overwrite') {
        skipped += 1
        continue
      }
      if (isDuplicate) {
        const [[existing]] = await conn.query(
          `SELECT id, value, remark FROM monitoring_data WHERE point_id = ? AND monitor_date = ? LIMIT 1`,
          [row.point_id, row.monitor_date]
        )
        if (existing) {
          await conn.query(
            `INSERT INTO monitoring_data_revisions
              (data_id, batch_id, old_value, new_value, old_remark, new_remark, reason, updated_by, updated_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              existing.id,
              batchId,
              existing.value,
              row.value,
              existing.remark,
              row.remark,
              overwrite_reason || '录入当天快速修正',
              req.user?.userId || null,
              userName(req),
            ]
          )
          await conn.query(
            `UPDATE monitoring_data SET value = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [row.value, row.remark, existing.id]
          )
          overwritten += 1
          continue
        }
      }

      await conn.query(
        `INSERT INTO monitoring_data (point_id, monitor_type, monitor_date, value, unit, remark)
         VALUES (?, ?, ?, ?, 'mm', ?)`,
        [row.point_id, row.monitor_type, row.monitor_date, row.value, row.remark]
      )
      inserted += 1
    }

    if (preview.missing.length) {
      const values = preview.missing.map((item) => [
        batchId,
        slope_id,
        item.point_id,
        point_type,
        item.monitor_date,
        item.reason || null,
        batch_remark || null,
        req.user?.userId || null,
        userName(req),
      ])
      await conn.query(
        `INSERT INTO monitoring_missing_records
          (batch_id, slope_id, point_id, monitor_type, monitor_date, reason, remark, created_by, created_by_name)
         VALUES ${values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')}`,
        values.flat()
      )
    }

    await conn.commit()
    res.status(201).json({
      success: true,
      message: '观测批次已保存',
      data: {
        batch_id: batchId,
        batch_no: batchNo,
        inserted,
        skipped,
        overwritten,
        missing: preview.missing.length,
        not_started: preview.not_started.length,
        stopped: preview.stopped.length,
        damaged: preview.damaged.length,
        start_dates_updated: auto_set_start_date ? preview.suggested_start_dates.filter((item) => !item.current_start_date).length : 0,
        warnings: preview.summary.warning_rows,
      },
    })
  } catch (error) {
    await conn.rollback()
    console.error('矩阵录入保存失败:', error)
    res.status(500).json({ success: false, message: error.message || '矩阵录入保存失败' })
  } finally {
    conn.release()
  }
})

router.post('/', auth, async (req, res) => {
  try {
    const { point_id, monitor_date, value, remark } = req.body

    if (!point_id) return res.status(400).json({ success: false, message: '缺少 point_id' })
    if (!monitor_date) return res.status(400).json({ success: false, message: '缺少 monitor_date' })
    if (value === undefined || value === null) return res.status(400).json({ success: false, message: '缺少 value' })

    const monitorDateNorm = normalizeMonitorDate(monitor_date)
    if (!monitorDateNorm) {
      return res.status(400).json({ success: false, message: 'monitor_date 格式应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm' })
    }

    const valueNum = parseAndRoundValue(value)
    if (valueNum === null) {
      return res.status(400).json({ success: false, message: 'value 必须是数字，且保留 2 位小数' })
    }

    // 查询监测点信息
    const [points] = await pool.query('SELECT id, point_type, archived FROM monitoring_points WHERE id = ?', [point_id])
    if (points.length === 0) return res.status(404).json({ success: false, message: '监测点不存在' })
    const point = points[0]

    if (point.archived) return res.status(409).json({ success: false, message: '该监测点已归档' })
    if (!ALLOWED_POINT_TYPES.includes(point.point_type)) {
      return res.status(409).json({ success: false, message: '该监测点类型不在当前业务口径内' })
    }

    const rangeErr = validateValueByPointType(point.point_type, valueNum)
    if (rangeErr) return res.status(400).json({ success: false, message: rangeErr })

    const [result] = await pool.query(
      `INSERT INTO monitoring_data (point_id, monitor_type, monitor_date, value, unit, remark)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [point_id, point.point_type, monitorDateNorm, valueNum, 'mm', remark || null]
    )

    res.status(201).json({ success: true, message: '录入成功', id: result.insertId })
  } catch (error) {
    console.error('录入监测数据失败:', error)
    res.status(500).json({ success: false, message: '录入监测数据失败' })
  }
})

// 批量录入（支持多监测点）
router.post('/batch', auth, async (req, res) => {
  try {
    const { rows } = req.body
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'rows 不能为空' })
    }

    // 防止一次塞太多导致 SQL/内存压力
    if (rows.length > 1000) {
      return res.status(400).json({ success: false, message: '一次批量最多 1000 行' })
    }

    // 收集所有 point_id
    const pointIds = [...new Set(rows.map(r => r.point_id).filter(Boolean))]
    if (pointIds.length === 0) {
      return res.status(400).json({ success: false, message: '缺少有效的 point_id' })
    }

    // 批量查询监测点信息
    const [points] = await pool.query(
      'SELECT id, point_type, archived FROM monitoring_points WHERE id IN (?)',
      [pointIds]
    )
    const pointMap = new Map(points.map(p => [p.id, p]))

    // 先全量校验，避免部分成功部分失败（前端也能对行号做提示）
    const normalized = []
    const errors = []

    rows.forEach((r, index) => {
      const point = pointMap.get(r.point_id)
      if (!point) {
        errors.push({ row: index, field: 'point_id', message: '监测点不存在' })
        return
      }
      if (point.archived) {
        errors.push({ row: index, field: 'point_id', message: '该监测点已归档' })
        return
      }
      if (!ALLOWED_POINT_TYPES.includes(point.point_type)) {
        errors.push({ row: index, field: 'point_type', message: '该监测点类型不在当前业务口径内' })
        return
      }

      const monitorDateNorm = normalizeMonitorDate(r.monitor_date)
      const valueNum = parseAndRoundValue(r.value)

      if (!monitorDateNorm) {
        errors.push({ row: index, field: 'monitor_date', message: '格式应为 YYYY-MM-DD HH:mm' })
        return
      }
      if (valueNum === null) {
        errors.push({ row: index, field: 'value', message: 'value 必须是数字，且保留 2 位小数' })
        return
      }
      const rangeErr = validateValueByPointType(point.point_type, valueNum)
      if (rangeErr) {
        errors.push({ row: index, field: 'value', message: rangeErr })
        return
      }

      normalized.push({
        point_id: r.point_id,
        monitor_type: point.point_type,
        monitor_date: monitorDateNorm,
        value: valueNum,
        remark: r.remark || null,
      })
    })

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: '批量数据存在校验错误', errors })
    }

    const values = normalized.map((n) => [n.point_id, n.monitor_type, n.monitor_date, n.value, 'mm', n.remark])
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(',')
    const flat = values.flat()

    const [result] = await pool.query(
      `
        INSERT INTO monitoring_data (point_id, monitor_type, monitor_date, value, unit, remark)
        VALUES ${placeholders}
      `,
      flat
    )

    res.status(201).json({
      success: true,
      message: '批量录入成功',
      inserted: normalized.length,
      affectedRows: result.affectedRows,
    })
  } catch (error) {
    console.error('批量录入监测数据失败:', error)
    res.status(500).json({ success: false, message: '批量录入监测数据失败' })
  }
})

// 修改（仅管理员）
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params
    const { monitor_date, value, remark } = req.body

    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: '无权编辑' })
    }
    if (!monitor_date) return res.status(400).json({ success: false, message: '缺少 monitor_date' })
    if (value === undefined || value === null) return res.status(400).json({ success: false, message: '缺少 value' })

    const monitorDateNorm = normalizeMonitorDate(monitor_date)
    if (!monitorDateNorm) {
      return res.status(400).json({ success: false, message: 'monitor_date 格式应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm' })
    }

    const valueNum = parseAndRoundValue(value)
    if (valueNum === null) {
      return res.status(400).json({ success: false, message: 'value 必须是数字，且保留 2 位小数' })
    }

    // 查询监测点类型用于校验
    const [existing] = await pool.query(
      `SELECT m.point_id, p.point_type
       FROM monitoring_data m
       JOIN monitoring_points p ON m.point_id = p.id
       WHERE m.id = ?`,
      [id]
    )
    if (existing.length === 0) return res.status(404).json({ success: false, message: '记录不存在' })

    const pointType = existing[0].point_type
    const rangeErr = validateValueByPointType(pointType, valueNum)
    if (rangeErr) return res.status(400).json({ success: false, message: rangeErr })

    await pool.query(
      `UPDATE monitoring_data
       SET monitor_date = ?, value = ?, remark = ?
       WHERE id = ?`,
      [monitorDateNorm, valueNum, remark || null, id]
    )

    res.json({ success: true, message: '更新成功' })
  } catch (error) {
    console.error('更新监测数据失败:', error)
    res.status(500).json({ success: false, message: '更新监测数据失败' })
  }
})

// 删除（仅管理员）
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params

    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: '无权删除' })
    }

    const [result] = await pool.query('DELETE FROM monitoring_data WHERE id = ?', [id])
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '记录不存在' })
    }

    res.json({ success: true, message: '删除成功' })
  } catch (error) {
    console.error('删除监测数据失败:', error)
    res.status(500).json({ success: false, message: '删除监测数据失败' })
  }
})

module.exports = router

