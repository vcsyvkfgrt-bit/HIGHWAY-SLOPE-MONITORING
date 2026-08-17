const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const auth = require('../middleware/auth')

const ALARM_STATUSES = ['data_abnormal', 'alarming', 'confirmed', 'field_review', 'processing', 'closed']

async function writeAlarmEvent(alarmId, status, description, user) {
  await pool.query(
    `INSERT INTO alarm_events (alarm_id, status, description, operator_id, operator_name)
     VALUES (?, ?, ?, ?, ?)`,
    [alarmId, status, description || null, user?.userId || null, user?.username || null]
  )
}

router.get('/', async (req, res) => {
  try {
    const { project_id, status, level, limit = '200' } = req.query
    const params = []
    const where = []
    let sql = `
      SELECT a.*, p.project_name, mp.point_name
      FROM alarms a
      LEFT JOIN projects p ON a.project_id = p.id
      LEFT JOIN monitoring_points mp ON a.point_id = mp.id
    `

    if (project_id) {
      where.push('a.project_id = ?')
      params.push(project_id)
    }
    if (status) {
      where.push('a.status = ?')
      params.push(status)
    }
    if (level) {
      where.push('a.alarm_level = ?')
      params.push(level)
    }

    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ' ORDER BY a.created_at DESC LIMIT ?'
    params.push(Math.min(Number(limit) || 200, 1000))

    const [rows] = await pool.query(sql, params)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取报警列表失败:', error)
    res.status(500).json({ success: false, message: '获取报警列表失败' })
  }
})

router.post('/', auth, async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { project_id, point_id, alarm_type, alarm_level, abnormal_value, threshold_value, description } = req.body
    if (!alarm_type) return res.status(400).json({ success: false, message: '缺少报警类型' })

    await conn.beginTransaction()
    const [result] = await conn.query(
      `INSERT INTO alarms
        (project_id, point_id, alarm_type, alarm_level, abnormal_value, threshold_value, description, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project_id || null,
        point_id || null,
        alarm_type,
        alarm_level || 'warning',
        abnormal_value ?? null,
        threshold_value ?? null,
        description || null,
        'alarming',
        req.user.userId,
      ]
    )
    await conn.query(
      `INSERT INTO alarm_events (alarm_id, status, description, operator_id, operator_name)
       VALUES (?, ?, ?, ?, ?)`,
      [result.insertId, 'alarming', description || '系统报警', req.user.userId, req.user.username]
    )
    await conn.commit()
    res.status(201).json({ success: true, message: '报警创建成功', data: { id: result.insertId } })
  } catch (error) {
    await conn.rollback()
    console.error('创建报警失败:', error)
    res.status(500).json({ success: false, message: '创建报警失败' })
  } finally {
    conn.release()
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [[alarm]] = await pool.query('SELECT * FROM alarms WHERE id = ?', [id])
    if (!alarm) return res.status(404).json({ success: false, message: '报警不存在' })
    const [events] = await pool.query('SELECT * FROM alarm_events WHERE alarm_id = ? ORDER BY created_at DESC', [id])
    res.json({ success: true, data: { alarm, events } })
  } catch (error) {
    console.error('获取报警详情失败:', error)
    res.status(500).json({ success: false, message: '获取报警详情失败' })
  }
})

router.put('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params
    const { status, description, field_review_result, measures, close_summary } = req.body
    if (!ALARM_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: '报警状态不合法' })
    }

    const fields = ['status = ?']
    const params = [status]
    if (field_review_result !== undefined) {
      fields.push('field_review_result = ?')
      params.push(field_review_result || null)
    }
    if (measures !== undefined) {
      fields.push('measures = ?')
      params.push(measures || null)
    }
    if (close_summary !== undefined) {
      fields.push('close_summary = ?')
      params.push(close_summary || null)
    }
    if (status === 'confirmed') {
      fields.push('confirmed_by = ?, confirmed_at = NOW()')
      params.push(req.user.userId)
    }
    if (status === 'closed') {
      fields.push('closed_by = ?, closed_at = NOW()')
      params.push(req.user.userId)
    }

    params.push(id)
    const [result] = await pool.query(`UPDATE alarms SET ${fields.join(', ')} WHERE id = ?`, params)
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: '报警不存在' })

    await writeAlarmEvent(id, status, description || `报警状态更新为 ${status}`, req.user)
    res.json({ success: true, message: '报警流程更新成功' })
  } catch (error) {
    console.error('更新报警流程失败:', error)
    res.status(500).json({ success: false, message: '更新报警流程失败' })
  }
})

module.exports = router
