const express = require('express')
const router = express.Router()
const pool = require('../config/database')

// 获取所有边坡
router.get('/', async (req, res) => {
  try {
    const { slope_type, q } = req.query

    let sql = `
      SELECT
        s.*,
        (
          SELECT COUNT(DISTINCT CASE
            WHEN p.point_type IN ('地表位移监测点', '沉降监测点', 'surface')
              THEN CONCAT(
                'surface-settlement:',
                COALESCE(NULLIF(TRIM(p.location), ''), CONCAT('point:', p.id))
              )
            ELSE CONCAT('point:', p.id)
          END)
          FROM monitoring_points p
          WHERE p.slope_id = s.id AND p.archived = 0
        ) AS point_count
      FROM slopes s
    `
    const params = []
    const where = []

    if (slope_type) {
      where.push('s.slope_type = ?')
      params.push(slope_type)
    }
    if (q) {
      where.push('s.slope_name LIKE ?')
      params.push(`%${q}%`)
    }

    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')}`
    }

    sql += ' ORDER BY s.created_at DESC'

    const [rows] = await pool.query(sql, params)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取边坡列表失败:', error)
    res.status(500).json({ success: false, message: '获取边坡列表失败' })
  }
})

// 添加边坡
router.post('/', async (req, res) => {
  try {
    console.log('收到添加边坡请求:', req.body)
    const { slope_name, section, start_stake, end_stake, slope_type, max_height, contact_person, description } = req.body
    const slopeName = String(slope_name || '').trim()
    if (!slopeName) {
      return res.status(400).json({ success: false, message: '请输入边坡名称' })
    }
    
    // 处理max_height字段，空字符串转换为null
    const processedMaxHeight = max_height === '' || max_height === null || max_height === undefined ? null : Number(max_height)
    if (processedMaxHeight !== null && Number.isNaN(processedMaxHeight)) {
      return res.status(400).json({ success: false, message: '最大坡高必须是数字' })
    }
    
    const sql = `
      INSERT INTO slopes (slope_name, section, start_stake, end_stake, slope_type, max_height, contact_person, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    console.log('SQL语句:', sql)
    console.log('参数:', [slopeName, section, start_stake, end_stake, slope_type || '滑坡', processedMaxHeight, contact_person, description || null])
    const [result] = await pool.query(sql, [slopeName, section, start_stake, end_stake, slope_type || '滑坡', processedMaxHeight, contact_person, description || null])
    
    console.log('添加边坡成功:', result)
    res.json({ success: true, message: '边坡添加成功', id: result.insertId })
  } catch (error) {
    console.error('添加边坡失败:', error)
    res.status(500).json({ success: false, message: '添加边坡失败' })
  }
})

// 获取单个边坡详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query('SELECT * FROM slopes WHERE id = ?', [id])
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '边坡不存在' })
    }
    
    res.json({ success: true, data: rows[0] })
  } catch (error) {
    console.error('获取边坡详情失败:', error)
    res.status(500).json({ success: false, message: '获取边坡详情失败' })
  }
})

// 更新边坡
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { slope_name, section, start_stake, end_stake, slope_type, max_height, contact_person, description } = req.body
    const slopeName = String(slope_name || '').trim()
    if (!slopeName) {
      return res.status(400).json({ success: false, message: '请输入边坡名称' })
    }
    
    // 处理max_height字段，空字符串转换为null
    const processedMaxHeight = max_height === '' || max_height === null || max_height === undefined ? null : Number(max_height)
    if (processedMaxHeight !== null && Number.isNaN(processedMaxHeight)) {
      return res.status(400).json({ success: false, message: '最大坡高必须是数字' })
    }
    
    const sql = `
      UPDATE slopes
      SET slope_name = ?, section = ?, start_stake = ?, end_stake = ?, slope_type = ?, max_height = ?, contact_person = ?, description = ?
      WHERE id = ?
    `
    const [result] = await pool.query(sql, [slopeName, section, start_stake, end_stake, slope_type || '滑坡', processedMaxHeight, contact_person, description || null, id])
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '边坡不存在' })
    }
    
    res.json({ success: true, message: '边坡更新成功' })
  } catch (error) {
    console.error('更新边坡失败:', error)
    res.status(500).json({ success: false, message: '更新边坡失败' })
  }
})

// 删除边坡
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query('SELECT id FROM slopes WHERE id = ?', [id])
    if (rows.length === 0) return res.status(404).json({ success: false, message: '边坡不存在' })

    // 开始事务
    await pool.query('START TRANSACTION')

    try {
      // 删除该边坡下的所有监测点
      await pool.query('DELETE FROM monitoring_points WHERE slope_id = ?', [id])
      
      // 删除边坡
      await pool.query('DELETE FROM slopes WHERE id = ?', [id])
      
      // 提交事务
      await pool.query('COMMIT')
      
      res.json({ success: true, message: '边坡删除成功，同时删除了该边坡下的所有监测点' })
    } catch (transactionError) {
      // 回滚事务
      await pool.query('ROLLBACK')
      throw transactionError
    }
  } catch (error) {
    console.error('删除边坡失败:', error)
    res.status(500).json({ success: false, message: '删除边坡失败' })
  }
})

module.exports = router
