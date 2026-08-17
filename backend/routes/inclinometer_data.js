const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const auth = require('../middleware/auth')

const DEEP_POINT_TYPE = '深部位移测斜孔'
let schemaReady = false

function normalizeDate(input) {
  if (!input) return null
  const text = String(input).trim()
  const dotted = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (!dotted) return null
  const [, y, m, d] = dotted
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function asNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const num = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(num) ? num : null
}

function round3(value) {
  const num = asNumber(value)
  return num === null ? null : Math.round(num * 1000) / 1000
}

function round4(value) {
  const num = asNumber(value)
  return num === null ? null : Math.round((num + Number.EPSILON) * 10000) / 10000
}

function readingIncrement(row) {
  const forward = asNumber(row.forward_reading)
  const reverse = asNumber(row.reverse_reading)
  if (forward === null || reverse === null) return null
  return round4((forward - reverse) / 2)
}

function normalizeBaselineRows(readings, preferReadings = true) {
  let previousBaselineValue = 0
  return readings
    .map((row, index) => {
      const depth = round3(row.depth_m ?? row.depth)
      const increment = readingIncrement(row)
      let baselineValue = preferReadings && increment !== null
        ? round4(previousBaselineValue + increment)
        : round4(row.baseline_value ?? row.value)
      if (baselineValue === null && increment !== null) baselineValue = round4(previousBaselineValue + increment)
      if (baselineValue !== null) previousBaselineValue = baselineValue
      return {
        depth_m: depth,
        forward_reading: round4(row.forward_reading),
        reverse_reading: round4(row.reverse_reading),
        baseline_value: baselineValue,
        row_order: row.row_order ?? index,
      }
    })
    .filter((row) => row.depth_m !== null && row.baseline_value !== null)
}

async function ensureSchema() {
  if (schemaReady) return

  await pool.query(`
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
      CONSTRAINT fk_inclinometer_baseline_point
        FOREIGN KEY (point_id) REFERENCES monitoring_points(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
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
      CONSTRAINT fk_inclinometer_baseline_readings_baseline
        FOREIGN KEY (baseline_id) REFERENCES inclinometer_baselines(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
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
      CONSTRAINT fk_inclinometer_survey_point
        FOREIGN KEY (point_id) REFERENCES monitoring_points(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await pool.query(`
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
      CONSTRAINT fk_inclinometer_survey_readings_survey
        FOREIGN KEY (survey_id) REFERENCES inclinometer_surveys(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  schemaReady = true
}

async function getDeepPoint(conn, pointId) {
  const [rows] = await conn.query(
    `SELECT p.id, p.point_name, p.point_type, p.archived, p.slope_id, s.slope_name
     FROM monitoring_points p
     LEFT JOIN slopes s ON p.slope_id = s.id
     WHERE p.id = ?`,
    [pointId]
  )
  if (rows.length === 0) return { error: [404, '测斜孔不存在'] }
  const point = rows[0]
  if (point.archived) return { error: [409, '测斜孔已归档'] }
  if (point.point_type !== DEEP_POINT_TYPE) return { error: [400, '该测点不是深部位移测斜孔'] }
  return { point }
}

function normalizeBaselineReadings(readings) {
  if (!Array.isArray(readings) || readings.length === 0) {
    return { error: '初始值数据不能为空' }
  }

  const baselineRows = normalizeBaselineRows(readings, true)
  const normalized = []
  const depthSet = new Set()
  baselineRows.forEach((row) => {
    const depth = row.depth_m
    const baselineValue = row.baseline_value
    const depthKey = depth.toFixed(3)
    if (depthSet.has(depthKey)) return
    depthSet.add(depthKey)
    normalized.push([
      depth,
      row.forward_reading,
      row.reverse_reading,
      baselineValue,
      row.row_order,
    ])
  })

  if (normalized.length === 0) return { error: '没有识别到有效的初始值深度数据' }
  return { readings: normalized }
}

function normalizeSurveyReadings(inputReadings, baselineRows) {
  if (!Array.isArray(inputReadings) || inputReadings.length === 0) {
    return { error: '观测数据不能为空' }
  }

  const baselineMap = new Map()
  normalizeBaselineRows(baselineRows, true).forEach((row) => {
    baselineMap.set(Number(row.depth_m).toFixed(3), Number(row.baseline_value))
  })

  const normalized = []
  let previousTestValue = 0
  let previousBias = null

  inputReadings.forEach((row, index) => {
    const depth = round3(row.depth_m ?? row.depth)
    const increment = readingIncrement(row)
    let testValue = increment !== null
      ? round4(previousTestValue + increment)
      : round4(row.test_value ?? row.value)
    if (depth === null || testValue === null) return

    const baselineValue = baselineMap.get(depth.toFixed(3))
    if (baselineValue === undefined) return

    const bias = (increment !== null ? null : round4(row.cumulative_displacement ?? row.cumulative ?? row.bias ?? row.deviation))
      ?? round4(testValue - baselineValue)
    const relative = (increment !== null ? null : round4(row.relative_displacement ?? row.relative ?? row.relative_deformation))
      ?? round4(previousBias === null ? bias : bias - previousBias)
    previousTestValue = testValue
    previousBias = bias

    normalized.push([
      depth,
      round4(row.forward_reading),
      round4(row.reverse_reading),
      testValue,
      bias,
      relative,
      index,
    ])
  })

  if (normalized.length === 0) {
    return { error: '没有识别到有效观测数据，或观测深度与初始值不匹配' }
  }

  return { readings: normalized }
}

router.get('/baseline/status', async (req, res) => {
  try {
    await ensureSchema()
    const pointId = Number(req.query.point_id)
    if (!pointId) return res.status(400).json({ success: false, message: '缺少 point_id' })

    const [rows] = await pool.query(
      `SELECT b.*, COUNT(r.id) AS reading_count
       FROM inclinometer_baselines b
       LEFT JOIN inclinometer_baseline_readings r ON b.id = r.baseline_id
       WHERE b.point_id = ?
       GROUP BY b.id`,
      [pointId]
    )

    res.json({ success: true, data: { has_baseline: rows.length > 0, baseline: rows[0] || null } })
  } catch (error) {
    console.error('获取测斜初始值状态失败:', error)
    res.status(500).json({ success: false, message: '获取测斜初始值状态失败' })
  }
})

router.post('/baseline', auth, async (req, res) => {
  await ensureSchema()
  const conn = await pool.getConnection()

  try {
    const {
      point_id,
      hole_name,
      baseline_date,
      test_basis,
      measure_interval,
      data_length,
      water_depth,
      source_file,
      overwrite = false,
      readings,
    } = req.body

    const pointId = Number(point_id)
    if (!pointId) return res.status(400).json({ success: false, message: '缺少 point_id' })

    const { point, error } = await getDeepPoint(conn, pointId)
    if (error) return res.status(error[0]).json({ success: false, message: error[1] })

    const baselineDate = normalizeDate(baseline_date)
    if (!baselineDate) return res.status(400).json({ success: false, message: '初始值日期格式不正确' })

    const normalized = normalizeBaselineReadings(readings)
    if (normalized.error) return res.status(400).json({ success: false, message: normalized.error })

    await conn.beginTransaction()
    const [existing] = await conn.query('SELECT id FROM inclinometer_baselines WHERE point_id = ?', [pointId])
    if (existing.length > 0 && !overwrite) {
      await conn.rollback()
      return res.status(409).json({ success: false, message: '该测斜孔已有初始值，如需替换请勾选覆盖' })
    }

    if (existing.length > 0) {
      await conn.query('DELETE FROM inclinometer_baselines WHERE point_id = ?', [pointId])
    }

    const [result] = await conn.query(
      `INSERT INTO inclinometer_baselines
        (point_id, hole_name, baseline_date, test_basis, measure_interval, data_length, water_depth, source_file, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pointId,
        hole_name || point.point_name,
        baselineDate,
        test_basis || null,
        asNumber(measure_interval),
        asNumber(data_length),
        asNumber(water_depth),
        source_file || null,
        req.user?.userId || null,
      ]
    )

    const placeholders = normalized.readings.map(() => '(?, ?, ?, ?, ?, ?)').join(',')
    const values = normalized.readings.flatMap((row) => [result.insertId, ...row])
    await conn.query(
      `INSERT INTO inclinometer_baseline_readings
        (baseline_id, depth_m, forward_reading, reverse_reading, baseline_value, row_order)
       VALUES ${placeholders}`,
      values
    )

    await conn.commit()
    res.status(201).json({
      success: true,
      message: '初始值上传成功',
      data: { baseline_id: result.insertId, reading_count: normalized.readings.length },
    })
  } catch (error) {
    await conn.rollback()
    console.error('保存测斜初始值失败:', error)
    res.status(500).json({ success: false, message: '保存测斜初始值失败' })
  } finally {
    conn.release()
  }
})

router.post('/surveys/batch', auth, async (req, res) => {
  await ensureSchema()
  const conn = await pool.getConnection()

  try {
    const {
      point_id,
      test_basis,
      measure_interval,
      data_length,
      source_file,
      overwrite = true,
      surveys,
    } = req.body

    const pointId = Number(point_id)
    if (!pointId) return res.status(400).json({ success: false, message: '缺少 point_id' })

    const { error } = await getDeepPoint(conn, pointId)
    if (error) return res.status(error[0]).json({ success: false, message: error[1] })

    if (!Array.isArray(surveys) || surveys.length === 0) {
      return res.status(400).json({ success: false, message: '观测期数据不能为空' })
    }

    const [baselines] = await conn.query('SELECT id FROM inclinometer_baselines WHERE point_id = ?', [pointId])
    if (baselines.length === 0) {
      return res.status(409).json({ success: false, code: 'BASELINE_REQUIRED', message: '该测斜孔暂无初始值，请先上传初始值' })
    }

    const baselineId = baselines[0].id
    const [baselineRows] = await conn.query(
      'SELECT depth_m, forward_reading, reverse_reading, baseline_value FROM inclinometer_baseline_readings WHERE baseline_id = ? ORDER BY row_order ASC',
      [baselineId]
    )

    const normalizedSurveys = []
    for (const survey of surveys) {
      const surveyDate = normalizeDate(survey.survey_date)
      if (!surveyDate) {
        return res.status(400).json({ success: false, message: `观测日期格式不正确：${survey.survey_date || ''}` })
      }

      const normalized = normalizeSurveyReadings(survey.readings, baselineRows)
      if (normalized.error) {
        return res.status(400).json({ success: false, message: `${surveyDate}：${normalized.error}` })
      }

      const maxCumulative = Math.max(...normalized.readings.map((row) => Math.abs(row[4] || 0)))
      const maxRelative = Math.max(...normalized.readings.map((row) => Math.abs(row[5] || 0)))
      normalizedSurveys.push({
        survey_no: survey.survey_no ? Number(survey.survey_no) : null,
        survey_date: surveyDate,
        readings: normalized.readings,
        max_cumulative: round4(maxCumulative),
        max_relative: round4(maxRelative),
      })
    }

    await conn.beginTransaction()
    let imported = 0
    let readingCount = 0

    for (const survey of normalizedSurveys) {
      const [existing] = await conn.query(
        'SELECT id FROM inclinometer_surveys WHERE point_id = ? AND survey_date = ?',
        [pointId, survey.survey_date]
      )

      if (existing.length > 0 && !overwrite) {
        continue
      }

      if (existing.length > 0) {
        await conn.query('DELETE FROM inclinometer_surveys WHERE id = ?', [existing[0].id])
      }

      const [result] = await conn.query(
        `INSERT INTO inclinometer_surveys
          (point_id, survey_no, survey_date, test_basis, measure_interval, data_length, source_file, max_cumulative, max_relative, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pointId,
          survey.survey_no,
          survey.survey_date,
          test_basis || null,
          asNumber(measure_interval),
          asNumber(data_length),
          source_file || null,
          survey.max_cumulative,
          survey.max_relative,
          req.user?.userId || null,
        ]
      )

      const placeholders = survey.readings.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',')
      const values = survey.readings.flatMap((row) => [result.insertId, ...row])
      await conn.query(
        `INSERT INTO inclinometer_survey_readings
          (survey_id, depth_m, forward_reading, reverse_reading, test_value, cumulative_displacement, relative_displacement, row_order)
         VALUES ${placeholders}`,
        values
      )

      imported += 1
      readingCount += survey.readings.length
    }

    await conn.commit()
    res.status(201).json({
      success: true,
      message: '测斜观测数据上传成功',
      data: { imported_surveys: imported, reading_count: readingCount },
    })
  } catch (error) {
    await conn.rollback()
    console.error('保存测斜观测数据失败:', error)
    res.status(500).json({ success: false, message: '保存测斜观测数据失败' })
  } finally {
    conn.release()
  }
})

router.put('/surveys/:id', auth, async (req, res) => {
  await ensureSchema()
  const conn = await pool.getConnection()

  try {
    const surveyId = Number(req.params.id)
    if (!surveyId) return res.status(400).json({ success: false, message: '缺少观测期 id' })

    const {
      survey_no,
      survey_date,
      test_basis,
      measure_interval,
      data_length,
      source_file,
      readings,
    } = req.body

    const [surveyRows] = await conn.query(
      'SELECT id, point_id, test_basis, measure_interval, data_length, source_file FROM inclinometer_surveys WHERE id = ?',
      [surveyId]
    )
    if (surveyRows.length === 0) {
      return res.status(404).json({ success: false, message: '观测期数据不存在' })
    }

    const survey = surveyRows[0]
    const { error } = await getDeepPoint(conn, survey.point_id)
    if (error) return res.status(error[0]).json({ success: false, message: error[1] })

    const surveyDate = normalizeDate(survey_date)
    if (!surveyDate) return res.status(400).json({ success: false, message: '测试日期格式不正确' })

    const [baselines] = await conn.query('SELECT id FROM inclinometer_baselines WHERE point_id = ?', [survey.point_id])
    if (baselines.length === 0) {
      return res.status(409).json({ success: false, code: 'BASELINE_REQUIRED', message: '该测斜孔暂无初始值，请先上传初始值' })
    }

    const [baselineRows] = await conn.query(
      'SELECT depth_m, forward_reading, reverse_reading, baseline_value FROM inclinometer_baseline_readings WHERE baseline_id = ? ORDER BY row_order ASC',
      [baselines[0].id]
    )
    const normalized = normalizeSurveyReadings(readings, baselineRows)
    if (normalized.error) return res.status(400).json({ success: false, message: normalized.error })

    const maxCumulative = Math.max(...normalized.readings.map((row) => Math.abs(row[4] || 0)))
    const maxRelative = Math.max(...normalized.readings.map((row) => Math.abs(row[5] || 0)))

    await conn.beginTransaction()
    await conn.query(
      `UPDATE inclinometer_surveys
       SET survey_no = ?, survey_date = ?, test_basis = ?, measure_interval = ?,
           data_length = ?, source_file = ?, max_cumulative = ?, max_relative = ?
       WHERE id = ?`,
      [
        survey_no ? Number(survey_no) : null,
        surveyDate,
        test_basis ?? survey.test_basis,
        measure_interval === undefined ? survey.measure_interval : asNumber(measure_interval),
        data_length === undefined ? survey.data_length : asNumber(data_length),
        source_file ?? survey.source_file,
        round4(maxCumulative),
        round4(maxRelative),
        surveyId,
      ]
    )

    await conn.query('DELETE FROM inclinometer_survey_readings WHERE survey_id = ?', [surveyId])
    const placeholders = normalized.readings.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',')
    const values = normalized.readings.flatMap((row) => [surveyId, ...row])
    await conn.query(
      `INSERT INTO inclinometer_survey_readings
        (survey_id, depth_m, forward_reading, reverse_reading, test_value, cumulative_displacement, relative_displacement, row_order)
       VALUES ${placeholders}`,
      values
    )

    await conn.commit()
    res.json({
      success: true,
      message: '测斜观测数据已保存',
      data: {
        survey_id: surveyId,
        reading_count: normalized.readings.length,
        max_cumulative: round4(maxCumulative),
        max_relative: round4(maxRelative),
      },
    })
  } catch (error) {
    await conn.rollback()
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '该测试日期已有观测数据，请更换日期或编辑对应期次' })
    }
    console.error('编辑测斜观测数据失败:', error)
    res.status(500).json({ success: false, message: '编辑测斜观测数据失败' })
  } finally {
    conn.release()
  }
})

router.get('/profile', async (req, res) => {
  try {
    await ensureSchema()
    const pointId = Number(req.query.point_id)
    if (!pointId) return res.status(400).json({ success: false, message: '缺少 point_id' })

    const from = req.query.from ? normalizeDate(req.query.from) : null
    const to = req.query.to ? normalizeDate(req.query.to) : null

    const [baselineRows] = await pool.query(
      `SELECT b.*, p.point_name, s.slope_name
       FROM inclinometer_baselines b
       JOIN monitoring_points p ON b.point_id = p.id
       LEFT JOIN slopes s ON p.slope_id = s.id
       WHERE b.point_id = ?`,
      [pointId]
    )

    if (baselineRows.length === 0) {
      return res.json({ success: true, data: { has_baseline: false, baseline: null, surveys: [] } })
    }

    const baseline = baselineRows[0]
    const [baselineReadings] = await pool.query(
      `SELECT depth_m, forward_reading, reverse_reading, baseline_value
       FROM inclinometer_baseline_readings
       WHERE baseline_id = ?
       ORDER BY row_order ASC`,
      [baseline.id]
    )

    let surveySql = `
      SELECT id, survey_no, DATE_FORMAT(survey_date, '%Y-%m-%d') AS survey_date,
             max_cumulative, max_relative, source_file, created_at
      FROM inclinometer_surveys
      WHERE point_id = ?
    `
    const params = [pointId]
    if (from) {
      surveySql += ' AND survey_date >= ?'
      params.push(from)
    }
    if (to) {
      surveySql += ' AND survey_date <= ?'
      params.push(to)
    }
    surveySql += ' ORDER BY survey_date ASC'

    const [surveys] = await pool.query(surveySql, params)
    const surveyIds = surveys.map((survey) => survey.id)
    let readings = []
    if (surveyIds.length > 0) {
      const [rows] = await pool.query(
        `SELECT survey_id, depth_m, forward_reading, reverse_reading, test_value,
                cumulative_displacement, relative_displacement
         FROM inclinometer_survey_readings
         WHERE survey_id IN (?)
         ORDER BY survey_id ASC, row_order ASC`,
        [surveyIds]
      )
      readings = rows
    }

    const readingMap = new Map()
    readings.forEach((row) => {
      if (!readingMap.has(row.survey_id)) readingMap.set(row.survey_id, [])
      readingMap.get(row.survey_id).push(row)
    })

    const effectiveBaselineReadings = normalizeBaselineRows(baselineReadings, true)
    const normalizedSurveys = surveys.map((survey) => {
      const storedReadings = readingMap.get(survey.id) || []
      const normalized = normalizeSurveyReadings(storedReadings, effectiveBaselineReadings)
      const effectiveReadings = normalized.error
        ? storedReadings
        : normalized.readings.map((row) => ({
            depth_m: row[0],
            forward_reading: row[1],
            reverse_reading: row[2],
            test_value: row[3],
            cumulative_displacement: row[4],
            relative_displacement: row[5],
          }))
      const maxCumulative = effectiveReadings.length
        ? Math.max(...effectiveReadings.map((row) => Math.abs(Number(row.cumulative_displacement) || 0)))
        : 0
      const maxRelative = effectiveReadings.length
        ? Math.max(...effectiveReadings.map((row) => Math.abs(Number(row.relative_displacement) || 0)))
        : 0

      return {
        ...survey,
        max_cumulative: round4(maxCumulative),
        max_relative: round4(maxRelative),
        readings: effectiveReadings,
      }
    })

    res.json({
      success: true,
      data: {
        has_baseline: true,
        baseline: {
          ...baseline,
          baseline_date: baseline.baseline_date instanceof Date
            ? baseline.baseline_date.toISOString().slice(0, 10)
            : baseline.baseline_date,
          readings: effectiveBaselineReadings,
        },
        surveys: normalizedSurveys,
      },
    })
  } catch (error) {
    console.error('获取测斜曲线失败:', error)
    res.status(500).json({ success: false, message: '获取测斜曲线失败' })
  }
})

module.exports = router
