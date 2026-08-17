<template>
  <div class="data-view-workflow">
    <el-card class="step-card">
      <template #header>
        <div class="step-card-header">
          <div class="header-title">
            <el-icon><View /></el-icon>
            <span>数据查看</span>
          </div>
          <el-button type="success" @click="openVisualization()">
            <el-icon><TrendCharts /></el-icon>
            可视化分析
          </el-button>
        </div>
      </template>

      <div class="overview-filter">
        <el-select v-model="filterForm.section" clearable placeholder="全部标段" filterable @change="handleSectionChange">
          <el-option v-for="section in sections" :key="section" :label="section" :value="section" />
        </el-select>
        <el-select v-model="filterForm.slopeId" clearable placeholder="全部边坡" filterable>
          <el-option
            v-for="slope in filteredSlopeOptions"
            :key="slope.id"
            :label="slope.slope_name"
            :value="String(slope.id)"
          />
        </el-select>
        <el-select v-model="filterForm.monitoringType" clearable placeholder="全部监测类型">
          <el-option v-for="type in MONITOR_TYPES" :key="type" :label="type" :value="type" />
        </el-select>
        <el-date-picker
          v-model="filterForm.cutoff"
          class="filter-date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="统计截止日期"
        />
        <div class="filter-actions">
          <el-button type="primary" :loading="loading" @click="loadOverview">
            <el-icon><Search /></el-icon>
            查询
          </el-button>
          <el-button @click="resetFilter">
            <el-icon><RefreshRight /></el-icon>
            重置
          </el-button>
        </div>
      </div>

      <div v-loading="loading" class="overview-content">
        <div class="summary-strip">
          <div class="summary-item">
            <span class="summary-value">{{ overview.summary.slope_count }}</span>
            <span class="summary-label">边坡数量</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">{{ overview.summary.point_count }}</span>
            <span class="summary-label">实体测点</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">{{ overview.summary.missing_count }}</span>
            <span class="summary-label">30天未更新</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">{{ overview.summary.alarm_count }}</span>
            <span class="summary-label">已有预警</span>
          </div>
          <div class="summary-item summary-date">
            <span class="summary-value">{{ filterForm.cutoff || '-' }}</span>
            <span class="summary-label">统计截止日期</span>
          </div>
        </div>

        <section class="ranking-board" v-if="hasRankingData">
          <div class="section-heading">
            <div>
              <h3>变化最大测点</h3>
              <p>按相邻两个有效监测日期的绝对变化量排序</p>
            </div>
          </div>
          <div class="ranking-columns">
            <div v-for="type in visibleRankingTypes" :key="type" class="ranking-column">
              <div class="ranking-title">
                <span class="type-mark" :style="{ backgroundColor: typeColor(type) }"></span>
                {{ shortType(type) }}
              </div>
              <button
                v-for="(point, index) in overview.rankings[type] || []"
                :key="point.id"
                type="button"
                class="ranking-row"
                @click="openRankingPoint(point)"
              >
                <span class="rank-index">{{ index + 1 }}</span>
                <span class="rank-main">
                  <strong>{{ point.point_name }}</strong>
                  <small>{{ point.slope_name }}</small>
                </span>
                <span class="rank-value" :class="{ alarm: point.alarm_count > 0 }">
                  {{ formatSigned(point.change_value) }} mm
                </span>
              </button>
              <div v-if="!(overview.rankings[type] || []).length" class="ranking-empty">暂无两期有效数据</div>
            </div>
          </div>
        </section>

        <section class="slope-overview-section">
          <div class="section-heading">
            <div>
              <h3>边坡监测总览</h3>
              <p>点击边坡查看各监测类型的测点变化</p>
            </div>
            <span class="result-count">共 {{ overview.slopes.length }} 处</span>
          </div>
          <el-table
            :data="overview.slopes"
            row-key="slope_id"
            stripe
            class="slope-table"
            empty-text="当前筛选条件下暂无监测数据"
            @row-click="openSlopeDrawer"
          >
            <el-table-column prop="slope_name" label="边坡名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="section" label="标段" min-width="130" show-overflow-tooltip />
            <el-table-column prop="total_points" label="实体测点" width="95" align="center" />
            <el-table-column prop="missing_points" label="未更新" width="85" align="center">
              <template #default="scope">
                <span :class="{ 'text-warning': scope.row.missing_points > 0 }">{{ scope.row.missing_points }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="abnormal_points" label="已有预警" width="95" align="center">
              <template #default="scope">
                <el-tag v-if="scope.row.abnormal_points" :type="alarmTagType(scope.row.alarm_level)" size="small">
                  {{ scope.row.abnormal_points }}个
                </el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="latest_monitor_date" label="最新监测日期" width="125" align="center">
              <template #default="scope">{{ scope.row.latest_monitor_date || '-' }}</template>
            </el-table-column>
            <el-table-column label="最大相邻期变化" min-width="190">
              <template #default="scope">
                <div v-if="scope.row.max_change !== null" class="change-cell">
                  <strong>{{ formatSigned(scope.row.max_change) }} mm</strong>
                  <span>{{ scope.row.max_change_point_name }} · {{ shortType(scope.row.max_change_type) }}</span>
                </div>
                <span v-else>数据不足</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90" align="center">
              <template #default="scope">
                <el-button link type="primary" @click.stop="openSlopeDrawer(scope.row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </div>

      <div v-if="!standalone" class="step-actions">
        <el-button @click="emit('prev')">
          <el-icon><ArrowLeft /></el-icon>
          上一步
        </el-button>
        <el-button type="primary" :disabled="!overview.slopes.length" @click="nextStep">
          下一步
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </el-card>

    <el-drawer
      v-model="drawerVisible"
      :title="drawerSlope?.slope_name || '边坡测点变化'"
      size="76%"
      destroy-on-close
      @closed="closeDrawer"
    >
      <div v-if="drawerSlope" class="drawer-content">
        <div class="drawer-summary">
          <span>{{ drawerSlope.section || '未填写标段' }}</span>
          <span>实体测点 {{ drawerSlope.total_points }}</span>
          <span>30天未更新 {{ drawerSlope.missing_points }}</span>
          <span>最新监测 {{ drawerSlope.latest_monitor_date || '-' }}</span>
        </div>

        <el-tabs v-model="drawerType" class="monitor-tabs" @tab-change="loadDrawerPoints">
          <el-tab-pane v-for="type in MONITOR_TYPES" :key="type" :label="type" :name="type" />
        </el-tabs>

        <div class="drawer-grid">
          <section class="point-list-panel" v-loading="pointsLoading">
            <div class="panel-heading">
              <strong>{{ shortType(drawerType) }}</strong>
              <span>{{ drawerPoints.length }} 个具有两期数据的测点</span>
            </div>
            <div v-if="drawerPoints.length" class="point-change-list">
              <button
                v-for="point in drawerPoints"
                :key="point.id"
                type="button"
                class="point-change-row"
                :class="{ active: selectedPoint?.id === point.id }"
                @click="selectPoint(point)"
              >
                <span class="point-name">{{ point.point_name }}</span>
                <span class="point-dates">{{ point.previous_date }} → {{ point.latest_date }}</span>
                <span class="point-change" :class="{ alarm: point.alarm_count > 0 }">
                  {{ formatSigned(point.change_value) }} mm
                </span>
              </button>
            </div>
            <el-empty v-else description="暂无两个有效期次的测点" :image-size="72" />
          </section>

          <section class="point-detail-panel" v-loading="detailLoading || slopeTrendLoading">
            <div class="point-detail-heading">
              <div>
                <h3>{{ shortType(drawerType) }}全部测点历史变化</h3>
                <p>
                  共 {{ slopeTrendPointCount }} 个测点
                  <template v-if="slopeTrendDateRange"> · {{ slopeTrendDateRange }}</template>
                </p>
              </div>
              <el-button type="primary" plain @click="openVisualization()">
                <el-icon><TrendCharts /></el-icon>
                全屏分析
              </el-button>
            </div>

            <div v-if="slopeTrendRows.length" ref="detailChartRef" class="detail-chart slope-history-chart"></div>
            <el-empty v-else-if="!slopeTrendLoading" description="该监测类型暂无历史数据" :image-size="90" />

            <div class="point-detail-divider">
              <span>{{ selectedPoint ? '所选测点明细' : '点击左侧测点，可继续查看原始明细' }}</span>
            </div>

            <template v-if="selectedPoint && pointDetail">
              <div class="point-detail-heading">
                <div>
                  <h3>{{ selectedPoint.point_name }}</h3>
                  <p>{{ selectedPoint.point_type }} · {{ selectedPoint.location || '未填写位置' }}</p>
                </div>
                <el-button type="primary" plain @click="openVisualization(selectedPoint)">
                  <el-icon><TrendCharts /></el-icon>
                  全屏分析
                </el-button>
              </div>

              <div class="point-kpis">
                <div><span>最新值</span><strong>{{ formatNumber(selectedPoint.latest_value) }} mm</strong></div>
                <div><span>相邻期变化</span><strong>{{ formatSigned(selectedPoint.change_value) }} mm</strong></div>
                <div><span>上一期</span><strong>{{ formatNumber(selectedPoint.previous_value) }} mm</strong></div>
                <div><span>最新日期</span><strong>{{ selectedPoint.latest_date || '-' }}</strong></div>
              </div>

              <el-collapse v-model="detailCollapse" class="detail-collapse">
                <el-collapse-item title="原始数据明细" name="records">
                  <el-table v-if="pointDetail.kind === 'deep'" :data="pointDetail.records" size="small" border>
                    <el-table-column prop="survey_no" label="测试次数" width="90" align="center" />
                    <el-table-column prop="monitor_date" label="测试日期" width="110" align="center" />
                    <el-table-column prop="value" label="最大累积位移(mm)" min-width="145" align="right">
                      <template #default="scope">{{ formatNumber(scope.row.value, 4) }}</template>
                    </el-table-column>
                    <el-table-column prop="max_relative" label="最大相对位移(mm)" min-width="145" align="right">
                      <template #default="scope">{{ formatNumber(scope.row.max_relative, 4) }}</template>
                    </el-table-column>
                    <el-table-column prop="source_file" label="来源文件" min-width="170" show-overflow-tooltip />
                  </el-table>
                  <el-table v-else :data="pointDetail.records" size="small" border>
                    <el-table-column prop="monitor_date" label="监测时间" min-width="160" />
                    <el-table-column prop="value" label="监测值" width="110" align="right">
                      <template #default="scope">{{ formatNumber(scope.row.value, 3) }} {{ scope.row.unit || 'mm' }}</template>
                    </el-table-column>
                    <el-table-column prop="remark" label="备注" min-width="190" show-overflow-tooltip />
                  </el-table>
                  <div class="record-pagination" v-if="pointDetail.total > pointDetail.page_size">
                    <el-pagination
                      small
                      layout="prev, pager, next, total"
                      :current-page="pointDetail.page"
                      :page-size="pointDetail.page_size"
                      :total="pointDetail.total"
                      @current-change="loadPointDetail"
                    />
                  </div>
                </el-collapse-item>
              </el-collapse>
            </template>
          </section>
        </div>
      </div>
    </el-drawer>

    <VisualizationAnalysisDialog
      v-model="visualizationVisible"
      :filter="visualizationFilter"
      :slopes="slopes"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, RefreshRight, Search, TrendCharts, View } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { useRoute } from 'vue-router'
import { API_DATA } from '../config/api'
import VisualizationAnalysisDialog from './VisualizationAnalysisDialog.vue'

const props = defineProps({
  workflowData: { type: Object, default: () => ({}) },
  standalone: { type: Boolean, default: false },
})
const emit = defineEmits(['next', 'prev'])
const route = useRoute()

const MONITOR_TYPES = ['地表位移监测点', '沉降监测点', '深部位移测斜孔']
const TYPE_COLORS = {
  地表位移监测点: '#409eff',
  沉降监测点: '#67c23a',
  深部位移测斜孔: '#e6a23c',
}
const FILTER_STORAGE_KEY = 'dataViewOverviewFilters'

const today = () => new Date().toISOString().slice(0, 10)
const daysBefore = (dateText, days) => {
  const date = new Date(`${dateText}T00:00:00`)
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

const loading = ref(false)
const slopes = ref([])
const overview = reactive({
  summary: { slope_count: 0, point_count: 0, missing_count: 0, alarm_count: 0 },
  rankings: {},
  slopes: [],
})
const filterForm = reactive({ section: '', slopeId: '', monitoringType: '', cutoff: today() })
let overviewController = null

const drawerVisible = ref(false)
const drawerSlope = ref(null)
const drawerType = ref(MONITOR_TYPES[0])
const drawerPoints = ref([])
const pointsLoading = ref(false)
const selectedPoint = ref(null)
const pointDetail = ref(null)
const detailLoading = ref(false)
const detailCollapse = ref([])
const detailChartRef = ref(null)
const slopeTrendRows = ref([])
const slopeTrendLoading = ref(false)
let detailChart = null
let pointsController = null
let detailController = null
let trendController = null

const visualizationVisible = ref(false)
const visualizationFilter = ref({})

const sections = computed(() => [...new Set(slopes.value.map((item) => item.section).filter(Boolean))])
const filteredSlopeOptions = computed(() => {
  if (!filterForm.section) return slopes.value
  return slopes.value.filter((slope) => slope.section === filterForm.section)
})
const visibleRankingTypes = computed(() => filterForm.monitoringType ? [filterForm.monitoringType] : MONITOR_TYPES)
const hasRankingData = computed(() => visibleRankingTypes.value.some((type) => (overview.rankings[type] || []).length))
const slopeTrendPointCount = computed(() => new Set(slopeTrendRows.value.map((row) => String(row.point_id))).size)
const slopeTrendDateRange = computed(() => {
  const dates = slopeTrendRows.value.map((row) => row.monitor_date).filter(Boolean).sort()
  if (!dates.length) return ''
  return dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} 至 ${dates[dates.length - 1]}`
})

function shortType(type) {
  return ({ 地表位移监测点: '地表位移', 沉降监测点: '沉降', 深部位移测斜孔: '深部测斜' })[type] || type || '-'
}

function typeColor(type) {
  return TYPE_COLORS[type] || '#909399'
}

function formatNumber(value, precision = 2) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(precision) : '-'
}

function formatSigned(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}`
}

function alarmTagType(level) {
  if (level === 'critical' || level === 'serious') return 'danger'
  if (level === 'warning') return 'warning'
  return 'info'
}

async function loadSlopes() {
  const response = await fetch(`${API_DATA}/api/slopes`)
  const result = await response.json()
  slopes.value = result?.success ? result.data || [] : []
}

function saveFilters() {
  sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filterForm))
}

function restoreFilters() {
  try {
    Object.assign(filterForm, JSON.parse(sessionStorage.getItem(FILTER_STORAGE_KEY) || '{}'))
  } catch {
    sessionStorage.removeItem(FILTER_STORAGE_KEY)
  }
  if (!filterForm.cutoff) filterForm.cutoff = today()
  if (route.query.monitoringType) filterForm.monitoringType = String(route.query.monitoringType)
  if (route.query.slopeId) filterForm.slopeId = String(route.query.slopeId)
}

async function loadOverview() {
  overviewController?.abort()
  overviewController = new AbortController()
  loading.value = true
  saveFilters()
  try {
    const params = new URLSearchParams({ cutoff: filterForm.cutoff || today() })
    if (filterForm.section) params.set('section', filterForm.section)
    if (filterForm.slopeId) params.set('slope_id', filterForm.slopeId)
    if (filterForm.monitoringType) params.set('point_type', filterForm.monitoringType)
    const response = await fetch(`${API_DATA}/api/monitoring-data/overview?${params}`, {
      signal: overviewController.signal,
    })
    const result = await response.json()
    if (!result.success) throw new Error(result.message || '加载数据概况失败')
    Object.assign(overview.summary, result.data.summary || {})
    overview.rankings = result.data.rankings || {}
    overview.slopes = result.data.slopes || []
    if (route.query.pointId) await openRoutePoint(String(route.query.pointId))
  } catch (error) {
    if (error.name !== 'AbortError') ElMessage.error(error.message || '加载数据概况失败')
  } finally {
    loading.value = false
  }
}

async function resetFilter() {
  filterForm.section = ''
  filterForm.slopeId = ''
  filterForm.monitoringType = ''
  filterForm.cutoff = today()
  await loadOverview()
}

function handleSectionChange() {
  const selectedSlope = slopes.value.find((slope) => String(slope.id) === String(filterForm.slopeId))
  if (selectedSlope && filterForm.section && selectedSlope.section !== filterForm.section) {
    filterForm.slopeId = ''
  }
}

async function openSlopeDrawer(row, preferredType = '') {
  drawerSlope.value = row
  drawerType.value = preferredType || filterForm.monitoringType || MONITOR_TYPES[0]
  selectedPoint.value = null
  pointDetail.value = null
  drawerVisible.value = true
  await loadDrawerPoints()
}

async function loadDrawerPoints() {
  if (!drawerSlope.value) return
  pointsController?.abort()
  trendController?.abort()
  pointsController = new AbortController()
  trendController = new AbortController()
  pointsLoading.value = true
  slopeTrendLoading.value = true
  selectedPoint.value = null
  pointDetail.value = null
  slopeTrendRows.value = []
  disposeDetailChart()
  try {
    const params = new URLSearchParams({
      cutoff: filterForm.cutoff || today(),
      point_type: drawerType.value,
    })
    const trendParams = new URLSearchParams({
      slope_id: String(drawerSlope.value.slope_id),
      point_type: drawerType.value,
      all_history: 'true',
    })
    const [pointResponse, trendResponse] = await Promise.all([
      fetch(`${API_DATA}/api/monitoring-data/overview/slopes/${drawerSlope.value.slope_id}/points?${params}`, {
        signal: pointsController.signal,
      }),
      fetch(`${API_DATA}/api/monitoring-data/overview/trends?${trendParams}`, {
        signal: trendController.signal,
      }),
    ])
    const [pointResult, trendResult] = await Promise.all([pointResponse.json(), trendResponse.json()])
    if (!pointResult.success) throw new Error(pointResult.message || '加载测点摘要失败')
    if (!trendResult.success) throw new Error(trendResult.message || '加载历史曲线失败')
    drawerPoints.value = pointResult.data || []
    slopeTrendRows.value = trendResult.data || []
    await nextTick()
    renderDetailChart()
  } catch (error) {
    if (error.name !== 'AbortError') ElMessage.error(error.message || '加载边坡监测数据失败')
  } finally {
    pointsLoading.value = false
    slopeTrendLoading.value = false
  }
}

async function selectPoint(point) {
  selectedPoint.value = point
  detailCollapse.value = []
  await loadPointDetail(1)
}

async function loadPointDetail(page = 1) {
  if (!selectedPoint.value) return
  detailController?.abort()
  detailController = new AbortController()
  detailLoading.value = true
  try {
    const params = new URLSearchParams({
      cutoff: filterForm.cutoff || today(),
      from: daysBefore(filterForm.cutoff || today(), 30),
      page: String(page),
      page_size: '10',
    })
    const response = await fetch(
      `${API_DATA}/api/monitoring-data/overview/points/${selectedPoint.value.id}?${params}`,
      { signal: detailController.signal }
    )
    const result = await response.json()
    if (!result.success) throw new Error(result.message || '加载测点明细失败')
    pointDetail.value = result.data
  } catch (error) {
    if (error.name !== 'AbortError') ElMessage.error(error.message || '加载测点明细失败')
  } finally {
    detailLoading.value = false
  }
}

function renderDetailChart() {
  if (!detailChartRef.value || !slopeTrendRows.value.length) return
  if (!detailChart) detailChart = echarts.init(detailChartRef.value)
  const dates = [...new Set(slopeTrendRows.value.map((row) => row.monitor_date).filter(Boolean))].sort()
  const pointGroups = new Map()
  slopeTrendRows.value.forEach((row) => {
    const key = String(row.point_id)
    if (!pointGroups.has(key)) pointGroups.set(key, { name: row.point_name || key, values: new Map() })
    pointGroups.get(key).values.set(row.monitor_date, Number(row.value))
  })
  const series = [...pointGroups.values()].map((point) => ({
      name: point.name,
      type: 'line',
      data: dates.map((date) => point.values.has(date) ? point.values.get(date) : null),
      smooth: false,
      showSymbol: dates.length <= 20,
      symbolSize: 4,
      connectNulls: true,
      lineStyle: { width: 1.5 },
    }))
  detailChart.setOption({
    animation: false,
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', top: 4, left: 12, right: 12, pageButtonItemGap: 6 },
    grid: { left: 56, right: 24, top: 58, bottom: dates.length > 12 ? 66 : 42 },
    xAxis: { type: 'category', data: dates, boundaryGap: false, axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', name: 'mm', scale: true },
    dataZoom: dates.length > 12 ? [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', height: 18, bottom: 8, start: 0, end: 100 },
    ] : [],
    series,
  }, true)
}

function disposeDetailChart() {
  detailChart?.dispose()
  detailChart = null
}

function closeDrawer() {
  pointsController?.abort()
  detailController?.abort()
  trendController?.abort()
  disposeDetailChart()
  drawerSlope.value = null
  drawerPoints.value = []
  slopeTrendRows.value = []
  selectedPoint.value = null
  pointDetail.value = null
}

async function openRankingPoint(point) {
  const slope = overview.slopes.find((item) => Number(item.slope_id) === Number(point.slope_id))
  if (!slope) return
  await openSlopeDrawer(slope, point.point_type)
  const target = drawerPoints.value.find((item) => Number(item.id) === Number(point.id)) || point
  await selectPoint(target)
}

async function openRoutePoint(pointId) {
  const response = await fetch(`${API_DATA}/api/monitoring-data/overview/points/${pointId}?page_size=10`)
  const result = await response.json()
  if (!result.success) return
  const base = result.data.point
  const slope = overview.slopes.find((item) => Number(item.slope_id) === Number(base.slope_id))
  if (!slope) return
  await openSlopeDrawer(slope, base.point_type)
  const target = drawerPoints.value.find((item) => Number(item.id) === Number(base.id))
  if (target) await selectPoint(target)
}

function openVisualization(point = null) {
  const drawerContext = drawerVisible.value && drawerSlope.value
  const type = point?.point_type
    || (drawerContext ? drawerType.value : filterForm.monitoringType)
    || MONITOR_TYPES[0]
  visualizationFilter.value = {
    slopeId: point?.slope_id || (drawerContext ? drawerSlope.value?.slope_id : filterForm.slopeId),
    monitoringType: type,
    pointId: point?.id || '',
    dateRange: [],
  }
  visualizationVisible.value = true
}

function nextStep() {
  props.workflowData.dataView = {
    filter: { ...filterForm },
    overview: JSON.parse(JSON.stringify(overview)),
  }
  emit('next')
}

function handleResize() {
  detailChart?.resize()
}

onMounted(async () => {
  restoreFilters()
  await loadSlopes()
  await loadOverview()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  overviewController?.abort()
  pointsController?.abort()
  detailController?.abort()
  trendController?.abort()
  disposeDetailChart()
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.data-view-workflow {
  margin: 0;
}

.step-card {
  border-radius: 6px;
}

.step-card-header,
.header-title,
.section-heading,
.drawer-summary,
.point-detail-heading {
  display: flex;
  align-items: center;
}

.step-card-header {
  justify-content: space-between;
  gap: 16px;
}

.header-title {
  gap: 8px;
  font-size: 17px;
  font-weight: 600;
}

.overview-filter {
  display: grid;
  grid-template-columns: minmax(150px, 0.8fr) minmax(220px, 1.3fr) minmax(180px, 1fr) minmax(210px, 0.8fr) minmax(170px, auto);
  gap: 10px;
  align-items: center;
  padding: 16px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
}

.overview-filter > .el-select,
.overview-filter .filter-date {
  width: 100%;
  min-width: 0;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  min-width: 170px;
}

.filter-actions .el-button + .el-button {
  margin-left: 0;
}

.overview-content {
  min-height: 280px;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(110px, 1fr)) minmax(170px, 1.25fr);
  margin-top: 18px;
  border: 1px solid #e4e7ed;
  background: #ffffff;
}

.summary-item {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 15px 18px;
}

.summary-item + .summary-item {
  border-left: 1px solid #ebeef5;
}

.summary-value {
  overflow: hidden;
  color: #303133;
  font-size: 23px;
  font-weight: 700;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-date .summary-value {
  font-size: 17px;
}

.summary-label {
  margin-top: 7px;
  color: #909399;
  font-size: 12px;
}

.ranking-board,
.slope-overview-section {
  margin-top: 20px;
  border-top: 1px solid #e4e7ed;
  padding-top: 16px;
}

.section-heading {
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 12px;
}

.section-heading h3,
.point-detail-heading h3 {
  margin: 0;
  color: #303133;
  font-size: 15px;
}

.section-heading p,
.point-detail-heading p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 12px;
}

.result-count {
  color: #606266;
  font-size: 13px;
}

.ranking-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid #e4e7ed;
}

.ranking-column {
  min-width: 0;
  padding: 12px 14px;
}

.ranking-column + .ranking-column {
  border-left: 1px solid #ebeef5;
}

.ranking-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
  color: #303133;
  font-size: 13px;
  font-weight: 600;
}

.type-mark {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.ranking-row,
.point-change-row {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  letter-spacing: 0;
  text-align: left;
}

.ranking-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 48px;
  padding: 6px 2px;
  border-top: 1px solid #f0f2f5;
}

.ranking-row:hover,
.point-change-row:hover,
.point-change-row.active {
  background: #f5f7fa;
}

.rank-index {
  color: #909399;
  font-size: 12px;
  text-align: center;
}

.rank-main {
  min-width: 0;
}

.rank-main strong,
.rank-main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-main strong {
  font-size: 13px;
}

.rank-main small {
  margin-top: 3px;
  color: #909399;
  font-size: 11px;
}

.rank-value,
.point-change {
  color: #303133;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.rank-value.alarm,
.point-change.alarm {
  color: #f56c6c;
}

.ranking-empty {
  padding: 18px 0;
  color: #a8abb2;
  font-size: 12px;
  text-align: center;
}

.slope-table :deep(.el-table__row) {
  cursor: pointer;
}

.change-cell strong,
.change-cell span {
  display: block;
}

.change-cell span {
  margin-top: 3px;
  color: #909399;
  font-size: 11px;
}

.text-warning {
  color: #e6a23c;
  font-weight: 600;
}

.drawer-content {
  min-height: calc(100vh - 120px);
}

.drawer-summary {
  gap: 20px;
  flex-wrap: wrap;
  padding: 11px 14px;
  background: #f5f7fa;
  color: #606266;
  font-size: 13px;
}

.monitor-tabs {
  margin-top: 10px;
}

.drawer-grid {
  display: grid;
  grid-template-columns: minmax(280px, 34%) minmax(0, 1fr);
  min-height: 520px;
  border: 1px solid #e4e7ed;
}

.point-list-panel {
  min-width: 0;
  border-right: 1px solid #e4e7ed;
}

.point-detail-panel {
  min-width: 0;
  padding: 16px 18px;
}

.panel-heading {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid #ebeef5;
  color: #606266;
  font-size: 12px;
}

.point-change-list {
  max-height: 610px;
  overflow: auto;
}

.point-change-row {
  display: grid;
  grid-template-columns: minmax(70px, 0.65fr) minmax(130px, 1.2fr) auto;
  gap: 10px;
  align-items: center;
  padding: 11px 14px;
  border-bottom: 1px solid #f0f2f5;
}

.point-name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.point-dates {
  color: #909399;
  font-size: 11px;
  white-space: nowrap;
}

.point-detail-heading {
  justify-content: space-between;
  gap: 16px;
}

.point-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(100px, 1fr));
  margin-top: 16px;
  border: 1px solid #ebeef5;
}

.point-kpis > div {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 12px 14px;
}

.point-kpis > div + div {
  border-left: 1px solid #ebeef5;
}

.point-kpis span {
  color: #909399;
  font-size: 11px;
}

.point-kpis strong {
  margin-top: 6px;
  overflow: hidden;
  color: #303133;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-chart {
  width: 100%;
  height: 280px;
  margin-top: 16px;
}

.slope-history-chart {
  height: 390px;
}

.point-detail-divider {
  display: flex;
  align-items: center;
  margin: 18px 0 14px;
  color: #909399;
  font-size: 12px;
}

.point-detail-divider::before,
.point-detail-divider::after {
  flex: 1;
  height: 1px;
  background: #ebeef5;
  content: '';
}

.point-detail-divider span {
  padding: 0 12px;
}

.detail-collapse {
  margin-top: 8px;
}

.record-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.step-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

@media (max-width: 1100px) {
  .overview-filter {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }

  .filter-actions {
    justify-content: flex-start;
  }

  .ranking-columns {
    grid-template-columns: 1fr;
  }

  .ranking-column + .ranking-column {
    border-top: 1px solid #ebeef5;
    border-left: 0;
  }

  .drawer-grid {
    grid-template-columns: 1fr;
  }

  .point-list-panel {
    border-right: 0;
    border-bottom: 1px solid #e4e7ed;
  }
}

@media (max-width: 760px) {
  .overview-filter,
  .summary-strip,
  .point-kpis {
    grid-template-columns: 1fr;
  }

  .filter-actions {
    min-width: 0;
  }

  .summary-item + .summary-item,
  .point-kpis > div + div {
    border-top: 1px solid #ebeef5;
    border-left: 0;
  }

  .point-change-row {
    grid-template-columns: minmax(70px, 1fr) auto;
  }

  .point-dates {
    display: none;
  }
}
</style>
