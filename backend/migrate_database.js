const mysql = require('mysql2/promise')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

async function migrate() {
  const {
    DB_HOST = 'localhost',
    DB_USER = 'root',
    DB_PASSWORD = 'your_password',
    DB_NAME = 'slope_monitoring',
  } = process.env

  // 兼容当前项目 .env.example/.env 的占位符密码
  const password = DB_PASSWORD && DB_PASSWORD !== 'your_password' ? DB_PASSWORD : '123456'

  const conn = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password,
    charset: 'utf8mb4',
    multipleStatements: true,
  })

  const run = async (sql) => {
    await conn.query(sql)
  }

  const addIndexIfMissing = async (tableName, indexName, sql) => {
    const [rows] = await conn.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [DB_NAME, tableName, indexName]
    )

    if (rows.length === 0) {
      await run(sql)
      console.log(`[migrate] added ${tableName}.${indexName}`)
    }
  }

  try {
    await run(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await run(`USE \`${DB_NAME}\``)

    // 1) slopes：新增字段
    const [slopeCols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'slopes'`,
      [DB_NAME]
    )
    const slopeColSet = new Set(slopeCols.map((c) => c.COLUMN_NAME))
    
    if (!slopeColSet.has('section')) {
      await run(`ALTER TABLE slopes ADD COLUMN section VARCHAR(100)`)
      console.log('[migrate] added slopes.section')
    }
    if (!slopeColSet.has('start_stake')) {
      await run(`ALTER TABLE slopes ADD COLUMN start_stake VARCHAR(50)`)
      console.log('[migrate] added slopes.start_stake')
    }
    if (!slopeColSet.has('end_stake')) {
      await run(`ALTER TABLE slopes ADD COLUMN end_stake VARCHAR(50)`)
      console.log('[migrate] added slopes.end_stake')
    }
    if (!slopeColSet.has('slope_type')) {
      await run(`ALTER TABLE slopes ADD COLUMN slope_type VARCHAR(50) DEFAULT '滑坡'`)
      console.log('[migrate] added slopes.slope_type')
    }
    if (!slopeColSet.has('max_height')) {
      await run(`ALTER TABLE slopes ADD COLUMN max_height DECIMAL(10,2)`)
      console.log('[migrate] added slopes.max_height')
    }
    if (!slopeColSet.has('contact_person')) {
      await run(`ALTER TABLE slopes ADD COLUMN contact_person VARCHAR(100)`)
      console.log('[migrate] added slopes.contact_person')
    }
    
    // 移除旧字段
    if (false && slopeColSet.has('location')) {
      await run(`ALTER TABLE slopes DROP COLUMN location`)
      console.log('[migrate] removed slopes.location')
    }
    if (false && slopeColSet.has('length')) {
      await run(`ALTER TABLE slopes DROP COLUMN length`)
      console.log('[migrate] removed slopes.length')
    }
    if (false && slopeColSet.has('height')) {
      await run(`ALTER TABLE slopes DROP COLUMN height`)
      console.log('[migrate] removed slopes.height')
    }

    // 2) monitoring_points：新增 install_date/calibration_value/archived
    const [pointCols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'monitoring_points'`,
      [DB_NAME]
    )
    const pointColSet = new Set(pointCols.map((c) => c.COLUMN_NAME))

    if (!pointColSet.has('install_date')) {
      await run(`
        ALTER TABLE monitoring_points
        ADD COLUMN install_date DATE NULL
      `)
      console.log('[migrate] added monitoring_points.install_date')
    }
    if (!pointColSet.has('calibration_value')) {
      await run(`
        ALTER TABLE monitoring_points
        ADD COLUMN calibration_value DECIMAL(10, 2) NULL
      `)
      console.log('[migrate] added monitoring_points.calibration_value')
    }
    if (!pointColSet.has('archived')) {
      await run(`
        ALTER TABLE monitoring_points
        ADD COLUMN archived BOOLEAN NOT NULL DEFAULT 0
      `)
      console.log('[migrate] added monitoring_points.archived')
    }

    // 3) monitoring_data：将 DATE 改为 DATETIME（时间补 00:00:00）
    const [dataCols] = await conn.query(
      `SELECT COLUMN_NAME, DATA_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'monitoring_data'`,
      [DB_NAME]
    )
    const monitorDateCol = dataCols.find((c) => c.COLUMN_NAME === 'monitor_date')
    const isDateType = monitorDateCol && monitorDateCol.DATA_TYPE === 'date'
    if (isDateType) {
      await run(`
        ALTER TABLE monitoring_data
        MODIFY monitor_date DATETIME NOT NULL
      `)
      console.log('[migrate] modified monitoring_data.monitor_date to DATETIME')
    }

    // 4) 创建巡检表
    const [inspectionTables] = await conn.query(
      `SHOW TABLES LIKE 'inspections'`,
      [DB_NAME]
    )
    if (inspectionTables.length === 0) {
      await run(`
        CREATE TABLE inspections (
          id INT AUTO_INCREMENT PRIMARY KEY,
          slope_id INT,
          inspection_date DATETIME NOT NULL,
          inspector VARCHAR(100) NOT NULL,
          inspection_type VARCHAR(50) NOT NULL,
          status ENUM('normal', 'abnormal', 'attention') NOT NULL DEFAULT 'normal',
          content TEXT,
          problems TEXT,
          suggestions TEXT,
          images JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (slope_id) REFERENCES slopes(id) ON DELETE SET NULL,
          INDEX idx_slope_id (slope_id),
          INDEX idx_inspection_date (inspection_date),
          INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `)
      console.log('[migrate] created inspections table')
    }

    const [inspectionCols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'inspections'`,
      [DB_NAME]
    )
    const inspectionColSet = new Set(inspectionCols.map((c) => c.COLUMN_NAME))
    if (!inspectionColSet.has('result')) {
      await run(`ALTER TABLE inspections ADD COLUMN result TEXT`)
      console.log('[migrate] added inspections.result')
    }

    await addIndexIfMissing('inspections', 'idx_slope_id', `ALTER TABLE inspections ADD INDEX idx_slope_id (slope_id)`)
    await addIndexIfMissing('inspections', 'idx_inspection_date', `ALTER TABLE inspections ADD INDEX idx_inspection_date (inspection_date)`)
    await addIndexIfMissing('inspections', 'idx_status', `ALTER TABLE inspections ADD INDEX idx_status (status)`)

    const [userCols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
      [DB_NAME]
    )
    const userColSet = new Set(userCols.map((c) => c.COLUMN_NAME))
    if (!userColSet.has('unit')) {
      await run(`ALTER TABLE users ADD COLUMN unit VARCHAR(100)`)
      console.log('[migrate] added users.unit')
    }
    if (!userColSet.has('phone')) {
      await run(`ALTER TABLE users ADD COLUMN phone VARCHAR(50)`)
      console.log('[migrate] added users.phone')
    }

    await run(`
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
    `)

    await run(`
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
    `)

    await run(`
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
    `)

    await run(`
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
    `)

    await run(`
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
    `)

    await run(`
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
    `)

    await run(`
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
    `)

    await run(`
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
    `)

    await run(`
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
    `)

    await run(`
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
    `)

    await run(`
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
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS inclinometer_baselines (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        point_id INT NOT NULL,
        hole_name VARCHAR(100) NOT NULL,
        baseline_date DATE NOT NULL,
        test_basis VARCHAR(50),
        measure_interval DECIMAL(10,3),
        data_length DECIMAL(10,3),
        water_depth DECIMAL(10,3),
        source_file VARCHAR(255),
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_inclinometer_baseline_point (point_id),
        INDEX idx_inclinometer_baseline_date (baseline_date),
        FOREIGN KEY (point_id) REFERENCES monitoring_points(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS inclinometer_baseline_readings (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        baseline_id BIGINT NOT NULL,
        depth_m DECIMAL(10,3) NOT NULL,
        forward_reading DECIMAL(14,4),
        reverse_reading DECIMAL(14,4),
        baseline_value DECIMAL(14,4) NOT NULL,
        row_order INT NOT NULL DEFAULT 0,
        UNIQUE KEY uk_inclinometer_baseline_depth (baseline_id, depth_m),
        INDEX idx_inclinometer_baseline_order (baseline_id, row_order),
        FOREIGN KEY (baseline_id) REFERENCES inclinometer_baselines(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS inclinometer_surveys (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        point_id INT NOT NULL,
        survey_no INT,
        survey_date DATE NOT NULL,
        test_basis VARCHAR(50),
        measure_interval DECIMAL(10,3),
        data_length DECIMAL(10,3),
        source_file VARCHAR(255),
        remark VARCHAR(500),
        max_cumulative DECIMAL(14,4),
        max_relative DECIMAL(14,4),
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_inclinometer_survey_point_date (point_id, survey_date),
        INDEX idx_inclinometer_survey_date (survey_date),
        FOREIGN KEY (point_id) REFERENCES monitoring_points(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS inclinometer_survey_readings (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        survey_id BIGINT NOT NULL,
        depth_m DECIMAL(10,3) NOT NULL,
        forward_reading DECIMAL(14,4),
        reverse_reading DECIMAL(14,4),
        test_value DECIMAL(14,4) NOT NULL,
        cumulative_displacement DECIMAL(14,4) NOT NULL,
        relative_displacement DECIMAL(14,4) NOT NULL,
        row_order INT NOT NULL DEFAULT 0,
        UNIQUE KEY uk_inclinometer_survey_depth (survey_id, depth_m),
        INDEX idx_inclinometer_survey_order (survey_id, row_order),
        FOREIGN KEY (survey_id) REFERENCES inclinometer_surveys(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS slope_ledger_entries (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        slope_id INT NOT NULL,
        ledger_month CHAR(7) NOT NULL,
        safety_status VARCHAR(30),
        work_status VARCHAR(30),
        suggested_safety_status VARCHAR(30),
        suggested_work_status VARCHAR(30),
        status_adjust_reason VARCHAR(500),
        construction_progress TEXT,
        current_problem TEXT,
        pause_reason VARCHAR(500),
        effective_date DATE,
        updated_by INT,
        updated_by_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_slope_ledger_entry (slope_id, ledger_month),
        INDEX idx_ledger_month (ledger_month),
        INDEX idx_slope_id (slope_id),
        FOREIGN KEY (slope_id) REFERENCES slopes(id) ON DELETE CASCADE,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS slope_ledger_frequencies (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        slope_id INT NOT NULL,
        ledger_month CHAR(7) NOT NULL,
        point_type VARCHAR(100) NOT NULL,
        frequency_text VARCHAR(200),
        required_times INT NOT NULL DEFAULT 0,
        remark VARCHAR(500),
        updated_by INT,
        updated_by_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_slope_ledger_frequency (slope_id, ledger_month, point_type),
        INDEX idx_ledger_month (ledger_month),
        INDEX idx_slope_id (slope_id),
        FOREIGN KEY (slope_id) REFERENCES slopes(id) ON DELETE CASCADE,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS slope_ledger_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        slope_id INT NOT NULL,
        ledger_month CHAR(7) NOT NULL,
        log_type ENUM('progress','problem') NOT NULL DEFAULT 'progress',
        record_date DATE NOT NULL,
        content TEXT NOT NULL,
        severity VARCHAR(30),
        measures TEXT,
        responsible_person VARCHAR(100),
        status VARCHAR(30),
        closed_date DATE,
        recorder_id INT,
        recorder_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_slope_month (slope_id, ledger_month),
        INDEX idx_log_type (log_type),
        INDEX idx_record_date (record_date),
        FOREIGN KEY (slope_id) REFERENCES slopes(id) ON DELETE CASCADE,
        FOREIGN KEY (recorder_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS slope_ledger_maps (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        slope_id INT NOT NULL,
        file_asset_id BIGINT NOT NULL,
        is_current BOOLEAN NOT NULL DEFAULT 0,
        uploaded_by INT,
        uploaded_by_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_slope_id (slope_id),
        INDEX idx_file_asset_id (file_asset_id),
        INDEX idx_current (slope_id, is_current),
        FOREIGN KEY (slope_id) REFERENCES slopes(id) ON DELETE CASCADE,
        FOREIGN KEY (file_asset_id) REFERENCES file_assets(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS slope_map_point_positions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        map_id BIGINT NOT NULL,
        slope_id INT NOT NULL,
        point_id INT NOT NULL,
        x_percent DECIMAL(9,6) NOT NULL,
        y_percent DECIMAL(9,6) NOT NULL,
        label_visible BOOLEAN NOT NULL DEFAULT 1,
        created_by INT,
        updated_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_map_point_position (map_id, point_id),
        INDEX idx_slope_map (slope_id, map_id),
        INDEX idx_point_id (point_id),
        FOREIGN KEY (map_id) REFERENCES slope_ledger_maps(id) ON DELETE CASCADE,
        FOREIGN KEY (slope_id) REFERENCES slopes(id) ON DELETE CASCADE,
        FOREIGN KEY (point_id) REFERENCES monitoring_points(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS slope_map_position_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        map_id BIGINT NOT NULL,
        slope_id INT NOT NULL,
        summary VARCHAR(500) NOT NULL,
        detail JSON,
        created_by INT,
        created_by_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_slope_map (slope_id, map_id),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (map_id) REFERENCES slope_ledger_maps(id) ON DELETE CASCADE,
        FOREIGN KEY (slope_id) REFERENCES slopes(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS report_records (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        report_type ENUM('weekly','monthly','custom') NOT NULL DEFAULT 'weekly',
        report_period VARCHAR(100),
        status ENUM('draft','pending_review','reviewed','exported','archived') NOT NULL DEFAULT 'draft',
        version_no INT NOT NULL DEFAULT 1,
        author VARCHAR(100),
        reviewer VARCHAR(100),
        report_date DATE,
        selected_data JSON,
        template_snapshot JSON,
        content_json JSON,
        chart_assets JSON,
        created_by INT,
        created_by_name VARCHAR(100),
        updated_by INT,
        updated_by_name VARCHAR(100),
        archived_by INT,
        archived_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_report_type (report_type),
        INDEX idx_status (status),
        INDEX idx_report_date (report_date),
        INDEX idx_updated_at (updated_at),
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await run(`
      CREATE TABLE IF NOT EXISTS report_versions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        report_id BIGINT NOT NULL,
        version_no INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        author VARCHAR(100),
        reviewer VARCHAR(100),
        report_date DATE,
        selected_data JSON,
        template_snapshot JSON,
        content_json JSON,
        chart_assets JSON,
        created_by INT,
        created_by_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_report_version (report_id, version_no),
        INDEX idx_report_id (report_id),
        FOREIGN KEY (report_id) REFERENCES report_records(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    const [templateCols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'templates'`,
      [DB_NAME]
    )
    const templateColSet = new Set(templateCols.map((c) => c.COLUMN_NAME))

    if (!templateColSet.has('template_kind')) {
      await run(`ALTER TABLE templates ADD COLUMN template_kind ENUM('system','word') NOT NULL DEFAULT 'system'`)
      console.log('[migrate] added templates.template_kind')
    }
    if (!templateColSet.has('version_no')) {
      await run(`ALTER TABLE templates ADD COLUMN version_no INT NOT NULL DEFAULT 1`)
      console.log('[migrate] added templates.version_no')
    }
    if (!templateColSet.has('file_asset_id')) {
      await run(`ALTER TABLE templates ADD COLUMN file_asset_id BIGINT NULL`)
      console.log('[migrate] added templates.file_asset_id')
    }
    if (!templateColSet.has('placeholders')) {
      await run(`ALTER TABLE templates ADD COLUMN placeholders JSON NULL`)
      console.log('[migrate] added templates.placeholders')
    }
    if (!templateColSet.has('structure')) {
      await run(`ALTER TABLE templates ADD COLUMN structure JSON NULL`)
      console.log('[migrate] added templates.structure')
    }
    if (!templateColSet.has('content_text')) {
      await run(`ALTER TABLE templates ADD COLUMN content_text LONGTEXT NULL`)
      console.log('[migrate] added templates.content_text')
    }
    if (!templateColSet.has('data_bindings')) {
      await run(`ALTER TABLE templates ADD COLUMN data_bindings JSON NULL`)
      console.log('[migrate] added templates.data_bindings')
    }
    if (!templateColSet.has('updated_by')) {
      await run(`ALTER TABLE templates ADD COLUMN updated_by INT NULL`)
      console.log('[migrate] added templates.updated_by')
    }
    if (!templateColSet.has('updated_by_name')) {
      await run(`ALTER TABLE templates ADD COLUMN updated_by_name VARCHAR(100) NULL`)
      console.log('[migrate] added templates.updated_by_name')
    }

    await run(`
      CREATE TABLE IF NOT EXISTS template_versions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        template_id INT NOT NULL,
        version_no INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        type ENUM('weekly','monthly','custom') NOT NULL DEFAULT 'custom',
        description TEXT,
        template_kind ENUM('system','word') NOT NULL DEFAULT 'system',
        modules JSON NOT NULL,
        file_asset_id BIGINT,
        placeholders JSON,
        structure JSON,
        content_text LONGTEXT,
        data_bindings JSON,
        created_by INT,
        created_by_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_template_version (template_id, version_no),
        INDEX idx_template_id (template_id),
        FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await run(`
      INSERT IGNORE INTO template_versions
        (template_id, version_no, name, type, description, template_kind, modules,
         file_asset_id, placeholders, structure, content_text, data_bindings, created_by, created_by_name, created_at)
      SELECT
        id,
        COALESCE(version_no, 1),
        name,
        type,
        COALESCE(description, ''),
        COALESCE(template_kind, 'system'),
        modules,
        file_asset_id,
        placeholders,
        structure,
        content_text,
        data_bindings,
        created_by,
        updated_by_name,
        created_at
      FROM templates
    `)

    console.log('[migrate] done')
  } finally {
    await conn.end()
  }
}

migrate().catch((e) => {
  console.error('[migrate] failed:', e)
  process.exit(1)
})

