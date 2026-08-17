<template>
  <div class="inclinometer-view">
    <div class="view-toolbar">
      <el-select
        v-model="selectedPointId"
        placeholder="选择测斜孔"
        filterable
        clearable
        style="width: 260px"
        @change="loadProfile"
      >
        <el-option
          v-for="point in points"
          :key="point.id"
          :label="`${point.point_name}（${point.slope_name || ''}）`"
          :value="String(point.id)"
        />
      </el-select>
      <el-button type="primary" :loading="loading" @click="loadProfile">查询曲线</el-button>
    </div>

    <el-empty v-if="!selectedPointId" description="请选择一个深部位移测斜孔" :image-size="72" />

    <template v-else>
      <el-alert
        v-if="profile && !profile.has_baseline"
        title="该测斜孔暂无初始值，请先到数据录入页面上传初始值。"
        type="warning"
        show-icon
        :closable="false"
      />

      <template v-else-if="profile?.has_baseline">
        <el-row :gutter="16" class="summary-row">
          <el-col :xs="24" :sm="6">
            <el-statistic title="观测期数" :value="profile.surveys.length" />
          </el-col>
          <el-col :xs="24" :sm="6">
            <el-statistic title="最大累积位移" :value="maxCumulative" :precision="2" suffix="mm" />
          </el-col>
          <el-col :xs="24" :sm="6">
            <el-statistic title="最大相对位移" :value="maxRelative" :precision="2" suffix="mm" />
          </el-col>
          <el-col :xs="24" :sm="6">
            <el-statistic title="深度点数" :value="profile.baseline.readings.length" />
          </el-col>
        </el-row>

        <el-descriptions :column="4" size="small" border>
          <el-descriptions-item label="测孔">{{ profile.baseline.hole_name }}</el-descriptions-item>
          <el-descriptions-item label="初始日期">{{ profile.baseline.baseline_date }}</el-descriptions-item>
          <el-descriptions-item label="孔深">{{ profile.baseline.data_length ?? '-' }} m</el-descriptions-item>
          <el-descriptions-item label="测试间距">{{ profile.baseline.measure_interval ?? '-' }} m</el-descriptions-item>
        </el-descriptions>

        <el-empty
          v-if="profile.surveys.length === 0"
          description="已有初始值，但暂无后续观测数据。"
          :image-size="72"
        />

        <template v-else>
          <div class="chart-grid">
            <div class="chart-panel">
              <div class="chart-title">
                <span>累积位移曲线</span>
                <div class="chart-actions">
                  <span class="axis-hint">横轴 -40 ~ 40mm</span>
                  <span class="warning-hint"><i></i>预警值 ±20mm</span>
                  <el-button size="small" plain :icon="Download" @click="exportChartImage('cumulative')">
                    导出图片
                  </el-button>
                </div>
              </div>
              <div ref="cumulativeChartRef" class="chart"></div>
            </div>
            <div class="chart-panel">
              <div class="chart-title">
                <span>相对位移曲线</span>
                <div class="chart-actions">
                  <span class="axis-hint">横轴 -40 ~ 40mm</span>
                  <span class="warning-hint"><i></i>预警值 ±20mm</span>
                  <el-button size="small" plain :icon="Download" @click="exportChartImage('relative')">
                    导出图片
                  </el-button>
                </div>
              </div>
              <div ref="relativeChartRef" class="chart"></div>
            </div>
          </div>

          <el-collapse v-model="expandedPanels" class="survey-collapse">
            <el-collapse-item name="surveys">
              <template #title>
                <span class="collapse-title">观测数据列表（{{ surveyRows.length }} 期，展开用于核查）</span>
              </template>
              <el-table :data="surveyRows" border size="small" class="survey-table">
                <el-table-column prop="survey_no" label="测试次数" width="100" align="center" />
                <el-table-column prop="survey_date" label="测试日期" width="140" align="center" />
                <el-table-column prop="reading_count" label="深度点数" width="110" align="right" />
                <el-table-column prop="max_cumulative" label="最大累积位移(mm)" width="160" align="right">
                  <template #default="{ row }">{{ formatNumber(row.max_cumulative) }}</template>
                </el-table-column>
                <el-table-column prop="max_relative" label="最大相对位移(mm)" width="160" align="right">
                  <template #default="{ row }">{{ formatNumber(row.max_relative) }}</template>
                </el-table-column>
                <el-table-column prop="source_file" label="来源文件" min-width="220" show-overflow-tooltip />
              </el-table>
            </el-collapse-item>
          </el-collapse>
        </template>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { dataRequest } from '../utils/request'

const props = defineProps({
  slopeId: {
    type: [String, Number],
    default: '',
  },
  pointId: {
    type: [String, Number],
    default: '',
  },
  dateRange: {
    type: Array,
    default: () => [],
  },
})

const points = ref([])
const selectedPointId = ref('')
const profile = ref(null)
const loading = ref(false)
const cumulativeChartRef = ref(null)
const relativeChartRef = ref(null)
const expandedPanels = ref([])
const warningThreshold = 20
const fixedAxisRange = 40
let cumulativeChart = null
let relativeChart = null

const maxCumulative = computed(() => {
  const values = profile.value?.surveys?.map((survey) => Math.abs(Number(survey.max_cumulative) || 0)) || []
  return values.length ? Math.max(...values) : 0
})

const maxRelative = computed(() => {
  const values = profile.value?.surveys?.map((survey) => Math.abs(Number(survey.max_relative) || 0)) || []
  return values.length ? Math.max(...values) : 0
})

const surveyRows = computed(() => {
  return [...(profile.value?.surveys || [])]
    .map((survey) => ({
      ...survey,
      reading_count: survey.readings?.length || 0,
    }))
    .sort((a, b) => String(b.survey_date || '').localeCompare(String(a.survey_date || '')))
})

function formatNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num.toFixed(2) : '-'
}

async function loadPoints() {
  const params = new URLSearchParams({ point_type: '深部位移测斜孔' })
  if (props.slopeId) params.append('slope_id', String(props.slopeId))
  try {
    const result = await dataRequest(`/api/points?${params}`)
    points.value = result.data || []
    if (props.pointId && points.value.some((point) => String(point.id) === String(props.pointId))) {
      selectedPointId.value = String(props.pointId)
    }
    if (!points.value.some((point) => String(point.id) === selectedPointId.value)) {
      selectedPointId.value = points.value[0] ? String(points.value[0].id) : ''
    }
    if (selectedPointId.value) await loadProfile()
    else profile.value = null
  } catch (error) {
    ElMessage.error(error.message || '加载测斜孔失败')
  }
}

async function loadProfile() {
  if (!selectedPointId.value) return
  loading.value = true
  try {
    const params = new URLSearchParams({ point_id: selectedPointId.value })
    if (props.dateRange?.length === 2) {
      params.append('from', props.dateRange[0])
      params.append('to', props.dateRange[1])
    }
    const result = await dataRequest(`/api/inclinometer-data/profile?${params}`)
    profile.value = result.data
    await nextTick()
    renderCharts()
  } catch (error) {
    ElMessage.error(error.message || '加载测斜曲线失败')
  } finally {
    loading.value = false
  }
}

function renderCharts() {
  if (!profile.value?.has_baseline || !profile.value.surveys.length) {
    disposeCharts()
    return
  }
  renderProfileChart(cumulativeChartRef.value, 'cumulative')
  renderProfileChart(relativeChartRef.value, 'relative')
}

function renderProfileChart(el, type) {
  if (!el) return
  let chart = type === 'cumulative' ? cumulativeChart : relativeChart
  if (!chart) chart = echarts.init(el)
  if (type === 'cumulative') cumulativeChart = chart
  else relativeChart = chart

  chart.setOption(buildProfileChartOption(type), true)
}

function disposeCharts() {
  cumulativeChart?.dispose()
  relativeChart?.dispose()
  cumulativeChart = null
  relativeChart = null
}

function handleResize() {
  cumulativeChart?.resize()
  relativeChart?.resize()
}

function getChartName(type) {
  return type === 'cumulative' ? '累积位移曲线' : '相对位移曲线'
}

function getDepthAxisMax() {
  const holeDepth = Number(profile.value?.baseline?.data_length) || Math.max(
    ...(profile.value?.surveys || []).flatMap((survey) => survey.readings.map((row) => Number(row.depth_m) || 0)),
    0
  )
  return holeDepth ? Math.ceil(holeDepth / 5) * 5 : undefined
}

function buildProfileSeries(type, reportMode = false) {
  const series = (profile.value?.surveys || []).map((survey) => ({
    name: survey.survey_date,
    type: 'line',
    smooth: false,
    showSymbol: false,
    animation: !reportMode,
    lineStyle: {
      width: reportMode ? 2 : 1.5,
      opacity: 0.9,
    },
    data: survey.readings.map((row) => [
      Number(type === 'cumulative' ? row.cumulative_displacement : row.relative_displacement),
      Number(row.depth_m),
    ]),
  }))

  if (series.length > 0) {
    series[0].markLine = {
      silent: true,
      symbol: 'none',
      label: {
        show: false,
      },
      lineStyle: {
        type: 'dashed',
        width: 1,
      },
      data: [
        { name: '-20mm预警线', xAxis: -warningThreshold, lineStyle: { color: '#d93026' } },
        { name: '0mm', xAxis: 0, lineStyle: { color: '#606266', type: 'solid' } },
        { name: '20mm预警线', xAxis: warningThreshold, lineStyle: { color: '#d93026' } },
      ],
    }
  }

  return series
}

function buildProfileChartOption(type, { reportMode = false } = {}) {
  const series = buildProfileSeries(type, reportMode)
  const dates = series.map((item) => item.name)
  const depthAxisMax = getDepthAxisMax()
  const holeName = profile.value?.baseline?.hole_name || '测斜孔'
  const initialDate = profile.value?.baseline?.baseline_date || '-'
  const periodText = dates.length > 1 ? `${dates[0]} 至 ${dates[dates.length - 1]}` : (dates[0] || '-')

  return {
    backgroundColor: '#ffffff',
    animation: !reportMode,
    title: reportMode ? {
      text: `${holeName} ${getChartName(type)}`,
      subtext: `初始日期：${initialDate}    观测日期：${periodText}    固定横轴：-40～40mm    预警值：±20mm`,
      left: 'center',
      top: 18,
      itemGap: 10,
      textStyle: {
        color: '#303133',
        fontSize: 22,
        fontWeight: 600,
      },
      subtextStyle: {
        color: '#606266',
        fontSize: 13,
        fontWeight: 400,
      },
    } : undefined,
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => `${value} mm`,
    },
    legend: reportMode ? {
      type: 'plain',
      orient: 'vertical',
      right: 28,
      top: 120,
      bottom: 54,
      data: dates,
      selectedMode: false,
      itemWidth: 24,
      itemHeight: 10,
      itemGap: 12,
      textStyle: {
        color: '#303133',
        fontSize: 13,
      },
    } : {
      type: 'scroll',
      bottom: 2,
      itemGap: 10,
      textStyle: {
        fontSize: 11,
      },
    },
    grid: reportMode ? {
      left: 104,
      right: 220,
      top: 112,
      bottom: 88,
    } : {
      left: 72,
      right: 28,
      top: 24,
      bottom: 92,
    },
    xAxis: {
      type: 'value',
      name: '位移(mm)',
      nameLocation: 'middle',
      nameGap: 32,
      min: -fixedAxisRange,
      max: fixedAxisRange,
      interval: 5,
      axisLabel: {
        formatter: '{value}',
        margin: 10,
        fontSize: reportMode ? 13 : 12,
      },
      nameTextStyle: {
        fontSize: reportMode ? 14 : 12,
      },
      splitLine: { show: true },
    },
    yAxis: {
      type: 'value',
      name: '深度(m)',
      nameLocation: 'middle',
      nameGap: 48,
      nameRotate: 90,
      min: 0,
      max: depthAxisMax,
      inverse: true,
      axisLabel: {
        margin: 10,
        fontSize: reportMode ? 13 : 12,
      },
      nameTextStyle: {
        fontSize: reportMode ? 14 : 12,
      },
      splitLine: { show: true },
    },
    series,
  }
}

function getChartImageDataUrl(type, options = {}) {
  if (!profile.value?.has_baseline || !profile.value.surveys.length) return ''

  const {
    width = 1400,
    height = 900,
    pixelRatio = 2,
    ...imageOptions
  } = options
  const container = document.createElement('div')
  container.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;background:#fff;`
  document.body.appendChild(container)

  const reportChart = echarts.init(container, null, { renderer: 'canvas', width, height })
  try {
    reportChart.setOption(buildProfileChartOption(type, { reportMode: true }), { notMerge: true, lazyUpdate: false })
    return reportChart.getDataURL({
      type: 'png',
      pixelRatio,
      backgroundColor: '#ffffff',
      ...imageOptions,
    })
  } finally {
    reportChart.dispose()
    container.remove()
  }
}

function getChartImages(options = {}) {
  return {
    cumulative: getChartImageDataUrl('cumulative', options),
    relative: getChartImageDataUrl('relative', options),
  }
}

function imageDataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',')
  const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

function exportChartImage(type) {
  const imageUrl = getChartImageDataUrl(type)
  if (!imageUrl) {
    ElMessage.warning('曲线尚未生成，请先查询数据')
    return
  }

  const holeName = profile.value?.baseline?.hole_name || '测斜孔'
  const chartName = getChartName(type)
  const fileName = `${holeName}-${chartName}.png`.replace(/[\\/:*?"<>|]/g, '_')
  const objectUrl = URL.createObjectURL(imageDataUrlToBlob(imageUrl))
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

defineExpose({
  getChartImageDataUrl,
  getChartImages,
})

watch(
  () => [props.slopeId, props.pointId],
  () => loadPoints()
)

watch(
  () => [props.dateRange?.[0], props.dateRange?.[1]],
  () => {
    if (selectedPointId.value) loadProfile()
  }
)

onMounted(() => {
  loadPoints()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  disposeCharts()
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.inclinometer-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.view-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.summary-row {
  margin-top: 4px;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.chart-panel {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  background: #fff;
}

.chart-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.chart-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.axis-hint {
  color: #909399;
  font-size: 12px;
  font-weight: 400;
}

.warning-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #606266;
  font-size: 12px;
  font-weight: 400;
  white-space: nowrap;
}

.warning-hint i {
  width: 18px;
  border-top: 1px dashed #d93026;
}

.chart {
  height: 420px;
}

.survey-collapse {
  border-top: 1px solid #ebeef5;
  border-bottom: 1px solid #ebeef5;
}

.collapse-title {
  color: #606266;
  font-weight: 600;
}

.survey-table {
  margin-top: 4px;
}

@media (max-width: 900px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }

  .chart-title {
    align-items: flex-start;
  }
}
</style>
