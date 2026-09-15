const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const DxfParser = require('dxf-parser')
const AdmZip = require('adm-zip')

const pool = require('../config/database')
const auth = require('../middleware/auth')

const router = express.Router()
const uploadRoot = path.join(__dirname, '..', 'uploads', 'map-overview')
fs.mkdirSync(uploadRoot, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      const name = path.basename(file.originalname, ext).replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '_')
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${name}${ext}`)
    },
  }),
  limits: { fileSize: Number(process.env.MAP_UPLOAD_MAX_SIZE || 100 * 1024 * 1024), files: 8 },
})

let schemaReady = false

function actor(req) {
  return req.user?.real_name || req.user?.username || null
}

function parseJson(value, fallback = null) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function normalizedFeatureCollection(features = []) {
  return {
    type: 'FeatureCollection',
    features: features.filter((item) => item && item.geometry && item.geometry.type),
  }
}

function csvRecords(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const split = (line) => {
    const values = []
    let value = ''
    let quoted = false
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      if (char === '"') {
        if (quoted && line[i + 1] === '"') { value += '"'; i += 1 } else quoted = !quoted
      } else if (char === ',' && !quoted) { values.push(value.trim()); value = '' } else value += char
    }
    values.push(value.trim())
    return values
  }
  const headers = split(lines[0]).map((item) => item.toLowerCase())
  return lines.slice(1).map((line) => {
    const values = split(line)
    return Object.fromEntries(headers.map((key, index) => [key, values[index] || '']))
  })
}

function propertyValue(record, names) {
  const key = Object.keys(record).find((name) => names.includes(name.toLowerCase()))
  return key ? record[key] : null
}

function csvToFeatures(text) {
  return csvRecords(text).map((record) => {
    const lng = Number(propertyValue(record, ['lng', 'lon', 'longitude', '经度', 'x']))
    const lat = Number(propertyValue(record, ['lat', 'latitude', '纬度', 'y']))
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    const name = propertyValue(record, ['name', '名称', '边坡名称', 'slope_name', 'point_name', '测点名称']) || '未命名对象'
    return { type: 'Feature', properties: { ...record, name }, geometry: { type: 'Point', coordinates: [lng, lat] } }
  }).filter(Boolean)
}

function kmlToFeatures(text) {
  const features = []
  const placemarks = String(text || '').match(/<Placemark\b[\s\S]*?<\/Placemark>/gi) || []
  for (const item of placemarks) {
    const name = (item.match(/<name[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/name>/i)?.[1] || '未命名对象').trim()
    const coordinateText = item.match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i)?.[1] || ''
    const coordinates = coordinateText.trim().split(/\s+/).map((pair) => pair.split(',').slice(0, 2).map(Number)).filter((pair) => pair.every(Number.isFinite))
    if (!coordinates.length) continue
    const type = /<Polygon\b/i.test(item) ? 'Polygon' : /<LineString\b/i.test(item) ? 'LineString' : 'Point'
    const geometry = type === 'Point'
      ? { type, coordinates: coordinates[0] }
      : type === 'Polygon'
        ? { type, coordinates: [coordinates] }
        : { type, coordinates }
    features.push({ type: 'Feature', properties: { name }, geometry })
  }
  return features
}

function dxfToFeatures(buffer) {
  const drawing = new DxfParser().parseSync(buffer.toString('utf8'))
  return (drawing.entities || []).map((entity, index) => {
    const vertices = entity.vertices || []
    const points = vertices.map((vertex) => [Number(vertex.x), Number(vertex.y)]).filter((point) => point.every(Number.isFinite))
    if (entity.type === 'LINE' && entity.startPoint && entity.endPoint) {
      return { type: 'Feature', properties: { name: `${entity.layer || 'CAD'}-${index + 1}`, layer: entity.layer || '' }, geometry: { type: 'LineString', coordinates: [[entity.startPoint.x, entity.startPoint.y], [entity.endPoint.x, entity.endPoint.y]] } }
    }
    if (['LWPOLYLINE', 'POLYLINE'].includes(entity.type) && points.length >= 2) {
      const closed = Boolean(entity.shape || entity.closed)
      return { type: 'Feature', properties: { name: `${entity.layer || 'CAD'}-${index + 1}`, layer: entity.layer || '' }, geometry: closed ? { type: 'Polygon', coordinates: [[...points, ...(points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1] ? [] : [points[0]])]] } : { type: 'LineString', coordinates: points } }
    }
    if (entity.type === 'POINT' && Number.isFinite(Number(entity.position?.x))) {
      return { type: 'Feature', properties: { name: `${entity.layer || 'CAD'}-${index + 1}`, layer: entity.layer || '' }, geometry: { type: 'Point', coordinates: [entity.position.x, entity.position.y] } }
    }
    return null
  }).filter(Boolean)
}

async function ensureSchema() {
  if (schemaReady) return
  await pool.query(`CREATE TABLE IF NOT EXISTS map_layers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    section VARCHAR(100) NOT NULL,
    layer_name VARCHAR(200) NOT NULL,
    source_type VARCHAR(30) NOT NULL,
    coordinate_system VARCHAR(50) NOT NULL DEFAULT 'GCJ-02',
    geometry_json JSON NULL,
    original_file_name VARCHAR(255),
    stored_file_path VARCHAR(500),
    status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
    version_no INT NOT NULL DEFAULT 1,
    import_note TEXT,
    created_by INT NULL,
    created_by_name VARCHAR(100),
    published_by INT NULL,
    published_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_map_layer_section (section, status),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  await pool.query(`CREATE TABLE IF NOT EXISTS slope_geo_locations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    slope_id INT NOT NULL,
    longitude DECIMAL(12,8) NULL,
    latitude DECIMAL(11,8) NULL,
    geometry_json JSON NULL,
    coordinate_system VARCHAR(50) NOT NULL DEFAULT 'GCJ-02',
    accuracy_m DECIMAL(10,2) NULL,
    source_layer_id BIGINT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_slope_geo_location (slope_id),
    FOREIGN KEY (slope_id) REFERENCES slopes(id) ON DELETE CASCADE,
    FOREIGN KEY (source_layer_id) REFERENCES map_layers(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  await pool.query(`CREATE TABLE IF NOT EXISTS monitoring_point_geo_locations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    point_id INT NOT NULL,
    longitude DECIMAL(12,8) NULL,
    latitude DECIMAL(11,8) NULL,
    coordinate_system VARCHAR(50) NOT NULL DEFAULT 'GCJ-02',
    accuracy_m DECIMAL(10,2) NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_monitoring_point_geo (point_id),
    FOREIGN KEY (point_id) REFERENCES monitoring_points(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  schemaReady = true
}

router.use(auth)

router.get('/overview', async (req, res) => {
  try {
    await ensureSchema()
    const [sectionRows] = await pool.query('SELECT DISTINCT section FROM slopes WHERE section IS NOT NULL AND TRIM(section) <> \'\' ORDER BY section')
    const sections = sectionRows.map((item) => item.section)
    const section = String(req.query.section || sections[0] || '土建一标')
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.as_of || '')) ? String(req.query.as_of) : new Date().toISOString().slice(0, 10)
    const [slopes] = await pool.query(`SELECT s.*, g.longitude, g.latitude, g.geometry_json, g.coordinate_system, g.accuracy_m,
      (SELECT COUNT(*) FROM monitoring_points p WHERE p.slope_id = s.id AND COALESCE(p.archived, 0) = 0) AS point_count,
      (SELECT MAX(md.monitor_date) FROM monitoring_data md JOIN monitoring_points p ON p.id = md.point_id
        WHERE p.slope_id = s.id AND md.monitor_date <= CONCAT(?, ' 23:59:59')) AS latest_monitor_date,
      (SELECT COUNT(*) FROM alarms a JOIN monitoring_points p ON p.id = a.point_id
        WHERE p.slope_id = s.id AND a.status <> 'closed' AND a.created_at <= CONCAT(?, ' 23:59:59')) AS active_alarm_count,
      (SELECT MAX(CASE a.alarm_level WHEN 'critical' THEN 4 WHEN 'serious' THEN 3 WHEN 'warning' THEN 2 WHEN 'info' THEN 1 ELSE 0 END)
        FROM alarms a JOIN monitoring_points p ON p.id = a.point_id
        WHERE p.slope_id = s.id AND a.status <> 'closed' AND a.created_at <= CONCAT(?, ' 23:59:59')) AS risk_rank,
      (SELECT COUNT(*) FROM inspections i WHERE i.slope_id = s.id AND i.has_problem = 1
        AND i.rectification_status IN ('pending','processing','pending_review') AND i.inspection_date <= CONCAT(?, ' 23:59:59')) AS open_inspection_count,
      (SELECT MAX(i.inspection_date) FROM inspections i WHERE i.slope_id = s.id
        AND i.inspection_date <= CONCAT(?, ' 23:59:59')) AS latest_inspection_date,
      (SELECT MIN(ip.next_due_date) FROM inspection_plans ip WHERE ip.slope_id = s.id AND ip.enabled = 1) AS next_inspection_date
      FROM slopes s LEFT JOIN slope_geo_locations g ON g.slope_id = s.id
      WHERE s.section = ? ORDER BY s.start_stake, s.slope_name`, [asOf, asOf, asOf, asOf, asOf, section])
    const [points] = await pool.query(`SELECT p.id, p.slope_id, p.point_name, p.point_type, p.location,
      g.longitude, g.latitude, g.coordinate_system,
      (SELECT MAX(md.monitor_date) FROM monitoring_data md WHERE md.point_id = p.id AND md.monitor_date <= CONCAT(?, ' 23:59:59')) latest_monitor_date,
      (SELECT COUNT(*) FROM alarms a WHERE a.point_id = p.id AND a.status <> 'closed' AND a.created_at <= CONCAT(?, ' 23:59:59')) active_alarm_count
      FROM monitoring_points p JOIN slopes s ON s.id = p.slope_id
      LEFT JOIN monitoring_point_geo_locations g ON g.point_id = p.id
      WHERE s.section = ? AND COALESCE(p.archived, 0) = 0`, [asOf, asOf, section])
    const [issues] = await pool.query(`SELECT i.id, i.slope_id, i.problem_level, i.problem_location, i.problems,
      i.rectification_status, i.longitude, i.latitude, i.inspection_date, s.slope_name
      FROM inspections i JOIN slopes s ON s.id = i.slope_id
      WHERE s.section = ? AND i.has_problem = 1 AND i.inspection_date <= CONCAT(?, ' 23:59:59')
        AND i.rectification_status IN ('pending','processing','pending_review')
      ORDER BY i.inspection_date DESC LIMIT 300`, [section, asOf])
    const [layers] = await pool.query('SELECT * FROM map_layers WHERE section = ? AND status = \'published\' ORDER BY updated_at DESC', [section])
    let weatherConfig = null
    let rainfall = []
    try {
      ;[[weatherConfig]] = await pool.query('SELECT * FROM weather_section_configs WHERE section = ? LIMIT 1', [section])
      ;[rainfall] = await pool.query(`SELECT DATE_FORMAT(rain_date,'%Y-%m-%d') rain_date, amount_mm
        FROM rainfall_daily_records WHERE section = ? AND rain_date BETWEEN DATE_SUB(?, INTERVAL 29 DAY) AND ? ORDER BY rain_date`, [section, asOf, asOf])
    } catch (weatherError) {
      if (weatherError.code !== 'ER_NO_SUCH_TABLE') throw weatherError
    }
    const recentRain = rainfall.filter((item) => item.rain_date >= new Date(new Date(`${asOf}T00:00:00`).getTime() - 6 * 86400000).toISOString().slice(0, 10)).reduce((sum, item) => sum + Number(item.amount_mm || 0), 0)
    res.json({ success: true, data: {
      section, sections, as_of: asOf,
      slopes: slopes.map((item) => ({ ...item, risk_rank: Number(item.risk_rank || 0), point_count: Number(item.point_count || 0), active_alarm_count: Number(item.active_alarm_count || 0), open_inspection_count: Number(item.open_inspection_count || 0), geometry: parseJson(item.geometry_json) })),
      points, issues,
      layers: layers.map((item) => ({ ...item, geometry: parseJson(item.geometry_json, normalizedFeatureCollection()) })),
      weather_station: weatherConfig,
      rainfall: rainfall.map((item) => ({ ...item, amount_mm: Number(item.amount_mm || 0) })),
      rain_summary: { recent_7d_mm: Number(recentRain.toFixed(1)), latest_mm: Number(rainfall.at(-1)?.amount_mm || 0) },
    } })
  } catch (error) {
    console.error('加载地图总览失败:', error)
    res.status(500).json({ success: false, message: '加载地图总览失败' })
  }
})

router.get('/layers', async (req, res) => {
  try {
    await ensureSchema()
    const section = String(req.query.section || '土建一标')
    const [rows] = await pool.query(`SELECT *, COALESCE(JSON_LENGTH(geometry_json, '$.features'), 0) feature_count
      FROM map_layers WHERE section = ? ORDER BY updated_at DESC`, [section])
    res.json({ success: true, data: rows.map((item) => ({ ...item, feature_count: Number(item.feature_count || 0), geometry: parseJson(item.geometry_json, normalizedFeatureCollection()) })) })
  } catch (error) { res.status(500).json({ success: false, message: '加载图层失败' }) }
})

router.post('/imports', upload.single('file'), async (req, res) => {
  try {
    await ensureSchema()
    if (!req.file) return res.status(400).json({ success: false, message: '请选择空间资料文件' })
    const section = String(req.body.section || '土建一标').trim()
    const coordinateSystem = String(req.body.coordinate_system || 'GCJ-02').trim()
    const ext = path.extname(req.file.originalname).toLowerCase()
    let features = []
    let sourceType = ext.slice(1) || 'file'
    let note = ''
    const content = fs.readFileSync(req.file.path)
    if (['.kml', '.kmz'].includes(ext)) {
      const kmlContent = ext === '.kmz'
        ? (new AdmZip(content).getEntries().find((entry) => /(^|\/)doc\.kml$/i.test(entry.entryName) || /\.kml$/i.test(entry.entryName))?.getData().toString('utf8') || '')
        : content.toString('utf8')
      features = kmlToFeatures(kmlContent)
      note = features.length ? `已解析 ${features.length} 个 KML 对象` : '未识别到 KML 对象，请检查文件内容'
    } else if (['.csv', '.txt'].includes(ext)) {
      features = csvToFeatures(content.toString('utf8'))
      sourceType = 'coordinate-table'
      note = features.length ? `已解析 ${features.length} 条坐标记录` : '未识别到经纬度列（支持 lng/lon/longitude/经度 与 lat/latitude/纬度）'
    } else if (ext === '.dxf') {
      features = dxfToFeatures(content)
      sourceType = 'cad-dxf'
      note = features.length ? `已解析 ${features.length} 个 CAD 图元；请确认坐标系后发布` : '未识别到可用 CAD 图元'
    } else if (ext === '.zip') {
      const shpjs = (await import('shpjs')).default
      const result = await shpjs(content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength))
      const collections = Array.isArray(result) ? result : [result]
      features = collections.flatMap((collection) => collection?.features || [])
      sourceType = 'shapefile'
      note = features.length ? `已解析 ${features.length} 个 Shapefile 对象` : '未识别到 Shapefile 对象'
    } else if (ext === '.dwg') {
      sourceType = 'cad-dwg'
      note = 'DWG 已安全归档。请由部署端配置 DWG 转换器后进行预览和发布。'
    } else {
      return res.status(400).json({ success: false, message: '支持 KML/KMZ、Shapefile ZIP、DXF、DWG 和 CSV 坐标表' })
    }
    const collection = normalizedFeatureCollection(features)
    const layerName = path.basename(req.file.originalname, ext)
    const [[versionRow]] = await pool.query('SELECT COALESCE(MAX(version_no), 0) + 1 next_version FROM map_layers WHERE section = ? AND layer_name = ?', [section, layerName])
    const [result] = await pool.query(`INSERT INTO map_layers
      (section, layer_name, source_type, coordinate_system, geometry_json, original_file_name, stored_file_path, status, import_note, created_by, created_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`, [section, `${layerName}`, sourceType, coordinateSystem, JSON.stringify(collection), req.file.originalname, `/uploads/map-overview/${req.file.filename}`, `${note}；版本 V${versionRow.next_version}`, req.user?.userId || null, actor(req)])
    await pool.query('UPDATE map_layers SET version_no = ? WHERE id = ?', [versionRow.next_version, result.insertId])
    res.status(201).json({ success: true, message: '空间资料已导入草稿，确认预览后即可发布', data: { id: result.insertId, feature_count: collection.features.length, version_no: Number(versionRow.next_version), note } })
  } catch (error) {
    console.error('导入空间资料失败:', error)
    res.status(400).json({ success: false, message: `导入空间资料失败：${error.message}` })
  }
})

router.put('/layers/:id/publish', async (req, res) => {
  try {
    await ensureSchema()
    const [result] = await pool.query(`UPDATE map_layers SET status = 'published', published_by = ?, published_at = NOW(), import_note = COALESCE(?, import_note) WHERE id = ?`, [req.user?.userId || null, req.body.note || null, req.params.id])
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '图层不存在' })
    res.json({ success: true, message: '图层已发布到地图总览' })
  } catch (error) { res.status(500).json({ success: false, message: '发布图层失败' }) }
})

router.put('/layers/:id/archive', async (req, res) => {
  try {
    await ensureSchema()
    const [result] = await pool.query("UPDATE map_layers SET status = 'archived' WHERE id = ?", [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '图层不存在' })
    res.json({ success: true, message: '图层已归档，不再显示于空间态势' })
  } catch (error) { res.status(500).json({ success: false, message: '归档图层失败' }) }
})

router.put('/slopes/:slopeId/location', async (req, res) => {
  try {
    await ensureSchema()
    const longitude = Number(req.body.longitude)
    const latitude = Number(req.body.latitude)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return res.status(400).json({ success: false, message: '请输入有效的经纬度' })
    const geometry = req.body.geometry || { type: 'Point', coordinates: [longitude, latitude] }
    await pool.query(`INSERT INTO slope_geo_locations (slope_id, longitude, latitude, geometry_json, coordinate_system, accuracy_m, source_layer_id, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE longitude = VALUES(longitude), latitude = VALUES(latitude), geometry_json = VALUES(geometry_json), coordinate_system = VALUES(coordinate_system), accuracy_m = VALUES(accuracy_m), source_layer_id = VALUES(source_layer_id), updated_by = VALUES(updated_by)`, [req.params.slopeId, longitude, latitude, JSON.stringify(geometry), req.body.coordinate_system || 'GCJ-02', req.body.accuracy_m || null, req.body.source_layer_id || null, req.user?.userId || null])
    res.json({ success: true, message: '边坡位置已保存' })
  } catch (error) { res.status(500).json({ success: false, message: '保存边坡位置失败' }) }
})

router.put('/points/:pointId/location', async (req, res) => {
  try {
    await ensureSchema()
    const longitude = Number(req.body.longitude)
    const latitude = Number(req.body.latitude)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return res.status(400).json({ success: false, message: '请输入有效的经纬度' })
    await pool.query(`INSERT INTO monitoring_point_geo_locations (point_id, longitude, latitude, coordinate_system, accuracy_m, updated_by)
      VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE longitude = VALUES(longitude), latitude = VALUES(latitude),
      coordinate_system = VALUES(coordinate_system), accuracy_m = VALUES(accuracy_m), updated_by = VALUES(updated_by)`,
    [req.params.pointId, longitude, latitude, req.body.coordinate_system || 'GCJ-02', req.body.accuracy_m || null, req.user?.userId || null])
    res.json({ success: true, message: '监测点位置已保存' })
  } catch (error) { res.status(500).json({ success: false, message: '保存监测点位置失败' }) }
})

module.exports = router
