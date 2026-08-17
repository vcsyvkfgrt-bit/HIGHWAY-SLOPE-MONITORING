const jwt = require('jsonwebtoken')
const pool = require('../config/database')
const { JWT_SECRET } = require('../config/auth')

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function getActor(req) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return null

  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

function operationLog(req, res, next) {
  if (!req.path.startsWith('/api') || !WRITE_METHODS.has(req.method)) {
    return next()
  }

  const startedAt = Date.now()
  const actor = getActor(req)

  res.on('finish', async () => {
    try {
      await pool.query(
        `INSERT INTO operation_logs
          (user_id, username, method, path, resource, resource_id, status_code, duration_ms, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          actor?.userId || null,
          actor?.username || null,
          req.method,
          req.originalUrl,
          req.baseUrl || req.path,
          req.params?.id || req.params?.project_id || req.params?.alarm_id || null,
          res.statusCode,
          Date.now() - startedAt,
          req.ip,
          req.headers['user-agent'] || null,
        ]
      )
    } catch (error) {
      console.error('[operation-log] write failed:', error.message)
    }
  })

  next()
}

module.exports = operationLog
