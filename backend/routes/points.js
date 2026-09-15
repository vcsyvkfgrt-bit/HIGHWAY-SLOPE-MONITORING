const express = require('express')
const router = express.Router()
const pool = require('../config/database')

const ALLOWED_POINT_TYPES = ['地表位移监测点', '沉降监测点', '深部位移测斜孔', '裂缝观测点', '锚索应力计', '锚索应力监测点', 'surface', 'deep', 'stress', 'water']

// 获取所有监测点
router.get('/', async (req, res) => {
  try {
    const { slope_id, point_type, q, include_archived = 'false' } = req.query

    // 新业务口径默认：只展示允许的类型，并隐藏归档
    const allowFilter = include_archived === 'true'

    // 使用 GROUP BY 确保每个测点只返回一条记录
    let sql = `
      SELECT
        p.*,
        s.slope_name,
        MAX(latest.monitor_date) AS latest_monitor_date,
        MAX(latest.value) AS latest_value
      FROM monitoring_points p
      LEFT JOIN slopes s ON p.slope_id = s.id
      LEFT JOIN (
        SELECT m1.point_id, m1.monitor_date, m1.value
        FROM monitoring_data m1
        INNER JOIN (
          SELECT point_id, MAX(monitor_date) AS max_date
          FROM monitoring_data
          GROUP BY point_id
        ) t ON m1.point_id = t.point_id AND m1.monitor_date = t.max_date
      ) latest ON latest.point_id = p.id
    `

    const params = []
    const where = []

    if (!allowFilter) {
      where.push('p.archived = 0')
      where.push(`p.point_type IN (${ALLOWED_POINT_TYPES.map(() => '?').join(',')})`)
      params.push(...ALLOWED_POINT_TYPES)
    }

    if (slope_id) {
      where.push('p.slope_id = ?')
      params.push(slope_id)
    }

    if (point_type) {
      where.push('p.point_type = ?')
      params.push(point_type)
    }

    if (q) {
      where.push('(p.point_name LIKE ? OR p.description LIKE ?)')
      params.push(`%${q}%`, `%${q}%`)
    }

    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')}`
    }

    // 按测点ID分组，确保每个测点只返回一条记录
    sql += ' GROUP BY p.id ORDER BY p.created_at DESC'
    const [rows] = await pool.query(sql, params)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取监测点列表失败:', error)
    res.status(500).json({ success: false, message: '获取监测点列表失败' })
  }
})

// 添加监测点
router.post('/', async (req, res) => {
  try {
    const { point_name, slope_id, location, point_type, description, install_date, calibration_value, photo } = req.body

    if (!ALLOWED_POINT_TYPES.includes(point_type)) {
      return res.status(400).json({ success: false, message: 'point_type 不在当前业务口径内' })
    }
    
    const sql = `
      INSERT INTO monitoring_points 
      (point_name, slope_id, location, point_type, description, install_date, calibration_value, photo) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    const [result] = await pool.query(sql, [
      point_name, slope_id, location, point_type, description, install_date, calibration_value, photo
    ])
    
    res.json({ success: true, message: '添加成功', data: { id: result.insertId } })
  } catch (error) {
    console.error('添加监测点失败:', error)
    res.status(500).json({ success: false, message: '添加监测点失败' })
  }
})

// 更新监测点
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { point_name, location, point_type, description, install_date, calibration_value, photo } = req.body

    if (!ALLOWED_POINT_TYPES.includes(point_type)) {
      return res.status(400).json({ success: false, message: 'point_type 不在当前业务口径内' })
    }

    const sql = `
      UPDATE monitoring_points 
      SET point_name = ?, location = ?, point_type = ?, description = ?, 
          install_date = ?, calibration_value = ?, photo = ?
      WHERE id = ?
    `
    await pool.query(sql, [point_name, location, point_type, description, install_date, calibration_value, photo, id])
    
    res.json({ success: true, message: '更新成功' })
  } catch (error) {
    console.error('更新监测点失败:', error)
    res.status(500).json({ success: false, message: '更新监测点失败' })
  }
})

// 删除监测点
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('DELETE FROM monitoring_points WHERE id = ?', [id])
    res.json({ success: true, message: '删除成功' })
  } catch (error) {
    console.error('删除监测点失败:', error)
    res.status(500).json({ success: false, message: '删除监测点失败' })
  }
})

module.exports = router
