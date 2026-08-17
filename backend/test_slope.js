const pool = require('./config/database')

async function testAddSlope() {
  try {
    console.log('测试添加边坡...')
    
    const slopeData = {
      slope_name: '测试边坡',
      section: 'A标段',
      start_stake: 'K10+000',
      end_stake: 'K10+100',
      slope_type: '滑坡',
      max_height: 10,
      contact_person: '张三',
      description: '测试边坡'
    }
    
    const sql = `
      INSERT INTO slopes (slope_name, section, start_stake, end_stake, slope_type, max_height, contact_person, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    
    const [result] = await pool.query(sql, [
      slopeData.slope_name,
      slopeData.section,
      slopeData.start_stake,
      slopeData.end_stake,
      slopeData.slope_type || '滑坡',
      slopeData.max_height,
      slopeData.contact_person,
      slopeData.description || null
    ])
    
    console.log('添加边坡成功:', result)
    
    // 验证数据是否正确插入
    const [rows] = await pool.query('SELECT * FROM slopes WHERE id = ?', [result.insertId])
    console.log('插入的数据:', rows[0])
    
    await pool.end()
  } catch (error) {
    console.error('添加边坡失败:', error)
    await pool.end()
  }
}

testAddSlope()
