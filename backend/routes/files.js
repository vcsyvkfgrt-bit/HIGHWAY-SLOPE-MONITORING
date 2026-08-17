const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')

const pool = require('../config/database')
const auth = require('../middleware/auth')

const router = express.Router()

const uploadRoot = path.join(__dirname, '..', 'uploads')
const allowedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function safeModuleName(moduleName = 'common') {
  return String(moduleName).replace(/[^a-zA-Z0-9_-]/g, '') || 'common'
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const moduleName = safeModuleName(req.query.module || req.body.module)
    const targetDir = path.join(uploadRoot, moduleName)
    ensureDir(targetDir)
    cb(null, targetDir)
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname)
    const baseName = path.basename(file.originalname, ext).replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '_')
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${baseName}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_SIZE || 20 * 1024 * 1024),
    files: 10,
  },
  fileFilter(_req, file, cb) {
    if (!allowedTypes.has(file.mimetype)) {
      return cb(new Error('不支持的文件类型'))
    }

    cb(null, true)
  },
})

router.post('/upload', auth, upload.array('files', 10), async (req, res) => {
  try {
    const moduleName = safeModuleName(req.query.module || req.body.module || 'common')
    const businessId = req.query.business_id || req.body.business_id || null
    const files = req.files || []

    const savedFiles = []
    for (const file of files) {
      const relativePath = `/uploads/${moduleName}/${file.filename}`
      const [result] = await pool.query(
        `INSERT INTO file_assets
          (module, business_id, original_name, file_name, file_path, mime_type, file_size, uploader_id, uploader_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          moduleName,
          businessId,
          file.originalname,
          file.filename,
          relativePath,
          file.mimetype,
          file.size,
          req.user?.userId || null,
          req.user?.username || null,
        ]
      )

      savedFiles.push({
        id: result.insertId,
        original_name: file.originalname,
        file_name: file.filename,
        file_path: relativePath,
        mime_type: file.mimetype,
        file_size: file.size,
      })
    }

    res.status(201).json({ success: true, message: '文件上传成功', data: savedFiles })
  } catch (error) {
    console.error('文件上传失败:', error)
    res.status(500).json({ success: false, message: error.message || '文件上传失败' })
  }
})

router.get('/', auth, async (req, res) => {
  try {
    const { module, business_id } = req.query
    const params = []
    const where = []
    let sql = 'SELECT * FROM file_assets'

    if (module) {
      where.push('module = ?')
      params.push(module)
    }
    if (business_id) {
      where.push('business_id = ?')
      params.push(business_id)
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ' ORDER BY created_at DESC LIMIT 200'

    const [rows] = await pool.query(sql, params)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取文件列表失败:', error)
    res.status(500).json({ success: false, message: '获取文件列表失败' })
  }
})

module.exports = router
