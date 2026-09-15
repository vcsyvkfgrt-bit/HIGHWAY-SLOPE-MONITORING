const express = require('express')
const pool = require('../config/database')
const auth = require('../middleware/auth')

const router = express.Router()
const DAY_WARNING_MM = 50
const THREE_DAY_WARNING_MM = 100
const DEFAULT_WEATHER_LOCATION = {
  location_name: '湖北省宜昌市秭归县',
  adcode: '420527',
  longitude: 110.977726,
  latitude: 30.825908,
}
let ready = false

async function ensureSchema() {
  if (ready) return
  await pool.query(`CREATE TABLE IF NOT EXISTS weather_section_configs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, section VARCHAR(100) NOT NULL UNIQUE,
    location_name VARCHAR(200), adcode VARCHAR(20), longitude DECIMAL(12,8), latitude DECIMAL(11,8),
    updated_by INT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  await pool.query(`CREATE TABLE IF NOT EXISTS rainfall_daily_records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, section VARCHAR(100) NOT NULL, rain_date DATE NOT NULL,
    amount_mm DECIMAL(10,2) NOT NULL, observation_end_time TIME NOT NULL DEFAULT '08:00:00',
    remark TEXT, needs_review BOOLEAN NOT NULL DEFAULT 0, source VARCHAR(30) NOT NULL DEFAULT 'manual',
    created_by INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_rain_section_date (section, rain_date), INDEX idx_rain_section_date (section, rain_date),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  await pool.query(`CREATE TABLE IF NOT EXISTS weather_daily_snapshots (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, section VARCHAR(100) NOT NULL, snapshot_date DATE NOT NULL,
    live_json JSON, forecast_json JSON, provider VARCHAR(30) NOT NULL DEFAULT 'amap', fetched_at DATETIME NOT NULL,
    UNIQUE KEY uk_weather_section_date (section, snapshot_date), INDEX idx_weather_section_date (section, snapshot_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  ready = true
}

function localDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
}

function dateShift(date, days) {
  const value = new Date(`${date}T00:00:00+08:00`)
  value.setDate(value.getDate() + days)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(value)
}

function parseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return null }
}

function weatherCodeText(code) {
  const value = Number(code)
  if (value === 0) return '晴'
  if ([1, 2, 3].includes(value)) return '多云'
  if ([45, 48].includes(value)) return '雾'
  if (value >= 51 && value <= 57) return '毛毛雨'
  if (value >= 61 && value <= 67) return '雨'
  if (value >= 71 && value <= 77) return '雪'
  if (value >= 80 && value <= 82) return '阵雨'
  if ([85, 86].includes(value)) return '阵雪'
  if (value >= 95) return '雷暴'
  return '天气变化'
}

function windDirectionText(degrees) {
  const labels = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return labels[Math.round(Number(degrees || 0) / 45) % 8]
}

function windLevel(speedKmh) {
  const speed = Number(speedKmh || 0)
  const limits = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118]
  const index = limits.findIndex(limit => speed < limit)
  return String(index < 0 ? 12 : index)
}

async function openMeteoWeather(config) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', config.latitude)
  url.searchParams.set('longitude', config.longitude)
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m')
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant')
  url.searchParams.set('timezone', 'Asia/Shanghai')
  url.searchParams.set('forecast_days', '4')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`经纬度天气服务响应 ${response.status}`)
  const payload = await response.json()
  const current = payload.current || {}
  const daily = payload.daily || {}
  const live = {
    city: config.location_name || config.section,
    weather: weatherCodeText(current.weather_code),
    temperature: current.temperature_2m,
    humidity: current.relative_humidity_2m,
    winddirection: windDirectionText(current.wind_direction_10m),
    windpower: windLevel(current.wind_speed_10m),
    reporttime: current.time,
  }
  const casts = (daily.time || []).map((date, index) => ({
    date,
    week: String(new Date(`${date}T12:00:00`).getDay()),
    dayweather: weatherCodeText(daily.weather_code?.[index]),
    nightweather: weatherCodeText(daily.weather_code?.[index]),
    daytemp: daily.temperature_2m_max?.[index],
    nighttemp: daily.temperature_2m_min?.[index],
    daywind: windDirectionText(daily.wind_direction_10m_dominant?.[index]),
    daypower: windLevel(daily.wind_speed_10m_max?.[index]),
  }))
  return { live, forecast: { city: config.location_name || config.section, casts } }
}

function rainfallStatistics(rows, endDate) {
  const values = rows.map(row => ({ date: row.rain_date, amount: Number(row.amount_mm || 0) }))
  const sumFrom = days => values
    .filter(item => item.date >= dateShift(endDate, -(days - 1)) && item.date <= endDate)
    .reduce((sum, item) => sum + item.amount, 0)
  const latest = values.filter(item => item.date <= endDate).at(-1) || null
  const maximum = [...values].sort((a, b) => b.amount - a.amount)[0] || null
  let consecutiveRainDays = 0
  for (let cursor = endDate; ; cursor = dateShift(cursor, -1)) {
    const row = values.find(item => item.date === cursor)
    if (!row || row.amount <= 0) break
    consecutiveRainDays += 1
  }
  const daily = latest?.date === endDate ? latest.amount : 0
  const threeDay = sumFrom(3)
  const sevenDay = sumFrom(7)
  let riskLevel = 'normal'
  let riskLabel = '常规关注'
  let judgement = '近期雨量未达到系统加密监测参考条件，按既定频率监测并保持排水设施巡查。'
  if (daily >= DAY_WARNING_MM || threeDay >= THREE_DAY_WARNING_MM) {
    riskLevel = 'warning'
    riskLabel = '建议加密监测'
    judgement = '短时或连续降雨达到系统参考条件，建议开展雨后巡查，并结合位移变化速率安排加密监测。'
  } else if (daily >= 25 || threeDay >= 50 || sevenDay >= 100) {
    riskLevel = 'watch'
    riskLabel = '加强关注'
    judgement = '近期降雨累积较明显，建议关注排水、裂缝及坡脚状态，并对照监测曲线观察雨量响应。'
  }
  return {
    latestDate: latest?.date || '', latestAmount: latest?.amount || 0, oneDay: daily,
    threeDay, sevenDay, thirtyDay: sumFrom(30),
    rainyDays: values.filter(item => item.amount > 0).length,
    heavyRainDays: values.filter(item => item.amount >= DAY_WARNING_MM).length,
    consecutiveRainDays, maximum,
    reviewCount: rows.filter(row => Boolean(row.needs_review)).length,
    riskLevel, riskLabel, judgement,
    references: { dailyMm: DAY_WARNING_MM, threeDayMm: THREE_DAY_WARNING_MM },
  }
}

async function cachedWeather(section, config, message = '') {
  const [[snapshot]] = await pool.query(
    `SELECT live_json, forecast_json, provider, DATE_FORMAT(fetched_at, '%Y-%m-%d %H:%i') fetched_at
     FROM weather_daily_snapshots WHERE section = ? ORDER BY fetched_at DESC LIMIT 1`, [section]
  )
  if (!snapshot) return { config, status: 'unavailable', message: message || '天气服务暂不可用，且没有可用缓存' }
  return {
    config, status: 'cached', message: message || '当前展示最近一次成功获取的天气数据',
    data: { live: parseJson(snapshot.live_json), forecast: parseJson(snapshot.forecast_json), fetchedAt: snapshot.fetched_at, provider: snapshot.provider },
  }
}

async function weather(section) {
  const [[storedConfig]] = await pool.query('SELECT * FROM weather_section_configs WHERE section = ?', [section])
  const config = {
    ...(storedConfig || {}),
    section,
    location_name: storedConfig?.location_name || DEFAULT_WEATHER_LOCATION.location_name,
    adcode: storedConfig?.adcode || DEFAULT_WEATHER_LOCATION.adcode,
    longitude: storedConfig?.longitude ?? DEFAULT_WEATHER_LOCATION.longitude,
    latitude: storedConfig?.latitude ?? DEFAULT_WEATHER_LOCATION.latitude,
    using_default_location: !storedConfig,
  }
  const hasCoordinates = Number.isFinite(Number(config?.longitude)) && Number.isFinite(Number(config?.latitude))
  if (!config?.adcode && !hasCoordinates) return { config, status: 'unconfigured', message: '请先配置行政区编码或经纬度' }
  const [[fresh]] = await pool.query(
    `SELECT live_json, forecast_json, provider, DATE_FORMAT(fetched_at, '%Y-%m-%d %H:%i') fetched_at
     FROM weather_daily_snapshots WHERE section = ? AND fetched_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
     ORDER BY fetched_at DESC LIMIT 1`, [section]
  )
  if (fresh) return { config, status: 'ok', cached: true, data: { live: parseJson(fresh.live_json), forecast: parseJson(fresh.forecast_json), fetchedAt: fresh.fetched_at, provider: fresh.provider } }
  try {
    let snapshot
    let provider
    if (process.env.AMAP_WEATHER_KEY && config.adcode) {
      const makeUrl = extension => {
        const url = new URL('https://restapi.amap.com/v3/weather/weatherInfo')
        url.searchParams.set('key', process.env.AMAP_WEATHER_KEY)
        url.searchParams.set('city', config.adcode)
        url.searchParams.set('extensions', extension)
        return url
      }
      const [liveResponse, forecastResponse] = await Promise.all([fetch(makeUrl('base')), fetch(makeUrl('all'))])
      const [livePayload, forecastPayload] = await Promise.all([liveResponse.json(), forecastResponse.json()])
      if (livePayload.status !== '1' || forecastPayload.status !== '1') throw new Error(livePayload.info || forecastPayload.info || '高德天气返回异常')
      snapshot = { live: livePayload.lives?.[0] || null, forecast: forecastPayload.forecasts?.[0] || null }
      provider = 'amap'
    } else if (hasCoordinates) {
      snapshot = await openMeteoWeather(config)
      provider = 'open-meteo'
    } else {
      return cachedWeather(section, config, '当前高德天气密钥不可用，请补充经纬度启用备用天气服务')
    }
    await pool.query(
      `INSERT INTO weather_daily_snapshots (section, snapshot_date, live_json, forecast_json, provider, fetched_at)
       VALUES (?, ?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE live_json=VALUES(live_json), forecast_json=VALUES(forecast_json), provider=VALUES(provider), fetched_at=NOW()`,
      [section, localDate(), JSON.stringify(snapshot.live), JSON.stringify(snapshot.forecast), provider]
    )
    return { config, status: 'ok', data: { ...snapshot, provider } }
  } catch (error) {
    if (hasCoordinates) {
      try {
        const snapshot = await openMeteoWeather(config)
        await pool.query(
          `INSERT INTO weather_daily_snapshots (section, snapshot_date, live_json, forecast_json, provider, fetched_at)
           VALUES (?, ?, ?, ?, 'open-meteo', NOW()) ON DUPLICATE KEY UPDATE live_json=VALUES(live_json), forecast_json=VALUES(forecast_json), provider='open-meteo', fetched_at=NOW()`,
          [section, localDate(), JSON.stringify(snapshot.live), JSON.stringify(snapshot.forecast)]
        )
        return { config, status: 'ok', message: `高德天气不可用，已切换经纬度天气：${error.message}`, data: { ...snapshot, provider: 'open-meteo' } }
      } catch (fallbackError) {
        return cachedWeather(section, config, `天气获取失败：${fallbackError.message}`)
      }
    }
    return cachedWeather(section, config, `实时天气获取失败：${error.message}`)
  }
}

router.use(auth)

router.get('/summary', async (req, res) => {
  try {
    await ensureSchema()
    const section = String(req.query.section || '土建一标').trim()
    const endDate = String(req.query.end_date || localDate()).slice(0, 10)
    const startDate = String(req.query.start_date || dateShift(endDate, -29)).slice(0, 10)
    const [rain] = await pool.query(
      `SELECT id, DATE_FORMAT(rain_date, '%Y-%m-%d') rain_date, amount_mm,
         TIME_FORMAT(observation_end_time, '%H:%i') observation_end_time, remark, needs_review, source,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') updated_at
       FROM rainfall_daily_records WHERE section = ? AND rain_date >= ? AND rain_date <= ? ORDER BY rain_date`,
      [section, startDate, endDate]
    )
    const [points] = await pool.query(
      `SELECT p.id, p.point_name, p.point_type, p.slope_id, s.slope_name FROM monitoring_points p
       JOIN slopes s ON s.id = p.slope_id WHERE s.section = ? AND COALESCE(p.archived, 0) = 0
       ORDER BY s.slope_name, p.point_type, p.point_name`, [section]
    )
    const [activeAlarms] = await pool.query(
      `SELECT COUNT(*) count FROM alarms a JOIN monitoring_points p ON p.id = a.point_id JOIN slopes s ON s.id = p.slope_id
       WHERE s.section = ? AND a.status <> 'closed'`, [section]
    )
    const weatherResult = await weather(section)
    res.json({ success: true, data: {
      section, dateRange: [startDate, endDate], rain, weather: weatherResult,
      statistics: { ...rainfallStatistics(rain, endDate), activeAlarmCount: Number(activeAlarms[0]?.count || 0) }, points,
    } })
  } catch (error) {
    console.error('加载雨情失败:', error)
    res.status(500).json({ success: false, message: '加载天气雨情失败' })
  }
})

router.put('/config', async (req, res) => {
  try {
    await ensureSchema()
    const { section = '土建一标', location_name, adcode, longitude, latitude } = req.body
    if (!String(section).trim()) return res.status(400).json({ success: false, message: '请选择标段' })
    await pool.query(
      `INSERT INTO weather_section_configs(section,location_name,adcode,longitude,latitude,updated_by)
       VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE location_name=VALUES(location_name),adcode=VALUES(adcode),
       longitude=VALUES(longitude),latitude=VALUES(latitude),updated_by=VALUES(updated_by)`,
      [section, location_name || null, adcode || null, longitude || null, latitude || null, req.user?.userId || null]
    )
    res.json({ success: true, message: '标段天气位置已保存' })
  } catch (error) { res.status(500).json({ success: false, message: '保存天气位置失败' }) }
})

router.post('/rainfall', async (req, res) => {
  try {
    await ensureSchema()
    const { section = '土建一标', rain_date, amount_mm, remark = '', observation_end_time = '08:00' } = req.body
    const amount = Number(amount_mm)
    if (!rain_date || !Number.isFinite(amount) || amount < 0) return res.status(400).json({ success: false, message: '请填写有效的观测日期和日雨量' })
    const [[average]] = await pool.query(
      `SELECT AVG(amount_mm) avg_amount FROM rainfall_daily_records WHERE section=? AND rain_date < ? AND rain_date >= DATE_SUB(?,INTERVAL 7 DAY)`,
      [section, rain_date, rain_date]
    )
    const needsReview = Number(average?.avg_amount || 0) > 0 && amount >= Number(average.avg_amount) * 3 && amount - Number(average.avg_amount) >= 20
    await pool.query(
      `INSERT INTO rainfall_daily_records(section,rain_date,amount_mm,observation_end_time,remark,needs_review,created_by)
       VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE amount_mm=VALUES(amount_mm),observation_end_time=VALUES(observation_end_time),
       remark=VALUES(remark),needs_review=VALUES(needs_review),created_by=VALUES(created_by)`,
      [section, rain_date, amount, observation_end_time, remark, needsReview ? 1 : 0, req.user?.userId || null]
    )
    res.json({ success: true, message: needsReview ? '雨量已保存，请复核突增数据' : '雨量已保存', data: { needs_review: needsReview } })
  } catch (error) { res.status(500).json({ success: false, message: '保存雨量失败' }) }
})

router.patch('/rainfall/:id/review', async (req, res) => {
  try {
    await ensureSchema()
    const [result] = await pool.query('UPDATE rainfall_daily_records SET needs_review = 0 WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '雨量记录不存在' })
    res.json({ success: true, message: '已标记为复核完成' })
  } catch (error) { res.status(500).json({ success: false, message: '更新复核状态失败' }) }
})

router.delete('/rainfall/:id', async (req, res) => {
  try {
    await ensureSchema()
    const [result] = await pool.query('DELETE FROM rainfall_daily_records WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '雨量记录不存在' })
    res.json({ success: true, message: '雨量记录已删除' })
  } catch (error) { res.status(500).json({ success: false, message: '删除雨量记录失败' }) }
})

router.get('/overlay', async (req, res) => {
  try {
    await ensureSchema()
    const { section = '土建一标', point_id, start_date, end_date } = req.query
    const rainParams = [section]
    let rainWhere = ''
    if (start_date) { rainWhere += ' AND rain_date >= ?'; rainParams.push(start_date) }
    if (end_date) { rainWhere += ' AND rain_date <= ?'; rainParams.push(end_date) }
    const [rain] = await pool.query(
      `SELECT DATE_FORMAT(rain_date,'%Y-%m-%d') date, amount_mm FROM rainfall_daily_records WHERE section = ? ${rainWhere} ORDER BY rain_date`, rainParams
    )
    let monitor = []
    let point = null
    if (point_id) {
      const monitorParams = [point_id]
      let monitorWhere = ''
      if (start_date) { monitorWhere += ' AND md.monitor_date >= ?'; monitorParams.push(start_date) }
      if (end_date) { monitorWhere += ' AND md.monitor_date <= ?'; monitorParams.push(end_date) }
      ;[monitor] = await pool.query(
        `SELECT DATE_FORMAT(md.monitor_date,'%Y-%m-%d') date, md.value, md.unit, md.monitor_type
         FROM monitoring_data md WHERE md.point_id = ? ${monitorWhere} ORDER BY md.monitor_date`, monitorParams
      )
      ;[[point]] = await pool.query(
        `SELECT p.id, p.point_name, p.point_type, s.slope_name, s.section FROM monitoring_points p
         JOIN slopes s ON s.id = p.slope_id WHERE p.id = ? AND s.section = ?`, [point_id, section]
      )
      if (!point) monitor = []
    }
    res.json({ success: true, data: { rain, monitor, point } })
  } catch (error) { res.status(500).json({ success: false, message: '加载雨量—监测叠加数据失败' }) }
})

module.exports = router
