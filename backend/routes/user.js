const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { JWT_EXPIRES_IN, JWT_SECRET } = require('../config/auth')

// 注册路由
router.post('/register', async (req, res) => {
  try {
    const { username, password, real_name, unit, phone } = req.body
    
    // 检查用户名是否已存在
    const [existingUser] = await pool.execute('SELECT * FROM users WHERE username = ?', [username])
    if (existingUser.length > 0) {
      return res.status(400).json({ error: '用户名已存在' })
    }
    
    // 加密密码
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)
    
    // 插入新用户，固定角色为 user
    const [result] = await pool.execute(
      'INSERT INTO users (username, password, real_name, unit, phone, role) VALUES (?, ?, ?, ?, ?, ?)',
      [username, hashedPassword, real_name || '', unit || '', phone || '', 'user']
    )
    
    res.status(201).json({ message: '注册成功', userId: result.insertId })
  } catch (error) {
    console.error('注册失败:', error)
    res.status(500).json({ error: '注册失败' })
  }
})

// 登录路由
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    
    // 查找用户
    const [users] = await pool.execute('SELECT * FROM users WHERE username = ?', [username])
    if (users.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' })
    }
    
    const user = users[0]
    
    // 验证密码
    // 历史数据可能是明文（create_database.js 直接插入），也可能是 bcrypt hash（register 路由插入）。
    // bcrypt hash 通常以 "$2" 开头（如 $2b$...）。
    let isPasswordValid = false
    if (typeof user.password === 'string' && user.password.startsWith('$2')) {
      isPasswordValid = await bcrypt.compare(password, user.password)
    } else {
      isPasswordValid = password === user.password
    }
    if (!isPasswordValid) {
      return res.status(401).json({ error: '用户名或密码错误' })
    }
    
    // 生成JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )
    
    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        real_name: user.real_name,
        unit: user.unit,
        phone: user.phone,
        role: user.role
      }
    })
  } catch (error) {
    console.error('登录失败:', error)
    res.status(500).json({ error: '登录失败' })
  }
})

// 验证用户是否存在（用于忘记密码）
router.post('/verify', async (req, res) => {
  try {
    const { username } = req.body
    
    // 查找用户
    const [users] = await pool.execute('SELECT id FROM users WHERE username = ?', [username])
    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' })
    }
    
    res.json({
      success: true,
      userId: users[0].id
    })
  } catch (error) {
    console.error('验证用户失败:', error)
    res.status(500).json({ error: '验证失败' })
  }
})

// 重置密码
router.post('/reset-password', async (req, res) => {
  try {
    const { userId, password } = req.body
    
    // 加密密码
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)
    
    // 更新密码
    const [result] = await pool.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, userId]
    )
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '用户不存在' })
    }
    
    res.json({
      success: true,
      message: '密码重置成功'
    })
  } catch (error) {
    console.error('重置密码失败:', error)
    res.status(500).json({ error: '重置密码失败' })
  }
})

// 获取用户信息路由
router.get('/me', async (req, res) => {
  try {
    // 从请求头获取token
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未提供认证令牌' })
    }
    
    // 验证token
    const decoded = jwt.verify(token, JWT_SECRET)
    
    // 查询用户信息
    const [users] = await pool.execute('SELECT id, username, real_name, unit, phone, role FROM users WHERE id = ?', [decoded.userId])
    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' })
    }
    
    res.json({ user: users[0] })
  } catch (error) {
    console.error('获取用户信息失败:', error)
    res.status(401).json({ error: '认证失败' })
  }
})

// 更新用户信息路由
router.put('/me', async (req, res) => {
  try {
    // 从请求头获取token
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未提供认证令牌' })
    }
    
    // 验证token
    const decoded = jwt.verify(token, JWT_SECRET)
    
    const { real_name, unit, phone } = req.body
    
    // 更新用户信息
    const [result] = await pool.execute(
      'UPDATE users SET real_name = ?, unit = ?, phone = ? WHERE id = ?',
      [real_name || '', unit || '', phone || '', decoded.userId]
    )
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '用户不存在' })
    }
    
    // 查询更新后的用户信息
    const [users] = await pool.execute('SELECT id, username, real_name, unit, phone, role FROM users WHERE id = ?', [decoded.userId])
    
    res.json({
      success: true,
      message: '用户信息更新成功',
      user: users[0]
    })
  } catch (error) {
    console.error('更新用户信息失败:', error)
    res.status(500).json({ error: '更新用户信息失败' })
  }
})

module.exports = router
