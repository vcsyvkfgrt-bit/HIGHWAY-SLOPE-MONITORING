const pool = require('./config/database')

async function addPhotoField() {
  try {
    console.log('添加图片字段到监测点表...')
    
    // 检查字段是否已存在
    const [fields] = await pool.query('DESCRIBE monitoring_points')
    const fieldNames = fields.map(f => f.Field)
    
    if (!fieldNames.includes('photo')) {
      // 添加photo字段
      await pool.query('ALTER TABLE monitoring_points ADD COLUMN photo TEXT')
      console.log('成功添加photo字段')
    } else {
      console.log('photo字段已存在')
    }
    
    // 检查修改后的表结构
    const [updatedFields] = await pool.query('DESCRIBE monitoring_points')
    console.table(updatedFields)
    
    await pool.end()
  } catch (error) {
    console.error('添加图片字段失败:', error)
    await pool.end()
  }
}

addPhotoField()