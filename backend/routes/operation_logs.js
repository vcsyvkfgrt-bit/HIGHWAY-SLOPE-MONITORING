const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const auth = require('../middleware/auth')

router.get('/', auth, async (req, res) => {
  try {
    const { username, resource, from, to, limit = '100' } = req.query
    const params = []
    const where = []

    let sql = 'SELECT * FROM operation_logs'
    if (username) {
      where.push('username LIKE ?')
      params.push(`%${username}%`)
    }
    if (resource) {
      where.push('resource LIKE ?')
      params.push(`%${resource}%`)
    }
    if (from) {
      where.push('created_at >= ?')
      params.push(from)
    }
    if (to) {
      where.push('created_at <= ?')
      params.push(to)
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ' ORDER BY created_at DESC LIMIT ?'
    params.push(Math.min(Number(limit) || 100, 500))

    const [rows] = await pool.query(sql, params)
    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取操作日志失败:', error)
    res.status(500).json({ success: false, message: '获取操作日志失败' })
  }
})

module.exports = router
