const pool = require('./config/database')

async function testBatchAddPoints() {
  try {
    console.log('开始测试批量添加监测点...')
    
    // 获取一个边坡
    const [slopes] = await pool.query('SELECT * FROM slopes LIMIT 1')
    if (slopes.length === 0) {
      console.log('没有找到边坡，请先添加边坡')
      await pool.end()
      return
    }
    
    const slope = slopes[0]
    console.log('使用边坡:', slope.slope_name, 'ID:', slope.id)
    
    // 测试添加地表位移监测点
    const pointTypes = [
      '地表位移监测点',
      '沉降监测点',
      '深部位移测斜孔'
    ]
    
    for (const pointType of pointTypes) {
      console.log(`\n测试添加 ${pointType}...`)
      
      // 添加3个监测点
      for (let i = 1; i <= 3; i++) {
        const pointName = `${slope.slope_name}${pointType.substring(0, 2)}-${String(i).padStart(2, '0')}`
        
        const sql = `
          INSERT INTO monitoring_points (
            point_name, slope_id, location, point_type, description, install_date, calibration_value, archived
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `
        
        const [result] = await pool.query(sql, [
          pointName,
          slope.id,
          `位置${i}`,
          pointType,
          `${pointType} ${i}`,
          null,
          null
        ])
        
        console.log(`  添加成功: ${pointName}, ID: ${result.insertId}`)
      }
    }
    
    // 查询所有监测点
    const [points] = await pool.query('SELECT * FROM monitoring_points WHERE slope_id = ?', [slope.id])
    console.log(`\n当前边坡共有 ${points.length} 个监测点:`)
    points.forEach(p => {
      console.log(`  - ${p.point_name} (${p.point_type})`)
    })
    
    await pool.end()
    console.log('\n测试完成!')
  } catch (error) {
    console.error('测试失败:', error)
    await pool.end()
  }
}

testBatchAddPoints()