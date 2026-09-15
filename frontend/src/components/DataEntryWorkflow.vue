<template>
  <div class="data-entry-workflow">
    <el-card class="step-card">
      <template #header>
        <div class="step-card-header">
          <el-icon><Edit /></el-icon>
          <span>数据录入范围选择</span>
        </div>
      </template>

      <el-alert
        title="工作流按边坡选择数据范围"
        type="info"
        :closable="false"
        show-icon
        class="intro-alert"
      >
        <template #default>
          <p>这里不再逐个选择测点数据。请先选择边坡、监测类型和时间范围，系统会自动汇总该范围内已有的真实监测数据，供后续数据查看和报告图表使用。</p>
        </template>
      </el-alert>

      <el-form :model="selectionForm" label-width="90px" class="range-form">
        <el-row :gutter="16">
          <el-col :xs="24" :md="5">
            <el-form-item label="所属标段">
              <el-select
                v-model="selectionForm.sections"
                multiple
                clearable
                filterable
                collapse-tags
                collapse-tags-tooltip
                placeholder="全部标段"
                style="width: 100%"
                @change="handleSectionChange"
              >
                <el-option v-for="section in sections" :key="section" :label="section" :value="section" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="7">
            <el-form-item label="选择边坡" required>
              <el-select
                v-model="selectionForm.slopeIds"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                placeholder="请选择一个或多个边坡"
                style="width: 100%"
                @change="loadSelectedSlopeData"
              >
                <el-option
                  v-for="slope in filteredSlopes"
                  :key="slope.id"
                  :label="`${slope.section || '未分标段'} · ${slope.slope_name}`"
                  :value="slope.id"
                >
                  <span>{{ slope.section || '未分标段' }} · {{ slope.slope_name }}</span>
                  <span class="option-meta">{{ slope.slope_type || '-' }} / {{ slope.point_count || 0 }} 点</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="6">
            <el-form-item label="监测类型">
              <el-select
                v-model="selectionForm.monitoringTypes"
                multiple
                collapse-tags
                placeholder="默认地表位移和沉降"
                style="width: 100%"
                @change="loadSelectedSlopeData"
              >
                <el-option label="地表位移监测点" value="地表位移监测点" />
                <el-option label="沉降监测点" value="沉降监测点" />
                <el-option label="深部位移测斜孔" value="深部位移测斜孔" />
                <el-option label="裂缝观测点" value="裂缝观测点" />
                <el-option label="锚索应力监测点" value="锚索应力监测点" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="6">
            <el-form-item label="时间范围">
              <el-date-picker
                v-model="selectionForm.dateRange"
                type="daterange"
                unlink-panels
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
                @change="loadSelectedSlopeData"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div class="toolbar">
        <el-button :disabled="filteredSlopes.length === 0" @click="selectAllFilteredSlopes">
          选择当前标段全部边坡
        </el-button>
        <el-button type="primary" :loading="loadingData" @click="loadSelectedSlopeData">
          <el-icon><Search /></el-icon>
          查询数据
        </el-button>
        <el-button @click="resetSelection">
          <el-icon><RefreshRight /></el-icon>
          重置
        </el-button>
        <el-button type="success" plain @click="navigateToDataEntry">
          <el-icon><Edit /></el-icon>
          前往数据录入
        </el-button>
      </div>

      <el-table :data="slopeSummaries" border stripe class="summary-table" v-loading="loadingData">
        <el-table-column prop="section" label="标段" width="130" />
        <el-table-column prop="slopeName" label="边坡名称" min-width="180" />
        <el-table-column prop="slopeType" label="边坡类型" width="130" />
        <el-table-column prop="pointCount" label="测点数" width="90" align="center" />
        <el-table-column prop="dataCount" label="已加载数据" width="120" align="center" />
        <el-table-column prop="typeSummary" label="涉及监测类型" min-width="180" />
        <el-table-column prop="dateRange" label="数据日期范围" width="220" />
        <el-table-column label="是否保留" width="120" align="center" fixed="right">
          <template #default="scope">
            <el-switch
              :model-value="true"
              inline-prompt
              active-text="保留"
              :disabled="loadingData"
              @change="value => changeSlopeRetention(scope.row.slopeId, value)"
            />
          </template>
        </el-table-column>
      </el-table>

      <el-empty
        v-if="selectionForm.slopeIds.length > 0 && !loadingData && selectedData.length === 0"
        description="当前范围内没有查询到监测数据，请调整时间或先完成数据录入"
        :image-size="90"
        class="empty-state"
      />

      <div class="selected-data-section" v-if="selectedData.length > 0">
        <div class="section-title">
          <h4>本次工作流数据范围</h4>
          <span>{{ selectedSlopes.length }} 个边坡，{{ selectedData.length }} 条真实监测数据</span>
        </div>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="标段">
            {{ selectedSectionNames.join('、') || '全部标段' }}
          </el-descriptions-item>
          <el-descriptions-item label="边坡">
            {{ selectedSlopes.map((item) => item.slope_name).join('、') }}
          </el-descriptions-item>
          <el-descriptions-item label="监测类型">
            {{ selectionForm.monitoringTypes.join('、') || '全部类型' }}
          </el-descriptions-item>
          <el-descriptions-item label="时间范围">
            {{ displayDateRange }}
          </el-descriptions-item>
          <el-descriptions-item label="后续用途">
            数据查看、可视化分析、报告图表插入
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <div class="step-actions">
        <el-button
          type="primary"
          size="large"
          @click="submitData"
          :loading="submitting"
          :disabled="selectionForm.slopeIds.length === 0 || selectedData.length === 0"
        >
          <el-icon><Check /></el-icon>
          选择 {{ selectedSlopes.length }} 个边坡并继续
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { API_DATA } from '../config/api'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { Edit, Check, RefreshRight, Search } from '@element-plus/icons-vue'

const props = defineProps({
  workflowData: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['next'])
const router = useRouter()

const slopes = ref([])
const selectedData = ref([])
const loadingData = ref(false)
const submitting = ref(false)
const DEEP_MONITOR_TYPE = '深部位移测斜孔'

const selectionForm = reactive({
  sections: [],
  slopeIds: [],
  monitoringTypes: ['地表位移监测点', '沉降监测点'],
  dateRange: [],
})

const selectedSlopes = computed(() => {
  const selectedIds = new Set(selectionForm.slopeIds.map((id) => Number(id)))
  return slopes.value.filter((slope) => selectedIds.has(Number(slope.id)))
})

const sections = computed(() => [...new Set(slopes.value.map((item) => item.section).filter(Boolean))])
const selectedSectionNames = computed(() => [...new Set(selectedSlopes.value.map((item) => item.section).filter(Boolean))])
const filteredSlopes = computed(() => {
  if (!selectionForm.sections.length) return slopes.value
  const allowedSections = new Set(selectionForm.sections)
  return slopes.value.filter((slope) => allowedSections.has(slope.section))
})

const displayDateRange = computed(() => {
  if (!selectionForm.dateRange?.length) return '全部日期'
  return `${selectionForm.dateRange[0]} 至 ${selectionForm.dateRange[1]}`
})

const slopeSummaries = computed(() => {
  return selectedSlopes.value.map((slope) => {
    const rows = selectedData.value.filter((item) => Number(item.slopeId) === Number(slope.id))
    const dates = [...new Set(rows.map((item) => item.monitorDate).filter(Boolean))].sort()
    const types = [...new Set(rows.map((item) => item.monitoringType).filter(Boolean))]
    return {
      slopeId: slope.id,
      section: slope.section || '-',
      slopeName: slope.slope_name,
      slopeType: slope.slope_type || '-',
      pointCount: slope.point_count || 0,
      dataCount: rows.length,
      typeSummary: types.length ? types.join('、') : '-',
      dateRange: dates.length ? `${dates[0]} 至 ${dates[dates.length - 1]}` : '-',
    }
  })
})

function splitMonitorDateTime(monitorDate) {
  if (typeof monitorDate !== 'string') return { monitorDate: '', monitorTime: '' }
  const trimmed = monitorDate.trim()
  const [datePart = '', timePartFull = ''] = trimmed.split(' ')
  const timePart = timePartFull.length >= 5 ? timePartFull.slice(0, 5) : timePartFull
  return { monitorDate: datePart, monitorTime: timePart }
}

function mapBackendRowToWorkflowItem(row) {
  const { monitorDate, monitorTime } = splitMonitorDateTime(row.monitor_date)
  return {
    id: row.id,
    slopeId: row.slope_id,
    slope: row.slope_name || '',
    pointId: row.point_id,
    pointName: row.point_name || '',
    monitoringPoint: row.point_name || '',
    monitoringType: row.monitor_type,
    monitorDate,
    monitorTime,
    value: row.value,
    relativeValue: row.max_relative ?? null,
    unit: row.unit || 'mm',
    remark: row.remark,
    source: row.monitor_type === DEEP_MONITOR_TYPE ? 'inclinometer_surveys' : 'backend_history',
  }
}

async function loadSlopes() {
  try {
    const response = await fetch(`${API_DATA}/api/slopes`)
    const result = await response.json()
    if (!result?.success) throw new Error(result?.message || '加载边坡失败')
    slopes.value = result.data || []
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '加载边坡失败')
  }
}

async function fetchMonitoringRowsBySlope(slopeId) {
  const params = new URLSearchParams({
    slope_id: String(slopeId),
    limit: '20000',
  })
  if (selectionForm.dateRange?.[0]) params.set('from', selectionForm.dateRange[0])
  if (selectionForm.dateRange?.[1]) params.set('to', selectionForm.dateRange[1])

  const response = await fetch(`${API_DATA}/api/monitoring-data?${params.toString()}`)
  const result = await response.json()
  if (!result?.success) throw new Error(result?.message || '加载监测数据失败')
  return (result.data || []).map(mapBackendRowToWorkflowItem)
}

async function fetchInclinometerRowsBySlope(slopeId) {
  const params = new URLSearchParams({
    slope_id: String(slopeId),
    point_type: DEEP_MONITOR_TYPE,
    all_history: 'true',
  })
  if (selectionForm.dateRange?.[0]) params.set('from', selectionForm.dateRange[0])
  if (selectionForm.dateRange?.[1]) params.set('to', selectionForm.dateRange[1])

  const response = await fetch(`${API_DATA}/api/monitoring-data/overview/trends?${params.toString()}`)
  const result = await response.json()
  if (!result?.success) throw new Error(result?.message || '加载深部测斜数据失败')
  return (result.data || []).map(mapBackendRowToWorkflowItem)
}

async function loadSelectedSlopeData() {
  if (selectionForm.slopeIds.length === 0) {
    selectedData.value = []
    return
  }

  loadingData.value = true
  try {
    const typeSet = new Set(selectionForm.monitoringTypes)
    const includeAllTypes = typeSet.size === 0
    const needsDeepData = includeAllTypes || typeSet.has(DEEP_MONITOR_TYPE)
    const needsRegularData = includeAllTypes || [...typeSet].some(type => type !== DEEP_MONITOR_TYPE)
    const requests = selectionForm.slopeIds.flatMap((slopeId) => [
      ...(needsRegularData ? [fetchMonitoringRowsBySlope(slopeId)] : []),
      ...(needsDeepData ? [fetchInclinometerRowsBySlope(slopeId)] : []),
    ])
    const rowsGroup = await Promise.all(requests)
    selectedData.value = rowsGroup
      .flat()
      .filter((item) => typeSet.size === 0 || typeSet.has(item.monitoringType))
      .sort((a, b) => new Date(b.monitorDate) - new Date(a.monitorDate))
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '加载监测数据失败')
  } finally {
    loadingData.value = false
  }
}

function resetSelection() {
  selectionForm.sections = []
  selectionForm.slopeIds = []
  selectionForm.monitoringTypes = ['地表位移监测点', '沉降监测点']
  selectionForm.dateRange = []
  selectedData.value = []
}

function handleSectionChange() {
  const allowedIds = new Set(filteredSlopes.value.map((slope) => Number(slope.id)))
  selectionForm.slopeIds = selectionForm.slopeIds.filter((id) => allowedIds.has(Number(id)))
  loadSelectedSlopeData()
}

function selectAllFilteredSlopes() {
  selectionForm.slopeIds = [...new Set([
    ...selectionForm.slopeIds,
    ...filteredSlopes.value.map((slope) => slope.id),
  ])]
  loadSelectedSlopeData()
}

function changeSlopeRetention(slopeId, retained) {
  if (retained) return
  const slope = slopes.value.find(item => Number(item.id) === Number(slopeId))
  selectionForm.slopeIds = selectionForm.slopeIds.filter(id => Number(id) !== Number(slopeId))
  selectedData.value = selectedData.value.filter(item => Number(item.slopeId) !== Number(slopeId))
  ElMessage.success(`已从本次报告范围移除“${slope?.slope_name || '该边坡'}”，可在上方重新选择`)
}

function navigateToDataEntry() {
  router.push('/data-entry')
}

async function submitData() {
  if (selectionForm.slopeIds.length === 0) {
    ElMessage.warning('请先选择边坡')
    return
  }

  if (selectedData.value.length === 0) {
    ElMessage.warning('当前边坡范围内没有可用于报告的数据')
    return
  }

  submitting.value = true
  await loadSelectedSlopeData()

  props.workflowData.dataEntry = {
    selectionMode: 'slope',
    selectedSlopes: selectedSlopes.value.map((slope) => ({
      id: slope.id,
      slope_name: slope.slope_name,
      section: slope.section,
      slope_type: slope.slope_type,
      point_count: slope.point_count,
    })),
    selectedSlopeIds: [...selectionForm.slopeIds],
    monitoringTypes: [...selectionForm.monitoringTypes],
    dateRange: [...(selectionForm.dateRange || [])],
    selectedData: [...selectedData.value],
    submitTime: new Date().toISOString(),
  }
  props.workflowData.scope = {
    sections: [...selectedSectionNames.value],
    section: selectedSectionNames.value.length === 1 ? selectedSectionNames.value[0] : '',
    slopeIds: [...selectionForm.slopeIds],
    monitoringTypes: [...selectionForm.monitoringTypes],
    dateRange: [...(selectionForm.dateRange || [])],
    cutoff: selectionForm.dateRange?.[1] || new Date().toISOString().slice(0, 10),
  }

  submitting.value = false
  ElMessage.success(`已选择 ${selectedSlopes.value.length} 个边坡，加载 ${selectedData.value.length} 条监测数据`)
  emit('next')
}

onMounted(async () => {
  await loadSlopes()
  const previous = props.workflowData?.dataEntry
  if (previous?.selectionMode === 'slope') {
    selectionForm.sections = props.workflowData?.scope?.sections?.length
      ? [...props.workflowData.scope.sections]
      : (props.workflowData?.scope?.section ? [props.workflowData.scope.section] : [])
    selectionForm.slopeIds = previous.selectedSlopeIds || []
    selectionForm.monitoringTypes = previous.monitoringTypes || ['地表位移监测点', '沉降监测点']
    selectionForm.dateRange = previous.dateRange || []
    selectedData.value = previous.selectedData || []
  }
})
</script>

<style scoped>
.data-entry-workflow {
  margin: 20px 0;
}

.step-card {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.step-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 16px;
}

.intro-alert {
  margin-bottom: 18px;
}

.range-form {
  padding: 18px 18px 2px;
  background: #f7f9fc;
  border: 1px solid #e5eaf3;
  border-radius: 6px;
}

.option-meta {
  float: right;
  color: #909399;
  font-size: 12px;
  margin-left: 16px;
}

.toolbar {
  display: flex;
  gap: 10px;
  margin: 16px 0;
}

.summary-table {
  margin-top: 12px;
}

.empty-state {
  margin: 24px 0;
}

.selected-data-section {
  margin-top: 18px;
  padding: 18px;
  background-color: #f0f9ff;
  border: 1px solid #d9ecff;
  border-radius: 6px;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.section-title h4 {
  margin: 0;
  font-size: 16px;
  color: #1f2937;
}

.section-title span {
  color: #409eff;
}

.step-actions {
  margin-top: 24px;
  text-align: center;
}
</style>
