const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

// 确保上传目录存在
const uploadDir = path.join(__dirname, '..', 'uploads', 'inspections')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'inspection-' + uniqueSuffix + path.extname(file.originalname))
  }
})

// 文件过滤器
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true)
  } else {
    cb(new Error('只允许上传图片文件'), false)
  }
}

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB 限制
})

// 获取所有巡检记录
router.get('/', async (req, res) => {
  try {
    const { slope_id, status, inspection_type, start_date, end_date, page = 1, limit = 10 } = req.query

    let sql = `
      SELECT
        i.id,
        i.slope_id,
        i.inspection_date,
        i.inspector,
        i.inspection_type,
        i.status,
        i.content,
        i.problems,
        i.suggestions,
        i.created_at,
        i.updated_at,
        s.slope_name
      FROM inspections i
      LEFT JOIN slopes s ON i.slope_id = s.id
    `
    const params = []
    const where = []

    if (slope_id) {
      where.push('i.slope_id = ?')
      params.push(slope_id)
    }
    if (status) {
      where.push('i.status = ?')
      params.push(status)
    }
    if (inspection_type) {
      where.push('i.inspection_type = ?')
      params.push(inspection_type)
    }
    if (start_date) {
      where.push('i.inspection_date >= ?')
      params.push(start_date)
    }
    if (end_date) {
      where.push('i.inspection_date <= ?')
      params.push(end_date)
    }

    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')}`
    }

    // 获取总数
    const countSql = sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as count FROM')
    const [countResult] = await pool.query(countSql, params)
    const total = countResult[0].count

    // 分页
    const offset = (page - 1) * limit
    sql += ' ORDER BY i.inspection_date DESC LIMIT ? OFFSET ?'
    params.push(parseInt(limit), offset)

    const [rows] = await pool.query(sql, params)
    res.json({ 
      success: true, 
      data: rows, 
      total, 
      page: parseInt(page), 
      limit: parseInt(limit) 
    })
  } catch (error) {
    console.error('获取巡检记录失败:', error)
    console.error('错误详情:', error.message)
    console.error('错误堆栈:', error.stack)
    res.status(500).json({ success: false, message: '获取巡检记录失败: ' + error.message })
  }
})

// 添加巡检记录（支持文件上传）
router.post('/', upload.array('images', 10), async (req, res) => {
  try {
    const { slope_id, inspection_date, inspector, inspection_type, status, content, problems, suggestions } = req.body
    
    // 处理上传的图片路径
    const imagePaths = req.files ? req.files.map(file => `/uploads/inspections/${file.filename}`) : []
    
    const sql = `
      INSERT INTO inspections (slope_id, inspection_date, inspector, inspection_type, status, content, problems, suggestions, images)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const [result] = await pool.query(sql, [
      slope_id, 
      inspection_date, 
      inspector, 
      inspection_type, 
      status, 
      content || '', 
      problems || '', 
      suggestions || '', 
      JSON.stringify(imagePaths)
    ])
    
    res.json({ success: true, message: '巡检记录添加成功', id: result.insertId })
  } catch (error) {
    console.error('添加巡检记录失败:', error)
    res.status(500).json({ success: false, message: '添加巡检记录失败: ' + error.message })
  }
})

// 获取单个巡检记录详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query(`
      SELECT
        i.*,
        s.slope_name
      FROM inspections i
      LEFT JOIN slopes s ON i.slope_id = s.id
      WHERE i.id = ?
    `, [id])
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '巡检记录不存在' })
    }
    
    // 处理图片路径
    const inspection = rows[0]
    if (inspection.images) {
      try {
        const imagePaths = JSON.parse(inspection.images)
        inspection.images = imagePaths.map(imgPath => ({
          path: imgPath,
          url: `${req.protocol}://${req.get('host')}${imgPath}`
        }))
      } catch (e) {
        inspection.images = []
      }
    } else {
      inspection.images = []
    }
    
    res.json({ success: true, data: inspection })
  } catch (error) {
    console.error('获取巡检记录详情失败:', error)
    res.status(500).json({ success: false, message: '获取巡检记录详情失败' })
  }
})

// 更新巡检记录
router.put('/:id', upload.array('images', 10), async (req, res) => {
  try {
    const { id } = req.params
    const { slope_id, inspection_date, inspector, inspection_type, status, content, problems, suggestions, existing_images } = req.body
    
    // 获取现有记录
    const [existingRows] = await pool.query('SELECT images FROM inspections WHERE id = ?', [id])
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: '巡检记录不存在' })
    }
    
    // 处理图片路径
    let imagePaths = []
    if (existing_images) {
      try {
        imagePaths = JSON.parse(existing_images)
      } catch (e) {
        imagePaths = []
      }
    }
    
    // 添加新上传的图片
    if (req.files && req.files.length > 0) {
      const newPaths = req.files.map(file => `/uploads/inspections/${file.filename}`)
      imagePaths = imagePaths.concat(newPaths)
    }
    
    const sql = `
      UPDATE inspections
      SET slope_id = ?, inspection_date = ?, inspector = ?, inspection_type = ?, status = ?, content = ?, problems = ?, suggestions = ?, images = ?
      WHERE id = ?
    `
    await pool.query(sql, [
      slope_id, 
      inspection_date, 
      inspector, 
      inspection_type, 
      status, 
      content || '', 
      problems || '', 
      suggestions || '', 
      JSON.stringify(imagePaths),
      id
    ])
    
    res.json({ success: true, message: '巡检记录更新成功' })
  } catch (error) {
    console.error('更新巡检记录失败:', error)
    res.status(500).json({ success: false, message: '更新巡检记录失败: ' + error.message })
  }
})

// 删除巡检记录
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    // 获取记录的图片路径
    const [rows] = await pool.query('SELECT images FROM inspections WHERE id = ?', [id])
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '巡检记录不存在' })
    }
    
    // 删除关联的图片文件
    if (rows[0].images) {
      try {
        const imagePaths = JSON.parse(rows[0].images)
        imagePaths.forEach(imgPath => {
          const fullPath = path.join(__dirname, '..', imgPath.replace('/uploads/', 'uploads/'))
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath)
          }
        })
      } catch (e) {
        console.error('删除图片文件失败:', e)
      }
    }
    
    await pool.query('DELETE FROM inspections WHERE id = ?', [id])
    res.json({ success: true, message: '巡检记录删除成功' })
  } catch (error) {
    console.error('删除巡检记录失败:', error)
    res.status(500).json({ success: false, message: '删除巡检记录失败' })
  }
})

// 删除单张图片
router.delete('/:id/images/:imageIndex', async (req, res) => {
  try {
    const { id, imageIndex } = req.params
    
    // 获取记录
    const [rows] = await pool.query('SELECT images FROM inspections WHERE id = ?', [id])
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '巡检记录不存在' })
    }
    
    let imagePaths = []
    if (rows[0].images) {
      try {
        imagePaths = JSON.parse(rows[0].images)
      } catch (e) {
        imagePaths = []
      }
    }
    
    const index = parseInt(imageIndex)
    if (index < 0 || index >= imagePaths.length) {
      return res.status(400).json({ success: false, message: '图片索引无效' })
    }
    
    // 删除文件
    const imgPath = imagePaths[index]
    const fullPath = path.join(__dirname, '..', imgPath.replace('/uploads/', 'uploads/'))
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
    
    // 更新数据库
    imagePaths.splice(index, 1)
    await pool.query('UPDATE inspections SET images = ? WHERE id = ?', [JSON.stringify(imagePaths), id])
    
    res.json({ success: true, message: '图片删除成功' })
  } catch (error) {
    console.error('删除图片失败:', error)
    res.status(500).json({ success: false, message: '删除图片失败' })
  }
})

// 获取边坡的巡检统计
router.get('/stats/slope/:slope_id', async (req, res) => {
  try {
    const { slope_id } = req.params
    
    const [stats] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'normal' THEN 1 ELSE 0 END) as normal_count,
        SUM(CASE WHEN status = 'attention' THEN 1 ELSE 0 END) as attention_count,
        SUM(CASE WHEN status = 'abnormal' THEN 1 ELSE 0 END) as abnormal_count,
        MAX(inspection_date) as last_inspection_date
      FROM inspections
      WHERE slope_id = ?
    `, [slope_id])
    
    res.json({ success: true, data: stats[0] })
  } catch (error) {
    console.error('获取边坡巡检统计失败:', error)
    res.status(500).json({ success: false, message: '获取边坡巡检统计失败' })
  }
})

module.exports = router
