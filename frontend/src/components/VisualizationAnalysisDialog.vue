<template>
  <el-dialog
    :model-value="modelValue"
    title="可视化分析"
    fullscreen
    destroy-on-close
    class="visual-analysis-dialog"
    @update:model-value="emit('update:modelValue', $event)"
    @opened="handleOpened"
    @closed="disposeCharts"
  >
    <div class="analysis-shell">
      <aside class="analysis-sidebar">
        <div class="sidebar-title">分析对象</div>
        <el-descriptions :column="1" size="small" border class="filter-summary">
          <el-descriptions-item label="边坡">{{ currentSlopeName }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ currentMonitoringType }}</el-descriptions-item>
          <el-descriptions-item label="日期">{{ dateRangeText }}</el-descriptions-item>
        </el-descriptions>

        <el-input
          v-model="pointKeyword"
          placeholder="搜索测点"
          clearable
          class="point-search"
        />

        <template v-if="isInclinometerMode">
          <el-radio-group v-model="selectedDeepPointId" class="point-list" @change="loadDeepProfile">
            <el-radio
              v-for="point in filteredDeepPoints"
              :key="point.id"
              :label="String(point.id)"
              border
            >
              {{ point.point_name }}
            </el-radio>
          </el-radio-group>
        </template>

        <template v-else>
          <el-checkbox-group v-model="selectedSurfacePointIds" class="point-list" @change="renderSurfaceCharts">
            <el-checkbox
              v-for="point in filteredSurfacePoints"
              :key="point.id"
              :label="String(point.id)"
              border
            >
              {{ point.name }}
            </el-checkbox>
          </el-checkbox-group>
        </template>
      </aside>

      <main class="analysis-main">
        <div class="analysis-toolbar">
          <el-radio-group
            v-if="!isInclinometerMode"
            v-model="surfaceChartMode"
            size="small"
            @change="renderSurfaceCharts"
          >
            <el-radio-button
              v-for="mode in surfaceChartModes"
              :key="mode.value"
              :label="mode.value"
            >
              {{ mode.label }}
            </el-radio-button>
          </el-radio-group>
          <el-button type="primary" :loading="loading" @click="reloadAnalysis">
            <el-icon><RefreshRight /></el-icon>
            刷新分析
          </el-button>
          <el-button :icon="Download" @click="exportActiveChart">导出当前图</el-button>
          <el-button :icon="FolderAdd" @click="saveActiveChartMaterial">加入报告素材</el-button>
        </div>

        <el-empty v-if="!loading && emptyMessage" :description="emptyMessage" :image-size="88" />

        <template v-else>
          <div v-if="isInclinometerMode" class="chart-stack">
            <div class="chart-panel">
              <div class="chart-title">
                <span>累积位移曲线</span>
                <div class="chart-title-actions">
                  <span>固定横轴 -40 ~ 40mm，预警线 ±20mm</span>
                  <el-button size="small" plain :icon="Download" @click="exportChartImage(deepCumulativeChart, '累积位移曲线')">
                    导出
                  </el-button>
                </div>
              </div>
              <div ref="deepCumulativeChartRef" class="analysis-chart"></div>
            </div>
            <div class="chart-panel">
              <div class="chart-title">
                <span>相对位移曲线</span>
                <div class="chart-title-actions">
                  <span>固定横轴 -40 ~ 40mm，预警线 ±20mm</span>
                  <el-button size="small" plain :icon="Download" @click="exportChartImage(deepRelativeChart, '相对位移曲线')">
                    导出
                  </el-button>
                </div>
              </div>
              <div ref="deepRelativeChartRef" class="analysis-chart"></div>
            </div>
          </div>

          <div v-else class="chart-panel chart-panel-large">
            <div class="chart-title">
              <span>{{ activeSurfaceChartTitle }}</span>
              <span>预警参考值：20mm</span>
            </div>
            <div ref="surfaceChartRef" class="analysis-chart large"></div>
          </div>
        </template>
      </main>

      <aside class="analysis-inspector">
        <div class="sidebar-title">统计与判断</div>
        <el-skeleton v-if="loading" :rows="8" animated />
        <template v-else>
          <el-row :gutter="12" class="metric-grid">
            <el-col :span="12">
              <el-statistic title="测点数" :value="analysisStats.pointCount" />
            </el-col>
            <el-col :span="12">
              <el-statistic title="数据期数" :value="analysisStats.periodCount" />
            </el-col>
            <el-col :span="12">
              <el-statistic title="最大值" :value="analysisStats.maxAbs" :precision="2" suffix="mm" />
            </el-col>
            <el-col :span="12">
              <el-statistic title="最大变化" :value="analysisStats.maxChange" :precision="2" suffix="mm" />
            </el-col>
          </el-row>

          <el-alert
            :title="judgement.title"
            :type="judgement.type"
            :closable="false"
            show-icon
            class="judgement-alert"
          >
            <template #default>
              <p>{{ judgement.description }}</p>
            </template>
          </el-alert>

          <el-divider content-position="left">图表素材</el-divider>
          <div class="material-note">
            当前图可导出为 PNG，也可加入本地报告素材池，后续报告模块可以读取这些图表素材。
          </div>

          <el-divider content-position="left">分析说明</el-divider>
          <ul class="analysis-notes">
            <li v-for="note in analysisNotes" :key="note">{{ note }}</li>
          </ul>
        </template>
      </aside>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, FolderAdd, RefreshRight } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { API_DATA } from '../config/api'
import { dataRequest } from '../utils/request'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  filter: {
    type: Object,
    default: () => ({}),
  },
  slopes: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:modelValue'])

const warningThreshold = 20
const fixedAxisRange = 40
const loading = ref(false)
const pointKeyword = ref('')
const surfaceRows = ref([])
const selectedSurfacePointIds = ref([])
const surfaceChartMode = ref('history')
const deepPoints = ref([])
const selectedDeepPointId = ref('')
const deepProfile = ref(null)

const surfaceChartRef = ref(null)
const deepCumulativeChartRef = ref(null)
const deepRelativeChartRef = ref(null)
let surfaceChart = null
let deepCumulativeChart = null
let deepRelativeChart = null

const surfaceChartModes = [
  { label: '单测点历时', value: 'history' },
  { label: '多测点对比', value: 'comparison' },
  { label: '累计变化', value: 'cumulative' },
]

const isInclinometerMode = computed(() => props.filter?.monitoringType === '深部位移测斜孔')
const currentMonitoringType = computed(() => props.filter?.monitoringType || '全部类型')
const currentSlopeName = computed(() => {
  const slope = props.slopes.find(item => String(item.id) === String(props.filter?.slopeId))
  return slope?.slope_name || '全部边坡'
})
const dateRangeText = computed(() => {
  const range = props.filter?.dateRange || []
  return range.length === 2 ? `${range[0]} 至 ${range[1]}` : '全部日期'
})

const surfacePoints = computed(() => {
  const map = new Map()
  surfaceRows.value.forEach(row => {
    if (!map.has(row.pointId)) {
      map.set(row.pointId, {
        id: row.pointId,
        name: row.pointName,
        slopeName: row.slopeName,
      })
    }
  })
  return [...map.values()]
})

const filteredSurfacePoints = computed(() => {
  const keyword = pointKeyword.value.trim().toLowerCase()
  if (!keyword) return surfacePoints.value
  return surfacePoints.value.filter(point => point.name.toLowerCase().includes(keyword))
})

const filteredDeepPoints = computed(() => {
  const keyword = pointKeyword.value.trim().toLowerCase()
  if (!keyword) return deepPoints.value
  return deepPoints.value.filter(point => String(point.point_name || '').toLowerCase().includes(keyword))
})

const selectedSurfaceRows = computed(() => {
  if (!selectedSurfacePointIds.value.length) return []
  return surfaceRows.value.filter(row => selectedSurfacePointIds.value.includes(String(row.pointId)))
})

const emptyMessage = computed(() => {
  if (loading.value) return ''
  if (isInclinometerMode.value) {
    if (!deepPoints.value.length) return '当前筛选条件下暂无深部测斜孔'
    if (!selectedDeepPointId.value) return '请选择一个测斜孔'
    if (!deepProfile.value?.has_baseline) return '该测斜孔暂无初始值，请先上传初始值'
    if (!deepProfile.value?.surveys?.length) return '该测斜孔暂无观测数据'
    return ''
  }
  if (!surfaceRows.value.length) return '当前筛选条件下暂无地表/沉降监测数据'
  if (!selectedSurfaceRows.value.length) return '请在左侧选择至少一个测点'
  return ''
})

const activeSurfaceChartTitle = computed(() => {
  const titleMap = {
    history: '单测点历时曲线',
    comparison: '多测点对比曲线',
    cumulative: '累计变化趋势',
  }
  return titleMap[surfaceChartMode.value] || '监测曲线'
})

const analysisStats = computed(() => {
  if (isInclinometerMode.value) {
    const surveys = deepProfile.value?.surveys || []
    const values = surveys.flatMap(survey => survey.readings || []).flatMap(row => [
      Math.abs(Number(row.cumulative_displacement) || 0),
      Math.abs(Number(row.relative_displacement) || 0),
    ])
    return {
      pointCount: selectedDeepPointId.value ? 1 : 0,
      periodCount: surveys.length,
      maxAbs: values.length ? Math.max(...values) : 0,
      maxChange: values.length ? Math.max(...values) : 0,
    }
  }

  const rows = selectedSurfaceRows.value
  const values = rows.map(row => Math.abs(Number(row.value) || 0))
  const rowsByPoint = new Map()
  rows.forEach((row) => {
    const key = String(row.pointId)
    if (!rowsByPoint.has(key)) rowsByPoint.set(key, [])
    rowsByPoint.get(key).push(row)
  })
  const changeValues = selectedSurfacePointIds.value.map(pointId => {
    const pointRows = (rowsByPoint.get(String(pointId)) || [])
      .sort((a, b) => String(a.monitorDate).localeCompare(String(b.monitorDate)))
    if (pointRows.length < 2) return 0
    return Math.abs(Number(pointRows.at(-1).value) - Number(pointRows[0].value))
  })
  return {
    pointCount: selectedSurfacePointIds.value.length,
    periodCount: new Set(rows.map(row => row.monitorDate)).size,
    maxAbs: values.length ? Math.max(...values) : 0,
    maxChange: changeValues.length ? Math.max(...changeValues) : 0,
  }
})

const judgement = computed(() => {
  const maxValue = analysisStats.value.maxAbs
  const ratio = maxValue / warningThreshold
  if (ratio >= 1) {
    return {
      type: 'error',
      title: '达到或超过预警参考值',
      description: '建议立即复核原始数据，结合现场巡查判断是否启动预警处置。',
    }
  }
  if (ratio >= 0.75) {
    return {
      type: 'warning',
      title: '接近预警参考值',
      description: '建议提高关注频率，重点核查变化较大的测点或深度段。',
    }
  }
  return {
    type: 'success',
    title: '总体处于正常范围',
    description: '当前最大变形未达到 20mm 预警参考值，可按常规频率持续监测。',
  }
})

const analysisNotes = computed(() => {
  if (isInclinometerMode.value) {
    return [
      '深部测斜曲线固定横坐标为 -40～40mm，避免小变形被自动放大。',
      '红色虚线为 ±20mm 预警参考线。',
      '重点观察曲线在某一深度段是否连续偏移或突变。',
    ]
  }
  return [
    '单测点历时曲线适合看某个测点随时间的发展趋势。',
    '多测点对比曲线适合判断同一边坡不同测点是否同步变化。',
    '累计变化趋势以首期数据为零点，适合报告中说明本期累计变形。',
  ]
})

function splitMonitorDateTime(monitorDate) {
  if (typeof monitorDate !== 'string') return { monitorDate: '', monitorTime: '' }
  const parts = monitorDate.trim().split(' ')
  return {
    monitorDate: parts[0] || '',
    monitorTime: parts[1]?.slice(0, 5) || '',
  }
}

function mapBackendRow(row) {
  const { monitorDate, monitorTime } = splitMonitorDateTime(row.monitor_date)
  return {
    id: row.id,
    slopeId: String(row.slope_id),
    slopeName: row.slope_name || '',
    pointId: String(row.point_id),
    pointName: row.point_name || '',
    monitoringType: row.monitor_type,
    monitorDate,
    monitorTime,
    value: Number(row.value) || 0,
    unit: row.unit || 'mm',
  }
}

async function handleOpened() {
  await reloadAnalysis()
}

async function reloadAnalysis() {
  if (isInclinometerMode.value) {
    await loadDeepPoints()
  } else {
    await loadSurfaceRows()
  }
}

async function loadSurfaceRows() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (props.filter?.slopeId) params.append('slope_id', props.filter.slopeId)
    if (props.filter?.monitoringType) params.append('point_type', props.filter.monitoringType)
    if (props.filter?.dateRange?.length === 2) {
      params.append('from', props.filter.dateRange[0])
      params.append('to', props.filter.dateRange[1])
    } else {
      params.append('all_history', 'true')
    }
    const response = await fetch(`${API_DATA}/api/monitoring-data/overview/trends?${params}`)
    const result = await response.json()
    let rows = result?.success && Array.isArray(result.data) ? result.data.map(mapBackendRow) : []
    surfaceRows.value = rows
    selectedSurfacePointIds.value = surfacePoints.value.map(point => String(point.id))
    await nextTick()
    renderSurfaceCharts()
  } catch (error) {
    ElMessage.error(error.message || '加载可视化数据失败')
  } finally {
    loading.value = false
  }
}

async function loadDeepPoints() {
  loading.value = true
  try {
    const params = new URLSearchParams({ point_type: '深部位移测斜孔' })
    if (props.filter?.slopeId) params.append('slope_id', props.filter.slopeId)
    const result = await dataRequest(`/api/points?${params}`)
    deepPoints.value = result.data || []
    selectedDeepPointId.value = String(props.filter?.pointId || deepPoints.value[0]?.id || '')
    if (selectedDeepPointId.value) await loadDeepProfile()
    else deepProfile.value = null
  } catch (error) {
    ElMessage.error(error.message || '加载测斜孔失败')
  } finally {
    loading.value = false
  }
}

async function loadDeepProfile() {
  if (!selectedDeepPointId.value) return
  loading.value = true
  try {
    const params = new URLSearchParams({ point_id: selectedDeepPointId.value })
    if (props.filter?.dateRange?.length === 2) {
      params.append('from', props.filter.dateRange[0])
      params.append('to', props.filter.dateRange[1])
    }
    const result = await dataRequest(`/api/inclinometer-data/profile?${params}`)
    deepProfile.value = result.data
    await nextTick()
    renderDeepCharts()
  } catch (error) {
    ElMessage.error(error.message || '加载测斜曲线失败')
  } finally {
    loading.value = false
  }
}

function groupSurfaceRows() {
  const dates = [...new Set(selectedSurfaceRows.value.map(row => row.monitorDate))].sort()
  const groups = {}
  selectedSurfaceRows.value.forEach(row => {
    if (!groups[row.pointName]) groups[row.pointName] = {}
    groups[row.pointName][row.monitorDate] = Number(row.value) || 0
  })
  return { dates, groups }
}

function buildSurfaceSeries() {
  const { dates, groups } = groupSurfaceRows()
  return Object.entries(groups).map(([name, values]) => {
    const raw = dates.map(date => values[date] ?? null)
    const firstValue = raw.find(value => Number.isFinite(value)) ?? 0
    const data = surfaceChartMode.value === 'cumulative'
      ? raw.map(value => Number.isFinite(value) ? Number((value - firstValue).toFixed(3)) : null)
      : raw
    return {
      name,
      type: 'line',
      smooth: false,
      connectNulls: true,
      showSymbol: surfaceChartMode.value === 'history',
      data,
    }
  })
}

function renderSurfaceCharts() {
  if (!surfaceChartRef.value || isInclinometerMode.value || !selectedSurfaceRows.value.length) return
  if (!surfaceChart) surfaceChart = echarts.init(surfaceChartRef.value)
  const { dates } = groupSurfaceRows()
  const series = buildSurfaceSeries()
  surfaceChart.setOption({
    backgroundColor: '#fff',
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', bottom: 0 },
    grid: { left: 64, right: 36, top: 48, bottom: 72, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: dates },
    yAxis: {
      type: 'value',
      name: surfaceChartMode.value === 'cumulative' ? '累计变化(mm)' : '监测值(mm)',
      splitLine: { show: true },
    },
    series,
  }, true)
}

function getDepthAxisMax() {
  const holeDepth = Number(deepProfile.value?.baseline?.data_length) || Math.max(
    ...(deepProfile.value?.surveys || []).flatMap(survey => (survey.readings || []).map(row => Number(row.depth_m) || 0)),
    0
  )
  return holeDepth ? Math.ceil(holeDepth / 5) * 5 : undefined
}

function buildDeepSeries(type) {
  const series = (deepProfile.value?.surveys || []).map(survey => ({
    name: survey.survey_date,
    type: 'line',
    smooth: false,
    showSymbol: false,
    data: (survey.readings || []).map(row => [
      Number(type === 'cumulative' ? row.cumulative_displacement : row.relative_displacement) || 0,
      Number(row.depth_m) || 0,
    ]),
  }))

  if (series.length) {
    series[0].markLine = {
      silent: true,
      symbol: 'none',
      label: { show: false },
      data: [
        { xAxis: -warningThreshold, lineStyle: { color: '#d93026', type: 'dashed' } },
        { xAxis: 0, lineStyle: { color: '#606266', type: 'solid' } },
        { xAxis: warningThreshold, lineStyle: { color: '#d93026', type: 'dashed' } },
      ],
    }
  }
  return series
}

function buildDeepOption(type) {
  return {
    backgroundColor: '#fff',
    tooltip: { trigger: 'axis', valueFormatter: value => `${value} mm` },
    legend: { type: 'scroll', bottom: 0 },
    grid: { left: 72, right: 36, top: 32, bottom: 82, containLabel: true },
    xAxis: {
      type: 'value',
      name: '位移(mm)',
      nameLocation: 'middle',
      nameGap: 34,
      min: -fixedAxisRange,
      max: fixedAxisRange,
      interval: 5,
    },
    yAxis: {
      type: 'value',
      name: '深度(m)',
      nameLocation: 'middle',
      nameGap: 46,
      nameRotate: 90,
      min: 0,
      max: getDepthAxisMax(),
      inverse: true,
    },
    series: buildDeepSeries(type),
  }
}

function renderDeepCharts() {
  if (!deepProfile.value?.has_baseline || !deepProfile.value?.surveys?.length) return
  if (!deepCumulativeChart) deepCumulativeChart = echarts.init(deepCumulativeChartRef.value)
  if (!deepRelativeChart) deepRelativeChart = echarts.init(deepRelativeChartRef.value)
  deepCumulativeChart.setOption(buildDeepOption('cumulative'), true)
  deepRelativeChart.setOption(buildDeepOption('relative'), true)
}

function getActiveChart() {
  if (isInclinometerMode.value) return deepCumulativeChart || deepRelativeChart
  return surfaceChart
}

function getActiveChartName() {
  if (isInclinometerMode.value) {
    const point = deepPoints.value.find(item => String(item.id) === selectedDeepPointId.value)
    return `${point?.point_name || '测斜孔'}-累积位移曲线`
  }
  return activeSurfaceChartTitle.value
}

function getActiveChartDataUrl() {
  const chart = getActiveChart()
  if (!chart) return ''
  return chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
}

function imageDataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',')
  const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mimeType })
}

function exportActiveChart() {
  exportChartImage(getActiveChart(), getActiveChartName())
}

function exportChartImage(chart, chartName) {
  const imageUrl = getActiveChartDataUrl()
  const targetImageUrl = chart
    ? chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' })
    : imageUrl
  if (!targetImageUrl) {
    ElMessage.warning('图表尚未生成')
    return
  }
  const fileName = `${currentSlopeName.value}-${chartName}.png`.replace(/[\\/:*?"<>|]/g, '_')
  const objectUrl = URL.createObjectURL(imageDataUrlToBlob(targetImageUrl))
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function saveActiveChartMaterial() {
  const imageUrl = getActiveChartDataUrl()
  if (!imageUrl) {
    ElMessage.warning('图表尚未生成')
    return
  }
  const materials = JSON.parse(localStorage.getItem('reportChartMaterials') || '[]')
  materials.unshift({
    id: `${Date.now()}`,
    title: getActiveChartName(),
    slopeName: currentSlopeName.value,
    monitoringType: currentMonitoringType.value,
    dateRange: dateRangeText.value,
    imageUrl,
    createdAt: new Date().toISOString(),
  })
  localStorage.setItem('reportChartMaterials', JSON.stringify(materials.slice(0, 30)))
  ElMessage.success('已加入报告图表素材')
}

function disposeCharts() {
  surfaceChart?.dispose()
  deepCumulativeChart?.dispose()
  deepRelativeChart?.dispose()
  surfaceChart = null
  deepCumulativeChart = null
  deepRelativeChart = null
}

function handleResize() {
  surfaceChart?.resize()
  deepCumulativeChart?.resize()
  deepRelativeChart?.resize()
}

window.addEventListener('resize', handleResize)

onBeforeUnmount(() => {
  disposeCharts()
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.analysis-shell {
  height: calc(100vh - 112px);
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  gap: 16px;
  background: #f5f7fa;
  padding: 16px;
  box-sizing: border-box;
}

.analysis-sidebar,
.analysis-main,
.analysis-inspector {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  min-height: 0;
}

.analysis-sidebar,
.analysis-inspector {
  padding: 14px;
  overflow: auto;
}

.analysis-main {
  display: flex;
  flex-direction: column;
  padding: 14px;
  overflow: hidden;
}

.sidebar-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
}

.filter-summary {
  margin-bottom: 12px;
}

.point-search {
  margin-bottom: 12px;
}

.point-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.point-list :deep(.el-checkbox),
.point-list :deep(.el-radio) {
  margin-right: 0;
  height: auto;
  padding: 8px 10px;
}

.analysis-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.chart-stack {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.chart-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
}

.chart-panel-large {
  flex: 1;
}

.chart-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-weight: 600;
}

.chart-title span:last-child {
  color: #909399;
  font-size: 12px;
  font-weight: 400;
}

.chart-title-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #909399;
  font-size: 12px;
  font-weight: 400;
}

.analysis-chart {
  flex: 1;
  min-height: 520px;
}

.analysis-chart.large {
  min-height: 620px;
}

.metric-grid {
  row-gap: 12px;
}

.judgement-alert {
  margin-top: 16px;
}

.material-note {
  color: #606266;
  line-height: 1.6;
  font-size: 13px;
}

.analysis-notes {
  padding-left: 18px;
  margin: 0;
  color: #606266;
  line-height: 1.8;
  font-size: 13px;
}

@media (max-width: 1200px) {
  .analysis-shell {
    grid-template-columns: 240px minmax(0, 1fr);
  }

  .analysis-inspector {
    grid-column: 1 / -1;
  }
}
</style>
