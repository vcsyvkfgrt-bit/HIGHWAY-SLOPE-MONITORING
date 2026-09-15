const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')

const pool = require('../config/database')
const auth = require('../middleware/auth')

const router = express.Router()
const protectedRoot = path.join(__dirname, '..', 'protected_uploads', 'standards')
const evidenceRoot = path.join(__dirname, '..', 'protected_uploads', 'compliance')
fs.mkdirSync(protectedRoot, { recursive: true })
fs.mkdirSync(evidenceRoot, { recursive: true })

const CATEGORIES = new Set([
  'surface_displacement', 'settlement', 'deep_inclinometer', 'crack',
  'anchor_stress', 'rainfall', 'inspection', 'data_processing', 'reporting', 'general',
])
const RESULTS = new Set([
  'pending', 'compliant', 'basically_compliant', 'non_compliant', 'not_applicable', 'to_confirm',
])
const STANDARD_STATUS = new Set(['draft', 'pending_review', 'published', 'deprecated', 'archived'])
const TASK_STATUS = new Set(['draft', 'pending_review', 'pending_rectification', 'pending_recheck', 'closed', 'archived'])

const upload = multer({
  storage: multer.diskStorage({
    destination: protectedRoot,
    filename(_req, file, cb) {
      const base = path.basename(file.originalname, path.extname(file.originalname))
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '_')
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}.pdf`)
    },
  }),
  limits: { fileSize: Number(process.env.UPLOAD_MAX_SIZE || 100 * 1024 * 1024), files: 1 },
  fileFilter(_req, file, cb) {
    const isPdf = file.mimetype === 'application/pdf' || path.extname(file.originalname).toLowerCase() === '.pdf'
    cb(isPdf ? null : new Error('仅支持 PDF 文件'), isPdf)
  },
})

const evidenceUpload = multer({
  storage: multer.diskStorage({
    destination: evidenceRoot,
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase()
      const base = path.basename(file.originalname, ext).replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '_')
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}${ext}`)
    },
  }),
  limits: { fileSize: Number(process.env.UPLOAD_MAX_SIZE || 100 * 1024 * 1024), files: 10 },
})

function asJson(value, fallback = []) {
  if (value == null || value === '') return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function cleanText(value, max = 5000) {
  const text = String(value ?? '').trim()
  return text.length > max ? text.slice(0, max) : text
}

function actor(req) {
  return { id: req.user?.userId || null, name: req.user?.username || null }
}

async function hasPermission(req, code) {
  if (req.user?.role === 'admin') return true
  if (['standards.view', 'compliance.execute', 'compliance.export'].includes(code)) return true
  const [rows] = await pool.query(
    'SELECT 1 FROM standard_user_permissions WHERE user_id = ? AND permission_code = ? LIMIT 1',
    [req.user?.userId || 0, code]
  )
  return rows.length > 0
}

function requirePermission(code) {
  return async (req, res, next) => {
    try {
      if (await hasPermission(req, code)) return next()
      res.status(403).json({ success: false, message: '当前账号没有此项规范管理权限' })
    } catch (error) { next(error) }
  }
}

router.use(auth)

router.get('/meta', (_req, res) => {
  res.json({
    success: true,
    data: {
      categories: [...CATEGORIES],
      permissions: [
        'standards.view', 'standards.manage', 'standards.review',
        'compliance.execute', 'compliance.review', 'compliance.export',
      ],
    },
  })
})

router.get('/permissions/me', async (req, res, next) => {
  try {
    const codes = ['standards.view', 'standards.manage', 'standards.review', 'compliance.execute', 'compliance.review', 'compliance.export']
    const values = {}
    for (const code of codes) values[code] = await hasPermission(req, code)
    res.json({ success: true, data: values })
  } catch (error) { next(error) }
})

router.get('/permissions/users', requirePermission('standards.review'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.username, u.real_name, u.role,
        GROUP_CONCAT(p.permission_code ORDER BY p.permission_code) AS permission_codes
      FROM users u LEFT JOIN standard_user_permissions p ON p.user_id = u.id
      GROUP BY u.id ORDER BY (u.role = 'admin') DESC, u.username`)
    rows.forEach(row => { row.permissions = row.permission_codes ? row.permission_codes.split(',') : [] })
    res.json({ success: true, data: rows })
  } catch (error) { next(error) }
})

router.put('/permissions/users/:id', requirePermission('standards.review'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const allowed = new Set(['standards.view', 'standards.manage', 'standards.review', 'compliance.execute', 'compliance.review', 'compliance.export'])
    const permissions = [...new Set(Array.isArray(req.body.permissions) ? req.body.permissions : [])]
    if (permissions.some(code => !allowed.has(code))) return res.status(400).json({ success: false, message: '包含无效权限代码' })
    await conn.beginTransaction()
    await conn.query('DELETE FROM standard_user_permissions WHERE user_id = ?', [req.params.id])
    for (const code of permissions) {
      await conn.query('INSERT INTO standard_user_permissions (user_id, permission_code, granted_by) VALUES (?, ?, ?)', [req.params.id, code, req.user.userId])
    }
    await conn.commit()
    res.json({ success: true, message: '用户权限已更新' })
  } catch (error) { await conn.rollback(); next(error) } finally { conn.release() }
})

router.get('/dashboard', requirePermission('standards.view'), async (_req, res, next) => {
  try {
    const [[standards]] = await pool.query(`
      SELECT
        SUM(status = 'published') AS active_count,
        SUM(status = 'pending_review') AS pending_standard_count,
        SUM(status = 'deprecated') AS deprecated_count
      FROM standards`)
    const [[tasks]] = await pool.query(`
      SELECT
        SUM(status NOT IN ('closed','archived')) AS active_task_count,
        SUM(status = 'pending_review') AS pending_review_count
      FROM compliance_tasks`)
    await pool.query(`UPDATE compliance_rectifications SET status = 'overdue' WHERE due_date < CURDATE() AND status IN ('pending','in_progress')`)
    const [[rectifications]] = await pool.query(`
      SELECT
        SUM(status NOT IN ('closed')) AS open_rectification_count,
        SUM(status = 'overdue') AS overdue_count
      FROM compliance_rectifications`)
    const [categories] = await pool.query(`
      SELECT category, COUNT(*) AS count FROM standards WHERE status = 'published' GROUP BY category ORDER BY count DESC`)
    const [recentTasks] = await pool.query(`
      SELECT t.*, s.slope_name FROM compliance_tasks t
      LEFT JOIN slopes s ON s.id = t.slope_id
      ORDER BY t.updated_at DESC LIMIT 8`)
    res.json({ success: true, data: { ...standards, ...tasks, ...rectifications, categories, recent_tasks: recentTasks } })
  } catch (error) { next(error) }
})

router.get('/library', requirePermission('standards.view'), async (req, res, next) => {
  try {
    const { q, category, status, page = 1, limit = 20 } = req.query
    const where = []
    const params = []
    if (category) { where.push('s.category = ?'); params.push(category) }
    if (status) { where.push('s.status = ?'); params.push(status) }
    if (q) {
      where.push(`(s.name LIKE ? OR s.code LIKE ? OR s.publisher LIKE ? OR s.applicable_scope LIKE ? OR v.full_text LIKE ?)`)
      const term = `%${q}%`
      params.push(term, term, term, term, term)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const offset = (Math.max(Number(page), 1) - 1) * Math.min(Math.max(Number(limit), 1), 100)
    const pageSize = Math.min(Math.max(Number(limit), 1), 100)
    const [[count]] = await pool.query(`SELECT COUNT(DISTINCT s.id) AS total FROM standards s LEFT JOIN standard_versions v ON v.id = s.current_version_id ${whereSql}`, params)
    const [rows] = await pool.query(`
      SELECT s.*, v.page_count, v.file_asset_id, v.id AS version_id,
        (SELECT COUNT(*) FROM standard_clauses c WHERE c.version_id = v.id) AS clause_count
      FROM standards s
      LEFT JOIN standard_versions v ON v.id = s.current_version_id
      ${whereSql}
      ORDER BY FIELD(s.status, 'pending_review','published','draft','deprecated','archived'), s.updated_at DESC
      LIMIT ? OFFSET ?`, [...params, pageSize, offset])
    res.json({ success: true, data: rows, total: Number(count.total || 0) })
  } catch (error) { next(error) }
})

router.post('/library', requirePermission('standards.manage'), upload.single('file'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const required = ['name', 'code', 'category', 'publisher', 'effective_date', 'applicable_scope', 'version_label']
    const missing = required.filter(key => !cleanText(req.body[key]))
    if (missing.length) throw Object.assign(new Error(`缺少必填信息：${missing.join('、')}`), { statusCode: 400 })
    if (!CATEGORIES.has(req.body.category)) throw Object.assign(new Error('规范分类无效'), { statusCode: 400 })
    if (!req.file) throw Object.assign(new Error('请选择 PDF 文件'), { statusCode: 400 })

    const pages = asJson(req.body.page_text, [])
    const fullText = pages.map(item => typeof item === 'string' ? item : item?.text || '').join('\n\n')
    const who = actor(req)
    await conn.beginTransaction()
    const [asset] = await conn.query(
      `INSERT INTO file_assets (module, business_id, original_name, file_name, file_path, mime_type, file_size, uploader_id, uploader_name)
       VALUES ('standards', NULL, ?, ?, ?, 'application/pdf', ?, ?, ?)`,
      [req.file.originalname, req.file.filename, `protected://standards/${req.file.filename}`, req.file.size, who.id, who.name]
    )
    const [standard] = await conn.query(
      `INSERT INTO standards
        (name, code, category, standard_level, publisher, publish_date, effective_date, applicable_scope, version_label, replacement_standard_id, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cleanText(req.body.name, 255), cleanText(req.body.code, 120), req.body.category,
        cleanText(req.body.standard_level, 40) || 'industry', cleanText(req.body.publisher, 255),
        req.body.publish_date || null, req.body.effective_date, cleanText(req.body.applicable_scope),
        cleanText(req.body.version_label, 80), req.body.replacement_standard_id || null, who.id, who.name]
    )
    const [version] = await conn.query(
      `INSERT INTO standard_versions
        (standard_id, version_no, version_label, file_asset_id, page_count, full_text, page_text, change_note, created_by, created_by_name)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [standard.insertId, cleanText(req.body.version_label, 80), asset.insertId, pages.length, fullText || null,
        pages.length ? JSON.stringify(pages) : null, cleanText(req.body.change_note), who.id, who.name]
    )
    await conn.query('UPDATE standards SET current_version_id = ? WHERE id = ?', [version.insertId, standard.insertId])
    await conn.query('UPDATE file_assets SET business_id = ? WHERE id = ?', [standard.insertId, asset.insertId])
    await conn.commit()
    res.status(201).json({ success: true, message: fullText ? '规范已上传并建立全文索引' : '规范已上传；扫描件暂不可全文检索', data: { id: standard.insertId } })
  } catch (error) {
    await conn.rollback()
    if (req.file?.path) fs.unlink(req.file.path, () => {})
    if (error.code === 'ER_DUP_ENTRY') error = Object.assign(new Error('同一规范编号和版本已经存在'), { statusCode: 409 })
    error.status = error.statusCode || error.status
    next(error)
  } finally { conn.release() }
})

router.post('/library/:id/versions', requirePermission('standards.manage'), upload.single('file'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    if (!req.file || !cleanText(req.body.version_label) || !req.body.effective_date) {
      throw Object.assign(new Error('请选择 PDF，并填写版本标识和实施日期'), { status: 400 })
    }
    const [[standard]] = await conn.query('SELECT * FROM standards WHERE id = ?', [req.params.id])
    if (!standard) throw Object.assign(new Error('规范不存在'), { status: 404 })
    const pages = asJson(req.body.page_text, [])
    const fullText = pages.map(item => typeof item === 'string' ? item : item?.text || '').join('\n\n')
    const [[counter]] = await conn.query('SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version FROM standard_versions WHERE standard_id = ?', [req.params.id])
    const who = actor(req)
    await conn.beginTransaction()
    const [asset] = await conn.query(
      `INSERT INTO file_assets (module, business_id, original_name, file_name, file_path, mime_type, file_size, uploader_id, uploader_name)
       VALUES ('standards', ?, ?, ?, ?, 'application/pdf', ?, ?, ?)`,
      [req.params.id, req.file.originalname, req.file.filename, `protected://standards/${req.file.filename}`, req.file.size, who.id, who.name]
    )
    const [version] = await conn.query(
      `INSERT INTO standard_versions
        (standard_id, version_no, version_label, file_asset_id, page_count, full_text, page_text, change_note, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, counter.next_version, cleanText(req.body.version_label, 80), asset.insertId, pages.length,
        fullText || null, pages.length ? JSON.stringify(pages) : null, cleanText(req.body.change_note), who.id, who.name]
    )
    await conn.query(
      `UPDATE standards SET current_version_id = ?, version_label = ?, effective_date = ?, status = 'draft', reviewed_by = NULL,
       reviewed_by_name = NULL, reviewed_at = NULL WHERE id = ?`,
      [version.insertId, cleanText(req.body.version_label, 80), req.body.effective_date, req.params.id]
    )
    await conn.commit()
    res.status(201).json({ success: true, message: '新版本已上传，请重新提交审核', data: { version_id: version.insertId } })
  } catch (error) {
    await conn.rollback()
    if (req.file?.path) fs.unlink(req.file.path, () => {})
    next(error)
  } finally { conn.release() }
})

router.get('/library/:id', requirePermission('standards.view'), async (req, res, next) => {
  try {
    const [[standard]] = await pool.query(`
      SELECT s.*, v.id AS version_id, v.version_no, v.page_count, v.file_asset_id, v.page_text, v.change_note,
        f.original_name, f.file_size
      FROM standards s
      LEFT JOIN standard_versions v ON v.id = COALESCE(?, s.current_version_id)
      LEFT JOIN file_assets f ON f.id = v.file_asset_id
      WHERE s.id = ? AND (v.standard_id = s.id OR v.id IS NULL)`, [req.query.version_id || null, req.params.id])
    if (!standard) return res.status(404).json({ success: false, message: '规范不存在' })
    standard.page_text = asJson(standard.page_text, [])
    const [clauses] = await pool.query('SELECT * FROM standard_clauses WHERE version_id = ? ORDER BY page_no, clause_no, id', [standard.version_id])
    const [annotations] = await pool.query(`
      SELECT * FROM standard_annotations
      WHERE version_id = ? AND (visibility = 'project' OR author_id = ?)
      ORDER BY page_no, created_at DESC`, [standard.version_id, req.user.userId])
    const [versions] = await pool.query(`
      SELECT v.id, v.version_no, v.version_label, v.page_count, v.change_note, v.created_at, f.original_name
      FROM standard_versions v JOIN file_assets f ON f.id = v.file_asset_id
      WHERE v.standard_id = ? ORDER BY v.version_no DESC`, [standard.id])
    res.json({ success: true, data: { standard, clauses, annotations, versions } })
  } catch (error) { next(error) }
})

router.get('/library/:id/file', requirePermission('standards.view'), async (req, res, next) => {
  try {
    const [[row]] = await pool.query(`
      SELECT f.file_name, f.original_name FROM standards s
      JOIN standard_versions v ON v.id = COALESCE(?, s.current_version_id)
      JOIN file_assets f ON f.id = v.file_asset_id WHERE s.id = ? AND v.standard_id = s.id`, [req.query.version_id || null, req.params.id])
    if (!row) return res.status(404).json({ success: false, message: '规范文件不存在' })
    const target = path.join(protectedRoot, path.basename(row.file_name))
    if (!fs.existsSync(target)) return res.status(404).json({ success: false, message: '规范原文件已丢失' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(row.original_name)}`)
    res.sendFile(target)
  } catch (error) { next(error) }
})

router.put('/library/:id/status', requirePermission('standards.manage'), async (req, res, next) => {
  try {
    const status = req.body.status
    if (!STANDARD_STATUS.has(status)) return res.status(400).json({ success: false, message: '规范状态无效' })
    if (['published', 'deprecated', 'archived'].includes(status) && !(await hasPermission(req, 'standards.review'))) {
      return res.status(403).json({ success: false, message: '发布、废止和归档需要规范审核权限' })
    }
    const who = actor(req)
    const [result] = await pool.query(
      `UPDATE standards SET status = ?, reviewed_by = ?, reviewed_by_name = ?, reviewed_at = IF(? IN ('published','deprecated','archived'), NOW(), reviewed_at) WHERE id = ?`,
      [status, who.id, who.name, status, req.params.id]
    )
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '规范不存在' })
    res.json({ success: true, message: '规范状态已更新' })
  } catch (error) { next(error) }
})

router.delete('/library/:id', requirePermission('standards.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const [[standard]] = await conn.query('SELECT status, current_version_id FROM standards WHERE id = ?', [req.params.id])
    if (!standard) return res.status(404).json({ success: false, message: '规范不存在' })
    const [[refs]] = await conn.query(`SELECT COUNT(*) AS count FROM compliance_task_items WHERE standard_id = ?`, [req.params.id])
    if (standard.status !== 'draft' || Number(refs.count) > 0) return res.status(409).json({ success: false, message: '只有未被引用的草稿规范可以删除；其他规范请作废或归档' })
    const [[file]] = await conn.query(`SELECT f.file_name FROM standard_versions v JOIN file_assets f ON f.id = v.file_asset_id WHERE v.id = ?`, [standard.current_version_id])
    await conn.beginTransaction()
    await conn.query('DELETE FROM standards WHERE id = ?', [req.params.id])
    if (file) await conn.query('DELETE FROM file_assets WHERE file_name = ? AND module = ?', [file.file_name, 'standards'])
    await conn.commit()
    if (file) fs.unlink(path.join(protectedRoot, path.basename(file.file_name)), () => {})
    res.json({ success: true, message: '草稿规范已删除' })
  } catch (error) { await conn.rollback(); next(error) } finally { conn.release() }
})

router.post('/library/:id/clauses', requirePermission('standards.manage'), async (req, res, next) => {
  try {
    const [[standard]] = await pool.query('SELECT current_version_id FROM standards WHERE id = ?', [req.params.id])
    if (!standard) return res.status(404).json({ success: false, message: '规范不存在' })
    if (!req.body.content || !req.body.page_no) return res.status(400).json({ success: false, message: '请填写条文内容和页码' })
    const who = actor(req)
    const [result] = await pool.query(
      `INSERT INTO standard_clauses (standard_id, version_id, clause_no, title, page_no, content, keywords, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, standard.current_version_id, cleanText(req.body.clause_no, 80), cleanText(req.body.title, 255),
        Number(req.body.page_no), cleanText(req.body.content), cleanText(req.body.keywords, 500), who.id, who.name]
    )
    res.status(201).json({ success: true, message: '条文已保存', data: { id: result.insertId } })
  } catch (error) { next(error) }
})

router.post('/library/:id/annotations', requirePermission('standards.view'), async (req, res, next) => {
  try {
    const [[standard]] = await pool.query('SELECT current_version_id FROM standards WHERE id = ?', [req.params.id])
    if (!standard) return res.status(404).json({ success: false, message: '规范不存在' })
    const visibility = req.body.visibility === 'project' && await hasPermission(req, 'standards.review') ? 'project' : 'private'
    if (!cleanText(req.body.note)) return res.status(400).json({ success: false, message: '请填写批注内容' })
    const who = actor(req)
    const [result] = await pool.query(
      `INSERT INTO standard_annotations (standard_id, version_id, page_no, selected_text, note, visibility, author_id, author_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, standard.current_version_id, Number(req.body.page_no || 1), cleanText(req.body.selected_text), cleanText(req.body.note), visibility, who.id, who.name]
    )
    res.status(201).json({ success: true, message: visibility === 'project' ? '项目级解读已发布' : '个人批注已保存', data: { id: result.insertId } })
  } catch (error) { next(error) }
})

router.get('/checklists', requirePermission('standards.view'), async (req, res, next) => {
  try {
    const params = []
    const where = []
    if (req.query.category) { where.push('t.category = ?'); params.push(req.query.category) }
    if (req.query.status) { where.push('t.status = ?'); params.push(req.query.status) }
    const [rows] = await pool.query(`
      SELECT t.*, COUNT(i.id) AS item_count FROM standard_checklist_templates t
      LEFT JOIN standard_checklist_items i ON i.template_id = t.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY t.id ORDER BY t.updated_at DESC`, params)
    res.json({ success: true, data: rows })
  } catch (error) { next(error) }
})

router.get('/checklists/:id', requirePermission('standards.view'), async (req, res, next) => {
  try {
    const [[template]] = await pool.query('SELECT * FROM standard_checklist_templates WHERE id = ?', [req.params.id])
    if (!template) return res.status(404).json({ success: false, message: '核查清单不存在' })
    const [items] = await pool.query(`
      SELECT i.*, s.name AS standard_name, s.code AS standard_code FROM standard_checklist_items i
      LEFT JOIN standards s ON s.id = i.standard_id WHERE i.template_id = ? ORDER BY i.sort_order, i.id`, [req.params.id])
    res.json({ success: true, data: { template, items } })
  } catch (error) { next(error) }
})

router.post('/checklists', requirePermission('standards.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    if (!cleanText(req.body.name) || !CATEGORIES.has(req.body.category)) return res.status(400).json({ success: false, message: '请填写清单名称并选择监测类型' })
    const items = Array.isArray(req.body.items) ? req.body.items : []
    if (!items.length) return res.status(400).json({ success: false, message: '核查清单至少需要一个检查项' })
    const who = actor(req)
    await conn.beginTransaction()
    const [template] = await conn.query(
      `INSERT INTO standard_checklist_templates (name, category, applicable_stage, description, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cleanText(req.body.name, 255), req.body.category, cleanText(req.body.applicable_stage, 80), cleanText(req.body.description), who.id, who.name]
    )
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      if (!cleanText(item.item_text)) continue
      await conn.query(
        `INSERT INTO standard_checklist_items
          (template_id, standard_id, version_id, clause_id, item_text, basis_text, page_no, sort_order, required)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [template.insertId, item.standard_id || null, item.version_id || null, item.clause_id || null,
          cleanText(item.item_text), cleanText(item.basis_text), item.page_no || null, index, item.required === false ? 0 : 1]
      )
    }
    await conn.commit()
    res.status(201).json({ success: true, message: '核查清单已创建', data: { id: template.insertId } })
  } catch (error) { await conn.rollback(); next(error) } finally { conn.release() }
})

router.put('/checklists/:id/status', requirePermission('standards.review'), async (req, res, next) => {
  try {
    if (!['draft', 'published', 'archived'].includes(req.body.status)) return res.status(400).json({ success: false, message: '清单状态无效' })
    await pool.query('UPDATE standard_checklist_templates SET status = ? WHERE id = ?', [req.body.status, req.params.id])
    res.json({ success: true, message: '清单状态已更新' })
  } catch (error) { next(error) }
})

router.get('/tasks', requirePermission('compliance.execute'), async (req, res, next) => {
  try {
    const where = []
    const params = []
    for (const key of ['status', 'section', 'monitor_type']) if (req.query[key]) { where.push(`t.${key} = ?`); params.push(req.query[key]) }
    const [rows] = await pool.query(`
      SELECT t.*, p.project_name, s.slope_name,
        COUNT(i.id) AS item_count,
        SUM(i.result = 'non_compliant') AS non_compliant_count,
        SUM(i.result = 'pending') AS pending_item_count
      FROM compliance_tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN slopes s ON s.id = t.slope_id
      LEFT JOIN compliance_task_items i ON i.task_id = t.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY t.id ORDER BY t.updated_at DESC`, params)
    res.json({ success: true, data: rows })
  } catch (error) { next(error) }
})

router.post('/tasks', requirePermission('compliance.execute'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    if (!cleanText(req.body.title) || !req.body.monitor_type) return res.status(400).json({ success: false, message: '请填写任务名称并选择监测类型' })
    const who = actor(req)
    const taskNo = `HG-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Date.now().toString().slice(-6)}`
    await conn.beginTransaction()
    const [task] = await conn.query(
      `INSERT INTO compliance_tasks
        (task_no, title, checklist_template_id, project_id, section, slope_id, monitor_type, implementation_stage, inspector_id, inspector_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskNo, cleanText(req.body.title, 255), req.body.checklist_template_id || null, req.body.project_id || null,
        cleanText(req.body.section, 100), req.body.slope_id || null, req.body.monitor_type,
        cleanText(req.body.implementation_stage, 80), who.id, who.name]
    )
    let items = Array.isArray(req.body.items) ? req.body.items : []
    if (!items.length && req.body.checklist_template_id) {
      const [templateItems] = await conn.query('SELECT * FROM standard_checklist_items WHERE template_id = ? ORDER BY sort_order, id', [req.body.checklist_template_id])
      items = templateItems
    }
    if (!items.length) throw Object.assign(new Error('请选择包含检查项的核查清单'), { status: 400 })
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      await conn.query(
        `INSERT INTO compliance_task_items
          (task_id, checklist_item_id, standard_id, version_id, clause_id, item_text, basis_text, page_no, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [task.insertId, item.id || item.checklist_item_id || null, item.standard_id || null, item.version_id || null,
          item.clause_id || null, cleanText(item.item_text), cleanText(item.basis_text), item.page_no || null, index]
      )
    }
    await conn.commit()
    res.status(201).json({ success: true, message: '符合性核查任务已创建', data: { id: task.insertId, task_no: taskNo } })
  } catch (error) { await conn.rollback(); next(error) } finally { conn.release() }
})

router.get('/tasks/:id', requirePermission('compliance.execute'), async (req, res, next) => {
  try {
    const [[task]] = await pool.query(`
      SELECT t.*, p.project_name, s.slope_name FROM compliance_tasks t
      LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN slopes s ON s.id = t.slope_id WHERE t.id = ?`, [req.params.id])
    if (!task) return res.status(404).json({ success: false, message: '核查任务不存在' })
    const [items] = await pool.query(`
      SELECT i.*, s.name AS standard_name, s.code AS standard_code, s.version_label
      FROM compliance_task_items i LEFT JOIN standards s ON s.id = i.standard_id
      WHERE i.task_id = ? ORDER BY i.sort_order, i.id`, [req.params.id])
    const [rectifications] = await pool.query('SELECT * FROM compliance_rectifications WHERE task_id = ? ORDER BY due_date, id', [req.params.id])
    items.forEach(item => { item.evidence = asJson(item.evidence, []) })
    rectifications.forEach(item => { item.evidence = asJson(item.evidence, []) })
    res.json({ success: true, data: { task, items, rectifications } })
  } catch (error) { next(error) }
})

router.post('/tasks/:id/evidence', requirePermission('compliance.execute'), evidenceUpload.array('files', 10), async (req, res, next) => {
  try {
    const [[task]] = await pool.query('SELECT id FROM compliance_tasks WHERE id = ?', [req.params.id])
    if (!task) {
      for (const file of req.files || []) fs.unlink(file.path, () => {})
      return res.status(404).json({ success: false, message: '核查任务不存在' })
    }
    const files = (req.files || []).map(file => ({
      name: file.originalname,
      file_name: file.filename,
      mime_type: file.mimetype,
      size: file.size,
      url: `/api/standards/evidence/${encodeURIComponent(file.filename)}`,
    }))
    res.status(201).json({ success: true, message: '证据材料已上传', data: files })
  } catch (error) { next(error) }
})

router.get('/evidence/:fileName', requirePermission('compliance.execute'), (req, res) => {
  const safeName = path.basename(req.params.fileName)
  const target = path.join(evidenceRoot, safeName)
  if (!fs.existsSync(target)) return res.status(404).json({ success: false, message: '证据文件不存在' })
  res.sendFile(target)
})

router.put('/tasks/:id/items', requirePermission('compliance.execute'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : []
    const who = actor(req)
    await conn.beginTransaction()
    for (const item of items) {
      if (!RESULTS.has(item.result)) throw Object.assign(new Error('检查结果无效'), { status: 400 })
      await conn.query(
        `UPDATE compliance_task_items SET result = ?, finding = ?, evidence = ?, updated_by = ?, updated_by_name = ?
         WHERE id = ? AND task_id = ?`,
        [item.result, cleanText(item.finding), JSON.stringify(item.evidence || []), who.id, who.name, item.id, req.params.id]
      )
    }
    await conn.commit()
    res.json({ success: true, message: '核查结果已保存' })
  } catch (error) { await conn.rollback(); next(error) } finally { conn.release() }
})

router.post('/tasks/:id/transition', requirePermission('compliance.execute'), async (req, res, next) => {
  try {
    const [[task]] = await pool.query('SELECT * FROM compliance_tasks WHERE id = ?', [req.params.id])
    if (!task) return res.status(404).json({ success: false, message: '核查任务不存在' })
    const actionMap = {
      submit: ['draft', 'pending_review'],
      request_rectification: ['pending_review', 'pending_rectification'],
      submit_recheck: ['pending_rectification', 'pending_recheck'],
      close: ['pending_review,pending_recheck', 'closed'],
      archive: ['closed', 'archived'],
    }
    const rule = actionMap[req.body.action]
    if (!rule) return res.status(400).json({ success: false, message: '流转动作无效' })
    const allowedSources = rule[0].split(',')
    if (!allowedSources.includes(task.status)) return res.status(409).json({ success: false, message: `当前状态不能执行此操作：${task.status}` })
    if (['request_rectification', 'close', 'archive'].includes(req.body.action) && !(await hasPermission(req, 'compliance.review'))) {
      return res.status(403).json({ success: false, message: '此操作需要核查复核权限' })
    }
    if (req.body.action === 'submit') {
      const [[pending]] = await pool.query(`SELECT COUNT(*) AS count FROM compliance_task_items WHERE task_id = ? AND result = 'pending'`, [req.params.id])
      if (Number(pending.count)) return res.status(409).json({ success: false, message: '仍有未填写结论的检查项' })
    }
    const who = actor(req)
    await pool.query(
      `UPDATE compliance_tasks SET status = ?, reviewer_id = IF(? IN ('request_rectification','close','archive'), ?, reviewer_id),
       reviewer_name = IF(? IN ('request_rectification','close','archive'), ?, reviewer_name), review_comment = ?,
       submitted_at = IF(? = 'submit', NOW(), submitted_at), closed_at = IF(? = 'close', NOW(), closed_at) WHERE id = ?`,
      [rule[1], req.body.action, who.id, req.body.action, who.name, cleanText(req.body.review_comment), req.body.action, req.body.action, req.params.id]
    )
    res.json({ success: true, message: '核查任务状态已更新', data: { status: rule[1] } })
  } catch (error) { next(error) }
})

router.post('/tasks/:id/rectifications', requirePermission('compliance.review'), async (req, res, next) => {
  try {
    if (!req.body.task_item_id || !cleanText(req.body.responsible_person) || !req.body.due_date) return res.status(400).json({ success: false, message: '请填写责任人和整改期限' })
    const [[item]] = await pool.query(`SELECT id FROM compliance_task_items WHERE id = ? AND task_id = ? AND result = 'non_compliant'`, [req.body.task_item_id, req.params.id])
    if (!item) return res.status(409).json({ success: false, message: '只能为该任务的不符合项创建整改任务' })
    const who = actor(req)
    await pool.query(
      `INSERT INTO compliance_rectifications
        (task_id, task_item_id, responsible_person, due_date, action_plan, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE responsible_person = VALUES(responsible_person), due_date = VALUES(due_date), action_plan = VALUES(action_plan)`,
      [req.params.id, item.id, cleanText(req.body.responsible_person, 100), req.body.due_date, cleanText(req.body.action_plan), who.id, who.name]
    )
    await pool.query(`UPDATE compliance_tasks SET status = 'pending_rectification' WHERE id = ?`, [req.params.id])
    res.status(201).json({ success: true, message: '整改任务已建立' })
  } catch (error) { next(error) }
})

router.get('/rectifications', requirePermission('compliance.execute'), async (req, res, next) => {
  try {
    await pool.query(`UPDATE compliance_rectifications SET status = 'overdue' WHERE due_date < CURDATE() AND status IN ('pending','in_progress')`)
    const params = []
    let where = ''
    if (req.query.status) { where = 'WHERE r.status = ?'; params.push(req.query.status) }
    const [rows] = await pool.query(`
      SELECT r.*, t.task_no, t.title, t.section, t.monitor_type, i.item_text, i.basis_text, i.page_no
      FROM compliance_rectifications r JOIN compliance_tasks t ON t.id = r.task_id
      JOIN compliance_task_items i ON i.id = r.task_item_id ${where}
      ORDER BY FIELD(r.status, 'overdue','pending','in_progress','pending_recheck','closed'), r.due_date`, params)
    rows.forEach(item => { item.evidence = asJson(item.evidence, []) })
    res.json({ success: true, data: rows })
  } catch (error) { next(error) }
})

router.put('/rectifications/:id', requirePermission('compliance.execute'), async (req, res, next) => {
  try {
    const status = req.body.status
    if (!['pending', 'in_progress', 'pending_recheck', 'closed'].includes(status)) return res.status(400).json({ success: false, message: '整改状态无效' })
    if (status === 'closed' && !(await hasPermission(req, 'compliance.review'))) return res.status(403).json({ success: false, message: '关闭整改需要核查复核权限' })
    const who = actor(req)
    await pool.query(
      `UPDATE compliance_rectifications SET status = ?, action_plan = COALESCE(?, action_plan), rectification_result = ?, evidence = ?,
       reviewer_id = IF(? = 'closed', ?, reviewer_id), reviewer_name = IF(? = 'closed', ?, reviewer_name), review_comment = ?,
       completed_at = IF(? = 'pending_recheck', NOW(), completed_at), reviewed_at = IF(? = 'closed', NOW(), reviewed_at)
       WHERE id = ?`,
      [status, cleanText(req.body.action_plan) || null, cleanText(req.body.rectification_result), JSON.stringify(req.body.evidence || []),
        status, who.id, status, who.name, cleanText(req.body.review_comment), status, status, req.params.id]
    )
    res.json({ success: true, message: '整改状态已更新' })
  } catch (error) { next(error) }
})

router.use((error, _req, res, next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: '单个规范文件不能超过 100MB' })
  if (error instanceof multer.MulterError || error?.message === '仅支持 PDF 文件') return res.status(400).json({ success: false, message: error.message })
  next(error)
})

module.exports = router
