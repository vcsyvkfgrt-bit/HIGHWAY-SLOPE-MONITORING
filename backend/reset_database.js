const mysql = require('mysql2/promise');

async function resetDatabase() {
  try {
    // 连接到MySQL服务器（不指定数据库）
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '123456'
    });

    // 删除现有数据库
    await connection.execute('DROP DATABASE IF EXISTS slope_monitoring');
    console.log('数据库删除成功');

    // 创建新数据库
    await connection.execute('CREATE DATABASE slope_monitoring DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    console.log('数据库创建成功');

    await connection.end();
    console.log('数据库重置完成');
  } catch (error) {
    console.error('数据库重置失败:', error);
  }
}

resetDatabase();