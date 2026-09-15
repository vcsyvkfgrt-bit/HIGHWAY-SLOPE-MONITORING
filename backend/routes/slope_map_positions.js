const express = require('express')
const pool = require('../config/database')
const auth = require('../middleware/auth')

const router = express.Router()
router.use(auth)

const ALLOWED_POINT_TYPES = ['地表位移监测点', '沉降监测点', '深部位移测斜孔', '裂缝观测点', '锚索应力计', '锚索应力监测点']
let positionStyleColumnReady = false

function userName(req) {
  return req.user?.real_name || req.user?.username || null
}

function toPercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.max(0, Math.min(100, Math.round(num * 1000000) / 1000000))
}

async function ensurePositionStyleColumn(db = pool) {
  if (positionStyleColumnReady) return
  const [columns] = await db.query("SHOW COLUMNS FROM slope_map_point_positions LIKE 'style_json'")
  if (!columns.length) {
    await db.query('ALTER TABLE slope_map_point_positions ADD COLUMN style_json TEXT NULL AFTER label_visible')
  }
  positionStyleColumnReady = true
}

function normalizeStyleJson(style) {
  if (!style || typeof style !== 'object') return null
  const normalized = {
    markerSize: Number(style.markerSize) || null,
    labelFontSize: Number(style.labelFontSize) || null,
    labelPadding: Number(style.labelPadding) || null,
    labelOpacity: Number(style.labelOpacity) || null,
    markerColor: typeof style.markerColor === 'string' ? style.markerColor : null,
    labelColor: typeof style.labelColor === 'string' ? style.labelColor : null,
    labelBgColor: typeof style.labelBgColor === 'string' ? style.labelBgColor : null,
    showShadow: style.showShadow !== undefined ? Boolean(style.showShadow) : null,
  }
  Object.keys(normalized).forEach((key) => {
    if (normalized[key] === null || normalized[key] === '') delete normalized[key]
  })
  return Object.keys(normalized).length ? JSON.stringify(normalized) : null
}

async function loadMaps(slopeId) {
  const [maps] = await pool.query(
    `SELECT m.*, f.file_path, f.original_name, f.mime_type, f.file_size
     FROM slope_ledger_maps m
     LEFT JOIN file_assets f ON f.id = m.file_asset_id
     WHERE m.slope_id = ?
     ORDER BY m.is_current DESC, m.created_at DESC`,
    [slopeId]
  )
  return maps
}

async function loadPoints(slopeId) {
  const [points] = await pool.query(
    `SELECT p.*, s.slope_name,
       latest.monitor_date AS latest_monitor_date,
       latest.value AS latest_value
     FROM monitoring_points p
     LEFT JOIN slopes s ON s.id = p.slope_id
     LEFT JOIN (
       SELECT m1.point_id, DATE_FORMAT(m1.monitor_date, '%Y-%m-%d') AS monitor_date, m1.value
       FROM monitoring_data m1
       INNER JOIN (
         SELECT point_id, MAX(monitor_date) AS max_date
         FROM monitoring_data
         GROUP BY point_id
       ) t ON t.point_id = m1.point_id AND t.max_date = m1.monitor_date
     ) latest ON latest.point_id = p.id
     WHERE p.slope_id = ? AND p.archived = 0
     ORDER BY p.point_type ASC, p.point_name ASC`,
    [slopeId]
  )
  return points
}

async function loadPositions(mapId) {
  if (!mapId) return []
  await ensurePositionStyleColumn()
  const [positions] = await pool.query(
    `SELECT pos.*, p.point_name, p.point_type
     FROM slope_map_point_positions pos
     JOIN monitoring_points p ON p.id = pos.point_id
     WHERE pos.map_id = ?
     ORDER BY p.point_type ASC, p.point_name ASC`,
    [mapId]
  )
  return positions
}

async function makeSaveSummary(before, after) {
  const beforeMap = new Map(before.map((item) => [Number(item.point_id), item]))
  const afterMap = new Map(after.map((item) => [Number(item.point_id), item]))
  let added = 0
  let moved = 0
  let removed = 0

  afterMap.forEach((item, pointId) => {
    const old = beforeMap.get(pointId)
    if (!old) {
      added += 1
      return
    }
    const dx = Math.abs(Number(old.x_percent) - Number(item.x_percent))
    const dy = Math.abs(Number(old.y_percent) - Number(item.y_percent))
    if (
      dx > 0.0001
      || dy > 0.0001
      || Boolean(old.label_visible) !== Boolean(item.label_visible)
      || String(old.style_json || '') !== String(item.style_json || '')
    ) moved += 1
  })
  beforeMap.forEach((_item, pointId) => {
    if (!afterMap.has(pointId)) removed += 1
  })

  return {
    added,
    moved,
    removed,
    text: `新增定位${added}个，移动/更新${moved}个，取消定位${removed}个`,
  }
}

router.get('/:slopeId', async (req, res) => {
  try {
    const { slopeId } = req.params
    const [[slope]] = await pool.query('SELECT * FROM slopes WHERE id = ?', [slopeId])
    if (!slope) return res.status(404).json({ success: false, message: '边坡不存在' })

    const maps = await loadMaps(slopeId)
    const requestedMapId = req.query.map_id ? Number(req.query.map_id) : null
    const currentMap = requestedMapId
      ? maps.find((map) => Number(map.id) === requestedMapId)
      : maps.find((map) => Number(map.is_current) === 1) || maps[0] || null

    const [logs] = currentMap
      ? await pool.query(
        `SELECT *
         FROM slope_map_position_logs
         WHERE map_id = ?
         ORDER BY created_at DESC
         LIMIT 20`,
        [currentMap.id]
      )
      : [[]]

    res.json({
      success: true,
      data: {
        slope,
        maps,
        current_map: currentMap,
        points: await loadPoints(slopeId),
        positions: await loadPositions(currentMap?.id),
        logs,
      },
    })
  } catch (error) {
    console.error('加载图上布点数据失败:', error)
    res.status(500).json({ success: false, message: '加载图上布点数据失败' })
  }
})

router.post('/:slopeId/maps', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { slopeId } = req.params
    const { file_asset_id, is_current = true } = req.body
    if (!file_asset_id) return res.status(400).json({ success: false, message: '缺少 file_asset_id' })

    const [[slope]] = await conn.query('SELECT id FROM slopes WHERE id = ?', [slopeId])
    if (!slope) return res.status(404).json({ success: false, message: '边坡不存在' })

    await conn.beginTransaction()
    if (is_current) {
      await conn.query('UPDATE slope_ledger_maps SET is_current = 0 WHERE slope_id = ?', [slopeId])
    }
    const [result] = await conn.query(
      `INSERT INTO slope_ledger_maps
        (slope_id, file_asset_id, is_current, uploaded_by, uploaded_by_name)
       VALUES (?, ?, ?, ?, ?)`,
      [slopeId, file_asset_id, is_current ? 1 : 0, req.user?.userId || null, userName(req)]
    )
    await conn.commit()
    res.status(201).json({ success: true, message: '无人机图片已保存', data: { id: result.insertId } })
  } catch (error) {
    await conn.rollback()
    console.error('保存无人机图片失败:', error)
    res.status(500).json({ success: false, message: '保存无人机图片失败' })
  } finally {
    conn.release()
  }
})

router.put('/maps/:mapId/current', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { mapId } = req.params
    const [[map]] = await conn.query('SELECT slope_id FROM slope_ledger_maps WHERE id = ?', [mapId])
    if (!map) return res.status(404).json({ success: false, message: '布点图不存在' })

    await conn.beginTransaction()
    await conn.query('UPDATE slope_ledger_maps SET is_current = 0 WHERE slope_id = ?', [map.slope_id])
    await conn.query('UPDATE slope_ledger_maps SET is_current = 1 WHERE id = ?', [mapId])
    await conn.commit()
    res.json({ success: true, message: '已设为当前布点图' })
  } catch (error) {
    await conn.rollback()
    console.error('设置当前布点图失败:', error)
    res.status(500).json({ success: false, message: '设置当前布点图失败' })
  } finally {
    conn.release()
  }
})

router.post('/:slopeId/points', async (req, res) => {
  try {
    const { slopeId } = req.params
    const { point_name, point_type, location, description } = req.body
    if (!point_name) return res.status(400).json({ success: false, message: '缺少测点编号' })
    if (!ALLOWED_POINT_TYPES.includes(point_type)) {
      return res.status(400).json({ success: false, message: '测点类型不合法' })
    }

    const [result] = await pool.query(
      `INSERT INTO monitoring_points
        (slope_id, point_name, point_type, location, description)
       VALUES (?, ?, ?, ?, ?)`,
      [slopeId, point_name, point_type, location || '', description || '图上布点快速创建']
    )
    res.status(201).json({ success: true, message: '测点已创建', data: { id: result.insertId } })
  } catch (error) {
    console.error('图上新建测点失败:', error)
    res.status(500).json({ success: false, message: '图上新建测点失败' })
  }
})

router.post('/:slopeId/positions', async (req, res) => {
  const conn = await pool.getConnection()
  try {
    const { slopeId } = req.params
    const { map_id, positions = [] } = req.body
    if (!map_id) return res.status(400).json({ success: false, message: '缺少 map_id' })
    if (!Array.isArray(positions)) return res.status(400).json({ success: false, message: 'positions 必须是数组' })

    const [[map]] = await conn.query('SELECT id, slope_id FROM slope_ledger_maps WHERE id = ? AND slope_id = ?', [map_id, slopeId])
    if (!map) return res.status(404).json({ success: false, message: '布点图不存在' })
    await ensurePositionStyleColumn(conn)

    const pointIds = positions.map((item) => Number(item.point_id)).filter(Boolean)
    if (pointIds.length > 0) {
      const [points] = await conn.query('SELECT id FROM monitoring_points WHERE slope_id = ? AND id IN (?)', [slopeId, pointIds])
      if (points.length !== new Set(pointIds).size) {
        return res.status(400).json({ success: false, message: '存在不属于当前边坡的测点' })
      }
    }

    const normalized = positions
      .map((item) => ({
        point_id: Number(item.point_id),
        x_percent: toPercent(item.x_percent),
        y_percent: toPercent(item.y_percent),
        label_visible: item.label_visible !== false,
        style_json: normalizeStyleJson(item.style),
      }))
      .filter((item) => item.point_id && item.x_percent !== null && item.y_percent !== null)

    const [before] = await conn.query('SELECT * FROM slope_map_point_positions WHERE map_id = ?', [map_id])
    const summary = await makeSaveSummary(before, normalized)

    await conn.beginTransaction()
    await conn.query('DELETE FROM slope_map_point_positions WHERE map_id = ?', [map_id])
    if (normalized.length > 0) {
      const placeholders = normalized.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')
      const values = normalized.flatMap((item) => [
        map_id,
        slopeId,
        item.point_id,
        item.x_percent,
        item.y_percent,
        item.label_visible ? 1 : 0,
        item.style_json,
        req.user?.userId || null,
        req.user?.userId || null,
      ])
      await conn.query(
        `INSERT INTO slope_map_point_positions
          (map_id, slope_id, point_id, x_percent, y_percent, label_visible, style_json, created_by, updated_by)
         VALUES ${placeholders}`,
        values
      )
    }

    await conn.query(
      `INSERT INTO slope_map_position_logs
        (map_id, slope_id, summary, detail, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        map_id,
        slopeId,
        summary.text,
        JSON.stringify({ ...summary, positions: normalized.length }),
        req.user?.userId || null,
        userName(req),
      ]
    )
    await conn.commit()
    res.json({ success: true, message: '布点已保存', data: { summary: summary.text } })
  } catch (error) {
    await conn.rollback()
    console.error('保存图上布点失败:', error)
    res.status(500).json({ success: false, message: '保存图上布点失败' })
  } finally {
    conn.release()
  }
})

module.exports = router
