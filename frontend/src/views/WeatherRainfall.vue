<template>
  <div class="rain-page" v-loading="loading">
    <header class="page-head">
      <div class="title-block">
        <span class="eyebrow">监测研判 · 08:00 日雨量口径</span>
        <h1>天气与雨情</h1>
        <p>将降雨过程与边坡变形放在同一时间轴上，判断是否需要雨后巡查或加密监测。</p>
      </div>
      <div class="head-actions">
        <el-select v-model="section" filterable placeholder="选择标段" @change="load">
          <el-option v-for="item in sections" :key="item" :label="item" :value="item" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" @change="load" />
        <el-button @click="load">刷新</el-button>
        <el-button @click="openConfig">天气位置</el-button>
        <el-button type="primary" @click="openRain()">录入日雨量</el-button>
      </div>
    </header>

    <section class="situation-grid">
      <article class="weather-sheet">
        <div class="sheet-label">
          <span>{{ weatherLocation }}</span>
          <em :class="weather.status">{{ weatherStatusText }}</em>
        </div>
        <template v-if="weather.data?.live">
          <div class="weather-now">
            <strong>{{ weather.data.live.temperature ?? '—' }}<small>℃</small></strong>
            <div><b>{{ weather.data.live.weather || '天气实况' }}</b><span>{{ weather.data.live.winddirection || '—' }}风 {{ weather.data.live.windpower || '—' }}级 · 湿度 {{ weather.data.live.humidity || '—' }}%</span></div>
          </div>
          <p>发布 {{ weather.data.live.reporttime || weather.data.fetchedAt || '—' }} · {{ weatherProvider }}<span v-if="weather.cached || weather.status === 'cached'"> · 使用缓存</span></p>
        </template>
        <template v-else>
          <div class="weather-empty"><b>尚无天气实况</b><span>{{ weather.message || '请配置标段天气位置' }}</span></div>
        </template>
      </article>

      <article class="judgement" :class="stats.riskLevel">
        <div class="judgement-head"><span>雨情研判</span><b>{{ stats.riskLabel || '待计算' }}</b></div>
        <p>{{ stats.judgement || '录入日雨量后生成研判结果。' }}</p>
        <div class="reference">系统参考：单日 {{ stats.references?.dailyMm ?? 50 }} mm · 连续3日 {{ stats.references?.threeDayMm ?? 100 }} mm</div>
      </article>

      <article class="rain-metrics">
        <div><span>截止日雨量</span><strong>{{ number(stats.oneDay) }}</strong><small>mm</small></div>
        <div><span>近3日累计</span><strong>{{ number(stats.threeDay) }}</strong><small>mm</small></div>
        <div><span>近7日累计</span><strong>{{ number(stats.sevenDay) }}</strong><small>mm</small></div>
        <div><span>连续有雨</span><strong>{{ stats.consecutiveRainDays || 0 }}</strong><small>天</small></div>
      </article>
    </section>

    <section v-if="forecasts.length" class="forecast-strip">
      <div class="forecast-title"><b>天气预报</b><span>用于安排外业与雨后复测</span></div>
      <div v-for="item in forecasts" :key="item.date" class="forecast-day">
        <span>{{ shortDate(item.date) }} · {{ weekText(item.week) }}</span>
        <b>{{ item.dayweather }}<template v-if="item.nightweather && item.nightweather !== item.dayweather"> 转 {{ item.nightweather }}</template></b>
        <small>{{ item.nighttemp }}～{{ item.daytemp }}℃ · {{ item.daywind }}风 {{ item.daypower }}级</small>
      </div>
    </section>

    <section class="analysis-panel">
      <div class="panel-head">
        <div>
          <span class="section-index">降雨—变形响应</span>
          <h2>{{ activeView === 'rainfall' ? '雨量过程线' : '雨量与监测值叠加' }}</h2>
          <p>{{ activeView === 'rainfall' ? '柱形为日雨量，折线为滚动3日累计雨量。' : '保持原始监测日期，不对缺测日期进行插值。' }}</p>
        </div>
        <div class="chart-tools">
          <el-radio-group v-model="activeView" @change="changeView">
            <el-radio-button value="rainfall">雨量过程</el-radio-button>
            <el-radio-button value="overlay">叠加监测</el-radio-button>
          </el-radio-group>
          <el-select v-if="activeView === 'overlay'" v-model="pointId" filterable placeholder="选择监测点" class="point-select" @change="loadOverlay">
            <el-option-group v-for="group in pointGroups" :key="group.label" :label="group.label">
              <el-option v-for="point in group.options" :key="point.id" :label="`${point.point_name} · ${point.point_type}`" :value="point.id" />
            </el-option-group>
          </el-select>
          <el-button @click="router.push('/map-overview')">空间态势</el-button>
        </div>
      </div>
      <div v-if="activeView === 'overlay' && !pointId" class="chart-empty">请选择一个监测点，查看降雨与变形的时间对应关系。</div>
      <div v-else ref="chartEl" class="chart" />
      <div class="chart-foot">
        <span>雨量记录 {{ rain.length }} 条 · 有雨 {{ stats.rainyDays || 0 }} 天 · ≥50 mm {{ stats.heavyRainDays || 0 }} 天</span>
        <span>最大日雨量 {{ number(stats.maximum?.amount) }} mm<span v-if="stats.maximum?.date">（{{ stats.maximum.date }}）</span></span>
      </div>
    </section>

    <section class="ledger-panel">
      <div class="panel-head ledger-head">
        <div><span class="section-index">原始记录</span><h2>日雨量台账</h2><p>同一标段、同一日期再次保存将覆盖原记录，并重新执行突增复核。</p></div>
        <div class="ledger-actions"><el-tag v-if="stats.reviewCount" type="warning" effect="plain">{{ stats.reviewCount }} 条待复核</el-tag><el-tag v-if="stats.activeAlarmCount" type="danger" effect="plain">{{ stats.activeAlarmCount }} 条监测预警</el-tag><el-button @click="exportCsv">导出台账</el-button></div>
      </div>
      <el-table :data="[...rain].reverse()" class="rain-table" empty-text="当前时间范围没有雨量记录">
        <el-table-column type="index" label="序号" width="70" />
        <el-table-column prop="rain_date" label="雨量归属日期" width="135" />
        <el-table-column prop="observation_end_time" label="观测截止" width="105" />
        <el-table-column label="日雨量" width="130"><template #default="{ row }"><b class="rain-value">{{ number(row.amount_mm) }}</b> mm</template></el-table-column>
        <el-table-column label="质量状态" width="110"><template #default="{ row }"><el-tag v-if="row.needs_review" type="warning" effect="plain">待复核</el-tag><span v-else class="normal-state">已检查</span></template></el-table-column>
        <el-table-column prop="remark" label="现场备注" min-width="210" show-overflow-tooltip><template #default="{ row }">{{ row.remark || '—' }}</template></el-table-column>
        <el-table-column prop="updated_at" label="更新时间" width="145" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }"><el-button link type="primary" @click="openRain(row)">编辑</el-button><el-button v-if="row.needs_review" link type="warning" @click="reviewRain(row)">确认复核</el-button><el-button link type="danger" @click="removeRain(row)">删除</el-button></template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="rainVisible" :title="editingDate ? '编辑日雨量' : '录入日雨量'" width="460px">
      <el-alert title="雨量归属日期为观测截止日；默认统计前一日08:00至当日08:00的24小时累计雨量。" type="info" :closable="false" show-icon />
      <el-form :model="form" label-position="top" class="form">
        <el-form-item label="标段"><el-input :model-value="section" disabled /></el-form-item>
        <div class="form-grid"><el-form-item label="雨量归属日期" required><el-date-picker v-model="form.rain_date" value-format="YYYY-MM-DD" type="date" /></el-form-item><el-form-item label="观测截止时间"><el-time-select v-model="form.observation_end_time" start="00:00" step="00:30" end="23:30" /></el-form-item></div>
        <el-form-item label="日雨量（mm）" required><el-input-number v-model="form.amount_mm" :min="0" :max="2000" :precision="1" /></el-form-item>
        <el-form-item label="现场备注"><el-input v-model="form.remark" type="textarea" :rows="3" placeholder="可填写雨量站、数据来源或异常说明" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="rainVisible=false">取消</el-button><el-button type="primary" @click="saveRain">保存日雨量</el-button></template>
    </el-dialog>

    <el-dialog v-model="configVisible" :title="`${section} · 天气位置`" width="500px">
      <el-alert title="优先使用行政区编码调用高德天气；未配置天气服务密钥或调用失败时，可按经纬度自动切换备用天气。天气数据每30分钟刷新一次，服务异常时显示最近缓存。" type="info" :closable="false" show-icon />
      <el-form :model="config" label-position="top" class="form">
        <el-form-item label="位置名称"><el-input v-model="config.location_name" placeholder="项目驻地、标段中心或雨量站" /></el-form-item>
        <el-form-item label="高德行政区编码"><el-input v-model="config.adcode" placeholder="例如 110101" /></el-form-item>
        <div class="form-grid"><el-form-item label="经度"><el-input-number v-model="config.longitude" :controls="false" :precision="8" /></el-form-item><el-form-item label="纬度"><el-input-number v-model="config.latitude" :controls="false" :precision="8" /></el-form-item></div>
      </el-form>
      <template #footer><el-button @click="configVisible=false">取消</el-button><el-button type="primary" @click="saveConfig">保存位置</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import { dataRequest } from '../utils/request'

const router = useRouter()
const section = ref('')
const sections = ref([])
const dateRange = ref([])
const rain = ref([])
const weather = ref({})
const stats = ref({})
const points = ref([])
const overlay = ref({ rain: [], monitor: [] })
const pointId = ref(null)
const activeView = ref('rainfall')
const chartEl = ref()
const rainVisible = ref(false)
const configVisible = ref(false)
const loading = ref(false)
const editingDate = ref('')
const form = reactive({ rain_date: '', observation_end_time: '08:00', amount_mm: 0, remark: '' })
const config = reactive({ location_name: '', adcode: '', longitude: null, latitude: null })
let chart
let resizeObserver

function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
function shiftDate(date, days) { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return localDate(value) }
function number(value) { return Number(value || 0).toFixed(1) }
function shortDate(value) { return value ? `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日` : '—' }
function weekText(value) { return ['日', '一', '二', '三', '四', '五', '六'][Number(value)] ? `周${['日', '一', '二', '三', '四', '五', '六'][Number(value)]}` : '' }

const forecasts = computed(() => weather.value.data?.forecast?.casts?.slice(0, 4) || [])
const weatherLocation = computed(() => weather.value.config?.location_name || weather.value.data?.live?.city || section.value || '当前标段')
const weatherStatusText = computed(() => ({ ok: '实时', cached: '缓存', unconfigured: '未配置', unavailable: '不可用' }[weather.value.status] || '待加载'))
const weatherProvider = computed(() => weather.value.data?.provider === 'open-meteo' ? '经纬度天气' : '高德天气')
const pointGroups = computed(() => {
  const groups = new Map()
  points.value.forEach(point => {
    if (!groups.has(point.slope_name)) groups.set(point.slope_name, [])
    groups.get(point.slope_name).push(point)
  })
  return [...groups.entries()].map(([label, options]) => ({ label, options }))
})

async function bootstrap() {
  const today = localDate()
  dateRange.value = [shiftDate(today, -29), today]
  try {
    const result = await dataRequest('/api/slopes')
    sections.value = [...new Set((result.data || []).map(item => item.section).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    section.value = sections.value[0] || ''
    await load()
  } catch (error) { ElMessage.error(error.message) }
}

async function load() {
  if (!section.value || dateRange.value?.length !== 2) return
  loading.value = true
  try {
    const query = new URLSearchParams({ section: section.value, start_date: dateRange.value[0], end_date: dateRange.value[1] })
    const result = await dataRequest(`/api/weather-rainfall/summary?${query}`)
    rain.value = result.data.rain || []
    weather.value = result.data.weather || {}
    stats.value = result.data.statistics || {}
    points.value = result.data.points || []
    Object.assign(config, { location_name: '', adcode: '', longitude: null, latitude: null }, result.data.weather?.config || {})
    if (!points.value.some(point => Number(point.id) === Number(pointId.value))) pointId.value = points.value.find(point => !/深部|测斜/.test(point.point_type))?.id || points.value[0]?.id || null
    if (activeView.value === 'overlay') await loadOverlay()
    else { await nextTick(); drawRainfall() }
  } catch (error) { ElMessage.error(error.message) }
  finally { loading.value = false }
}

function continuousRainSeries() {
  if (dateRange.value?.length !== 2) return { dates: [], daily: [], rolling: [] }
  const amounts = new Map(rain.value.map(item => [item.rain_date, Number(item.amount_mm || 0)]))
  const dates = []
  for (let cursor = dateRange.value[0]; cursor <= dateRange.value[1]; cursor = shiftDate(cursor, 1)) dates.push(cursor)
  const daily = dates.map(date => amounts.get(date) || 0)
  const rolling = daily.map((_, index) => daily.slice(Math.max(0, index - 2), index + 1).reduce((sum, value) => sum + value, 0))
  return { dates, daily, rolling }
}

function baseChartOption() {
  return {
    animation: false,
    textStyle: { fontFamily: 'Microsoft YaHei, sans-serif', color: '#263b46' },
    grid: { left: 72, right: 72, top: 58, bottom: 70 },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(20,42,53,.94)', borderWidth: 0, textStyle: { color: '#fff' } },
    legend: { top: 5, right: 8, itemWidth: 22, itemHeight: 8, textStyle: { color: '#4e626c' } },
    xAxis: { type: 'category', axisLine: { lineStyle: { color: '#81939b' } }, axisTick: { alignWithLabel: true }, axisLabel: { color: '#60747e', hideOverlap: true } },
  }
}

function prepareChart() {
  if (!chartEl.value) return null
  chart?.dispose()
  chart = echarts.init(chartEl.value, null, { renderer: 'canvas' })
  return chart
}

function drawRainfall() {
  const instance = prepareChart()
  if (!instance) return
  const series = continuousRainSeries()
  const reference = Number(stats.value.references?.dailyMm || 50)
  instance.setOption({
    ...baseChartOption(),
    xAxis: { ...baseChartOption().xAxis, data: series.dates },
    yAxis: { type: 'value', name: '降雨量（mm）', min: 0, nameTextStyle: { color: '#60747e' }, splitLine: { lineStyle: { type: 'dashed', color: '#dce5e8' } } },
    dataZoom: series.dates.length > 45 ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 12 }] : [],
    series: [
      { name: '日雨量', type: 'bar', data: series.daily, barMaxWidth: 20, itemStyle: { color: '#3b8fa5', borderRadius: [2, 2, 0, 0] }, markLine: { silent: true, symbol: 'none', label: { formatter: `${reference} mm参考线`, color: '#a45f1c' }, lineStyle: { color: '#c87827', type: 'dashed' }, data: [{ yAxis: reference }] } },
      { name: '滚动3日累计', type: 'line', data: series.rolling, symbol: 'none', lineStyle: { width: 2.2, color: '#173f58' }, itemStyle: { color: '#173f58' } },
    ],
  })
}

async function loadOverlay() {
  if (!pointId.value) { overlay.value = { rain: [], monitor: [] }; return }
  try {
    const query = new URLSearchParams({ section: section.value, point_id: pointId.value, start_date: dateRange.value[0], end_date: dateRange.value[1] })
    const result = await dataRequest(`/api/weather-rainfall/overlay?${query}`)
    overlay.value = result.data || { rain: [], monitor: [] }
    await nextTick(); drawOverlay()
  } catch (error) { ElMessage.error(error.message) }
}

function drawOverlay() {
  const instance = prepareChart()
  if (!instance) return
  const rainMap = new Map((overlay.value.rain || []).map(item => [item.date, Number(item.amount_mm || 0)]))
  const monitorMap = new Map((overlay.value.monitor || []).map(item => [item.date, Number(item.value)]))
  const dates = [...new Set([...rainMap.keys(), ...monitorMap.keys()])].sort()
  const point = overlay.value.point
  instance.setOption({
    ...baseChartOption(),
    legend: { ...baseChartOption().legend, data: ['监测值', '日雨量'] },
    xAxis: { ...baseChartOption().xAxis, data: dates },
    yAxis: [
      { type: 'value', name: `${point?.point_name || '监测点'}（${overlay.value.monitor?.[0]?.unit || 'mm'}）`, nameTextStyle: { color: '#274e65' }, splitLine: { lineStyle: { type: 'dashed', color: '#dce5e8' } } },
      { type: 'value', name: '日雨量（mm）', min: 0, nameTextStyle: { color: '#3b8fa5' }, splitLine: { show: false } },
    ],
    dataZoom: dates.length > 45 ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 12 }] : [],
    series: [
      { name: '监测值', type: 'line', yAxisIndex: 0, connectNulls: false, data: dates.map(date => monitorMap.has(date) ? monitorMap.get(date) : null), symbol: 'circle', symbolSize: 5, lineStyle: { width: 2.3, color: '#193f58' }, itemStyle: { color: '#193f58' } },
      { name: '日雨量', type: 'bar', yAxisIndex: 1, data: dates.map(date => rainMap.get(date) || 0), barMaxWidth: 18, itemStyle: { color: 'rgba(59,143,165,.68)' } },
    ],
  })
}

async function changeView() { await nextTick(); activeView.value === 'rainfall' ? drawRainfall() : loadOverlay() }
function openConfig() { configVisible.value = true }
function openRain(row = null) {
  editingDate.value = row?.rain_date || ''
  Object.assign(form, { rain_date: row?.rain_date || dateRange.value?.[1] || localDate(), observation_end_time: row?.observation_end_time || '08:00', amount_mm: Number(row?.amount_mm || 0), remark: row?.remark || '' })
  rainVisible.value = true
}

async function saveRain() {
  if (!form.rain_date) return ElMessage.warning('请选择雨量归属日期')
  const existing = rain.value.find(item => item.rain_date === form.rain_date)
  if (existing && editingDate.value !== form.rain_date) {
    await ElMessageBox.confirm(`${form.rain_date} 已有雨量记录，继续将覆盖原记录。`, '确认覆盖', { type: 'warning', confirmButtonText: '覆盖保存', cancelButtonText: '取消' })
  }
  try {
    const result = await dataRequest('/api/weather-rainfall/rainfall', { method: 'POST', body: { section: section.value, ...form } })
    ElMessage.success(result.message); rainVisible.value = false; await load()
  } catch (error) { if (error !== 'cancel') ElMessage.error(error.message || '保存失败') }
}

async function reviewRain(row) {
  try { const result = await dataRequest(`/api/weather-rainfall/rainfall/${row.id}/review`, { method: 'PATCH' }); ElMessage.success(result.message); await load() }
  catch (error) { ElMessage.error(error.message) }
}

async function removeRain(row) {
  try {
    await ElMessageBox.confirm(`确定删除 ${row.rain_date} 的雨量记录吗？删除后无法恢复。`, '删除雨量记录', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    const result = await dataRequest(`/api/weather-rainfall/rainfall/${row.id}`, { method: 'DELETE' })
    ElMessage.success(result.message); await load()
  } catch (error) { if (error !== 'cancel') ElMessage.error(error.message || '删除失败') }
}

async function saveConfig() {
  try { const result = await dataRequest('/api/weather-rainfall/config', { method: 'PUT', body: { section: section.value, ...config } }); ElMessage.success(result.message); configVisible.value = false; await load() }
  catch (error) { ElMessage.error(error.message) }
}

function exportCsv() {
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const lines = [['标段', '雨量归属日期', '观测截止', '日雨量(mm)', '质量状态', '备注'], ...[...rain.value].reverse().map(row => [section.value, row.rain_date, row.observation_end_time, row.amount_mm, row.needs_review ? '待复核' : '已检查', row.remark || ''])]
  const blob = new Blob([`\ufeff${lines.map(line => line.map(escape).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${section.value}_${dateRange.value[0]}_${dateRange.value[1]}_雨量台账.csv`; link.click(); URL.revokeObjectURL(url)
}

onMounted(async () => {
  await bootstrap()
  resizeObserver = new ResizeObserver(() => chart?.resize())
  if (chartEl.value) resizeObserver.observe(chartEl.value)
})
onBeforeUnmount(() => { resizeObserver?.disconnect(); chart?.dispose() })
</script>

<style scoped>
.rain-page{--ink:#18323f;--muted:#667b85;--line:#d7e1e5;--paper:#fff;--water:#246e88;--deep:#173f58;--amber:#b86d22;min-height:calc(100vh - 52px);padding:24px 30px 52px;background:#eef3f5;color:var(--ink);font-family:"Microsoft YaHei","Noto Sans SC",sans-serif}.page-head,.situation-grid,.forecast-strip,.analysis-panel,.ledger-panel{max-width:1540px;margin-right:auto;margin-left:auto}.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:16px}.eyebrow,.section-index{color:var(--water);font-size:12px;font-weight:700;letter-spacing:.08em}.title-block h1{margin:4px 0 3px;font-size:28px;line-height:1.2;letter-spacing:-.02em}.title-block p,.panel-head p{margin:0;color:var(--muted);font-size:13px}.head-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.head-actions .el-select{width:170px}.head-actions :deep(.el-date-editor){width:260px}.situation-grid{display:grid;grid-template-columns:1.05fr 1.35fr 1.5fr;border:1px solid var(--line);background:var(--paper)}.weather-sheet,.judgement,.rain-metrics{min-height:154px;padding:20px 22px}.weather-sheet{border-top:4px solid var(--deep);border-right:1px solid var(--line)}.sheet-label{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:12px}.sheet-label em{padding:2px 7px;border:1px solid #bad2dc;border-radius:2px;color:var(--water);font-style:normal}.sheet-label em.cached{border-color:#d9c59f;color:#916220}.weather-now{display:flex;align-items:center;gap:18px;margin-top:13px}.weather-now>strong{font-family:Georgia,"Times New Roman",serif;font-size:48px;font-weight:500;line-height:1}.weather-now>strong small{font-family:inherit;font-size:18px}.weather-now div{display:flex;flex-direction:column;gap:5px}.weather-now div b{font-size:16px}.weather-now div span,.weather-sheet>p,.weather-empty span{color:var(--muted);font-size:12px}.weather-sheet>p{margin:14px 0 0}.weather-empty{display:flex;flex-direction:column;gap:8px;margin-top:28px}.judgement{border-right:1px solid var(--line);border-left:5px solid #70909e;background:#f7fafb}.judgement.watch{border-left-color:#d49842;background:#fffaf2}.judgement.warning{border-left-color:#c34f43;background:#fff7f5}.judgement-head{display:flex;align-items:center;justify-content:space-between}.judgement-head span{color:var(--muted);font-size:12px}.judgement-head b{font-size:18px}.judgement p{min-height:48px;margin:18px 0 13px;font-family:"SimSun",serif;font-size:14px;line-height:1.75}.reference{color:var(--muted);font-size:11px}.rain-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:0;padding:0}.rain-metrics>div{display:flex;align-items:baseline;padding:17px 20px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.rain-metrics>div:nth-child(2n){border-right:0}.rain-metrics>div:nth-child(n+3){border-bottom:0}.rain-metrics span{display:block;width:100%;color:var(--muted);font-size:11px}.rain-metrics strong{font-family:Georgia,"Times New Roman",serif;font-size:26px;font-weight:500}.rain-metrics small{margin-left:4px;color:var(--muted)}.forecast-strip{display:grid;grid-template-columns:190px repeat(4,1fr);margin-top:12px;border:1px solid var(--line);background:#fff}.forecast-title,.forecast-day{display:flex;min-height:78px;flex-direction:column;justify-content:center;padding:12px 18px;border-right:1px solid var(--line)}.forecast-day:last-child{border-right:0}.forecast-title span,.forecast-day span,.forecast-day small{color:var(--muted);font-size:11px}.forecast-title b,.forecast-day b{margin:4px 0;font-size:13px}.analysis-panel,.ledger-panel{margin-top:12px;border:1px solid var(--line);background:#fff;padding:20px 22px}.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}.panel-head h2{margin:4px 0 3px;font-size:19px}.chart-tools,.ledger-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.point-select{width:300px}.chart{height:440px;margin-top:8px}.chart-empty{display:flex;height:390px;align-items:center;justify-content:center;color:var(--muted);font-size:13px}.chart-foot{display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}.ledger-head{margin-bottom:16px}.rain-value{color:var(--deep);font-family:Georgia,"Times New Roman",serif;font-size:15px}.normal-state{color:#55736a}.form{margin-top:18px}.form :deep(.el-date-editor),.form :deep(.el-input-number),.form :deep(.el-select){width:100%}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.rain-table :deep(th.el-table__cell){background:#f4f7f8;color:#435965;font-weight:600}.rain-table :deep(.el-table__row:hover>td.el-table__cell){background:#f1f7f9}@media(max-width:1180px){.page-head{align-items:flex-start;flex-direction:column}.head-actions{justify-content:flex-start}.situation-grid{grid-template-columns:1fr 1fr}.rain-metrics{grid-column:1/-1;border-top:1px solid var(--line)}.forecast-strip{grid-template-columns:160px repeat(2,1fr)}.forecast-day{border-bottom:1px solid var(--line)}}@media(max-width:760px){.rain-page{padding:16px}.situation-grid{grid-template-columns:1fr}.weather-sheet,.judgement{border-right:0;border-bottom:1px solid var(--line)}.rain-metrics{grid-template-columns:1fr 1fr}.forecast-strip{grid-template-columns:1fr}.forecast-title,.forecast-day{border-right:0;border-bottom:1px solid var(--line)}.panel-head,.chart-foot{flex-direction:column}.chart-tools{width:100%}.point-select{width:100%}.chart{height:360px}.form-grid{grid-template-columns:1fr}.head-actions :deep(.el-date-editor){width:100%}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style>
