const pool = require('./config/database')

async function checkTableStructure() {
  try {
    console.log('检查监测点表结构...')
    const [rows] = await pool.query('DESCRIBE monitoring_points')
    console.table(rows)
    
    await pool.end()
  } catch (error) {
    console.error('检查表结构失败:', error)
    await pool.end()
  }
}

checkTableStructure()