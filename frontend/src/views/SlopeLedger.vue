<template>
  <div class="slope-ledger">
    <el-card class="ledger-card">
      <template #header>
        <div class="page-header">
          <div>
            <div class="page-title">边坡监测台账</div>
            <div class="page-subtitle">按月汇总边坡状态、测点完成情况、施工进展与问题记录</div>
          </div>
          <div class="header-actions">
            <el-button :icon="Refresh" @click="loadLedger">刷新</el-button>
            <el-button type="success" :icon="Download" :loading="exporting" @click="exportExcel">
              导出 Excel
            </el-button>
          </div>
        </div>
      </template>

      <div class="filters">
        <el-date-picker
          v-model="query.month"
          type="month"
          value-format="YYYY-MM"
          format="YYYY-MM"
          placeholder="选择月份"
          :clearable="false"
          class="filter-month"
          @change="loadLedger"
        />
        <el-select
          v-model="query.section"
          placeholder="全部标段"
          clearable
          class="filter-section"
          @change="loadLedger"
        >
          <el-option v-for="section in sections" :key="section" :label="section" :value="section" />
        </el-select>
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索边坡名称、类型、责任人"
          class="filter-keyword"
        />
      </div>

      <el-table
        v-loading="loading"
        :data="filteredRows"
        border
        row-key="slope_id"
        class="ledger-table"
        @expand-change="handleExpand"
      >
        <el-table-column type="expand" width="46">
          <template #default="{ row }">
            <div class="expand-panel">
              <el-table :data="row.point_details || []" size="small" border>
                <el-table-column prop="point_name" label="测点编号" min-width="120" />
                <el-table-column prop="point_type" label="测点类型" min-width="140" />
                <el-table-column prop="install_date" label="安装日期" width="120" />
                <el-table-column prop="latest_monitor_date" label="最新监测日期" width="130" />
                <el-table-column prop="actual_times" label="本月次数" width="90" align="center" />
                <el-table-column prop="required_times" label="应测次数" width="90" align="center" />
                <el-table-column label="完成情况" width="100" align="center">
                  <template #default="{ row: point }">
                    <el-tag :type="point.completed ? 'success' : 'warning'" effect="plain">
                      {{ point.completed ? '完成' : '未达标' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="max_value" label="最大值" width="100" align="center" />
                <el-table-column prop="description" label="备注" min-width="160" show-overflow-tooltip />
              </el-table>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="section" label="标段" min-width="120" show-overflow-tooltip />
        <el-table-column prop="slope_name" label="边坡名称" min-width="150" show-overflow-tooltip />
        <el-table-column prop="slope_type" label="类型" width="90" align="center" />
        <el-table-column prop="total_points" label="测点总数" width="90" align="center" />
        <el-table-column prop="point_type_summary" label="按类型数量" min-width="180" show-overflow-tooltip />
        <el-table-column prop="completed_points" label="已完成测点" width="110" align="center" />
        <el-table-column label="完成率" width="110" align="center">
          <template #default="{ row }">
            <span v-if="row.completion_rate !== null">{{ row.completion_rate }}%</span>
            <span v-else class="muted">未配置</span>
          </template>
        </el-table-column>
        <el-table-column label="安全状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.safety_status)" effect="light">{{ row.safety_status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="建议安全" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.suggested_safety_status)" effect="plain">
              {{ row.suggested_safety_status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="工作状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="workTag(row.work_status)" effect="light">{{ row.work_status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="suggested_work_status" label="建议工作" width="110" align="center" />
        <el-table-column prop="construction_progress" label="施工进度" min-width="180" show-overflow-tooltip />
        <el-table-column prop="current_problem" label="当前问题" min-width="180" show-overflow-tooltip />
        <el-table-column prop="updated_by_name" label="更新人" width="100" align="center" />
        <el-table-column label="操作" width="150" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="openDetail(row)">编辑台账</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-drawer v-model="detailVisible" :title="detailTitle" size="62%" destroy-on-close>
      <div v-loading="detailLoading" class="drawer-body">
        <el-tabs v-model="activeTab">
          <el-tab-pane label="台账信息" name="entry">
            <el-form :model="entryForm" label-width="120px" class="entry-form">
              <el-row :gutter="12">
                <el-col :span="12">
                  <el-form-item label="安全状态">
                    <el-select v-model="entryForm.safety_status" style="width: 100%">
                      <el-option v-for="status in safetyStatuses" :key="status" :label="status" :value="status" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="监测工作状态">
                    <el-select v-model="entryForm.work_status" style="width: 100%">
                      <el-option v-for="status in workStatuses" :key="status" :label="status" :value="status" />
                    </el-select>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-alert
                v-if="entryForm.safety_status !== entryForm.suggested_safety_status"
                title="人工安全状态与系统建议不一致，请填写调整原因。"
                type="warning"
                show-icon
                :closable="false"
                class="form-alert"
              />
              <el-form-item label="调整原因">
                <el-input v-model="entryForm.status_adjust_reason" type="textarea" :rows="2" />
              </el-form-item>
              <el-form-item label="施工进度">
                <el-input v-model="entryForm.construction_progress" type="textarea" :rows="3" />
              </el-form-item>
              <el-form-item label="当前问题">
                <el-input v-model="entryForm.current_problem" type="textarea" :rows="3" />
              </el-form-item>
              <el-row :gutter="12">
                <el-col :span="12">
                  <el-form-item label="状态原因">
                    <el-input v-model="entryForm.pause_reason" placeholder="暂停监测/销项时填写" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="生效日期">
                    <el-date-picker
                      v-model="entryForm.effective_date"
                      value-format="YYYY-MM-DD"
                      style="width: 100%"
                      placeholder="暂停监测/销项时填写"
                    />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-divider content-position="left">每类测点频率与本月应测次数</el-divider>
              <div class="frequency-toolbar">
                <el-button size="small" @click="copyPreviousMonth">复制上月配置</el-button>
              </div>
              <el-table :data="frequencyRows" border size="small">
                <el-table-column prop="point_type" label="测点类型" min-width="150" />
                <el-table-column label="当前监测频率" min-width="180">
                  <template #default="{ row }">
                    <el-input v-model="row.frequency_text" placeholder="例如：每周1次" />
                  </template>
                </el-table-column>
                <el-table-column label="本月应测次数" width="130">
                  <template #default="{ row }">
                    <el-input-number v-model="row.required_times" :min="0" :step="1" controls-position="right" />
                  </template>
                </el-table-column>
                <el-table-column label="备注" min-width="160">
                  <template #default="{ row }">
                    <el-input v-model="row.remark" />
                  </template>
                </el-table-column>
              </el-table>

              <div class="drawer-actions">
                <el-button type="primary" :loading="saving" @click="saveEntry">保存台账</el-button>
              </div>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="测点明细" name="points">
            <el-table :data="detail.points" border>
              <el-table-column prop="point_name" label="测点编号" min-width="130" />
              <el-table-column prop="point_type" label="测点类型" min-width="150" />
              <el-table-column prop="install_date" label="安装日期" width="120" />
              <el-table-column prop="latest_monitor_date" label="最新监测日期" width="130" />
              <el-table-column prop="actual_times" label="本月次数" width="90" align="center" />
              <el-table-column prop="required_times" label="应测次数" width="90" align="center" />
              <el-table-column label="完成情况" width="100" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.completed ? 'success' : 'warning'" effect="plain">
                    {{ row.completed ? '完成' : '未达标' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="max_value" label="最新/最大值" width="110" />
              <el-table-column prop="description" label="备注" min-width="180" show-overflow-tooltip />
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="布点图" name="maps">
            <el-upload
              drag
              :show-file-list="false"
              :http-request="uploadMap"
              accept=".png,.jpg,.jpeg,.pdf"
              class="map-upload"
            >
              <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
              <div class="el-upload__text">拖拽或点击上传当前边坡布点图</div>
              <template #tip>
                <div class="el-upload__tip">支持 PNG/JPG/JPEG/PDF，上传后默认设为当前布点图。</div>
              </template>
            </el-upload>

            <div class="map-list">
              <div v-for="map in detail.maps" :key="map.id" class="map-item">
                <div class="map-preview">
                  <img
                    v-if="isImage(map)"
                    :src="assetUrl(map.file_path)"
                    :alt="map.original_name"
                  />
                  <div v-else class="pdf-preview">PDF</div>
                </div>
                <div class="map-info">
                  <div class="map-name">{{ map.original_name }}</div>
                  <div class="map-meta">{{ map.created_at }} <el-tag v-if="map.is_current" size="small">当前</el-tag></div>
                  <div class="map-actions">
                    <el-button link type="primary" @click="openAsset(map.file_path)">打开</el-button>
                    <el-button v-if="!map.is_current" link type="primary" @click="setCurrentMap(map)">设为当前</el-button>
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="进展日志" name="progress">
            <div class="log-form">
              <el-date-picker v-model="progressForm.record_date" value-format="YYYY-MM-DD" />
              <el-input v-model="progressForm.content" placeholder="填写工作进展" />
              <el-button type="primary" @click="addLog('progress')">追加</el-button>
            </div>
            <el-table :data="progressLogs" border>
              <el-table-column prop="record_date" label="日期" width="120" />
              <el-table-column prop="content" label="进展内容" min-width="260" />
              <el-table-column prop="recorder_name" label="记录人" width="100" />
              <el-table-column prop="created_at" label="记录时间" width="180" />
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="问题日志" name="problems">
            <el-form :model="problemForm" label-width="90px" class="problem-form">
              <el-row :gutter="12">
                <el-col :span="8">
                  <el-form-item label="发现日期">
                    <el-date-picker v-model="problemForm.record_date" value-format="YYYY-MM-DD" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="严重程度">
                    <el-select v-model="problemForm.severity" style="width: 100%">
                      <el-option label="一般" value="一般" />
                      <el-option label="较重" value="较重" />
                      <el-option label="严重" value="严重" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="状态">
                    <el-select v-model="problemForm.status" style="width: 100%">
                      <el-option label="未处理" value="未处理" />
                      <el-option label="处理中" value="处理中" />
                      <el-option label="已关闭" value="已关闭" />
                    </el-select>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-form-item label="问题描述">
                <el-input v-model="problemForm.content" type="textarea" :rows="2" />
              </el-form-item>
              <el-row :gutter="12">
                <el-col :span="12">
                  <el-form-item label="处置措施">
                    <el-input v-model="problemForm.measures" />
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="责任人">
                    <el-input v-model="problemForm.responsible_person" />
                  </el-form-item>
                </el-col>
                <el-col :span="4">
                  <el-button type="primary" class="problem-submit" @click="addLog('problem')">追加</el-button>
                </el-col>
              </el-row>
            </el-form>
            <el-table :data="problemLogs" border>
              <el-table-column prop="record_date" label="发现日期" width="120" />
              <el-table-column prop="severity" label="严重程度" width="90" />
              <el-table-column prop="content" label="问题描述" min-width="220" />
              <el-table-column prop="measures" label="处置措施" min-width="180" />
              <el-table-column prop="responsible_person" label="责任人" width="100" />
              <el-table-column prop="status" label="状态" width="90" />
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Refresh, UploadFilled } from '@element-plus/icons-vue'
import ExcelJS from 'exceljs'
import { API_DATA } from '../config/api'

const safetyStatuses = ['正常', '关注', '预警', '处置中', '已销项']
const workStatuses = ['未布点', '已布点', '已上传初值', '正常监测', '数据缺失', '暂停监测', '完成/销项']

const loading = ref(false)
const detailLoading = ref(false)
const saving = ref(false)
const exporting = ref(false)
const rows = ref([])
const sections = ref([])
const keyword = ref('')
const detailVisible = ref(false)
const activeTab = ref('entry')
const currentRow = ref(null)

const query = reactive({
  month: currentMonth(),
  section: '',
})

const detail = reactive({
  summary: null,
  points: [],
  frequencies: [],
  logs: [],
  maps: [],
})

const entryForm = reactive({
  safety_status: '正常',
  work_status: '正常监测',
  suggested_safety_status: '正常',
  suggested_work_status: '正常监测',
  status_adjust_reason: '',
  construction_progress: '',
  current_problem: '',
  pause_reason: '',
  effective_date: '',
})

const frequencyRows = ref([])

const progressForm = reactive({
  record_date: today(),
  content: '',
})

const problemForm = reactive({
  record_date: today(),
  content: '',
  severity: '一般',
  measures: '',
  responsible_person: '',
  status: '未处理',
})

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function tokenHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: tokenHeaders(options.headers || {}),
  })
  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.message || '请求失败')
  }
  return data.data
}

const filteredRows = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) return rows.value
  return rows.value.filter((row) => {
    return [row.slope_name, row.slope_type, row.section, row.current_problem, row.construction_progress]
      .some((value) => String(value || '').toLowerCase().includes(key))
  })
})

const detailTitle = computed(() => {
  return currentRow.value ? `${currentRow.value.slope_name} - ${query.month} 台账` : '边坡监测台账'
})

const progressLogs = computed(() => detail.logs.filter((log) => log.log_type === 'progress'))
const problemLogs = computed(() => detail.logs.filter((log) => log.log_type === 'problem'))

function statusTag(status) {
  if (status === '正常' || status === '已销项') return 'success'
  if (status === '预警' || status === '处置中') return 'danger'
  return 'warning'
}

function workTag(status) {
  if (status === '正常监测' || status === '完成/销项') return 'success'
  if (status === '数据缺失') return 'warning'
  if (status === '暂停监测') return 'info'
  return ''
}

function assetUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return `${API_DATA}${path}`
}

function isImage(file) {
  return String(file?.mime_type || '').startsWith('image/')
}

function openAsset(path) {
  window.open(assetUrl(path), '_blank')
}

async function loadLedger() {
  loading.value = true
  try {
    const params = new URLSearchParams({ month: query.month })
    if (query.section) params.append('section', query.section)
    const data = await request(`${API_DATA}/api/slope-ledger?${params}`)
    rows.value = (data.rows || []).map((row) => ({ ...row, point_details: [] }))
    sections.value = data.sections || []
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '加载台账失败')
  } finally {
    loading.value = false
  }
}

function buildFrequencies(summary, existing = []) {
  const existingMap = new Map(existing.map((item) => [item.point_type, item]))
  return Object.keys(summary?.type_stats || {}).map((pointType) => {
    const stat = summary.type_stats[pointType] || {}
    const saved = existingMap.get(pointType) || {}
    return {
      point_type: pointType,
      frequency_text: saved.frequency_text ?? stat.frequency_text ?? '',
      required_times: Number(saved.required_times ?? stat.required_times ?? 0),
      remark: saved.remark || '',
    }
  })
}

function fillEntry(summary) {
  Object.assign(entryForm, {
    safety_status: summary.safety_status || summary.suggested_safety_status || '正常',
    work_status: summary.work_status || summary.suggested_work_status || '正常监测',
    suggested_safety_status: summary.suggested_safety_status || '正常',
    suggested_work_status: summary.suggested_work_status || '正常监测',
    status_adjust_reason: summary.status_adjust_reason || '',
    construction_progress: summary.construction_progress || '',
    current_problem: summary.current_problem || '',
    pause_reason: summary.pause_reason || '',
    effective_date: summary.effective_date || '',
  })
}

async function openDetail(row) {
  currentRow.value = row
  detailVisible.value = true
  activeTab.value = 'entry'
  await loadDetail(row)
}

async function loadDetail(row = currentRow.value) {
  if (!row) return
  detailLoading.value = true
  try {
    const data = await request(`${API_DATA}/api/slope-ledger/${row.slope_id}?month=${query.month}`)
    detail.summary = data.summary
    detail.points = data.points || []
    detail.frequencies = data.frequencies || []
    detail.logs = data.logs || []
    detail.maps = data.maps || []
    frequencyRows.value = buildFrequencies(data.summary, data.frequencies)
    fillEntry(data.summary)

    const index = rows.value.findIndex((item) => item.slope_id === row.slope_id)
    if (index >= 0) {
      rows.value[index].point_details = data.points || []
    }
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '加载台账详情失败')
  } finally {
    detailLoading.value = false
  }
}

async function handleExpand(row, expandedRows) {
  const expanded = expandedRows.some((item) => item.slope_id === row.slope_id)
  if (!expanded || row.point_details_loaded) return
  try {
    const data = await request(`${API_DATA}/api/slope-ledger/${row.slope_id}?month=${query.month}`)
    row.point_details = data.points || []
    row.point_details_loaded = true
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '加载测点明细失败')
  }
}

function previousMonth(month) {
  const [year, monthNum] = month.split('-').map(Number)
  if (monthNum === 1) return `${year - 1}-12`
  return `${year}-${String(monthNum - 1).padStart(2, '0')}`
}

async function copyPreviousMonth() {
  if (!currentRow.value) return
  try {
    const prev = previousMonth(query.month)
    const data = await request(`${API_DATA}/api/slope-ledger/${currentRow.value.slope_id}?month=${prev}`)
    const prevMap = new Map((data.frequencies || []).map((item) => [item.point_type, item]))
    frequencyRows.value = frequencyRows.value.map((row) => {
      const saved = prevMap.get(row.point_type)
      return saved ? {
        ...row,
        frequency_text: saved.frequency_text || '',
        required_times: Number(saved.required_times || 0),
        remark: saved.remark || '',
      } : row
    })
    ElMessage.success('已复制上月频率配置')
  } catch (error) {
    console.error(error)
    ElMessage.warning('上月没有可复制的配置')
  }
}

async function saveEntry() {
  if (!currentRow.value) return
  if (entryForm.safety_status !== entryForm.suggested_safety_status && !entryForm.status_adjust_reason.trim()) {
    ElMessage.warning('人工安全状态与系统建议不一致，请填写调整原因')
    return
  }
  if (['暂停监测', '完成/销项'].includes(entryForm.work_status) && (!entryForm.pause_reason || !entryForm.effective_date)) {
    ElMessage.warning('暂停监测或完成/销项时，请填写原因和生效日期')
    return
  }

  saving.value = true
  try {
    await request(`${API_DATA}/api/slope-ledger/${currentRow.value.slope_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: query.month,
        ...entryForm,
        frequencies: frequencyRows.value,
      }),
    })
    ElMessage.success('台账已保存')
    await loadLedger()
    await loadDetail()
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function addLog(type) {
  if (!currentRow.value) return
  const form = type === 'problem' ? problemForm : progressForm
  if (!form.content.trim()) {
    ElMessage.warning('请输入记录内容')
    return
  }

  try {
    await request(`${API_DATA}/api/slope-ledger/${currentRow.value.slope_id}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: query.month,
        log_type: type,
        ...form,
      }),
    })
    if (type === 'problem') {
      Object.assign(problemForm, {
        record_date: today(),
        content: '',
        severity: '一般',
        measures: '',
        responsible_person: '',
        status: '未处理',
      })
    } else {
      Object.assign(progressForm, { record_date: today(), content: '' })
    }
    ElMessage.success('记录已追加')
    await loadLedger()
    await loadDetail()
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '追加失败')
  }
}

async function uploadMap({ file, onSuccess, onError }) {
  if (!currentRow.value) return
  try {
    const formData = new FormData()
    formData.append('files', file)
    formData.append('module', 'slope-ledger-map')
    formData.append('business_id', String(currentRow.value.slope_id))

    const uploadResponse = await fetch(`${API_DATA}/api/files/upload`, {
      method: 'POST',
      headers: tokenHeaders(),
      body: formData,
    })
    const uploadData = await uploadResponse.json()
    if (!uploadResponse.ok || !uploadData.success) throw new Error(uploadData.message || '上传失败')
    const asset = uploadData.data?.[0]
    await request(`${API_DATA}/api/slope-ledger/${currentRow.value.slope_id}/maps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_asset_id: asset.id, is_current: true }),
    })
    ElMessage.success('布点图已上传')
    onSuccess?.(uploadData)
    await loadLedger()
    await loadDetail()
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '上传失败')
    onError?.(error)
  }
}

async function setCurrentMap(map) {
  try {
    await request(`${API_DATA}/api/slope-ledger/maps/${map.id}/current`, { method: 'PUT' })
    ElMessage.success('已设为当前布点图')
    await loadLedger()
    await loadDetail()
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '设置失败')
  }
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } }
  row.alignment = { vertical: 'middle', horizontal: 'center' }
}

function applySheetStyle(sheet) {
  sheet.views = [{ state: 'frozen', ySplit: 2 }]
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
        left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
        bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
        right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      }
      cell.alignment = { vertical: 'middle', wrapText: true }
    })
  })
}

async function fetchImageBuffer(file) {
  if (!file || !isImage(file)) return null
  const response = await fetch(assetUrl(file.file_path), {
    headers: tokenHeaders(),
  })
  if (!response.ok) return null
  const buffer = await response.arrayBuffer()
  const lower = String(file.file_path || file.original_name || '').toLowerCase()
  const extension = lower.endsWith('.png') ? 'png' : 'jpeg'
  return { buffer, extension }
}

async function exportExcel() {
  exporting.value = true
  try {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = '高边坡监测预警平台'
    workbook.created = new Date()

    const mainSheet = workbook.addWorksheet('台账主表')
    const pointSheet = workbook.addWorksheet('测点明细')
    const logSheet = workbook.addWorksheet('进展与问题记录')

    mainSheet.addRow([`边坡监测台账（${query.month}）`])
    mainSheet.mergeCells('A1:Q1')
    mainSheet.getRow(1).font = { bold: true, size: 16 }
    mainSheet.getRow(1).alignment = { horizontal: 'center' }
    mainSheet.addRow([
      '标段', '边坡名称', '边坡类型', '测点总数', '按类型数量', '已完成测点数', '监测完成率',
      '当前监测频率', '安全状态', '建议安全状态', '监测工作状态', '建议工作状态',
      '施工进度', '当前问题', '更新人', '更新时间', '布点图',
    ])
    styleHeader(mainSheet.getRow(2))
    mainSheet.columns = [
      { width: 16 }, { width: 18 }, { width: 12 }, { width: 10 }, { width: 24 }, { width: 14 },
      { width: 12 }, { width: 32 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 14 },
      { width: 28 }, { width: 28 }, { width: 12 }, { width: 20 }, { width: 22 },
    ]

    pointSheet.addRow([`测点明细（${query.month}）`])
    pointSheet.mergeCells('A1:J1')
    pointSheet.getRow(1).font = { bold: true, size: 16 }
    pointSheet.getRow(1).alignment = { horizontal: 'center' }
    pointSheet.addRow(['标段', '边坡名称', '测点编号', '测点类型', '安装日期', '最新监测日期', '本月次数', '应测次数', '完成情况', '最大值'])
    styleHeader(pointSheet.getRow(2))
    pointSheet.columns = [{ width: 16 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 }]

    logSheet.addRow([`进展与问题记录（${query.month}）`])
    logSheet.mergeCells('A1:J1')
    logSheet.getRow(1).font = { bold: true, size: 16 }
    logSheet.getRow(1).alignment = { horizontal: 'center' }
    logSheet.addRow(['标段', '边坡名称', '记录类型', '日期', '内容', '严重程度', '处置措施', '责任人', '状态', '记录人'])
    styleHeader(logSheet.getRow(2))
    logSheet.columns = [{ width: 16 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 34 }, { width: 10 }, { width: 26 }, { width: 12 }, { width: 10 }, { width: 12 }]

    for (const row of filteredRows.value) {
      const detailData = await request(`${API_DATA}/api/slope-ledger/${row.slope_id}?month=${query.month}`)
      const mainRow = mainSheet.addRow([
        row.section,
        row.slope_name,
        row.slope_type,
        row.total_points,
        row.point_type_summary,
        row.completed_points,
        row.completion_rate === null ? '未配置' : `${row.completion_rate}%`,
        row.frequency_summary,
        row.safety_status,
        row.suggested_safety_status,
        row.work_status,
        row.suggested_work_status,
        row.construction_progress,
        row.current_problem,
        row.updated_by_name,
        row.updated_at,
        row.current_map?.original_name || '',
      ])

      if (row.current_map && isImage(row.current_map)) {
        try {
          const img = await fetchImageBuffer(row.current_map)
          if (img) {
            const imageId = workbook.addImage(img)
            mainSheet.getRow(mainRow.number).height = 72
            mainSheet.addImage(imageId, {
              tl: { col: 16.1, row: mainRow.number - 0.9 },
              ext: { width: 120, height: 70 },
            })
          }
        } catch (error) {
          console.warn('布点图插入失败:', error)
        }
      }

      ;(detailData.points || []).forEach((point) => {
        pointSheet.addRow([
          row.section,
          row.slope_name,
          point.point_name,
          point.point_type,
          point.install_date,
          point.latest_monitor_date,
          point.actual_times,
          point.required_times,
          point.completed ? '完成' : '未达标',
          point.max_value,
        ])
      })

      ;(detailData.logs || []).forEach((log) => {
        logSheet.addRow([
          row.section,
          row.slope_name,
          log.log_type === 'problem' ? '问题' : '进展',
          log.record_date,
          log.content,
          log.severity || '',
          log.measures || '',
          log.responsible_person || '',
          log.status || '',
          log.recorder_name || '',
        ])
      })
    }

    applySheetStyle(mainSheet)
    applySheetStyle(pointSheet)
    applySheetStyle(logSheet)

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `边坡监测台账_${query.month}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    ElMessage.success('Excel 已导出')
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

onMounted(loadLedger)
</script>

<style scoped>
.slope-ledger {
  min-height: 100%;
}

.ledger-card {
  border-radius: 6px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f2d3d;
}

.page-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: #7a869a;
}

.header-actions,
.filters,
.frequency-toolbar,
.drawer-actions,
.log-form,
.map-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filters {
  margin-bottom: 14px;
}

.filter-month {
  width: 150px;
}

.filter-section {
  width: 220px;
}

.filter-keyword {
  width: 320px;
}

.ledger-table {
  width: 100%;
}

.expand-panel {
  padding: 10px 12px;
  background: #fafcff;
}

.muted {
  color: #909399;
}

.drawer-body {
  padding-right: 8px;
}

.entry-form {
  max-width: 980px;
}

.form-alert {
  margin-bottom: 12px;
}

.frequency-toolbar {
  justify-content: flex-end;
  margin-bottom: 8px;
}

.drawer-actions {
  justify-content: flex-end;
  margin-top: 16px;
}

.map-upload {
  margin-bottom: 16px;
}

.map-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.map-item {
  display: flex;
  gap: 12px;
  padding: 10px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fff;
}

.map-preview {
  width: 96px;
  height: 72px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  flex-shrink: 0;
}

.map-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pdf-preview {
  font-weight: 700;
  color: #c45656;
}

.map-info {
  min-width: 0;
  flex: 1;
}

.map-name {
  font-weight: 600;
  color: #303133;
  word-break: break-all;
}

.map-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

.log-form {
  margin-bottom: 12px;
}

.log-form .el-input {
  flex: 1;
}

.problem-form {
  padding: 12px;
  margin-bottom: 12px;
  background: #fafcff;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}

.problem-submit {
  width: 100%;
}
</style>
