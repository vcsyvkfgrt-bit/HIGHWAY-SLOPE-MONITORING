const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const auth = require('../middleware/auth')

const LIFECYCLE_STAGES = [
  'project_created',
  'plan_configured',
  'device_installed',
  'data_connected',
  'auto_monitoring',
  'risk_analysis',
  'report_generated',
]

async function writeProjectEvent(projectId, stage, description, user) {
  await pool.query(
    `INSERT INTO project_lifecycle_events (project_id, stage, description, operator_id, operator_name)
     VALUES (?, ?, ?, ?, ?)`,
    [projectId, stage, description || null, user?.userId || null, user?.username || null]
  )
}

router.get('/', async (req, res) => {
  try {
    const { status, q, limit = '200' } = req.query
    const params = []
    const where = []

    let sql = `
      SELECT p.*,
        (SELECT COUNT(*) FROM monitoring_plans mp WHERE mp.project_id = p.id) AS plan_count,
        (SELECT COUNT(*) FROM devices d WHERE d.project_id = p.id) AS device_count,
        (SELECT COUNT(*) FROM alarms a WHERE a.project_id = p.id AND a.status <> 'closed') AS open_alarm_count
      FROM projects p
    `

    if (status) {
      where.push('p.status = ?')
      params.push(status)
    }
    if (q) {
      where.push('(p.project_name LIKE ? OR p.project_code LIKE ? OR p.location LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }

    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ' ORDER BY p.updated_at DESC LIMIT ?'
    params.push(Math.min(Number(limit) || 200, 1000))

    const [rows] = await pool.query(sql, params)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取项目列表失败:', error)
    res.status(500).json({ success: false, message: '获取项目列表失败' })
  }
})

router.post('/', auth, async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { project_name, project_code, location, owner_unit, start_date, description } = req.body
    if (!project_name) return res.status(400).json({ success: false, message: '缺少项目名称' })

    await conn.beginTransaction()
    const [result] = await conn.query(
      `INSERT INTO projects
        (project_name, project_code, location, owner_unit, start_date, description, lifecycle_stage, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project_name,
        project_code || null,
        location || null,
        owner_unit || null,
        start_date || null,
        description || null,
        'project_created',
        'active',
        req.user.userId,
      ]
    )
    await conn.query(
      `INSERT INTO project_lifecycle_events (project_id, stage, description, operator_id, operator_name)
       VALUES (?, ?, ?, ?, ?)`,
      [result.insertId, 'project_created', '项目创建', req.user.userId, req.user.username]
    )
    await conn.commit()
    res.status(201).json({ success: true, message: '项目创建成功', data: { id: result.insertId } })
  } catch (error) {
    await conn.rollback()
    console.error('创建项目失败:', error)
    res.status(500).json({ success: false, message: '创建项目失败' })
  } finally {
    conn.release()
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [[project]] = await pool.query('SELECT * FROM projects WHERE id = ?', [id])
    if (!project) return res.status(404).json({ success: false, message: '项目不存在' })

    const [plans] = await pool.query('SELECT * FROM monitoring_plans WHERE project_id = ? ORDER BY created_at DESC', [id])
    const [devices] = await pool.query('SELECT * FROM devices WHERE project_id = ? ORDER BY created_at DESC', [id])
    const [events] = await pool.query('SELECT * FROM project_lifecycle_events WHERE project_id = ? ORDER BY created_at DESC', [id])
    const [alarms] = await pool.query('SELECT * FROM alarms WHERE project_id = ? ORDER BY created_at DESC LIMIT 20', [id])

    res.json({ success: true, data: { project, plans, devices, events, alarms } })
  } catch (error) {
    console.error('获取项目详情失败:', error)
    res.status(500).json({ success: false, message: '获取项目详情失败' })
  }
})

router.put('/:id/stage', auth, async (req, res) => {
  try {
    const { id } = req.params
    const { stage, description } = req.body
    if (!LIFECYCLE_STAGES.includes(stage)) {
      return res.status(400).json({ success: false, message: '生命周期阶段不合法' })
    }

    const [result] = await pool.query(
      'UPDATE projects SET lifecycle_stage = ? WHERE id = ?',
      [stage, id]
    )
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: '项目不存在' })

    await writeProjectEvent(id, stage, description || `阶段更新为 ${stage}`, req.user)
    res.json({ success: true, message: '项目阶段更新成功' })
  } catch (error) {
    console.error('更新项目阶段失败:', error)
    res.status(500).json({ success: false, message: '更新项目阶段失败' })
  }
})

router.post('/:id/plans', auth, async (req, res) => {
  try {
    const { id } = req.params
    const { plan_name, monitor_items, frequency, threshold_rules, responsible_person, description } = req.body
    if (!plan_name) return res.status(400).json({ success: false, message: '缺少方案名称' })

    const [result] = await pool.query(
      `INSERT INTO monitoring_plans
        (project_id, plan_name, monitor_items, frequency, threshold_rules, responsible_person, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        plan_name,
        JSON.stringify(monitor_items || []),
        frequency || null,
        JSON.stringify(threshold_rules || []),
        responsible_person || null,
        description || null,
        req.user.userId,
      ]
    )

    await pool.query('UPDATE projects SET lifecycle_stage = ? WHERE id = ?', ['plan_configured', id])
    await writeProjectEvent(id, 'plan_configured', `配置监测方案：${plan_name}`, req.user)
    res.status(201).json({ success: true, message: '监测方案保存成功', data: { id: result.insertId } })
  } catch (error) {
    console.error('保存监测方案失败:', error)
    res.status(500).json({ success: false, message: '保存监测方案失败' })
  }
})

router.post('/:id/devices', auth, async (req, res) => {
  try {
    const { id } = req.params
    const { device_name, device_code, device_type, install_location, install_time, status, data_source } = req.body
    if (!device_name) return res.status(400).json({ success: false, message: '缺少设备名称' })

    const [result] = await pool.query(
      `INSERT INTO devices
        (project_id, device_name, device_code, device_type, install_location, install_time, status, data_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        device_name,
        device_code || null,
        device_type || null,
        install_location || null,
        install_time || null,
        status || 'installed',
        data_source || null,
      ]
    )

    await pool.query('UPDATE projects SET lifecycle_stage = ? WHERE id = ?', ['device_installed', id])
    await writeProjectEvent(id, 'device_installed', `安装设备：${device_name}`, req.user)
    res.status(201).json({ success: true, message: '设备安装记录保存成功', data: { id: result.insertId } })
  } catch (error) {
    console.error('保存设备记录失败:', error)
    res.status(500).json({ success: false, message: '保存设备记录失败' })
  }
})

router.post('/:id/risk-analysis', auth, async (req, res) => {
  try {
    const { id } = req.params
    const { risk_level, conclusion, measures } = req.body
    await pool.query(
      `INSERT INTO risk_analysis_records (project_id, risk_level, conclusion, measures, analyst_id, analyst_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, risk_level || 'low', conclusion || null, measures || null, req.user.userId, req.user.username]
    )
    await pool.query('UPDATE projects SET lifecycle_stage = ? WHERE id = ?', ['risk_analysis', id])
    await writeProjectEvent(id, 'risk_analysis', `完成风险分析：${risk_level || 'low'}`, req.user)
    res.json({ success: true, message: '风险分析记录保存成功' })
  } catch (error) {
    console.error('保存风险分析失败:', error)
    res.status(500).json({ success: false, message: '保存风险分析失败' })
  }
})

router.post('/:id/risk-analysis/auto', auth, async (req, res) => {
  try {
    const { id } = req.params
    const [alarms] = await pool.query(
      `SELECT alarm_level, COUNT(*) AS count
       FROM alarms
       WHERE project_id = ? AND status <> 'closed'
       GROUP BY alarm_level`,
      [id]
    )

    const counts = Object.fromEntries(alarms.map((row) => [row.alarm_level, Number(row.count)]))
    let riskLevel = 'low'
    if ((counts.critical || 0) > 0) riskLevel = 'critical'
    else if ((counts.serious || 0) > 0) riskLevel = 'high'
    else if ((counts.warning || 0) > 0) riskLevel = 'medium'

    const conclusion = `基于未关闭报警自动计算：critical=${counts.critical || 0}, serious=${counts.serious || 0}, warning=${counts.warning || 0}, info=${counts.info || 0}`
    const measures = riskLevel === 'low'
      ? '当前未发现需要升级处置的未关闭报警，保持常规监测。'
      : '存在未关闭报警，请结合现场复核和监测趋势制定处置措施。'

    await pool.query(
      `INSERT INTO risk_analysis_records (project_id, risk_level, conclusion, measures, analyst_id, analyst_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, riskLevel, conclusion, measures, req.user.userId, req.user.username]
    )
    await pool.query('UPDATE projects SET lifecycle_stage = ? WHERE id = ?', ['risk_analysis', id])
    await writeProjectEvent(id, 'risk_analysis', `自动风险分析：${riskLevel}`, req.user)

    res.json({ success: true, message: '自动风险分析完成', data: { risk_level: riskLevel, conclusion, measures } })
  } catch (error) {
    console.error('自动风险分析失败:', error)
    res.status(500).json({ success: false, message: '自动风险分析失败' })
  }
})

module.exports = router
