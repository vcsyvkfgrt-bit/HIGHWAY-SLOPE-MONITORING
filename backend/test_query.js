const pool = require('./config/database');

(async () => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        slope_id,
        inspection_date,
        inspector,
        inspection_type,
        status,
        (CASE WHEN images IS NOT NULL AND JSON_LENGTH(images) > 0 THEN 1 ELSE 0 END) as has_images
      FROM inspections
      LIMIT 5
    `);
    console.log('查询结果:', JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }
})();
