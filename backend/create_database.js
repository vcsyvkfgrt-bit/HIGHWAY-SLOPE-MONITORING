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
    await connection.query('USE slope_monitoring');

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

    // 创建边坡表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS slopes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slope_name VARCHAR(100) NOT NULL,
        section VARCHAR(100),
        start_stake VARCHAR(50),
        end_stake VARCHAR(50),
        slope_type VARCHAR(50) DEFAULT '滑坡',
        max_height DECIMAL(10,2),
        contact_person VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('边坡表创建成功');

    // 创建监测点表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS monitoring_points (
        id INT AUTO_INCREMENT PRIMARY KEY,
        point_name VARCHAR(100) NOT NULL,
        slope_id INT,
        location VARCHAR(255),
        point_type VARCHAR(50),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (slope_id) REFERENCES slopes(id) ON DELETE SET NULL,
        INDEX idx_slope_id (slope_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('监测点表创建成功');

    // 创建监测数据表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS monitoring_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        point_id INT,
        monitor_type VARCHAR(50) NOT NULL,
        monitor_date DATE NOT NULL,
        value DECIMAL(10, 2) NOT NULL,
        unit VARCHAR(20),
        remark TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (point_id) REFERENCES monitoring_points(id) ON DELETE SET NULL,
        INDEX idx_point_id (point_id),
        INDEX idx_monitor_date (monitor_date),
        INDEX idx_monitor_type (monitor_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('监测数据表创建成功');

    // 创建报告表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        report_type ENUM('weekly', 'monthly') NOT NULL,
        date_range VARCHAR(100) NOT NULL,
        points JSON,
        author VARCHAR(50),
        content JSON,
        create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_report_type (report_type),
        INDEX idx_create_time (create_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('报告表创建成功');

    // 创建模板表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        type ENUM('weekly', 'monthly', 'custom') NOT NULL DEFAULT 'custom',
        description TEXT,
        modules JSON NOT NULL,
        is_system BOOLEAN DEFAULT FALSE,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_type (type),
        INDEX idx_is_system (is_system),
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('模板表创建成功');

    // 创建巡检表
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS inspections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slope_id INT,
        inspection_date DATETIME NOT NULL,
        inspector VARCHAR(100) NOT NULL,
        inspection_type VARCHAR(50) NOT NULL,
        status ENUM('normal', 'abnormal', 'attention') NOT NULL DEFAULT 'normal',
        content TEXT,
        problems TEXT,
        suggestions TEXT,
        result TEXT,
        images JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (slope_id) REFERENCES slopes(id) ON DELETE SET NULL,
        INDEX idx_slope_id (slope_id),
        INDEX idx_inspection_date (inspection_date),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('巡检表创建成功');

    // 插入默认管理员用户
    await connection.execute(`
      INSERT IGNORE INTO users (username, password, real_name, role) VALUES
      ('admin', 'admin123', '管理员', 'admin')
    `);
    console.log('默认管理员用户创建成功');

    // 插入默认系统模板
    const defaultTemplate = {
      name: '周报基础模板',
      type: 'weekly',
      description: '包含基本的周报结构和常用模块',
      modules: [
        {
          id: 'mod_1',
          name: '项目概况',
          children: [
            { id: 'child_1', type: 'text', name: '项目基本信息', default: '项目名称：XX公路边坡监测项目\n项目地点：XX省XX市\n监测周期：2026年第X周' },
            { id: 'child_2', type: 'text', name: '监测目的', default: '为确保公路边坡的安全稳定，及时发现和预警边坡变形情况，保障公路通行安全。' },
            { id: 'child_3', type: 'text', name: '监测范围', default: 'XX公路K1+200-K1+500段右侧边坡' }
          ]
        },
        {
          id: 'mod_2',
          name: '边坡设计复核',
          children: [
            { id: 'child_4', type: 'text', name: '设计参数复核', default: '边坡设计坡度：1:1.5\n设计稳定系数：≥1.25\n支护结构：锚杆+格构梁' },
            { id: 'child_5', type: 'table', name: '设计对比表', columns: ['项目', '设计值', '实测值', '偏差'] }
          ]
        },
        {
          id: 'mod_3',
          name: '边坡监测情况',
          children: [
            { id: 'child_6', type: 'monitoring', name: '表面位移监测', monitoringType: 'surface' },
            { id: 'child_7', type: 'chart', name: '位移趋势图', chartType: 'line', description: '本周位移变化趋势' },
            { id: 'child_8', type: 'text', name: '监测分析', default: '本周监测数据显示，边坡位移处于正常范围内，未发现异常变化。' }
          ]
        },
        {
          id: 'mod_4',
          name: '边坡巡查情况',
          children: [
            { id: 'child_9', type: 'select', name: '巡查结果', options: ['正常', '异常', '需关注'], default: '正常' },
            { id: 'child_10', type: 'text', name: '巡查记录', default: '本周对监测边坡进行了X次巡查，边坡表面无明显裂缝、坍塌等异常现象。' }
          ]
        }
      ],
      is_system: true
    };

    await connection.execute(`
      INSERT IGNORE INTO templates (name, type, description, modules, is_system) 
      VALUES (?, ?, ?, ?, ?)
    `, [
      defaultTemplate.name,
      defaultTemplate.type,
      defaultTemplate.description,
      JSON.stringify(defaultTemplate.modules),
      defaultTemplate.is_system
    ]);
    console.log('默认模板插入成功');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_name VARCHAR(255) NOT NULL,
        project_code VARCHAR(100),
        location VARCHAR(255),
        owner_unit VARCHAR(255),
        start_date DATE,
        description TEXT,
        lifecycle_stage ENUM('project_created','plan_configured','device_installed','data_connected','auto_monitoring','risk_analysis','report_generated') NOT NULL DEFAULT 'project_created',
        status ENUM('active','paused','completed','archived') NOT NULL DEFAULT 'active',
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_project_code (project_code),
        INDEX idx_lifecycle_stage (lifecycle_stage),
        INDEX idx_status (status),
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS project_lifecycle_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        stage VARCHAR(50) NOT NULL,
        description TEXT,
        operator_id INT,
        operator_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_project_id (project_id),
        INDEX idx_stage (stage),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS monitoring_plans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        plan_name VARCHAR(255) NOT NULL,
        monitor_items JSON,
        frequency VARCHAR(100),
        threshold_rules JSON,
        responsible_person VARCHAR(100),
        description TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_project_id (project_id),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        device_name VARCHAR(255) NOT NULL,
        device_code VARCHAR(100),
        device_type VARCHAR(100),
        install_location VARCHAR(255),
        install_time DATETIME,
        status ENUM('installed','online','offline','maintenance','removed') NOT NULL DEFAULT 'installed',
        data_source VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_project_id (project_id),
        INDEX idx_device_code (device_code),
        INDEX idx_status (status),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS risk_analysis_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        risk_level ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low',
        conclusion TEXT,
        measures TEXT,
        analyst_id INT,
        analyst_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_project_id (project_id),
        INDEX idx_risk_level (risk_level),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (analyst_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS alarms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT,
        point_id INT,
        alarm_type VARCHAR(100) NOT NULL,
        alarm_level ENUM('info','warning','serious','critical') NOT NULL DEFAULT 'warning',
        abnormal_value DECIMAL(12,3),
        threshold_value DECIMAL(12,3),
        description TEXT,
        status ENUM('data_abnormal','alarming','confirmed','field_review','processing','closed') NOT NULL DEFAULT 'alarming',
        field_review_result TEXT,
        measures TEXT,
        close_summary TEXT,
        created_by INT,
        confirmed_by INT,
        confirmed_at DATETIME,
        closed_by INT,
        closed_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_project_id (project_id),
        INDEX idx_point_id (point_id),
        INDEX idx_status (status),
        INDEX idx_alarm_level (alarm_level),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY (point_id) REFERENCES monitoring_points(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS alarm_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        alarm_id INT NOT NULL,
        status VARCHAR(50) NOT NULL,
        description TEXT,
        operator_id INT,
        operator_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_alarm_id (alarm_id),
        INDEX idx_status (status),
        FOREIGN KEY (alarm_id) REFERENCES alarms(id) ON DELETE CASCADE,
        FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS operation_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        username VARCHAR(100),
        method VARCHAR(10) NOT NULL,
        path VARCHAR(500) NOT NULL,
        resource VARCHAR(255),
        resource_id VARCHAR(100),
        status_code INT,
        duration_ms INT,
        ip VARCHAR(100),
        user_agent VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_resource (resource),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS file_assets (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        module VARCHAR(100) NOT NULL DEFAULT 'common',
        business_id VARCHAR(100),
        original_name VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        mime_type VARCHAR(120),
        file_size BIGINT,
        uploader_id INT,
        uploader_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_module_business (module, business_id),
        INDEX idx_uploader_id (uploader_id),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS monitoring_import_batches (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        batch_no VARCHAR(80) NOT NULL UNIQUE,
        file_name VARCHAR(255) NOT NULL,
        file_size BIGINT,
        data_type VARCHAR(50) NOT NULL DEFAULT 'monitoring_data',
        status ENUM('uploaded','parsed','validation_failed','pending_import','imported','cancelled','rolled_back') NOT NULL DEFAULT 'uploaded',
        total_rows INT NOT NULL DEFAULT 0,
        valid_rows INT NOT NULL DEFAULT 0,
        error_rows INT NOT NULL DEFAULT 0,
        duplicate_rows INT NOT NULL DEFAULT 0,
        uploader_id INT,
        uploader_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_batch_no (batch_no),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS monitoring_import_errors (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        batch_id BIGINT NOT NULL,
        source_row_number INT NOT NULL,
        field_name VARCHAR(100),
        error_message VARCHAR(500) NOT NULL,
        raw_data JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_batch_id (batch_id),
        INDEX idx_source_row_number (source_row_number),
        FOREIGN KEY (batch_id) REFERENCES monitoring_import_batches(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.end();
    console.log('数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
}

createDatabase();
