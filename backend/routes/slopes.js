const express = require('express')
const router = express.Router()
const pool = require('../config/database')

const numberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : NaN
}

const integerOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : NaN
}

const textOrNull = (value) => {
  const text = String(value || '').trim()
  return text || null
}

const readSlopePayload = (body = {}) => {
  const payload = {
    slope_name: textOrNull(body.slope_name),
    section: textOrNull(body.section),
    start_stake: textOrNull(body.start_stake),
    end_stake: textOrNull(body.end_stake),
    slope_type: textOrNull(body.slope_type) || '滑坡',
    max_height: numberOrNull(body.max_height),
    slope_length: numberOrNull(body.slope_length),
    slope_position: textOrNull(body.slope_position),
    design_displacement_piles: integerOrNull(body.design_displacement_piles),
    design_settlement_plates: integerOrNull(body.design_settlement_plates),
    design_anchor_dynamometers: integerOrNull(body.design_anchor_dynamometers),
    design_inclinometer_length: numberOrNull(body.design_inclinometer_length),
    construction_status: textOrNull(body.construction_status),
    meeting_work_progress: textOrNull(body.meeting_work_progress),
    meeting_remark: textOrNull(body.meeting_remark),
    include_in_meeting: body.include_in_meeting === false || body.include_in_meeting === 0 || body.include_in_meeting === '0' ? 0 : 1,
    meeting_display_order: integerOrNull(body.meeting_display_order),
    contact_person: textOrNull(body.contact_person),
    description: textOrNull(body.description),
  }

  if (!payload.slope_name) return { error: '请输入边坡名称' }
  if (Number.isNaN(payload.max_height)) return { error: '最大坡高必须是数字' }
  if (Number.isNaN(payload.slope_length)) return { error: '边坡长度必须是数字' }
  if (Number.isNaN(payload.design_displacement_piles)) return { error: '位移桩数量必须是非负整数' }
  if (Number.isNaN(payload.design_settlement_plates)) return { error: '沉降板数量必须是非负整数' }
  if (Number.isNaN(payload.design_anchor_dynamometers)) return { error: '锚测力计数量必须是非负整数' }
  if (Number.isNaN(payload.design_inclinometer_length)) return { error: '测斜管长度必须是数字' }
  if (Number.isNaN(payload.meeting_display_order)) return { error: '例会排序必须是非负整数' }

  return { payload }
}

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
    const { payload, error } = readSlopePayload(req.body)
    if (error) {
      return res.status(400).json({ success: false, message: error })
    }
    
    const sql = `
      INSERT INTO slopes (
        slope_name, section, start_stake, end_stake, slope_type, max_height,
        slope_length, slope_position, design_displacement_piles, design_settlement_plates,
        design_anchor_dynamometers, design_inclinometer_length, construction_status,
        meeting_work_progress, meeting_remark, include_in_meeting, meeting_display_order,
        contact_person, description
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    console.log('SQL语句:', sql)
    const params = [
      payload.slope_name, payload.section, payload.start_stake, payload.end_stake, payload.slope_type, payload.max_height,
      payload.slope_length, payload.slope_position, payload.design_displacement_piles, payload.design_settlement_plates,
      payload.design_anchor_dynamometers, payload.design_inclinometer_length, payload.construction_status,
      payload.meeting_work_progress, payload.meeting_remark, payload.include_in_meeting, payload.meeting_display_order,
      payload.contact_person, payload.description,
    ]
    console.log('参数:', params)
    const [result] = await pool.query(sql, params)
    
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
    const { payload, error } = readSlopePayload(req.body)
    if (error) {
      return res.status(400).json({ success: false, message: error })
    }
    
    const sql = `
      UPDATE slopes
      SET slope_name = ?, section = ?, start_stake = ?, end_stake = ?, slope_type = ?, max_height = ?,
          slope_length = ?, slope_position = ?, design_displacement_piles = ?, design_settlement_plates = ?,
          design_anchor_dynamometers = ?, design_inclinometer_length = ?, construction_status = ?,
          meeting_work_progress = ?, meeting_remark = ?, include_in_meeting = ?, meeting_display_order = ?,
          contact_person = ?, description = ?
      WHERE id = ?
    `
    const [result] = await pool.query(sql, [
      payload.slope_name, payload.section, payload.start_stake, payload.end_stake, payload.slope_type, payload.max_height,
      payload.slope_length, payload.slope_position, payload.design_displacement_piles, payload.design_settlement_plates,
      payload.design_anchor_dynamometers, payload.design_inclinometer_length, payload.construction_status,
      payload.meeting_work_progress, payload.meeting_remark, payload.include_in_meeting, payload.meeting_display_order,
      payload.contact_person, payload.description, id,
    ])
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
