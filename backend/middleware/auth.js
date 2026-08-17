const jwt = require('jsonwebtoken')
const { JWT_SECRET } = require('../config/auth')

function extractToken(req) {
  const authorization = req.headers.authorization || ''
  const [scheme, token] = authorization.split(' ')
  if (scheme === 'Bearer' && token) return token
  return null
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

function auth(req, res, next) {
  try {
    const token = extractToken(req)

    if (!token) {
      return res.status(401).json({ success: false, message: '未提供认证令牌', error: '未提供认证令牌' })
    }

    req.user = verifyToken(token)
    next()
  } catch (error) {
    console.error('认证失败:', error.message)
    res.status(401).json({ success: false, message: '认证失败', error: '认证失败' })
  }
}

function requireRole(roles = []) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles]

  return (req, res, next) => {
    if (!req.user) {
      return auth(req, res, () => requireRole(allowedRoles)(req, res, next))
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: '权限不足', error: '权限不足' })
    }

    next()
  }
}

auth.extractToken = extractToken
auth.verifyToken = verifyToken
auth.requireRole = requireRole

module.exports = auth
