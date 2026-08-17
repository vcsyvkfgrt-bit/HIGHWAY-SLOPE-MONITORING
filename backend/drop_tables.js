const mysql = require('mysql2/promise')

async function dropTables() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '123456',
      database: 'slope_monitoring'
    })

    await connection.execute('DROP TABLE IF EXISTS monitoring_data')
    console.log('monitoring_data 表已删除')

    await connection.execute('DROP TABLE IF EXISTS monitoring_points')
    console.log('monitoring_points 表已删除')

    await connection.execute('DROP TABLE IF EXISTS slopes')
    console.log('slopes 表已删除')

    await connection.end()
    console.log('表删除完成')
  } catch (error) {
    console.error('删除表失败:', error)
    process.exit(1)
  }
}

dropTables()