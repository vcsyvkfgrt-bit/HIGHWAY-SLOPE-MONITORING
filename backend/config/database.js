const mysql = require('mysql2/promise')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const {
  DB_HOST = 'localhost',
  DB_USER = 'root',
  DB_PASSWORD,
  DB_NAME = 'slope_monitoring',
} = process.env

// 后端路由和脚本里默认口径是 123456（前面的 .env 可能是占位符）
const password =
  DB_PASSWORD && DB_PASSWORD !== 'your_password' ? DB_PASSWORD : '123456'

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password,
  database: DB_NAME,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

module.exports = pool

