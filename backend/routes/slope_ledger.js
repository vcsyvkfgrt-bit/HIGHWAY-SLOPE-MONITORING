const express = require('express')
const pool = require('../config/database')
const auth = require('../middleware/auth')

const router = express.Router()

const SAFETY_STATUS = ['正常', '关注', '预警', '处置中', '已销项']
const WORK_STATUS = ['未布点', '已布点', '已上传初值', '正常监测', '数据缺失', '暂停监测', '完成/销项']
const PROBLEM_SEVERITY = ['一般', '较重', '严重']
const PROBLEM_STATUS = ['未处理', '处理中', '已关闭']
const SHARED_SURFACE_TYPES = new Set(['地表位移监测点', '沉降监测点', 'surface'])

router.use(auth)

function parseMonth(input) {
  const value = String(input || '').trim()
  if (!/^\d{4}-\d{2}$/.test(value)) return null
  const [year, month] = value.split('-').map(Number)
  if (month < 1 || month > 12) return null
  const start = `${value}-01`
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { month: value, start, end: nextMonth }
}

function userName(req) {
  return req.user?.real_name || req.user?.username || null
}

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizeStatus(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

function physicalPointKey(point) {
  if (!SHARED_SURFACE_TYPES.has(point.point_type)) return `point:${point.id}`
  const location = String(point.location || '').trim().toLowerCase()
  if (location) return `surface-settlement:${point.slope_id}:${location}`
  const suffix = String(point.point_name || '').match(/(\d+)$/)?.[1]
  return suffix
    ? `surface-settlement:${point.slope_id}:index-${Number(suffix)}`
    : `point:${point.id}`
}

function summarizePhysicalPoints(points, measurementsByPoint) {
  const groups = new Map()
  points.forEach((point) => {
    const key = physicalPointKey(point)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(point)
  })

  let completed = 0
  groups.forEach((groupPoints) => {
    const allStarted = groupPoints.every((point) => {
      return toNumber(measurementsByPoint.get(Number(point.id))?.actual_times) > 0
    })
    if (allStarted) completed += 1
  })

  const sharedCount = new Set(
    points.filter((point) => SHARED_SURFACE_TYPES.has(point.point_type)).map(physicalPointKey)
  ).size
  const deepCount = points.filter((point) => ['深部位移测斜孔', 'deep'].includes(point.point_type)).length
  const otherCount = Math.max(0, groups.size - sharedCount - deepCount)
  const summaries = []
  if (sharedCount > 0) summaries.push(`地表位移/沉降点${sharedCount}`)
  if (deepCount > 0) summaries.push(`深部位移测斜孔${deepCount}`)
  if (otherCount > 0) summaries.push(`其他测点${otherCount}`)

  return {
    total: groups.size,
    completed,
    summary: summaries.join('，'),
  }
}

function suggestSafetyStatus({ openAlarmCount, openProblemCount, completionRate, totalRequired }) {
  if (openAlarmCount > 0) return '预警'
  if (openProblemCount > 0) return '关注'
  if (totalRequired > 0 && completionRate < 100) return '关注'
  return '正常'
}

function suggestWorkStatus({ totalPoints, actualTotal, totalRequired, completionRate }) {
  if (totalPoints === 0) return '未布点'
  if (actualTotal === 0) return '已布点'
  if (totalRequired > 0 && completionRate < 100) return '数据缺失'
  return '正常监测'
}

async function ensureEntry(conn, slopeId, month, req) {
  const [[existing]] = await conn.query(
    'SELECT id FROM slope_ledger_entries WHERE slope_id = ? AND ledger_month = ?',
    [slopeId, month]
  )
  if (existing) return existing.id

  const [result] = await conn.query(
    `INSERT INTO slope_ledger_entries
      (slope_id, ledger_month, updated_by, updated_by_name)
     VALUES (?, ?, ?, ?)`,
    [slopeId, month, req.user?.userId || null, userName(req)]
  )
  return result.insertId
}

async function loadLedger(monthInfo, section) {
  const slopeParams = []
  let slopeSql = 'SELECT * FROM slopes'
  if (section) {
    slopeSql += ' WHERE section = ?'
    slopeParams.push(section)
  }
  slopeSql += ' ORDER BY section ASC, created_at DESC'
  const [slopes] = await pool.query(slopeSql, slopeParams)
  const slopeIds = slopes.map((row) => row.id)
  if (slopeIds.length === 0) {
    return { rows: [], sections: [] }
  }

  const [sectionsRows] = await pool.query(
    'SELECT DISTINCT section FROM slopes WHERE section IS NOT NULL AND section <> "" ORDER BY section ASC'
  )
  const sections = sectionsRows.map((row) => row.section)

  const [entries] = await pool.query(
    'SELECT * FROM slope_ledger_entries WHERE ledger_month = ? AND slope_id IN (?)',
    [monthInfo.month, slopeIds]
  )
  const entryMap = new Map(entries.map((row) => [Number(row.slope_id), row]))

  const [frequencies] = await pool.query(
    'SELECT * FROM slope_ledger_frequencies WHERE ledger_month = ? AND slope_id IN (?)',
    [monthInfo.month, slopeIds]
  )
  const frequencyMap = new Map()
  frequencies.forEach((row) => {
    frequencyMap.set(`${row.slope_id}|${row.point_type}`, row)
  })

  const [points] = await pool.query(
    `SELECT id, slope_id, point_name, point_type, location, install_date, description
     FROM monitoring_points
     WHERE archived = 0 AND slope_id IN (?)`,
    [slopeIds]
  )

  const pointMap = new Map()
  const pointsBySlope = new Map()
  points.forEach((point) => {
    const normalized = { ...point, id: Number(point.id), slope_id: Number(point.slope_id) }
    pointMap.set(normalized.id, normalized)
    if (!pointsBySlope.has(normalized.slope_id)) pointsBySlope.set(normalized.slope_id, [])
    pointsBySlope.get(normalized.slope_id).push(normalized)
  })

  const pointIds = points.map((point) => point.id)
  const measurementsByPoint = new Map()
  if (pointIds.length > 0) {
    const [surfaceRows] = await pool.query(
      `SELECT
         p.id AS point_id,
         COUNT(m.id) AS actual_times,
         DATE_FORMAT(MAX(m.monitor_date), '%Y-%m-%d') AS latest_monitor_date,
         MAX(ABS(m.value)) AS max_value
       FROM monitoring_points p
       JOIN monitoring_data m ON m.point_id = p.id
       WHERE p.id IN (?) AND m.monitor_date >= ? AND m.monitor_date < ?
       GROUP BY p.id`,
      [pointIds, monthInfo.start, monthInfo.end]
    )
    surfaceRows.forEach((row) => {
      measurementsByPoint.set(Number(row.point_id), {
        actual_times: toNumber(row.actual_times),
        latest_monitor_date: row.latest_monitor_date,
        max_value: row.max_value,
      })
    })

    const [deepRows] = await pool.query(
      `SELECT
         p.id AS point_id,
         COUNT(s.id) AS actual_times,
         DATE_FORMAT(MAX(s.survey_date), '%Y-%m-%d') AS latest_monitor_date,
         GREATEST(COALESCE(MAX(ABS(s.max_cumulative)), 0), COALESCE(MAX(ABS(s.max_relative)), 0)) AS max_value
       FROM monitoring_points p
       JOIN inclinometer_surveys s ON s.point_id = p.id
       WHERE p.id IN (?) AND s.survey_date >= ? AND s.survey_date < ?
       GROUP BY p.id`,
      [pointIds, monthInfo.start, monthInfo.end]
    )
    deepRows.forEach((row) => {
      const existing = measurementsByPoint.get(Number(row.point_id)) || { actual_times: 0 }
      measurementsByPoint.set(Number(row.point_id), {
        actual_times: existing.actual_times + toNumber(row.actual_times),
        latest_monitor_date: row.latest_monitor_date || existing.latest_monitor_date || null,
        max_value: row.max_value ?? existing.max_value ?? null,
      })
    })
  }

  const [problems] = await pool.query(
    `SELECT slope_id, COUNT(*) AS count
     FROM slope_ledger_logs
     WHERE ledger_month = ? AND log_type = 'problem' AND COALESCE(status, '') <> '已关闭' AND slope_id IN (?)
     GROUP BY slope_id`,
    [monthInfo.month, slopeIds]
  )
  const problemMap = new Map(problems.map((row) => [Number(row.slope_id), toNumber(row.count)]))

  const [alarms] = await pool.query(
    `SELECT p.slope_id, COUNT(*) AS count
     FROM alarms a
     JOIN monitoring_points p ON p.id = a.point_id
     WHERE a.status <> 'closed' AND p.slope_id IN (?)
     GROUP BY p.slope_id`,
    [slopeIds]
  )
  const alarmMap = new Map(alarms.map((row) => [Number(row.slope_id), toNumber(row.count)]))

  const [maps] = await pool.query(
    `SELECT m.*, f.file_path, f.original_name, f.mime_type
     FROM slope_ledger_maps m
     LEFT JOIN file_assets f ON f.id = m.file_asset_id
     WHERE m.slope_id IN (?) AND m.is_current = 1`,
    [slopeIds]
  )
  const mapBySlope = new Map(maps.map((row) => [Number(row.slope_id), row]))

  const rows = slopes.map((slope) => {
    const slopePoints = pointsBySlope.get(Number(slope.id)) || []
    const typeStats = {}
    let actualTotal = 0
    let requiredTotal = 0

    slopePoints.forEach((point) => {
      const type = point.point_type || '未分类'
      const freq = frequencyMap.get(`${slope.id}|${type}`)
      const requiredTimes = toNumber(freq?.required_times)
      const measured = measurementsByPoint.get(point.id) || { actual_times: 0 }
      const actualTimes = toNumber(measured.actual_times)

      if (!typeStats[type]) {
        typeStats[type] = {
          total: 0,
          completed: 0,
          actual_times: 0,
          required_times: requiredTimes,
          frequency_text: freq?.frequency_text || '',
        }
      }

      typeStats[type].total += 1
      typeStats[type].actual_times += actualTimes
      typeStats[type].required_times = requiredTimes
      typeStats[type].frequency_text = freq?.frequency_text || typeStats[type].frequency_text

      if (actualTimes > 0) typeStats[type].completed += 1
      actualTotal += Math.min(actualTimes, requiredTimes || actualTimes)
      requiredTotal += requiredTimes
    })

    const completionRate = requiredTotal > 0 ? Math.round((actualTotal / requiredTotal) * 1000) / 10 : null
    const physicalStats = summarizePhysicalPoints(slopePoints, measurementsByPoint)
    const entry = entryMap.get(Number(slope.id)) || {}
    const openProblemCount = problemMap.get(Number(slope.id)) || 0
    const openAlarmCount = alarmMap.get(Number(slope.id)) || 0
    const suggestedSafetyStatus = suggestSafetyStatus({ openAlarmCount, openProblemCount, completionRate: completionRate ?? 100, totalRequired: requiredTotal })
    const suggestedWorkStatus = suggestWorkStatus({
      totalPoints: physicalStats.total,
      actualTotal,
      totalRequired: requiredTotal,
      completionRate: completionRate ?? 100,
    })
    const currentMap = mapBySlope.get(Number(slope.id))

    return {
      slope_id: slope.id,
      section: slope.section || '',
      slope_name: slope.slope_name,
      slope_type: slope.slope_type,
      total_points: physicalStats.total,
      completed_points: physicalStats.completed,
      completion_rate: completionRate,
      actual_times: actualTotal,
      required_times: requiredTotal,
      type_stats: typeStats,
      point_type_summary: physicalStats.summary,
      frequency_summary: Object.entries(typeStats)
        .map(([type, stat]) => `${type}：${stat.frequency_text || '-'} / 应测${stat.required_times || 0}次`)
        .join('；'),
      safety_status: entry.safety_status || suggestedSafetyStatus,
      suggested_safety_status: suggestedSafetyStatus,
      work_status: entry.work_status || suggestedWorkStatus,
      suggested_work_status: suggestedWorkStatus,
      status_adjust_reason: entry.status_adjust_reason || '',
      construction_progress: entry.construction_progress || '',
      current_problem: entry.current_problem || '',
      pause_reason: entry.pause_reason || '',
      effective_date: entry.effective_date || null,
      updated_by_name: entry.updated_by_name || '',
      updated_at: entry.updated_at || null,
      current_map: currentMap ? {
        id: currentMap.id,
        file_asset_id: currentMap.file_asset_id,
        file_path: currentMap.file_path,
        original_name: currentMap.original_name,
        mime_type: currentMap.mime_type,
      } : null,
      open_problem_count: openProblemCount,
      open_alarm_count: openAlarmCount,
    }
  })

  return { rows, sections }
}

router.get('/', async (req, res) => {
  try {
    const monthInfo = parseMonth(req.query.month)
    if (!monthInfo) return res.status(400).json({ success: false, message: 'month 格式应为 YYYY-MM' })
    const data = await loadLedger(monthInfo, req.query.section || '')
    res.json({ success: true, data: { month: monthInfo.month, ...data } })
  } catch (error) {
    console.error('获取边坡监测台账失败:', error)
    res.status(500).json({ success: false, message: '获取边坡监测台账失败' })
  }
})

router.get('/:slopeId', async (req, res) => {
  try {
    const { slopeId } = req.params
    const monthInfo = parseMonth(req.query.month)
    if (!monthInfo) return res.status(400).json({ success: false, message: 'month 格式应为 YYYY-MM' })

    const { rows } = await loadLedger(monthInfo, '')
    const summary = rows.find((row) => Number(row.slope_id) === Number(slopeId))
    if (!summary) return res.status(404).json({ success: false, message: '边坡不存在' })

    const [frequencies] = await pool.query(
      `SELECT point_type, frequency_text, required_times, remark
       FROM slope_ledger_frequencies
       WHERE slope_id = ? AND ledger_month = ?
       ORDER BY point_type ASC`,
      [slopeId, monthInfo.month]
    )

    const [logs] = await pool.query(
      `SELECT *
       FROM slope_ledger_logs
       WHERE slope_id = ? AND ledger_month = ?
       ORDER BY record_date DESC, created_at DESC`,
      [slopeId, monthInfo.month]
    )

    const [maps] = await pool.query(
      `SELECT m.*, f.file_path, f.original_name, f.mime_type, f.file_size
       FROM slope_ledger_maps m
       LEFT JOIN file_assets f ON f.id = m.file_asset_id
       WHERE m.slope_id = ?
       ORDER BY m.is_current DESC, m.created_at DESC`,
      [slopeId]
    )

    const [points] = await pool.query(
      `SELECT p.id, p.point_name, p.point_type, p.install_date, p.description,
         COALESCE(md.actual_times, 0) + COALESCE(ic.actual_times, 0) AS actual_times,
         DATE_FORMAT(GREATEST(COALESCE(md.latest_date, '1000-01-01'), COALESCE(ic.latest_date, '1000-01-01')), '%Y-%m-%d') AS latest_monitor_date,
         GREATEST(COALESCE(md.max_value, 0), COALESCE(ic.max_value, 0)) AS max_value
       FROM monitoring_points p
       LEFT JOIN (
         SELECT point_id, COUNT(*) AS actual_times, MAX(monitor_date) AS latest_date, MAX(ABS(value)) AS max_value
         FROM monitoring_data
         WHERE monitor_date >= ? AND monitor_date < ?
         GROUP BY point_id
       ) md ON md.point_id = p.id
       LEFT JOIN (
         SELECT point_id, COUNT(*) AS actual_times, MAX(survey_date) AS latest_date,
           GREATEST(COALESCE(MAX(ABS(max_cumulative)), 0), COALESCE(MAX(ABS(max_relative)), 0)) AS max_value
         FROM inclinometer_surveys
         WHERE survey_date >= ? AND survey_date < ?
         GROUP BY point_id
       ) ic ON ic.point_id = p.id
       WHERE p.slope_id = ? AND p.archived = 0
       ORDER BY p.point_type ASC, p.point_name ASC`,
      [monthInfo.start, monthInfo.end, monthInfo.start, monthInfo.end, slopeId]
    )

    const frequencyByType = new Map(frequencies.map((row) => [row.point_type, row]))
    const pointDetails = points.map((point) => {
      const requiredTimes = toNumber(frequencyByType.get(point.point_type)?.required_times)
      const actualTimes = toNumber(point.actual_times)
      return {
        ...point,
        required_times: requiredTimes,
        actual_times: actualTimes,
        completed: requiredTimes > 0 ? actualTimes >= requiredTimes : actualTimes > 0,
        latest_monitor_date: point.latest_monitor_date === '1000-01-01' ? null : point.latest_monitor_date,
      }
    })

    res.json({
      success: true,
      data: {
        summary,
        frequencies,
        points: pointDetails,
        logs,
        maps,
      },
    })
  } catch (error) {
    console.error('获取边坡台账详情失败:', error)
    res.status(500).json({ success: false, message: '获取边坡台账详情失败' })
  }
})

router.put('/:slopeId', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { slopeId } = req.params
    const monthInfo = parseMonth(req.body.month)
    if (!monthInfo) return res.status(400).json({ success: false, message: 'month 格式应为 YYYY-MM' })

    const {
      safety_status,
      work_status,
      suggested_safety_status,
      suggested_work_status,
      status_adjust_reason,
      construction_progress,
      current_problem,
      pause_reason,
      effective_date,
      frequencies = [],
    } = req.body

    const finalSafetyStatus = normalizeStatus(safety_status, SAFETY_STATUS, '正常')
    const finalWorkStatus = normalizeStatus(work_status, WORK_STATUS, '正常监测')
    if (suggested_safety_status && suggested_safety_status !== finalSafetyStatus && !String(status_adjust_reason || '').trim()) {
      return res.status(400).json({ success: false, message: '人工安全状态与系统建议不一致时，请填写调整原因' })
    }
    if (['暂停监测', '完成/销项'].includes(finalWorkStatus) && (!pause_reason || !effective_date)) {
      return res.status(400).json({ success: false, message: '暂停监测或完成/销项时，请填写原因和生效日期' })
    }

    await conn.beginTransaction()
    await ensureEntry(conn, slopeId, monthInfo.month, req)
    await conn.query(
      `UPDATE slope_ledger_entries
       SET safety_status = ?, work_status = ?, suggested_safety_status = ?, suggested_work_status = ?,
         status_adjust_reason = ?, construction_progress = ?, current_problem = ?,
         pause_reason = ?, effective_date = ?, updated_by = ?, updated_by_name = ?
       WHERE slope_id = ? AND ledger_month = ?`,
      [
        finalSafetyStatus,
        finalWorkStatus,
        suggested_safety_status || null,
        suggested_work_status || null,
        status_adjust_reason || null,
        construction_progress || null,
        current_problem || null,
        pause_reason || null,
        effective_date || null,
        req.user?.userId || null,
        userName(req),
        slopeId,
        monthInfo.month,
      ]
    )

    if (Array.isArray(frequencies)) {
      for (const item of frequencies) {
        if (!item.point_type) continue
        await conn.query(
          `INSERT INTO slope_ledger_frequencies
            (slope_id, ledger_month, point_type, frequency_text, required_times, remark, updated_by, updated_by_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             frequency_text = VALUES(frequency_text),
             required_times = VALUES(required_times),
             remark = VALUES(remark),
             updated_by = VALUES(updated_by),
             updated_by_name = VALUES(updated_by_name)`,
          [
            slopeId,
            monthInfo.month,
            item.point_type,
            item.frequency_text || null,
            toNumber(item.required_times),
            item.remark || null,
            req.user?.userId || null,
            userName(req),
          ]
        )
      }
    }

    await conn.commit()
    res.json({ success: true, message: '台账保存成功' })
  } catch (error) {
    await conn.rollback()
    console.error('保存边坡台账失败:', error)
    res.status(500).json({ success: false, message: '保存边坡台账失败' })
  } finally {
    conn.release()
  }
})

router.post('/:slopeId/logs', async (req, res) => {
  try {
    const { slopeId } = req.params
    const monthInfo = parseMonth(req.body.month)
    if (!monthInfo) return res.status(400).json({ success: false, message: 'month 格式应为 YYYY-MM' })

    const logType = req.body.log_type === 'problem' ? 'problem' : 'progress'
    const recordDate = req.body.record_date || `${monthInfo.month}-01`
    const content = String(req.body.content || '').trim()
    if (!content) return res.status(400).json({ success: false, message: '请输入记录内容' })

    const severity = PROBLEM_SEVERITY.includes(req.body.severity) ? req.body.severity : null
    const status = PROBLEM_STATUS.includes(req.body.status) ? req.body.status : (logType === 'problem' ? '未处理' : null)

    const [result] = await pool.query(
      `INSERT INTO slope_ledger_logs
        (slope_id, ledger_month, log_type, record_date, content, severity, measures, responsible_person, status, closed_date, recorder_id, recorder_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slopeId,
        monthInfo.month,
        logType,
        recordDate,
        content,
        severity,
        req.body.measures || null,
        req.body.responsible_person || null,
        status,
        req.body.closed_date || null,
        req.user?.userId || null,
        userName(req),
      ]
    )

    res.status(201).json({ success: true, message: '记录已添加', data: { id: result.insertId } })
  } catch (error) {
    console.error('添加台账记录失败:', error)
    res.status(500).json({ success: false, message: '添加台账记录失败' })
  }
})

router.post('/:slopeId/maps', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { slopeId } = req.params
    const { file_asset_id, is_current = true } = req.body
    if (!file_asset_id) return res.status(400).json({ success: false, message: '缺少 file_asset_id' })

    await conn.beginTransaction()
    if (is_current) {
      await conn.query('UPDATE slope_ledger_maps SET is_current = 0 WHERE slope_id = ?', [slopeId])
    }
    const [result] = await conn.query(
      `INSERT INTO slope_ledger_maps
        (slope_id, file_asset_id, is_current, uploaded_by, uploaded_by_name)
       VALUES (?, ?, ?, ?, ?)`,
      [slopeId, file_asset_id, is_current ? 1 : 0, req.user?.userId || null, userName(req)]
    )
    await conn.commit()
    res.status(201).json({ success: true, message: '布点图已保存', data: { id: result.insertId } })
  } catch (error) {
    await conn.rollback()
    console.error('保存布点图失败:', error)
    res.status(500).json({ success: false, message: '保存布点图失败' })
  } finally {
    conn.release()
  }
})

router.put('/maps/:mapId/current', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { mapId } = req.params
    const [[map]] = await conn.query('SELECT slope_id FROM slope_ledger_maps WHERE id = ?', [mapId])
    if (!map) return res.status(404).json({ success: false, message: '布点图不存在' })
    await conn.beginTransaction()
    await conn.query('UPDATE slope_ledger_maps SET is_current = 0 WHERE slope_id = ?', [map.slope_id])
    await conn.query('UPDATE slope_ledger_maps SET is_current = 1 WHERE id = ?', [mapId])
    await conn.commit()
    res.json({ success: true, message: '当前布点图已更新' })
  } catch (error) {
    await conn.rollback()
    console.error('设置当前布点图失败:', error)
    res.status(500).json({ success: false, message: '设置当前布点图失败' })
  } finally {
    conn.release()
  }
})

module.exports = router
