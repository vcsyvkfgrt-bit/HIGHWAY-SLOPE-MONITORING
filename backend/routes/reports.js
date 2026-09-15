const express = require('express')
const fs = require('fs')
const os = require('os')
const path = require('path')
const multer = require('multer')
const pool = require('../config/database')
const auth = require('../middleware/auth')
const { renderWordTemplate, resolveUploadedTemplate } = require('../utils/wordTemplateRenderer')
const { convertWordToPdf } = require('../utils/wordPdfPreview')
const { inspectReportQuality } = require('../utils/reportQuality')

const router = express.Router()

const previewUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    const isDocx = file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(file.originalname)
    callback(isDocx ? null : new Error('PDF 预览仅支持 DOCX 文件'), isDocx)
  },
})

router.use(auth)

function userName(req) {
  return req.user?.real_name || req.user?.username || null
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeReport(row) {
  return {
    ...row,
    selected_data: parseJson(row.selected_data, []),
    template_snapshot: parseJson(row.template_snapshot, null),
    content_json: parseJson(row.content_json, {}),
    chart_assets: parseJson(row.chart_assets, []),
  }
}

async function sendTemplateWord(report, res) {
  const snapshot = report.template_snapshot || {}
  const fileAssetId = snapshot.fileAssetId || snapshot.file_asset_id
  const sourceFormat = snapshot.sourceFormat || snapshot.dataBindings?.__sourceFormat

  if (snapshot.templateKind !== 'word' || sourceFormat === 'pdf' || !fileAssetId) {
    res.status(409).json({
      success: false,
      message: sourceFormat === 'pdf'
        ? 'PDF 模板用于结构参考，不能保留为可编辑 Word 版式，请选择 DOCX 模板'
        : '当前报告没有可用于高保真导出的 DOCX 原模板',
    })
    return
  }

  const [[asset]] = await pool.query(
    'SELECT id, original_name, file_path, mime_type FROM file_assets WHERE id = ? AND module = ?',
    [fileAssetId, 'document-template']
  )
  if (!asset) {
    res.status(404).json({ success: false, message: 'Word 模板原文件不存在' })
    return
  }

  const templatePath = resolveUploadedTemplate(asset.file_path)
  if (!fs.existsSync(templatePath)) {
    res.status(404).json({ success: false, message: 'Word 模板原文件已丢失，请重新上传模板' })
    return
  }

  const output = await renderWordTemplate(templatePath, report)
  const safeName = String(report.title || '监测报告').replace(/[\\/:*?"<>|]/g, '_')
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.docx`)
  res.setHeader('Content-Length', output.length)
  res.send(Buffer.from(output))
}

router.get('/', async (req, res) => {
  try {
    const { report_type, status, q, include_archived = 'false', limit = '200' } = req.query
    const params = []
    const where = []

    let sql = `
      SELECT
        id, title, report_type, report_period, status, version_no,
        author, reviewer, report_date, created_by_name, updated_by_name,
        archived_at, created_at, updated_at
      FROM report_records
    `

    if (report_type) {
      where.push('report_type = ?')
      params.push(report_type)
    }
    if (status) {
      where.push('status = ?')
      params.push(status)
    }
    if (include_archived !== 'true') {
      where.push('status <> ?')
      params.push('archived')
    }
    if (q) {
      where.push('(title LIKE ? OR author LIKE ? OR reviewer LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }

    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ' ORDER BY updated_at DESC LIMIT ?'
    params.push(Math.min(Number(limit) || 200, 1000))

    const [rows] = await pool.query(sql, params)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取报告列表失败:', error)
    res.status(500).json({ success: false, message: '获取报告列表失败' })
  }
})

router.post('/preview-pdf', previewUpload.single('file'), async (req, res) => {
  let tempDir = null
  try {
    if (!req.file?.buffer) return res.status(400).json({ success: false, message: '缺少待预览的 Word 文件' })
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'slope-report-preview-'))
    const inputPath = path.join(tempDir, 'report.docx')
    const outputPath = path.join(tempDir, 'report.pdf')
    await fs.promises.writeFile(inputPath, req.file.buffer)
    await convertWordToPdf(inputPath, outputPath)
    const pdf = await fs.promises.readFile(outputPath)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'inline; filename="report-preview.pdf"')
    return res.send(pdf)
  } catch (error) {
    console.error('生成 PDF 预览失败:', error)
    const detail = String(error?.stderr || error?.message || '')
    const message = /ActiveX|COM|Word\.Application|class not registered|Invalid class/i.test(detail)
      ? '服务器无法调用 Microsoft Word，请安装桌面版 Word 或在服务器配置 PDF 转换服务'
      : (error?.message || '生成 PDF 预览失败')
    return res.status(500).json({ success: false, message })
  } finally {
    if (tempDir) {
      const tempRoot = path.resolve(os.tmpdir())
      const resolved = path.resolve(tempDir)
      if (path.dirname(resolved) === tempRoot && path.basename(resolved).startsWith('slope-report-preview-')) {
        await fs.promises.rm(resolved, { recursive: true, force: true }).catch(() => {})
      }
    }
  }
})

router.post('/quality-preview', (req, res) => {
  const report = normalizeReport(req.body || {})
  res.json({ success: true, data: inspectReportQuality(report) })
})

router.get('/:id/export-word', async (req, res) => {
  try {
    const { id } = req.params
    const [[row]] = await pool.query('SELECT * FROM report_records WHERE id = ?', [id])
    if (!row) return res.status(404).json({ success: false, message: '报告不存在' })

    const report = normalizeReport(row)
    return await sendTemplateWord(report, res)
  } catch (error) {
    console.error('按 Word 模板导出失败:', error)
    const errors = Array.isArray(error) ? error : [error]
    const message = errors.map((item) => item?.message || String(item)).slice(0, 3).join('；')
    return res.status(400).json({ success: false, message: message || '按 Word 模板导出失败' })
  }
})

router.post('/export-word-preview', async (req, res) => {
  try {
    const report = normalizeReport(req.body || {})
    return await sendTemplateWord(report, res)
  } catch (error) {
    console.error('按 Word 模板预览导出失败:', error)
    const errors = Array.isArray(error) ? error : [error]
    const message = errors.map((item) => item?.message || String(item)).slice(0, 3).join('；')
    return res.status(400).json({ success: false, message: message || '按 Word 模板预览导出失败' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [[report]] = await pool.query('SELECT * FROM report_records WHERE id = ?', [id])
    if (!report) return res.status(404).json({ success: false, message: '报告不存在' })

    const [versions] = await pool.query(
      `SELECT id, version_no, title, author, reviewer, report_date, created_by_name, created_at
       FROM report_versions
       WHERE report_id = ?
       ORDER BY version_no DESC`,
      [id]
    )

    res.json({ success: true, data: { report: normalizeReport(report), versions } })
  } catch (error) {
    console.error('获取报告详情失败:', error)
    res.status(500).json({ success: false, message: '获取报告详情失败' })
  }
})

router.get('/:id/quality', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM report_records WHERE id = ?', [req.params.id])
    if (!row) return res.status(404).json({ success: false, message: '报告不存在' })
    res.json({ success: true, data: inspectReportQuality(normalizeReport(row)) })
  } catch (error) {
    console.error('报告质量检查失败:', error)
    res.status(500).json({ success: false, message: '报告质量检查失败' })
  }
})

router.get('/:id/versions/:versionNo', async (req, res) => {
  try {
    const [[row]] = await pool.query(
      'SELECT * FROM report_versions WHERE report_id = ? AND version_no = ?',
      [req.params.id, req.params.versionNo]
    )
    if (!row) return res.status(404).json({ success: false, message: '报告版本不存在' })
    res.json({ success: true, data: normalizeReport(row) })
  } catch (error) {
    console.error('获取报告版本失败:', error)
    res.status(500).json({ success: false, message: '获取报告版本失败' })
  }
})

router.post('/', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const {
      title,
      report_type = 'weekly',
      report_period,
      author,
      reviewer,
      report_date,
      selected_data = [],
      template_snapshot = null,
      content_json = {},
      chart_assets = [],
      status = 'draft',
    } = req.body

    if (!title) return res.status(400).json({ success: false, message: '缺少报告标题' })

    await conn.beginTransaction()
    const [result] = await conn.query(
      `INSERT INTO report_records
        (title, report_type, report_period, status, version_no, author, reviewer, report_date,
         selected_data, template_snapshot, content_json, chart_assets, created_by, created_by_name, updated_by, updated_by_name)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        report_type,
        report_period || null,
        status,
        author || null,
        reviewer || null,
        report_date || null,
        JSON.stringify(selected_data || []),
        JSON.stringify(template_snapshot || null),
        JSON.stringify(content_json || {}),
        JSON.stringify(chart_assets || []),
        req.user?.userId || null,
        userName(req),
        req.user?.userId || null,
        userName(req),
      ]
    )

    await conn.query(
      `INSERT INTO report_versions
        (report_id, version_no, title, author, reviewer, report_date,
         selected_data, template_snapshot, content_json, chart_assets, created_by, created_by_name)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        title,
        author || null,
        reviewer || null,
        report_date || null,
        JSON.stringify(selected_data || []),
        JSON.stringify(template_snapshot || null),
        JSON.stringify(content_json || {}),
        JSON.stringify(chart_assets || []),
        req.user?.userId || null,
        userName(req),
      ]
    )

    await conn.commit()
    res.status(201).json({ success: true, message: '报告已保存', data: { id: result.insertId, version_no: 1 } })
  } catch (error) {
    await conn.rollback()
    console.error('保存报告失败:', error)
    res.status(500).json({ success: false, message: '保存报告失败' })
  } finally {
    conn.release()
  }
})

router.post('/:id/versions', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { id } = req.params
    const [[existing]] = await conn.query('SELECT * FROM report_records WHERE id = ?', [id])
    if (!existing) return res.status(404).json({ success: false, message: '报告不存在' })

    const {
      title = existing.title,
      author = existing.author,
      reviewer = existing.reviewer,
      report_date = existing.report_date,
      selected_data = parseJson(existing.selected_data, []),
      template_snapshot = parseJson(existing.template_snapshot, null),
      content_json = parseJson(existing.content_json, {}),
      chart_assets = parseJson(existing.chart_assets, []),
      status = existing.status === 'archived' ? 'draft' : existing.status,
    } = req.body

    const nextVersion = Number(existing.version_no || 1) + 1

    await conn.beginTransaction()
    await conn.query(
      `UPDATE report_records
       SET title = ?, author = ?, reviewer = ?, report_date = ?, selected_data = ?,
         template_snapshot = ?, content_json = ?, chart_assets = ?, status = ?,
         version_no = ?, updated_by = ?, updated_by_name = ?
       WHERE id = ?`,
      [
        title,
        author || null,
        reviewer || null,
        report_date || null,
        JSON.stringify(selected_data || []),
        JSON.stringify(template_snapshot || null),
        JSON.stringify(content_json || {}),
        JSON.stringify(chart_assets || []),
        status,
        nextVersion,
        req.user?.userId || null,
        userName(req),
        id,
      ]
    )
    await conn.query(
      `INSERT INTO report_versions
        (report_id, version_no, title, author, reviewer, report_date,
         selected_data, template_snapshot, content_json, chart_assets, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        nextVersion,
        title,
        author || null,
        reviewer || null,
        report_date || null,
        JSON.stringify(selected_data || []),
        JSON.stringify(template_snapshot || null),
        JSON.stringify(content_json || {}),
        JSON.stringify(chart_assets || []),
        req.user?.userId || null,
        userName(req),
      ]
    )
    await conn.commit()

    res.json({ success: true, message: '报告版本已保存', data: { id: Number(id), version_no: nextVersion } })
  } catch (error) {
    await conn.rollback()
    console.error('保存报告版本失败:', error)
    res.status(500).json({ success: false, message: '保存报告版本失败' })
  } finally {
    conn.release()
  }
})

router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    const allowed = ['draft', 'pending_review', 'reviewed', 'exported', 'archived']
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: '报告状态不合法' })

    const archivedFields = status === 'archived'
      ? ', archived_at = NOW(), archived_by = ?'
      : ', archived_at = NULL, archived_by = NULL'
    const params = status === 'archived'
      ? [status, req.user?.userId || null, req.user?.userId || null, userName(req), id]
      : [status, req.user?.userId || null, userName(req), id]

    const [result] = await pool.query(
      `UPDATE report_records
       SET status = ?${archivedFields}, updated_by = ?, updated_by_name = ?
       WHERE id = ?`,
      params
    )
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: '报告不存在' })
    res.json({ success: true, message: '报告状态已更新' })
  } catch (error) {
    console.error('更新报告状态失败:', error)
    res.status(500).json({ success: false, message: '更新报告状态失败' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [result] = await pool.query('DELETE FROM report_records WHERE id = ?', [id])
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: '报告不存在' })
    res.json({ success: true, message: '报告已删除' })
  } catch (error) {
    console.error('删除报告失败:', error)
    res.status(500).json({ success: false, message: '删除报告失败' })
  }
})

module.exports = router
