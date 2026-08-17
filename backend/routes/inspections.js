const express = require('express')
const router = express.Router()
const pool = require('../config/database')

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
        i.result,
        i.created_at,
        i.updated_at,
        (CASE WHEN i.images IS NOT NULL AND JSON_LENGTH(i.images) > 0 THEN 1 ELSE 0 END) as has_images,
        s.slope_name
      FROM inspections i FORCE INDEX (idx_inspection_date)
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
    res.status(500).json({ success: false, message: '获取巡检记录失败' })
  }
})

// 添加巡检记录
router.post('/', async (req, res) => {
  try {
    const { slope_id, inspection_date, inspector, inspection_type, status, content, problems, suggestions, result: inspection_result, images } = req.body
    
    const sql = `
      INSERT INTO inspections (slope_id, inspection_date, inspector, inspection_type, status, content, problems, suggestions, result, images)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const [insertResult] = await pool.query(sql, [slope_id, inspection_date, inspector, inspection_type, status, content, problems, suggestions, inspection_result, images || '[]'])
    const result = insertResult
    const resultForResponse = insertResult
    
    res.json({ success: true, message: '巡检记录添加成功', id: result.insertId })
  } catch (error) {
    console.error('添加巡检记录失败:', error)
    res.status(500).json({ success: false, message: '添加巡检记录失败' })
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
    
    res.json({ success: true, data: rows[0] })
  } catch (error) {
    console.error('获取巡检记录详情失败:', error)
    res.status(500).json({ success: false, message: '获取巡检记录详情失败' })
  }
})

// 更新巡检记录
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { slope_id, inspection_date, inspector, inspection_type, status, content, problems, suggestions, result: inspection_result, images } = req.body
    
    const sql = `
      UPDATE inspections
      SET slope_id = ?, inspection_date = ?, inspector = ?, inspection_type = ?, status = ?, content = ?, problems = ?, suggestions = ?, result = ?, images = ?
      WHERE id = ?
    `
    await pool.query(sql, [slope_id, inspection_date, inspector, inspection_type, status, content, problems, suggestions, inspection_result, images || '[]', id])
    
    res.json({ success: true, message: '巡检记录更新成功' })
  } catch (error) {
    console.error('更新巡检记录失败:', error)
    res.status(500).json({ success: false, message: '更新巡检记录失败' })
  }
})

// 删除巡检记录
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query('SELECT id FROM inspections WHERE id = ?', [id])
    if (rows.length === 0) return res.status(404).json({ success: false, message: '巡检记录不存在' })

    await pool.query('DELETE FROM inspections WHERE id = ?', [id])
    res.json({ success: true, message: '巡检记录删除成功' })
  } catch (error) {
    console.error('删除巡检记录失败:', error)
    res.status(500).json({ success: false, message: '删除巡检记录失败' })
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
