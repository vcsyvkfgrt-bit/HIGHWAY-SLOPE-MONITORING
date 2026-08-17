const mysql = require('mysql2/promise');

async function createDatabase() {
  try {
    // 连接到MySQL服务器（不指定数据库）
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '123456'
    });

    // 创建数据库
    await connection.execute('CREATE DATABASE IF NOT EXISTS slope_monitoring DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    console.log('数据库创建成功');

    // 切换到创建的数据库
    await connection.execute('USE slope_monitoring');

    // 创建用户表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        real_name VARCHAR(50),
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('用户表创建成功');

    // 插入测试数据
    await connection.execute(`
      INSERT IGNORE INTO users (username, password, real_name, role) VALUES
      ('admin', 'admin123', '管理员', 'admin'),
      ('user1', 'user123', '张三', 'user'),
      ('user2', 'user123', '李四', 'user')
    `);
    console.log('测试数据插入成功');

    await connection.end();
    console.log('数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
}

createDatabase();