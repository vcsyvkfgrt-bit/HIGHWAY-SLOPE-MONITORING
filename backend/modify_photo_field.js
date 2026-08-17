const pool = require('./config/database')

async function modifyPhotoField() {
  try {
    console.log('修改图片字段类型...')
    
    // 将photo字段从TEXT修改为LONGTEXT
    await pool.query('ALTER TABLE monitoring_points MODIFY COLUMN photo LONGTEXT')
    console.log('成功修改photo字段为LONGTEXT')
    
    // 检查修改后的表结构
    const [fields] = await pool.query('DESCRIBE monitoring_points')
    const photoField = fields.find(f => f.Field === 'photo')
    console.log('修改后的photo字段:', photoField)
    
    await pool.end()
  } catch (error) {
    console.error('修改图片字段失败:', error)
    await pool.end()
  }
}

modifyPhotoField()