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

        <div v-if="!isInclinometerMode" class="processing-bar">
          <div class="processing-label">
            <strong>曲线处理</strong>
            <span>仅影响显示与导出</span>
          </div>
          <el-select v-model="processingMethod" class="method-select" @change="renderSurfaceCharts">
            <el-option v-for="method in processingMethods" :key="method.value" :label="method.label" :value="method.value">
              <span>{{ method.label }}</span>
              <small class="method-option-note">{{ method.note }}</small>
            </el-option>
          </el-select>
          <label v-if="['moving_average', 'median'].includes(processingMethod)" class="parameter-control">
            <span>窗口</span>
            <el-input-number v-model="processingWindow" :min="3" :max="21" :step="2" controls-position="right" @change="normalizeProcessingWindow" />
            <small>期</small>
          </label>
          <label v-else-if="processingMethod === 'exponential'" class="parameter-control alpha-control">
            <span>平滑系数 α</span>
            <el-slider v-model="processingAlpha" :min="0.05" :max="1" :step="0.05" :show-tooltip="true" @input="renderSurfaceCharts" />
          </label>
          <label v-else-if="processingMethod === 'lttb'" class="parameter-control">
            <span>目标点数</span>
            <el-input-number v-model="processingTargetPoints" :min="20" :max="1000" :step="20" controls-position="right" @change="renderSurfaceCharts" />
          </label>
          <div class="processing-result" :class="{ active: processingMethod !== 'raw' }">
            <span>{{ processingSummary }}</span>
            <el-tooltip placement="bottom" :content="processingDescription">
              <button aria-label="查看处理方法说明">?</button>
            </el-tooltip>
          </div>
          <el-button v-if="processingMethod !== 'raw'" text @click="resetProcessing">恢复原始曲线</el-button>
        </div>

        <div v-if="!isInclinometerMode" class="trend-bar" :class="{ active: trendLineEnabled }">
          <div class="processing-label">
            <strong>趋势线</strong>
            <span>辅助判断长期变化方向</span>
          </div>
          <el-switch
            v-model="trendLineEnabled"
            active-text="显示"
            inactive-text="隐藏"
            @change="renderSurfaceCharts"
          />
          <el-select v-model="trendLineMethod" class="trend-select" :disabled="!trendLineEnabled" @change="renderSurfaceCharts">
            <el-option label="线性趋势" value="linear" />
            <el-option label="二次趋势" value="quadratic" />
          </el-select>
          <el-select v-model="trendLineScope" class="trend-select" :disabled="!trendLineEnabled" @change="renderSurfaceCharts">
            <el-option label="总体趋势线" value="overall" />
            <el-option label="逐测点趋势线" value="per_point" />
          </el-select>
          <span class="trend-hint">{{ trendLineDescription }}</span>
        </div>

        <el-empty v-if="!loading && emptyMessage" :description="emptyMessage" :image-size="88" />

        <template v-else>
          <div v-if="isInclinometerMode" class="chart-stack">
            <div class="chart-panel">
              <div class="chart-title">
                <span>累积位移曲线</span>
                <div class="chart-title-actions">
                  <span>固定横轴 -40 ~ 40mm，预警线 ±20mm</span>
                  <el-button size="small" plain :icon="Download" @click="exportChartImage('deep-cumulative', '累积位移曲线')">
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
                  <el-button size="small" plain :icon="Download" @click="exportChartImage('deep-relative', '相对位移曲线')">
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
              <span>{{ thresholdCaption }}</span>
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
              <el-statistic :title="primaryMetricTitle" :value="analysisStats.maxAbs" :precision="3" :suffix="currentChartUnit" />
            </el-col>
            <el-col :span="12">
              <el-statistic :title="secondaryMetricTitle" :value="analysisStats.maxChange" :precision="3" :suffix="currentChartUnit" />
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
import { ACADEMIC_COLORS, MEETING_CHART_EXPORT } from '../utils/academicChart'
import { countFiniteValues, processTimeSeries } from '../utils/timeSeriesProcessing'

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
const rateWarningThreshold = 2
const fixedAxisRange = 40
const academicPalette = ACADEMIC_COLORS
const academicSymbols = ['circle', 'rect', 'triangle', 'diamond', 'emptyCircle', 'emptyRect', 'emptyTriangle', 'emptyDiamond', 'roundRect', 'emptyRoundRect']
const academicLineTypes = ['solid', 'dashed', 'dotted']
const academicFontFamily = '"Times New Roman", "SimSun", "宋体", serif'
const meetingExportWidth = MEETING_CHART_EXPORT.width
const meetingExportPixelRatio = MEETING_CHART_EXPORT.pixelRatio
const loading = ref(false)
const pointKeyword = ref('')
const surfaceRows = ref([])
const selectedSurfacePointIds = ref([])
const surfaceChartMode = ref('history')
const processingMethod = ref('raw')
const processingWindow = ref(3)
const processingAlpha = ref(0.3)
const processingTargetPoints = ref(120)
const trendLineEnabled = ref(false)
const trendLineMethod = ref('linear')
const trendLineScope = ref('overall')

const trendLineCaption = computed(() => {
  if (!trendLineEnabled.value) return '未显示趋势线'
  const method = trendLineMethod.value === 'quadratic' ? '二次趋势' : '线性趋势'
  const scope = trendLineScope.value === 'per_point' ? '逐测点' : '总体'
  return `${scope}${method}`
})

const trendLineDescription = computed(() => {
  if (!trendLineEnabled.value) return '打开后可叠加科研图常用趋势线'
  if (trendLineMethod.value === 'quadratic') return '二次趋势用于观察非线性加速或回稳迹象'
  return '线性趋势用于判断监测期内整体增减方向'
})

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
  { label: '变化速率', value: 'rate' },
]

const processingMethods = [
  { label: '原始数据', value: 'raw', note: '不做处理' },
  { label: '移动平均', value: 'moving_average', note: '观察中短期趋势' },
  { label: '指数平滑', value: 'exponential', note: '近期数据权重更高' },
  { label: '中值滤波', value: 'median', note: '抑制孤立毛刺' },
  { label: 'LTTB 曲线简化', value: 'lttb', note: '长序列保留主要形态' },
]

const processingMethodLabel = computed(() => processingMethods.find(item => item.value === processingMethod.value)?.label || '原始数据')
const processingDescription = computed(() => ({
  raw: '直接展示数据库中的有效观测值。',
  moving_average: `采用 ${processingWindow.value} 期居中移动平均；端点按实际可用数据计算。`,
  exponential: `采用一次指数平滑，α=${processingAlpha.value.toFixed(2)}；α 越大越贴近近期观测。`,
  median: `采用 ${processingWindow.value} 期居中中值滤波，主要用于抑制单个孤立毛刺。`,
  lttb: `使用 LTTB 算法将每条长序列简化至最多 ${processingTargetPoints.value} 个点，保留首尾点和主要转折。`,
}[processingMethod.value]))
const processingCaption = computed(() => ({
  raw: '原始数据',
  moving_average: `${processingWindow.value}期移动平均`,
  exponential: `指数平滑 α=${processingAlpha.value.toFixed(2)}`,
  median: `${processingWindow.value}期中值滤波`,
  lttb: `LTTB≤${processingTargetPoints.value}点/测点`,
}[processingMethod.value]))

const processingSummary = computed(() => {
  const { dates, groups } = groupSurfaceRows()
  let rawCount = 0
  let displayedCount = 0
  Object.values(groups).forEach(values => {
    const modeValues = getSurfaceModeValues(dates, values)
    rawCount += countFiniteValues(modeValues)
    displayedCount += countFiniteValues(applySurfaceProcessing(dates, modeValues))
  })
  return processingMethod.value === 'raw' ? `${rawCount} 个有效观测值` : `${rawCount} 个原始点 → ${displayedCount} 个显示点`
})

const isInclinometerMode = computed(() => props.filter?.monitoringType === '深部位移测斜孔')
const currentMonitoringType = computed(() => props.filter?.monitoringType || '全部类型')
const currentChartUnit = computed(() => {
  if (isInclinometerMode.value) return 'mm'
  const unit = getSurfaceUnit()
  return surfaceChartMode.value === 'rate' ? `${unit}/d` : unit
})
const activeWarningThreshold = computed(() => {
  if (isInclinometerMode.value) return warningThreshold
  if (surfaceChartMode.value === 'rate') {
    return getSurfaceUnit().toLowerCase() === 'mm' ? rateWarningThreshold : null
  }
  return ['地表位移监测点', '沉降监测点'].includes(currentMonitoringType.value)
    ? warningThreshold
    : null
})
const thresholdCaption = computed(() => activeWarningThreshold.value === null
  ? (surfaceChartMode.value === 'rate' ? '当前量纲暂未配置变化速率参考值' : '当前类型未配置统一预警参考值')
  : `预警参考值：±${activeWarningThreshold.value} ${currentChartUnit.value}`
)
const primaryMetricTitle = computed(() => surfaceChartMode.value === 'rate' && !isInclinometerMode.value ? '最大变化速率' : '最大值')
const secondaryMetricTitle = computed(() => surfaceChartMode.value === 'rate' && !isInclinometerMode.value ? '平均变化速率' : '最大变化')
const currentSlopeName = computed(() => {
  const slope = props.slopes.find(item => String(item.id) === String(props.filter?.slopeId))
  return slope?.slope_name || '全部边坡'
})
const dateRangeText = computed(() => {
  const range = props.filter?.dateRange || []
  return range.length === 2 ? `${range[0]} 至 ${range[1]}` : '全部日期'
})

const chartDataRangeText = computed(() => {
  if (isInclinometerMode.value) {
    const dates = (deepProfile.value?.surveys || []).map(item => String(item.survey_date || '').slice(0, 10)).filter(Boolean).sort()
    if (!dates.length) return dateRangeText.value
    return dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} 至 ${dates.at(-1)}`
  }
  const dates = selectedSurfaceRows.value.map(item => item.monitorDate).filter(Boolean).sort()
  if (!dates.length) return dateRangeText.value
  return dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} 至 ${dates.at(-1)}`
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
    rate: '变化速率曲线',
  }
  const baseTitle = titleMap[surfaceChartMode.value] || '监测曲线'
  return processingMethod.value === 'raw' ? baseTitle : `${baseTitle}（${processingMethodLabel.value}）`
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
  if (surfaceChartMode.value === 'rate') {
    const rates = getAllSurfaceRates().map(value => Math.abs(value))
    return {
      pointCount: selectedSurfacePointIds.value.length,
      periodCount: new Set(rows.map(row => row.monitorDate)).size,
      maxAbs: rates.length ? Math.max(...rates) : 0,
      maxChange: rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : 0,
    }
  }
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
  if (activeWarningThreshold.value === null) {
    return {
      type: 'info',
      title: '当前类型未配置统一判据',
      description: '图表仅反映实测变化，不自动给出超限结论；请结合设计控制值、仪器量程和现场工况进行判断。',
    }
  }
  const maxValue = analysisStats.value.maxAbs
  const ratio = maxValue / activeWarningThreshold.value
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
    description: `当前${surfaceChartMode.value === 'rate' && !isInclinometerMode.value ? '最大变化速率' : '最大变形'}未达到 ±${activeWarningThreshold.value}${currentChartUnit.value} 预警参考值，可按常规频率持续监测。`,
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
  const processingNotes = processingMethod.value === 'raw' ? [] : [
    `${processingDescription.value} 处理结果仅用于识别趋势和简化展示，不替代原始观测值。`,
    '预警参考线和右侧判断指标始终基于原始数据计算，避免平滑处理掩盖异常。',
  ]
  if (surfaceChartMode.value === 'rate') {
    return [
      ...processingNotes,
      '变化速率按同一测点相邻两次有效观测值之差除以实际间隔天数计算，正负号表示变化方向。',
      '毫米量纲数据暂按 ±2mm/d 作为变化速率参考值，红色虚线表示正、负参考边界。',
      '速率突增时应先复核观测日期、原始读数和现场工况，再判断是否需要提高监测频率。',
    ]
  }
  return [
    ...processingNotes,
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

function dateSerial(dateText) {
  const [year, month, day] = String(dateText || '').slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return Date.UTC(year, month - 1, day) / 86400000
}

function buildRateMap(dates, values) {
  const observations = dates
    .filter(date => Number.isFinite(values[date]) && dateSerial(date) !== null)
    .map(date => ({ date, serial: dateSerial(date), value: Number(values[date]) }))
    .sort((a, b) => a.serial - b.serial)
  const rateMap = {}
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1]
    const current = observations[index]
    const elapsedDays = current.serial - previous.serial
    if (elapsedDays <= 0) continue
    rateMap[current.date] = Number(((current.value - previous.value) / elapsedDays).toFixed(6))
  }
  return rateMap
}

function getSurfaceModeValues(dates, values) {
  const raw = dates.map(date => values[date] ?? null)
  const firstValue = raw.find(value => Number.isFinite(value)) ?? 0
  if (surfaceChartMode.value === 'cumulative') {
    return raw.map(value => Number.isFinite(value) ? Number((value - firstValue).toFixed(6)) : null)
  }
  if (surfaceChartMode.value === 'rate') {
    const rateMap = buildRateMap(dates, values)
    return dates.map(date => rateMap[date] ?? null)
  }
  return raw
}

function applySurfaceProcessing(dates, values) {
  return processTimeSeries(values, {
    method: processingMethod.value,
    windowSize: processingWindow.value,
    alpha: processingAlpha.value,
    targetPoints: processingTargetPoints.value,
    xValues: dates.map(date => dateSerial(date)),
  })
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length
  const rows = matrix.map((row, index) => [...row, vector[index]])
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(rows[row][pivot]) > Math.abs(rows[best][pivot])) best = row
    }
    if (Math.abs(rows[best][pivot]) < 1e-12) return null
    if (best !== pivot) [rows[pivot], rows[best]] = [rows[best], rows[pivot]]
    const divisor = rows[pivot][pivot]
    for (let column = pivot; column <= size; column += 1) rows[pivot][column] /= divisor
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue
      const factor = rows[row][pivot]
      for (let column = pivot; column <= size; column += 1) rows[row][column] -= factor * rows[pivot][column]
    }
  }
  return rows.map(row => row[size])
}

function fitTrendModel(points, method = 'linear') {
  const degree = method === 'quadratic' ? 2 : 1
  if (points.length < degree + 1) return null
  const x0 = points[0].x
  const normalized = points.map(point => ({ x: point.x - x0, y: point.y }))
  const matrix = Array.from({ length: degree + 1 }, () => Array(degree + 1).fill(0))
  const vector = Array(degree + 1).fill(0)
  normalized.forEach(point => {
    const powers = Array.from({ length: degree * 2 + 1 }, (_, index) => point.x ** index)
    for (let row = 0; row <= degree; row += 1) {
      for (let column = 0; column <= degree; column += 1) matrix[row][column] += powers[row + column]
      vector[row] += point.y * powers[row]
    }
  })
  const coefficients = solveLinearSystem(matrix, vector)
  if (!coefficients) return null
  return x => coefficients.reduce((sum, coefficient, index) => sum + coefficient * ((x - x0) ** index), 0)
}

function buildTrendLineData(dates, values) {
  const points = dates
    .map((date, index) => ({ x: dateSerial(date), y: Number(values[index]) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x)
  const model = fitTrendModel(points, trendLineMethod.value)
  if (!model) return []
  const firstX = points[0].x
  const lastX = points.at(-1).x
  return dates.map(date => {
    const x = dateSerial(date)
    if (!Number.isFinite(x) || x < firstX || x > lastX) return null
    return Number(model(x).toFixed(6))
  })
}

function buildOverallTrendValues(dates, seriesData) {
  return dates.map((_, index) => {
    const values = seriesData.map(item => Number(item.data[index])).filter(Number.isFinite)
    if (!values.length) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
  })
}

function normalizeProcessingWindow(value) {
  let window = Math.max(3, Math.round(Number(value) || 3))
  if (window % 2 === 0) window += 1
  processingWindow.value = Math.min(window, 21)
  renderSurfaceCharts()
}

function resetProcessing() {
  processingMethod.value = 'raw'
  renderSurfaceCharts()
}

function getAllSurfaceRates() {
  const { dates, groups } = groupSurfaceRows()
  return Object.values(groups).flatMap(values => Object.values(buildRateMap(dates, values)))
}

function getSeriesVisual(index) {
  return {
    color: academicPalette[index % academicPalette.length],
    symbol: academicSymbols[index % academicSymbols.length],
    lineType: academicLineTypes[Math.floor(index / academicPalette.length) % academicLineTypes.length],
  }
}

function getSurfaceUnit() {
  return selectedSurfaceRows.value.find(row => row.unit)?.unit || 'mm'
}

function wrapLegendName(name, limit = 18) {
  const text = String(name || '')
  if (text.length <= limit) return text
  if (text.length <= limit * 2) return `${text.slice(0, limit)}\n${text.slice(limit)}`
  return `${text.slice(0, limit)}\n${text.slice(limit, limit * 2 - 1)}…`
}

function getLegendLayout(seriesCount, reportMode) {
  if (!reportMode) {
    return {
      legend: {
        type: 'scroll',
        bottom: 4,
        left: 28,
        right: 28,
        pageIconColor: '#1f4e79',
        pageTextStyle: { color: '#5a6470', fontFamily: academicFontFamily, fontSize: 11 },
        itemWidth: 26,
        itemHeight: 9,
        itemGap: 16,
        textStyle: { color: '#30353b', fontFamily: academicFontFamily, fontSize: 12 },
      },
      gridBottom: 82,
      legendHeight: 28,
    }
  }
  const estimatedRows = Math.max(1, Math.ceil(seriesCount / MEETING_CHART_EXPORT.itemsPerLegendRow))
  const hasLongLegend = [
    ...Object.keys(groupSurfaceRows().groups),
    ...(deepProfile.value?.surveys || []).map(item => item.survey_date),
  ].some(name => String(name || '').length > 18)
  const legendHeight = Math.max(54, estimatedRows * (hasLongLegend ? 46 : 34))
  return {
    legend: {
      type: 'plain',
      orient: 'horizontal',
      left: 112,
      right: 112,
      bottom: 54,
      height: legendHeight,
      selectedMode: false,
      itemWidth: 36,
      itemHeight: 10,
      itemGap: 22,
      formatter: name => wrapLegendName(name),
      textStyle: { color: '#202327', fontFamily: academicFontFamily, fontSize: 16, lineHeight: 20 },
    },
    gridBottom: legendHeight + 112,
    legendHeight,
  }
}

function buildSurfaceSeries({ reportMode = false } = {}) {
  const { dates, groups } = groupSurfaceRows()
  const baseSeries = Object.entries(groups).map(([name, values], index) => {
    const data = applySurfaceProcessing(dates, getSurfaceModeValues(dates, values))
    const visual = getSeriesVisual(index)
    return {
      name,
      type: 'line',
      smooth: false,
      connectNulls: true,
      showSymbol: reportMode || dates.length <= 24,
      symbol: visual.symbol,
      symbolSize: reportMode ? 7 : 5,
      lineStyle: { color: visual.color, width: reportMode ? 2.2 : 1.8, type: visual.lineType },
      itemStyle: { color: visual.color, borderColor: '#ffffff', borderWidth: 0.8 },
      emphasis: { focus: 'series', lineStyle: { width: 3 } },
      data,
      ...(index === 0 && activeWarningThreshold.value !== null ? {
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            show: reportMode,
            formatter: ({ value }) => `${Number(value) > 0 ? '+' : ''}${value} ${currentChartUnit.value}`,
            position: 'insideEndTop',
            color: '#9f2f28',
            fontFamily: academicFontFamily,
            fontSize: 13,
          },
          lineStyle: { color: '#b33a32', type: 'dashed', width: 1.2 },
          data: [{ yAxis: -activeWarningThreshold.value }, { yAxis: activeWarningThreshold.value }],
        },
      } : {}),
    }
  })

  if (!trendLineEnabled.value || !baseSeries.length) return baseSeries

  if (trendLineScope.value === 'overall') {
    const trendData = buildTrendLineData(dates, buildOverallTrendValues(dates, baseSeries))
    if (!trendData.length) return baseSeries
    return [
      ...baseSeries,
      {
        name: trendLineCaption.value,
        type: 'line',
        smooth: false,
        connectNulls: true,
        showSymbol: false,
        silent: true,
        z: 6,
        data: trendData,
        lineStyle: {
          color: '#111827',
          width: reportMode ? 3 : 2.4,
          type: 'dashed',
          opacity: 0.9,
        },
        emphasis: { disabled: true },
      },
    ]
  }

  const trendSeries = baseSeries
    .map((item, index) => {
      const trendData = buildTrendLineData(dates, item.data)
      if (!trendData.length) return null
      const visual = getSeriesVisual(index)
      return {
        name: `${item.name} 趋势`,
        type: 'line',
        smooth: false,
        connectNulls: true,
        showSymbol: false,
        silent: true,
        z: 5,
        data: trendData,
        lineStyle: {
          color: visual.color,
          width: reportMode ? 2.2 : 1.9,
          type: 'dashed',
          opacity: 0.72,
        },
        emphasis: { disabled: true },
      }
    })
    .filter(Boolean)

  return [...baseSeries, ...trendSeries]
}

function buildSurfaceOption({ reportMode = false } = {}) {
  const { dates } = groupSurfaceRows()
  const series = buildSurfaceSeries({ reportMode })
  const { legend, gridBottom, legendHeight } = getLegendLayout(series.length, reportMode)
  const unit = getSurfaceUnit()
  const displayUnit = surfaceChartMode.value === 'rate' ? `${unit}/d` : unit
  const exportHeight = Math.max(MEETING_CHART_EXPORT.minHeight, 820 + legendHeight)
  return {
    backgroundColor: '#fff',
    animation: !reportMode,
    color: academicPalette,
    title: reportMode ? {
      text: `${currentSlopeName.value}  ${activeSurfaceChartTitle.value}`,
      subtext: `${currentMonitoringType.value}    监测时段：${chartDataRangeText.value}    曲线处理：${processingCaption.value}    ${thresholdCaption.value}`,
      left: 'center',
      top: 24,
      itemGap: 12,
      textStyle: { color: '#171a1d', fontFamily: academicFontFamily, fontSize: 25, fontWeight: 600 },
      subtextStyle: { color: '#555d66', fontFamily: academicFontFamily, fontSize: 14, fontWeight: 400 },
    } : undefined,
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderColor: '#87919b',
      borderWidth: 1,
      textStyle: { color: '#202327', fontFamily: academicFontFamily, fontSize: 12 },
      valueFormatter: value => value === null || value === undefined ? '-' : `${value} ${displayUnit}`,
    },
    legend,
    grid: {
      left: reportMode ? 106 : 74,
      right: reportMode ? 74 : 36,
      top: reportMode ? 128 : 44,
      bottom: gridBottom,
      containLabel: false,
    },
    // 来源信息保留在报告材料元数据中，图片本身保持干净。
    graphic: undefined,
    xAxis: {
      type: 'category',
      name: '监测日期',
      nameLocation: 'middle',
      nameGap: reportMode ? 46 : 38,
      boundaryGap: false,
      data: dates,
      axisLine: { lineStyle: { color: '#25292d', width: 1.2 } },
      axisTick: { alignWithLabel: true, lineStyle: { color: '#25292d' } },
      axisLabel: { color: '#30353b', fontFamily: academicFontFamily, fontSize: reportMode ? 14 : 11, hideOverlap: true, margin: 12 },
      nameTextStyle: { color: '#202327', fontFamily: academicFontFamily, fontSize: reportMode ? 16 : 13 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: `${surfaceChartMode.value === 'cumulative' ? '累计变化' : (surfaceChartMode.value === 'rate' ? '变化速率' : '监测值')}（${displayUnit}）`,
      nameLocation: 'middle',
      nameGap: reportMode ? 68 : 52,
      scale: true,
      axisLine: { show: true, lineStyle: { color: '#25292d', width: 1.2 } },
      axisTick: { show: true, lineStyle: { color: '#25292d' } },
      axisLabel: { color: '#30353b', fontFamily: academicFontFamily, fontSize: reportMode ? 14 : 11, margin: 12 },
      nameTextStyle: { color: '#202327', fontFamily: academicFontFamily, fontSize: reportMode ? 16 : 13 },
      splitLine: { show: true, lineStyle: { color: '#cfd4d9', type: 'dashed', width: 0.8 } },
    },
    series,
  }
}

function renderSurfaceCharts() {
  if (!surfaceChartRef.value || isInclinometerMode.value || !selectedSurfaceRows.value.length) return
  if (!surfaceChart) surfaceChart = echarts.init(surfaceChartRef.value)
  surfaceChart.setOption(buildSurfaceOption(), true)
}

function getDepthAxisMax() {
  const holeDepth = Number(deepProfile.value?.baseline?.data_length) || Math.max(
    ...(deepProfile.value?.surveys || []).flatMap(survey => (survey.readings || []).map(row => Number(row.depth_m) || 0)),
    0
  )
  return holeDepth ? Math.ceil(holeDepth / 5) * 5 : undefined
}

function buildDeepSeries(type, { reportMode = false } = {}) {
  const series = (deepProfile.value?.surveys || []).map((survey, index) => {
    const visual = getSeriesVisual(index)
    return {
      name: survey.survey_date,
      type: 'line',
      smooth: false,
      showSymbol: reportMode,
      symbol: visual.symbol,
      symbolSize: reportMode ? 5 : 4,
      lineStyle: { color: visual.color, width: reportMode ? 2.1 : 1.7, type: visual.lineType },
      itemStyle: { color: visual.color },
      emphasis: { focus: 'series', lineStyle: { width: 3 } },
      data: (survey.readings || []).map(row => [
        Number(type === 'cumulative' ? row.cumulative_displacement : row.relative_displacement) || 0,
        Number(row.depth_m) || 0,
      ]),
    }
  })

  if (series.length) {
    series[0].markLine = {
      silent: true,
      symbol: 'none',
      label: {
        show: reportMode,
        formatter: ({ value }) => Number(value) === 0 ? '0' : `${Number(value) > 0 ? '+' : ''}${value} mm`,
        position: 'insideEndTop',
        color: '#8f2d27',
        fontFamily: academicFontFamily,
        fontSize: 13,
      },
      data: [
        { xAxis: -warningThreshold, lineStyle: { color: '#d93026', type: 'dashed' } },
        { xAxis: 0, lineStyle: { color: '#606266', type: 'solid' } },
        { xAxis: warningThreshold, lineStyle: { color: '#d93026', type: 'dashed' } },
      ],
    }
  }
  return series
}

function buildDeepOption(type, { reportMode = false } = {}) {
  const series = buildDeepSeries(type, { reportMode })
  const { legend, gridBottom, legendHeight } = getLegendLayout(series.length, reportMode)
  const point = deepPoints.value.find(item => String(item.id) === selectedDeepPointId.value)
  const exportHeight = Math.max(MEETING_CHART_EXPORT.minHeight, 820 + legendHeight)
  return {
    backgroundColor: '#fff',
    animation: !reportMode,
    color: academicPalette,
    title: reportMode ? {
      text: `${point?.point_name || '测斜孔'}  ${type === 'cumulative' ? '累积位移曲线' : '相对位移曲线'}`,
      subtext: `${currentSlopeName.value}    监测时段：${chartDataRangeText.value}    横轴范围：-${fixedAxisRange}～${fixedAxisRange} mm    预警参考值：±${warningThreshold} mm`,
      left: 'center',
      top: 24,
      itemGap: 12,
      textStyle: { color: '#171a1d', fontFamily: academicFontFamily, fontSize: 25, fontWeight: 600 },
      subtextStyle: { color: '#555d66', fontFamily: academicFontFamily, fontSize: 14, fontWeight: 400 },
    } : undefined,
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderColor: '#87919b',
      textStyle: { color: '#202327', fontFamily: academicFontFamily, fontSize: 12 },
      valueFormatter: value => `${value} mm`,
    },
    legend,
    grid: { left: reportMode ? 112 : 78, right: reportMode ? 78 : 36, top: reportMode ? 128 : 36, bottom: gridBottom },
    graphic: undefined,
    xAxis: {
      type: 'value',
      name: '位移（mm）',
      nameLocation: 'middle',
      nameGap: reportMode ? 48 : 38,
      min: -fixedAxisRange,
      max: fixedAxisRange,
      interval: 5,
      axisLine: { show: true, lineStyle: { color: '#25292d', width: 1.2 } },
      axisTick: { show: true, lineStyle: { color: '#25292d' } },
      axisLabel: { color: '#30353b', fontFamily: academicFontFamily, fontSize: reportMode ? 14 : 11, margin: 11 },
      nameTextStyle: { color: '#202327', fontFamily: academicFontFamily, fontSize: reportMode ? 16 : 13 },
      splitLine: { show: true, lineStyle: { color: '#cfd4d9', type: 'dashed', width: 0.8 } },
    },
    yAxis: {
      type: 'value',
      name: '深度（m）',
      nameLocation: 'middle',
      nameGap: reportMode ? 64 : 50,
      nameRotate: 90,
      min: 0,
      max: getDepthAxisMax(),
      inverse: true,
      axisLine: { show: true, lineStyle: { color: '#25292d', width: 1.2 } },
      axisTick: { show: true, lineStyle: { color: '#25292d' } },
      axisLabel: { color: '#30353b', fontFamily: academicFontFamily, fontSize: reportMode ? 14 : 11, margin: 11 },
      nameTextStyle: { color: '#202327', fontFamily: academicFontFamily, fontSize: reportMode ? 16 : 13 },
      splitLine: { show: true, lineStyle: { color: '#cfd4d9', type: 'dashed', width: 0.8 } },
    },
    series,
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

function getActiveChartKind() {
  return isInclinometerMode.value ? 'deep-cumulative' : 'surface'
}

function getChartSeriesCount(kind) {
  if (kind === 'surface') return buildSurfaceSeries({ reportMode: true }).length
  return deepProfile.value?.surveys?.length || 0
}

function getAcademicChartDataUrl(kind, { pixelRatio = meetingExportPixelRatio } = {}) {
  const activeChart = kind === 'surface'
    ? surfaceChart
    : (kind === 'deep-relative' ? deepRelativeChart : deepCumulativeChart)
  if (!activeChart) return ''

  const seriesCount = getChartSeriesCount(kind)
  const legendRows = Math.max(1, Math.ceil(seriesCount / MEETING_CHART_EXPORT.itemsPerLegendRow))
  const hasLongLegend = kind === 'surface'
    ? Object.keys(groupSurfaceRows().groups).some(name => String(name || '').length > 18)
    : (deepProfile.value?.surveys || []).some(item => String(item.survey_date || '').length > 18)
  const legendHeight = Math.max(54, legendRows * (hasLongLegend ? 46 : 34))
  const width = meetingExportWidth
  const height = Math.max(MEETING_CHART_EXPORT.minHeight, 820 + legendHeight)
  const container = document.createElement('div')
  container.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;background:#fff;`
  document.body.appendChild(container)
  const exportChart = echarts.init(container, null, { renderer: 'canvas', width, height })
  try {
    const option = kind === 'surface'
      ? buildSurfaceOption({ reportMode: true })
      : buildDeepOption(kind === 'deep-relative' ? 'relative' : 'cumulative', { reportMode: true })
    exportChart.setOption(option, { notMerge: true, lazyUpdate: false })
    return exportChart.getDataURL({ type: 'png', pixelRatio, backgroundColor: '#ffffff' })
  } finally {
    exportChart.dispose()
    container.remove()
  }
}

function getActiveChartDataUrl() {
  return getAcademicChartDataUrl(getActiveChartKind(), { pixelRatio: 1 })
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
  exportChartImage(getActiveChartKind(), getActiveChartName())
}

function exportChartImage(kind, chartName) {
  const targetImageUrl = getAcademicChartDataUrl(kind)
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
    processing: {
      method: processingMethod.value,
      label: processingMethodLabel.value,
      description: processingDescription.value,
      windowSize: processingWindow.value,
      alpha: processingAlpha.value,
      targetPoints: processingTargetPoints.value,
    },
    trendLine: {
      enabled: trendLineEnabled.value,
      method: trendLineMethod.value,
      scope: trendLineScope.value,
      label: trendLineCaption.value,
    },
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
  --academic-ink: #20252a;
  --academic-blue: #1f4e79;
  --academic-line: #cfd5da;
  --academic-paper: #ffffff;
  height: calc(100vh - 112px);
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  gap: 12px;
  background: #eef1f3;
  padding: 12px;
  box-sizing: border-box;
  color: var(--academic-ink);
}

.analysis-sidebar,
.analysis-main,
.analysis-inspector {
  background: var(--academic-paper);
  border: 1px solid var(--academic-line);
  border-radius: 2px;
  min-height: 0;
}

.processing-bar {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  margin-bottom: 10px;
  background: #f5f8fa;
  border: 1px solid #d8e0e5;
  border-left: 3px solid var(--academic-blue);
}

.trend-bar {
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 12px;
  margin: -4px 0 10px;
  background: #fbfcfd;
  border: 1px solid #dce3e8;
  border-left: 3px solid #7a8691;
}

.trend-bar.active {
  border-left-color: #111827;
  background: #f8fafb;
}

.trend-select {
  width: 150px;
}

.trend-hint {
  margin-left: auto;
  color: #66737d;
  font-size: 12px;
  line-height: 1.35;
}

.processing-label {
  min-width: 104px;
}

.processing-label strong,
.processing-label span {
  display: block;
}

.processing-label strong {
  font-size: 13px;
}

.processing-label span {
  margin-top: 2px;
  color: #78848d;
  font-size: 10px;
}

.method-select {
  width: 170px;
}

.method-option-note {
  float: right;
  margin-left: 18px;
  color: #8a959d;
}

.parameter-control {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #53616b;
  font-size: 12px;
  white-space: nowrap;
}

.parameter-control :deep(.el-input-number) {
  width: 108px;
}

.alpha-control {
  width: 220px;
}

.alpha-control :deep(.el-slider) {
  flex: 1;
}

.processing-result {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 6px 9px;
  color: #66737d;
  font: 12px/1.2 "Times New Roman", "SimSun", serif;
  border: 1px solid #d8e0e5;
  background: #fff;
}

.processing-result.active {
  color: #1f4e79;
  border-color: #aabfce;
}

.processing-result button {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid currentColor;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: help;
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
  margin-bottom: 14px;
  padding-bottom: 9px;
  border-bottom: 2px solid var(--academic-blue);
  color: #17212a;
  font-family: "SimSun", "宋体", serif;
  font-size: 16px;
  font-weight: 700;
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
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--academic-line);
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
  border: 1px solid #bfc7ce;
  border-radius: 1px;
  padding: 14px;
  background: #fff;
}

.chart-panel-large {
  flex: 1;
}

.chart-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  padding-bottom: 9px;
  border-bottom: 1px solid #d9dee2;
  color: #161a1e;
  font-family: "SimSun", "宋体", serif;
  font-size: 16px;
  font-weight: 700;
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

  .processing-bar {
    flex-wrap: wrap;
  }

  .processing-result {
    margin-left: 0;
  }
}
</style>
