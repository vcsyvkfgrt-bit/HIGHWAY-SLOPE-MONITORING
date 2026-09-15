const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')

const pool = require('../config/database')
const auth = require('../middleware/auth')

const router = express.Router()
const uploadDir = path.join(__dirname, '..', 'uploads', 'inspections')
const problemLevels = new Set(['general', 'important', 'urgent'])
const rectificationStatuses = new Set(['pending', 'processing', 'pending_review', 'closed'])

fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination(_req, _file, cb) { cb(null, uploadDir) },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `inspection-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter(_req, file, cb) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new Error('巡查照片仅支持 JPG、PNG 或 WebP 格式'))
    }
    cb(null, true)
  },
})

router.use(auth)

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function parseJsonArray(value) {
  const parsed = parseJson(value, [])
  return Array.isArray(parsed) ? parsed : []
}

function cleanNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function weekRange(input) {
  const base = input ? new Date(`${input}T00:00:00`) : new Date()
  if (Number.isNaN(base.getTime())) return weekRange()
  const day = base.getDay() || 7
  const start = new Date(base)
  start.setDate(base.getDate() - day + 1)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (date) => {
    const pad = (value) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }
  return { start: fmt(start), end: fmt(end) }
}

function periodRange(type, value) {
  const now = new Date()
  const pad = (number) => String(number).padStart(2, '0')
  if (type === 'year') {
    const year = /^\d{4}$/.test(String(value || '')) ? Number(value) : now.getFullYear()
    return { type: 'year', period: String(year), start: `${year}-01-01`, end: `${year + 1}-01-01`, expectedTimes: 52 }
  }
  const fallback = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  const period = /^\d{4}-\d{2}$/.test(String(value || '')) ? String(value) : fallback
  const [year, month] = period.split('-').map(Number)
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`
  return { type: 'month', period, start: `${period}-01`, end: next, expectedTimes: 4 }
}

function userName(req) {
  return req.user?.real_name || req.user?.username || '系统用户'
}

function filePathFromPublicUrl(publicUrl) {
  const prefix = '/uploads/inspections/'
  if (!String(publicUrl || '').startsWith(prefix)) return null
  const absolutePath = path.resolve(uploadDir, path.basename(publicUrl))
  return absolutePath.startsWith(path.resolve(uploadDir)) ? absolutePath : null
}

function removeStoredImages(imageUrls) {
  for (const imageUrl of imageUrls || []) {
    const absolutePath = filePathFromPublicUrl(imageUrl)
    if (!absolutePath || !fs.existsSync(absolutePath)) continue
    try { fs.unlinkSync(absolutePath) } catch (error) {
      console.error('[inspections] 删除影像失败:', error.message)
    }
  }
}

function normalizePayload(req) {
  const hasProblem = ['1', 'true', 'yes'].includes(String(req.body.has_problem).toLowerCase())
  const problemLevel = hasProblem && problemLevels.has(req.body.problem_level) ? req.body.problem_level : null
  const status = !hasProblem ? 'normal' : (problemLevel === 'general' ? 'attention' : 'abnormal')
  const existingImages = parseJsonArray(req.body.existing_images || req.body.images)
  const newImages = (req.files || []).map(file => `/uploads/inspections/${file.filename}`)
  return {
    slopeId: Number(req.body.slope_id),
    inspectionDate: String(req.body.inspection_date || '').trim(),
    inspector: String(req.body.inspector || '').trim(),
    inspectionType: String(req.body.inspection_type || '').trim(),
    status,
    content: String(req.body.content || '').trim(),
    problems: hasProblem ? String(req.body.problems || '').trim() : '',
    suggestions: hasProblem ? String(req.body.suggestions || '').trim() : '',
    result: hasProblem ? String(req.body.result || '').trim() : '',
    checklist: parseJsonArray(req.body.checklist),
    hasProblem,
    problemLevel,
    problemLocation: hasProblem ? String(req.body.problem_location || '').trim() : '',
    images: [...existingImages, ...newImages],
    newlyUploadedImages: newImages,
    longitude: cleanNumber(req.body.longitude),
    latitude: cleanNumber(req.body.latitude),
    locationDescription: String(req.body.location_description || '').trim(),
    photoMetadata: parseJsonArray(req.body.photo_metadata),
    imageAssist: parseJsonArray(req.body.image_assist),
    responsiblePerson: hasProblem ? String(req.body.responsible_person || '').trim() : '',
    rectificationDeadline: hasProblem ? (req.body.rectification_deadline || null) : null,
  }
}

async function validatePayload(payload) {
  if (!Number.isInteger(payload.slopeId) || payload.slopeId <= 0) return '请选择有效边坡'
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(payload.inspectionDate)) return '巡查日期格式不正确'
  if (!payload.inspector) return '请填写巡查人员'
  if (!payload.inspectionType) return '请选择巡查场景'
  if (!payload.checklist.length) return '请填写标准巡查项目'
  if (payload.hasProblem && !payload.problemLevel) return '请选择问题等级'
  if (payload.hasProblem && !payload.problems) return '请填写问题描述'
  if (payload.longitude !== null && (payload.longitude < -180 || payload.longitude > 180)) return '经度范围应为 -180 至 180'
  if (payload.latitude !== null && (payload.latitude < -90 || payload.latitude > 90)) return '纬度范围应为 -90 至 90'
  const [slopes] = await pool.query('SELECT id FROM slopes WHERE id = ? LIMIT 1', [payload.slopeId])
  return slopes.length ? null : '所选边坡不存在'
}

async function slopeContext(slopeId) {
  const [[slope]] = await pool.query('SELECT id, slope_name, section FROM slopes WHERE id = ? LIMIT 1', [slopeId])
  return slope || null
}

async function weatherContext(section, inspectionDate) {
  if (!section || !inspectionDate) return { snapshot: null, rainfall: null }
  const date = String(inspectionDate).slice(0, 10)
  try {
    const [[rain]] = await pool.query(
      'SELECT amount_mm, source, quality_status FROM rainfall_daily_records WHERE section = ? AND rain_date = ? LIMIT 1',
      [section, date]
    )
    const [[weather]] = await pool.query(
      'SELECT live_json, forecast_json, source, fetched_at FROM weather_daily_snapshots WHERE section = ? AND snapshot_date = ? ORDER BY fetched_at DESC LIMIT 1',
      [section, date]
    )
    return {
      snapshot: weather ? {
        live: parseJson(weather.live_json, null), forecast: parseJson(weather.forecast_json, null),
        source: weather.source, fetched_at: weather.fetched_at,
      } : null,
      rainfall: rain?.amount_mm === null || rain?.amount_mm === undefined ? null : Number(rain.amount_mm),
    }
  } catch (error) {
    if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) console.warn('[inspections] 关联天气失败:', error.message)
    return { snapshot: null, rainfall: null }
  }
}

async function advancePlans(conn, slopeId, inspectionDate) {
  const [plans] = await conn.query('SELECT id, interval_days FROM inspection_plans WHERE slope_id = ? AND enabled = 1', [slopeId])
  for (const plan of plans) {
    await conn.query(
      `UPDATE inspection_plans SET last_inspection_date = ?, next_due_date = DATE_ADD(DATE(?), INTERVAL ? DAY) WHERE id = ?`,
      [inspectionDate, inspectionDate, Math.max(1, Number(plan.interval_days || 7)), plan.id]
    )
  }
}

function listFilters(query) {
  const params = []
  const where = []
  if (!['1', 'true'].includes(String(query.include_voided).toLowerCase())) where.push('COALESCE(i.voided, 0) = 0')
  if (query.section) { where.push('s.section = ?'); params.push(query.section) }
  if (query.slope_id) { where.push('i.slope_id = ?'); params.push(query.slope_id) }
  if (['1', 'true'].includes(String(query.only_problems).toLowerCase())) where.push('i.has_problem = 1')
  if (query.rectification_status) { where.push('i.rectification_status = ?'); params.push(query.rectification_status) }
  if (query.start_date) { where.push('i.inspection_date >= ?'); params.push(`${query.start_date} 00:00:00`) }
  if (query.end_date) { where.push('i.inspection_date <= ?'); params.push(`${query.end_date} 23:59:59`) }
  return { where, params }
}

async function analyticsData(query) {
  const { where, params } = listFilters(query)
  const condition = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const baseFrom = `FROM inspections i LEFT JOIN slopes s ON i.slope_id = s.id`
  const [[summary]] = await pool.query(`
    SELECT COUNT(*) total, SUM(i.has_problem = 1) problem_count,
      SUM(i.rectification_status IN ('pending','processing','pending_review')) open_count,
      SUM(i.rectification_status <> 'closed' AND i.rectification_deadline < CURDATE()) overdue_count,
      ROUND(AVG(CASE WHEN i.closed_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, i.inspection_date, i.closed_at) / 24 END), 1) avg_rectification_days
    ${baseFrom} ${condition}
  `, params)
  const problemCondition = `${condition} ${condition ? 'AND' : 'WHERE'} i.has_problem = 1`
  const [levels] = await pool.query(`
    SELECT COALESCE(i.problem_level, 'none') label, COUNT(*) value ${baseFrom} ${problemCondition}
    GROUP BY i.problem_level ORDER BY value DESC
  `, params)
  const [slopes] = await pool.query(`
    SELECT i.slope_id, s.slope_name, s.section, COUNT(*) problem_count,
      SUM(i.rectification_status IN ('pending','processing','pending_review')) open_count
    ${baseFrom} ${problemCondition}
    GROUP BY i.slope_id, s.slope_name, s.section ORDER BY problem_count DESC, open_count DESC LIMIT 10
  `, params)
  const [trend] = await pool.query(`
    SELECT DATE(i.inspection_date) date, COUNT(*) total, SUM(i.has_problem = 1) problem_count
    ${baseFrom} ${condition} GROUP BY DATE(i.inspection_date) ORDER BY date DESC LIMIT 30
  `, params)
  return {
    summary: {
      total: Number(summary?.total || 0), problem_count: Number(summary?.problem_count || 0),
      open_count: Number(summary?.open_count || 0), overdue_count: Number(summary?.overdue_count || 0),
      avg_rectification_days: summary?.avg_rectification_days === null ? null : Number(summary.avg_rectification_days),
    },
    levels: levels.map(item => ({ ...item, value: Number(item.value) })),
    slopes: slopes.map(item => ({ ...item, problem_count: Number(item.problem_count), open_count: Number(item.open_count) })),
    trend: trend.reverse().map(item => ({ ...item, total: Number(item.total), problem_count: Number(item.problem_count) })),
  }
}

router.get('/', async (req, res) => {
  try {
    const safePage = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10))
    const { where, params } = listFilters(req.query)
    const fromSql = `FROM inspections i FORCE INDEX (idx_inspection_date_id) LEFT JOIN slopes s ON i.slope_id = s.id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`
    const [[countRow]] = await pool.query(`SELECT COUNT(*) count ${fromSql}`, params)
    const [rows] = await pool.query(`
      SELECT i.*, COALESCE(JSON_LENGTH(i.images), 0) image_count,
        COALESCE(JSON_LENGTH(i.rectification_images), 0) rectification_image_count,
        s.slope_name, s.section, s.start_stake, s.end_stake
      ${fromSql} ORDER BY i.inspection_date DESC, i.id DESC LIMIT ? OFFSET ?
    `, [...params, safeLimit, (safePage - 1) * safeLimit])
    res.json({ success: true, data: rows, total: Number(countRow?.count || 0), page: safePage, limit: safeLimit })
  } catch (error) {
    console.error('获取巡查记录失败:', error)
    res.status(500).json({ success: false, message: '获取巡查记录失败' })
  }
})

router.get('/dashboard', async (req, res) => {
  try {
    const params = []
    const sectionCondition = req.query.section ? 'AND s.section = ?' : ''
    if (req.query.section) params.push(req.query.section)
    const currentWeek = weekRange(req.query.week_date)
    const [[inspectionStats]] = await pool.query(`
      SELECT SUM(i.rectification_status IN ('pending','processing','pending_review')) open_rectifications,
        SUM(i.rectification_status <> 'closed' AND i.rectification_deadline < CURDATE()) overdue_rectifications,
        SUM(i.inspection_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) month_inspections,
        COUNT(DISTINCT CASE WHEN DATE(i.inspection_date) BETWEEN ? AND ? THEN i.slope_id END) week_completed_slopes,
        SUM(CASE WHEN DATE(i.inspection_date) BETWEEN ? AND ? AND i.has_problem = 1 THEN 1 ELSE 0 END) week_problem_records
      FROM inspections i LEFT JOIN slopes s ON i.slope_id = s.id WHERE COALESCE(i.voided, 0) = 0 ${sectionCondition}
    `, [currentWeek.start, currentWeek.end, currentWeek.start, currentWeek.end, ...params])
    const [[slopeStats]] = await pool.query(
      `SELECT COUNT(*) total_slopes FROM slopes s WHERE 1=1 ${req.query.section ? 'AND s.section = ?' : ''}`,
      req.query.section ? [req.query.section] : []
    )
    const [[planStats]] = await pool.query(`
      SELECT SUM(enabled = 1 AND next_due_date <= DATE_ADD(CURDATE(), INTERVAL advance_notice_days DAY)) due_plans,
        SUM(enabled = 1 AND next_due_date < CURDATE()) overdue_plans
      FROM inspection_plans ${req.query.section ? 'WHERE section = ?' : ''}
    `, req.query.section ? [req.query.section] : [])
    res.json({ success: true, data: {
      open_rectifications: Number(inspectionStats?.open_rectifications || 0),
      overdue_rectifications: Number(inspectionStats?.overdue_rectifications || 0),
      month_inspections: Number(inspectionStats?.month_inspections || 0),
      due_plans: Number(planStats?.due_plans || 0), overdue_plans: Number(planStats?.overdue_plans || 0),
      week_required_slopes: Number(slopeStats?.total_slopes || 0),
      week_completed_slopes: Number(inspectionStats?.week_completed_slopes || 0),
      week_pending_slopes: Math.max(0, Number(slopeStats?.total_slopes || 0) - Number(inspectionStats?.week_completed_slopes || 0)),
      week_problem_records: Number(inspectionStats?.week_problem_records || 0),
      week_start: currentWeek.start,
      week_end: currentWeek.end,
    } })
  } catch (error) {
    console.error('获取巡查工作台失败:', error)
    res.status(500).json({ success: false, message: '获取巡查工作台失败' })
  }
})

router.get('/weekly-tasks', async (req, res) => {
  try {
    const currentWeek = weekRange(req.query.week_date)
    const params = [currentWeek.start, currentWeek.end]
    const where = []
    if (req.query.section) {
      where.push('s.section = ?')
      params.push(req.query.section)
    }
    const [rows] = await pool.query(`
      SELECT
        s.id slope_id,
        s.section,
        s.slope_name,
        s.slope_type,
        s.start_stake,
        s.end_stake,
        p.id plan_id,
        p.plan_name,
        p.responsible_person,
        p.next_due_date,
        p.interval_days,
        p.enabled,
        li.id inspection_id,
        li.inspection_date,
        li.inspector,
        li.has_problem,
        li.problem_level,
        li.rectification_status,
        COALESCE(JSON_LENGTH(li.images), 0) image_count,
        CASE
          WHEN li.id IS NOT NULL THEN 'completed'
          WHEN p.enabled = 1 AND p.next_due_date < CURDATE() THEN 'overdue'
          WHEN p.enabled = 1 AND p.next_due_date <= DATE_ADD(CURDATE(), INTERVAL p.advance_notice_days DAY) THEN 'due'
          ELSE 'pending'
        END task_status
      FROM slopes s
      LEFT JOIN inspection_plans p ON p.slope_id = s.id AND p.enabled = 1
      LEFT JOIN (
        SELECT i.*
        FROM inspections i
        JOIN (
          SELECT slope_id, MAX(inspection_date) latest_date
          FROM inspections
          WHERE COALESCE(voided, 0) = 0 AND DATE(inspection_date) BETWEEN ? AND ?
          GROUP BY slope_id
        ) latest ON latest.slope_id = i.slope_id AND latest.latest_date = i.inspection_date
      ) li ON li.slope_id = s.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY
        FIELD(task_status, 'overdue', 'due', 'pending', 'completed'),
        COALESCE(p.next_due_date, CURDATE()) ASC,
        s.section ASC,
        s.slope_name ASC
    `, params)
    const summary = rows.reduce((acc, row) => {
      acc.total += 1
      if (row.task_status === 'completed') acc.completed += 1
      else acc.pending += 1
      if (row.task_status === 'overdue') acc.overdue += 1
      if (Number(row.has_problem)) acc.problem += 1
      return acc
    }, { total: 0, completed: 0, pending: 0, overdue: 0, problem: 0 })
    res.json({ success: true, data: rows, summary, week: currentWeek })
  } catch (error) {
    console.error('获取每周巡查任务失败:', error)
    res.status(500).json({ success: false, message: '获取每周巡查任务失败' })
  }
})

router.get('/plans', async (req, res) => {
  try {
    const where = []
    const params = []
    if (req.query.section) { where.push('p.section = ?'); params.push(req.query.section) }
    if (req.query.enabled !== undefined && req.query.enabled !== '') { where.push('p.enabled = ?'); params.push(Number(req.query.enabled) ? 1 : 0) }
    const [rows] = await pool.query(`
      SELECT p.*, s.slope_name,
        CASE WHEN p.enabled = 0 THEN 'disabled' WHEN p.next_due_date < CURDATE() THEN 'overdue'
          WHEN p.next_due_date <= DATE_ADD(CURDATE(), INTERVAL p.advance_notice_days DAY) THEN 'due' ELSE 'normal' END plan_status
      FROM inspection_plans p LEFT JOIN slopes s ON p.slope_id = s.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.enabled DESC, p.next_due_date ASC, p.id DESC
    `, params)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取巡查计划失败:', error)
    res.status(500).json({ success: false, message: '获取巡查计划失败' })
  }
})

router.post('/plans', async (req, res) => {
  try {
    const slopeId = Number(req.body.slope_id)
    const slope = await slopeContext(slopeId)
    if (!slope) return res.status(400).json({ success: false, message: '请选择有效边坡' })
    if (!req.body.next_due_date) return res.status(400).json({ success: false, message: '请选择下次巡查日期' })
    const [result] = await pool.query(`
      INSERT INTO inspection_plans
        (section, slope_id, plan_name, frequency_type, interval_days, responsible_person, advance_notice_days, next_due_date, enabled, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [slope.section, slopeId, String(req.body.plan_name || `${slope.slope_name}巡查计划`).trim(), req.body.frequency_type || 'weekly',
      Math.max(1, Number(req.body.interval_days || 7)), String(req.body.responsible_person || '').trim() || null,
      Math.max(0, Number(req.body.advance_notice_days ?? 2)), req.body.next_due_date, req.body.enabled === false ? 0 : 1, req.user?.userId || null])
    res.status(201).json({ success: true, message: '巡查计划已创建', id: result.insertId })
  } catch (error) {
    console.error('创建巡查计划失败:', error)
    res.status(500).json({ success: false, message: '创建巡查计划失败' })
  }
})

router.put('/plans/:id', async (req, res) => {
  try {
    const slopeId = Number(req.body.slope_id)
    const slope = await slopeContext(slopeId)
    if (!slope) return res.status(400).json({ success: false, message: '请选择有效边坡' })
    const [result] = await pool.query(`
      UPDATE inspection_plans SET section = ?, slope_id = ?, plan_name = ?, frequency_type = ?, interval_days = ?,
        responsible_person = ?, advance_notice_days = ?, next_due_date = ?, enabled = ? WHERE id = ?
    `, [slope.section, slopeId, String(req.body.plan_name || '').trim(), req.body.frequency_type || 'weekly',
      Math.max(1, Number(req.body.interval_days || 7)), String(req.body.responsible_person || '').trim() || null,
      Math.max(0, Number(req.body.advance_notice_days ?? 2)), req.body.next_due_date, req.body.enabled === false ? 0 : 1, req.params.id])
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '巡查计划不存在' })
    res.json({ success: true, message: '巡查计划已更新' })
  } catch (error) {
    console.error('更新巡查计划失败:', error)
    res.status(500).json({ success: false, message: '更新巡查计划失败' })
  }
})

router.delete('/plans/:id', auth.requireRole('admin'), async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM inspection_plans WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '巡查计划不存在' })
    res.json({ success: true, message: '巡查计划已删除' })
  } catch (error) {
    console.error('删除巡查计划失败:', error)
    res.status(500).json({ success: false, message: '删除巡查计划失败' })
  }
})

router.get('/analytics', async (req, res) => {
  try { res.json({ success: true, data: await analyticsData(req.query) }) }
  catch (error) {
    console.error('获取巡查分析失败:', error)
    res.status(500).json({ success: false, message: '获取巡查分析失败' })
  }
})

router.get('/period-summary', async (req, res) => {
  try {
    const range = periodRange(req.query.period_type, req.query.period)
    const params = [range.start, range.end, range.expectedTimes, range.start, range.end]
    const where = []
    if (req.query.section) {
      where.push('s.section = ?')
      params.push(req.query.section)
    }
    const [rows] = await pool.query(`
      SELECT
        s.id slope_id,
        s.section,
        s.slope_name,
        s.slope_type,
        s.start_stake,
        s.end_stake,
        ? AS period_start,
        ? AS period_end,
        ? AS expected_times,
        COUNT(i.id) AS actual_times,
        COUNT(DISTINCT DATE(i.inspection_date)) AS actual_days,
        SUM(CASE WHEN i.has_problem = 1 THEN 1 ELSE 0 END) AS problem_times,
        SUM(CASE WHEN i.has_problem = 1 AND i.rectification_status IN ('pending','processing','pending_review') THEN 1 ELSE 0 END) AS open_problem_times,
        SUM(COALESCE(JSON_LENGTH(i.images), 0)) AS photo_count,
        MAX(i.inspection_date) AS last_inspection_date,
        COUNT(DISTINCT DATE_FORMAT(i.inspection_date, '%Y-%m')) AS covered_months
      FROM slopes s
      LEFT JOIN inspections i ON i.slope_id = s.id
        AND COALESCE(i.voided, 0) = 0
        AND i.inspection_date >= ?
        AND i.inspection_date < ?
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY s.id, s.section, s.slope_name, s.slope_type, s.start_stake, s.end_stake
      ORDER BY s.section ASC, s.slope_name ASC
    `, params)
    const normalized = rows.map((row) => {
      const actual = Number(row.actual_times || 0)
      const expected = Number(row.expected_times || 0)
      return {
        ...row,
        expected_times: expected,
        actual_times: actual,
        actual_days: Number(row.actual_days || 0),
        problem_times: Number(row.problem_times || 0),
        open_problem_times: Number(row.open_problem_times || 0),
        photo_count: Number(row.photo_count || 0),
        covered_months: Number(row.covered_months || 0),
        completion_rate: expected > 0 ? Math.min(100, Math.round((actual / expected) * 1000) / 10) : 0,
      }
    })
    const summary = normalized.reduce((acc, row) => {
      acc.slope_count += 1
      acc.expected_times += row.expected_times
      acc.actual_times += row.actual_times
      acc.problem_times += row.problem_times
      acc.open_problem_times += row.open_problem_times
      acc.photo_count += row.photo_count
      return acc
    }, { slope_count: 0, expected_times: 0, actual_times: 0, problem_times: 0, open_problem_times: 0, photo_count: 0 })
    summary.completion_rate = summary.expected_times > 0
      ? Math.min(100, Math.round((summary.actual_times / summary.expected_times) * 1000) / 10)
      : 0
    res.json({ success: true, data: normalized, summary, period: range })
  } catch (error) {
    console.error('获取巡查周期汇总失败:', error)
    res.status(500).json({ success: false, message: '获取巡查周期汇总失败' })
  }
})

router.post('/report-draft', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { section = '', start_date: startDate, end_date: endDate, report_type: reportType = 'weekly' } = req.body
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: '请选择报告统计周期' })
    const analytics = await analyticsData({ section, start_date: startDate, end_date: endDate })
    const [problems] = await pool.query(`
      SELECT i.id, s.section, s.slope_name, i.inspection_date, i.problem_level, i.problem_location,
        i.problems, i.responsible_person, i.rectification_deadline, i.rectification_status
      FROM inspections i LEFT JOIN slopes s ON i.slope_id = s.id
      WHERE COALESCE(i.voided, 0) = 0 AND i.has_problem = 1 AND i.inspection_date BETWEEN ? AND ? ${section ? 'AND s.section = ?' : ''}
      ORDER BY i.inspection_date DESC
    `, section ? [`${startDate} 00:00:00`, `${endDate} 23:59:59`, section] : [`${startDate} 00:00:00`, `${endDate} 23:59:59`])
    const title = `${section || '全项目'}${reportType === 'monthly' ? '月度' : '周度'}边坡巡查报告（${startDate}—${endDate}）`
    const contentJson = {
      source: 'inspection-auto-draft', scope: { section: section || '全部标段', start_date: startDate, end_date: endDate },
      inspection_summary: analytics.summary, problem_levels: analytics.levels, high_frequency_slopes: analytics.slopes,
      problem_register: problems, generated_note: '本草稿由巡查台账自动汇总，提交前需由专业人员复核。',
    }
    await conn.beginTransaction()
    const [result] = await conn.query(`
      INSERT INTO report_records
        (title, report_type, report_period, status, version_no, author, report_date, selected_data, content_json, chart_assets,
         created_by, created_by_name, updated_by, updated_by_name)
      VALUES (?, ?, ?, 'draft', 1, ?, CURDATE(), ?, ?, '[]', ?, ?, ?, ?)
    `, [title, reportType, `${startDate} - ${endDate}`, userName(req), JSON.stringify(problems.map(item => ({ inspection_id: item.id }))),
      JSON.stringify(contentJson), req.user?.userId || null, userName(req), req.user?.userId || null, userName(req)])
    await conn.query(`
      INSERT INTO report_versions
        (report_id, version_no, title, author, report_date, selected_data, content_json, chart_assets, created_by, created_by_name)
      VALUES (?, 1, ?, ?, CURDATE(), ?, ?, '[]', ?, ?)
    `, [result.insertId, title, userName(req), JSON.stringify(problems.map(item => ({ inspection_id: item.id }))),
      JSON.stringify(contentJson), req.user?.userId || null, userName(req)])
    await conn.commit()
    res.status(201).json({ success: true, message: '巡查报告草稿已生成', data: { id: result.insertId, title } })
  } catch (error) {
    await conn.rollback()
    console.error('生成巡查报告失败:', error)
    res.status(500).json({ success: false, message: '生成巡查报告失败' })
  } finally { conn.release() }
})

router.get('/stats/slope/:slope_id', async (req, res) => {
  try {
    const [[stats]] = await pool.query(`
      SELECT COUNT(*) total, SUM(has_problem = 0) normal_count, SUM(has_problem = 1) problem_count,
        SUM(rectification_status IN ('pending','processing','pending_review')) open_rectifications,
        MAX(inspection_date) last_inspection_date FROM inspections WHERE slope_id = ? AND COALESCE(voided, 0) = 0
    `, [req.params.slope_id])
    res.json({ success: true, data: stats })
  } catch (error) {
    console.error('获取边坡巡查统计失败:', error)
    res.status(500).json({ success: false, message: '获取边坡巡查统计失败' })
  }
})

router.post('/', upload.array('images', 10), async (req, res) => {
  const payload = normalizePayload(req)
  const conn = await pool.getConnection()
  try {
    const validationError = await validatePayload(payload)
    if (validationError) { removeStoredImages(payload.newlyUploadedImages); return res.status(400).json({ success: false, message: validationError }) }
    const slope = await slopeContext(payload.slopeId)
    const weather = await weatherContext(slope?.section, payload.inspectionDate)
    await conn.beginTransaction()
    const [result] = await conn.query(`
      INSERT INTO inspections
        (slope_id, inspection_date, inspector, inspection_type, status, content, problems, suggestions, result,
         checklist, has_problem, problem_level, problem_location, images, rectification_status, responsible_person,
         rectification_deadline, longitude, latitude, location_description, weather_snapshot, rainfall_mm, photo_metadata, image_assist)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [payload.slopeId, payload.inspectionDate, payload.inspector, payload.inspectionType, payload.status, payload.content,
      payload.problems, payload.suggestions, payload.result, JSON.stringify(payload.checklist), payload.hasProblem ? 1 : 0,
      payload.problemLevel, payload.problemLocation, JSON.stringify(payload.images), payload.hasProblem ? 'pending' : 'not_required',
      payload.responsiblePerson || null, payload.rectificationDeadline, payload.longitude, payload.latitude, payload.locationDescription || null,
      JSON.stringify(weather.snapshot), weather.rainfall, JSON.stringify(payload.photoMetadata), JSON.stringify(payload.imageAssist)])
    if (payload.hasProblem) {
      await conn.query(`INSERT INTO inspection_rectification_events
        (inspection_id, from_status, to_status, action_note, images, operator_id, operator_name)
        VALUES (?, NULL, 'pending', '巡查发现问题，进入待整改状态', '[]', ?, ?)`, [result.insertId, req.user?.userId || null, userName(req)])
    }
    await advancePlans(conn, payload.slopeId, payload.inspectionDate)
    await conn.commit()
    res.status(201).json({ success: true, message: '巡查记录已保存', id: result.insertId })
  } catch (error) {
    await conn.rollback()
    removeStoredImages(payload.newlyUploadedImages)
    console.error('添加巡查记录失败:', error)
    res.status(500).json({ success: false, message: error.message || '添加巡查记录失败' })
  } finally { conn.release() }
})

router.get('/:id/rectification-events', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM inspection_rectification_events WHERE inspection_id = ? ORDER BY created_at ASC, id ASC', [req.params.id])
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取整改过程失败:', error)
    res.status(500).json({ success: false, message: '获取整改过程失败' })
  }
})

router.put('/:id/rectification', upload.array('images', 10), async (req, res) => {
  const newImages = (req.files || []).map(file => `/uploads/inspections/${file.filename}`)
  const conn = await pool.getConnection()
  try {
    const nextStatus = String(req.body.status || '')
    if (!rectificationStatuses.has(nextStatus)) { removeStoredImages(newImages); return res.status(400).json({ success: false, message: '整改状态不合法' }) }
    const [[record]] = await conn.query('SELECT has_problem, rectification_status, rectification_images FROM inspections WHERE id = ?', [req.params.id])
    if (!record) { removeStoredImages(newImages); return res.status(404).json({ success: false, message: '巡查记录不存在' }) }
    if (!Number(record.has_problem)) { removeStoredImages(newImages); return res.status(400).json({ success: false, message: '无问题记录无需整改' }) }
    const previousImages = parseJsonArray(record.rectification_images)
    const images = [...parseJsonArray(req.body.existing_images), ...newImages]
    const reviewer = ['pending_review', 'closed'].includes(nextStatus) ? String(req.body.reviewer || '').trim() : null
    if (nextStatus === 'closed' && !reviewer) { removeStoredImages(newImages); return res.status(400).json({ success: false, message: '关闭问题前请填写复核人' }) }
    await conn.beginTransaction()
    await conn.query(`
      UPDATE inspections SET rectification_status = ?, responsible_person = ?, rectification_deadline = ?,
        rectification_result = ?, rectification_images = ?, reviewer = ?, review_comment = ?,
        reviewed_at = CASE WHEN ? IN ('pending_review','closed') THEN NOW() ELSE reviewed_at END,
        closed_at = CASE WHEN ? = 'closed' THEN NOW() ELSE NULL END WHERE id = ?
    `, [nextStatus, String(req.body.responsible_person || '').trim() || null, req.body.rectification_deadline || null,
      String(req.body.rectification_result || '').trim() || null, JSON.stringify(images), reviewer,
      String(req.body.review_comment || '').trim() || null, nextStatus, nextStatus, req.params.id])
    await conn.query(`INSERT INTO inspection_rectification_events
      (inspection_id, from_status, to_status, action_note, images, operator_id, operator_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [req.params.id, record.rectification_status, nextStatus,
      String(req.body.action_note || req.body.rectification_result || '').trim() || null, JSON.stringify(newImages), req.user?.userId || null, userName(req)])
    await conn.commit()
    removeStoredImages(previousImages.filter(image => !images.includes(image)))
    res.json({ success: true, message: '整改状态已更新' })
  } catch (error) {
    await conn.rollback()
    removeStoredImages(newImages)
    console.error('更新整改状态失败:', error)
    res.status(500).json({ success: false, message: '更新整改状态失败' })
  } finally { conn.release() }
})

router.put('/:id/void', async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim()
    if (!reason) return res.status(400).json({ success: false, message: '请填写作废原因' })
    const [result] = await pool.query(`
      UPDATE inspections
      SET voided = 1,
          void_reason = ?,
          voided_by = ?,
          voided_by_name = ?,
          voided_at = NOW()
      WHERE id = ? AND COALESCE(voided, 0) = 0
    `, [reason, req.user?.userId || null, userName(req), req.params.id])
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '巡查记录不存在或已作废' })
    res.json({ success: true, message: '巡查记录已作废' })
  } catch (error) {
    console.error('作废巡查记录失败:', error)
    res.status(500).json({ success: false, message: '作废巡查记录失败' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const [[record]] = await pool.query(`SELECT i.*, s.slope_name, s.section, s.start_stake, s.end_stake
      FROM inspections i LEFT JOIN slopes s ON i.slope_id = s.id WHERE i.id = ?`, [req.params.id])
    if (!record) return res.status(404).json({ success: false, message: '巡查记录不存在' })
    res.json({ success: true, data: record })
  } catch (error) {
    console.error('获取巡查详情失败:', error)
    res.status(500).json({ success: false, message: '获取巡查详情失败' })
  }
})

router.put('/:id', upload.array('images', 10), async (req, res) => {
  const payload = normalizePayload(req)
  try {
    const validationError = await validatePayload(payload)
    if (validationError) { removeStoredImages(payload.newlyUploadedImages); return res.status(400).json({ success: false, message: validationError }) }
    const [[existing]] = await pool.query('SELECT images, rectification_status FROM inspections WHERE id = ?', [req.params.id])
    if (!existing) { removeStoredImages(payload.newlyUploadedImages); return res.status(404).json({ success: false, message: '巡查记录不存在' }) }
    const slope = await slopeContext(payload.slopeId)
    const weather = await weatherContext(slope?.section, payload.inspectionDate)
    const nextRectificationStatus = payload.hasProblem ? (existing.rectification_status === 'not_required' ? 'pending' : existing.rectification_status) : 'not_required'
    await pool.query(`
      UPDATE inspections SET slope_id = ?, inspection_date = ?, inspector = ?, inspection_type = ?, status = ?, content = ?,
        problems = ?, suggestions = ?, result = ?, checklist = ?, has_problem = ?, problem_level = ?, problem_location = ?, images = ?,
        rectification_status = ?, responsible_person = ?, rectification_deadline = ?, longitude = ?, latitude = ?, location_description = ?,
        weather_snapshot = ?, rainfall_mm = ?, photo_metadata = ?, image_assist = ? WHERE id = ?
    `, [payload.slopeId, payload.inspectionDate, payload.inspector, payload.inspectionType, payload.status, payload.content,
      payload.problems, payload.suggestions, payload.result, JSON.stringify(payload.checklist), payload.hasProblem ? 1 : 0,
      payload.problemLevel, payload.problemLocation, JSON.stringify(payload.images), nextRectificationStatus,
      payload.responsiblePerson || null, payload.rectificationDeadline, payload.longitude, payload.latitude, payload.locationDescription || null,
      JSON.stringify(weather.snapshot), weather.rainfall, JSON.stringify(payload.photoMetadata), JSON.stringify(payload.imageAssist), req.params.id])
    removeStoredImages(parseJsonArray(existing.images).filter(image => !payload.images.includes(image)))
    res.json({ success: true, message: '巡查记录已更新' })
  } catch (error) {
    removeStoredImages(payload.newlyUploadedImages)
    console.error('更新巡查记录失败:', error)
    res.status(500).json({ success: false, message: error.message || '更新巡查记录失败' })
  }
})

router.delete('/:id', auth.requireRole('admin'), async (req, res) => {
  try {
    const [[record]] = await pool.query('SELECT images, rectification_images FROM inspections WHERE id = ?', [req.params.id])
    if (!record) return res.status(404).json({ success: false, message: '巡查记录不存在' })
    await pool.query('DELETE FROM inspections WHERE id = ?', [req.params.id])
    removeStoredImages([...parseJsonArray(record.images), ...parseJsonArray(record.rectification_images)])
    res.json({ success: true, message: '巡查记录已删除' })
  } catch (error) {
    console.error('删除巡查记录失败:', error)
    res.status(500).json({ success: false, message: '删除巡查记录失败' })
  }
})

router.use((error, _req, res, _next) => {
  console.error('巡查影像上传失败:', error)
  res.status(400).json({ success: false, message: error.message || '巡查影像上传失败' })
})

module.exports = router
