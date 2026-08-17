<template>
  <div class="data-entry-page">
    <el-row :gutter="16">
      <!-- 左侧：边坡 + 测点类型数量 + 管理入口 -->
      <el-col :xs="24" :md="8" :lg="7">
        <el-card class="side-card" shadow="never">
          <template #header>
            <span class="side-card-title">边坡与监测点</span>
          </template>

          <div class="side-section">
            <div class="side-label">选择边坡</div>
            <el-select
              v-model="selectedSlopeId"
              placeholder="请选择边坡"
              style="width: 100%"
              filterable
              clearable
            >
              <el-option
                v-for="s in slopes"
                :key="s.id"
                :label="`${s.slope_name}（测点 ${s.point_count ?? 0}）`"
                :value="String(s.id)"
              />
            </el-select>
          </div>

          <template v-if="selectedSlopeId">
            <el-divider content-position="left">当前边坡</el-divider>
            <div v-if="slopeContextLoading" class="side-loading">
              <el-icon class="is-loading"><Loading /></el-icon>
              加载概况…
            </div>
            <template v-else>
              <div class="slope-name-line">
                {{ currentSlopeDetail?.slope_name || activeSlopeName }}
              </div>
              <el-descriptions v-if="currentSlopeDetail" :column="1" size="small" border class="slope-desc">
                <el-descriptions-item label="类型">{{ currentSlopeDetail.slope_type || '-' }}</el-descriptions-item>
                <el-descriptions-item label="位置">{{ currentSlopeDetail.location || '-' }}</el-descriptions-item>
                <el-descriptions-item label="测点总数">{{ allPointsOnSlope.length }}</el-descriptions-item>
              </el-descriptions>

              <div class="side-label" style="margin-top: 12px">按类型选择（显示本边坡测点数量）</div>
              <div class="type-buttons">
                <el-button
                  v-for="t in POINT_TYPES"
                  :key="t"
                  :type="selectedPointType === t ? 'primary' : 'default'"
                  class="type-btn"
                  @click="selectPointType(t)"
                >
                  {{ t }}
                  <el-tag size="small" effect="plain" class="type-count-tag">{{ pointTypeCounts[t] ?? 0 }}</el-tag>
                </el-button>
              </div>
              <p v-if="selectedPointType && (pointTypeCounts[selectedPointType] ?? 0) === 0" class="warn-text">
                该类型下尚无监测点，请「新增监测点」或前往边坡与测点管理维护。
              </p>

              <div class="side-actions">
                <el-button type="primary" plain size="small" @click="goPointManagement">
                  边坡与测点管理
                </el-button>
                <el-button type="success" size="small" @click="openAddPointDialog">
                  <el-icon><Plus /></el-icon>
                  新增监测点
                </el-button>
              </div>

              <el-divider content-position="left">录入策略</el-divider>
              <div class="threshold-row">
                <span>在线录入阈值</span>
                <el-input-number
                  v-model="bulkModeThreshold"
                  :min="1"
                  :max="50"
                  size="small"
                  controls-position="right"
                />
                <span class="threshold-hint">当前类型测点数 &lt; 此值时用表格/粘贴；≥ 此值时用 Excel</span>
              </div>
            </template>
          </template>
          <el-empty v-else description="请先选择边坡" :image-size="72" />
        </el-card>
      </el-col>

      <!-- 右侧：录入主区 -->
      <el-col :xs="24" :md="16" :lg="17">
        <el-card class="main-entry-card">
          <template #header>
            <div class="card-header">
              <el-icon><Edit /></el-icon>
              <span>监测数据录入</span>
            </div>
          </template>

          <div v-if="!selectedSlopeId" class="empty-main">
            <el-empty description="请在左侧选择边坡以开始录入" />
          </div>
          <div v-else-if="!selectedPointType" class="empty-main">
            <el-empty description="请在左侧选择监测点类型" />
          </div>
          <div v-else-if="points.length === 0" class="empty-main">
            <el-empty description="当前类型下暂无监测点，请先添加监测点">
              <el-button type="primary" @click="openAddPointDialog">新增监测点</el-button>
            </el-empty>
          </div>
          <template v-else>
            <!-- 批量/单条切换 -->
            <div class="mode-tabs">
              <el-radio-group v-model="entryMode">
                <el-radio-button value="single">单条录入</el-radio-button>
                <el-radio-button value="batch">批量录入（表格/粘贴）</el-radio-button>
                <el-radio-button value="excel">Excel 导入</el-radio-button>
              </el-radio-group>
              <div class="mode-hint">
                当前共 {{ points.length }} 个监测点，{{ points.length >= bulkModeThreshold ? '建议使用 Excel 导入' : '建议使用批量录入' }}
              </div>
            </div>

            <!-- 单条录入 -->
            <div v-if="entryMode === 'single'" class="entry-section">
              <el-form :model="singleForm" label-width="100px" class="single-form">
                <el-form-item label="监测点">
                  <el-select v-model="singleForm.point_id" placeholder="选择监测点" style="width: 280px">
                    <el-option
                      v-for="p in points"
                      :key="p.id"
                      :label="p.point_name"
                      :value="p.id"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item label="监测日期">
                  <el-date-picker
                    v-model="singleForm.monitor_date"
                    type="date"
                    placeholder="选择日期"
                    style="width: 200px"
                    value-format="YYYY-MM-DD"
                  />
                </el-form-item>
                <el-form-item label="数值">
                  <el-input-number v-model="singleForm.value" :precision="3" style="width: 200px" />
                </el-form-item>
                <el-form-item label="备注">
                  <el-input v-model="singleForm.remark" type="textarea" :rows="2" style="width: 400px" />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" @click="submitSingle">提交</el-button>
                  <el-button @click="resetSingle">重置</el-button>
                </el-form-item>
              </el-form>
            </div>

            <!-- 批量录入（表格/粘贴） -->
            <div v-if="entryMode === 'batch'" class="entry-section">
              <div class="batch-toolbar">
                <el-button type="primary" @click="submitBatch" :disabled="batchRows.length === 0">提交</el-button>
                <el-button @click="batchRows = []">清空</el-button>
                <el-button @click="fillBatchDemo">填充示例</el-button>
              </div>
              <div class="batch-table-wrap">
                <el-table :data="batchRows" border size="small" style="width: 100%">
                  <el-table-column prop="point_id" label="监测点" width="200">
                    <template #default="scope">
                      <el-select v-model="scope.row.point_id" placeholder="选择监测点" size="small">
                        <el-option
                          v-for="p in points"
                          :key="p.id"
                          :label="p.point_name"
                          :value="p.id"
                        />
                      </el-select>
                    </template>
                  </el-table-column>
                  <el-table-column prop="monitor_date" label="监测日期" width="160">
                    <template #default="scope">
                      <el-date-picker
                        v-model="scope.row.monitor_date"
                        type="date"
                        placeholder="选择日期"
                        size="small"
                        style="width: 140px"
                        value-format="YYYY-MM-DD"
                      />
                    </template>
                  </el-table-column>
                  <el-table-column prop="value" label="数值" width="140">
                    <template #default="scope">
                      <el-input-number v-model="scope.row.value" :precision="3" size="small" style="width: 120px" />
                    </template>
                  </el-table-column>
                  <el-table-column prop="remark" label="备注">
                    <template #default="scope">
                      <el-input v-model="scope.row.remark" size="small" />
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="80">
                    <template #default="scope">
                      <el-button type="danger" size="small" @click="removeBatchRow(scope.$index)">删除</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
              <div class="paste-area">
                <div class="paste-label">粘贴导入（支持从 Excel 复制，格式：监测点名称 日期 数值 备注）</div>
                <el-input
                  v-model="pasteText"
                  type="textarea"
                  :rows="4"
                  placeholder="例如：&#10;测点A1&#9;2024-01-15&#9;12.345&#9;备注1&#10;测点A2&#9;2024-01-15&#9;23.456&#9;备注2"
                />
                <div class="paste-actions">
                  <el-button type="primary" size="small" @click="parsePaste">解析粘贴内容</el-button>
                  <el-button size="small" @click="pasteText = ''">清空</el-button>
                </div>
              </div>
            </div>

            <!-- Excel 导入 -->
            <div v-if="entryMode === 'excel'" class="entry-section">
              <ExcelImportPanel
                :points="points"
                :slope-id="selectedSlopeId"
                :point-type="selectedPointType"
                @imported="onExcelImported"
              />
            </div>
          </template>
        </el-card>
      </el-col>
    </el-row>

    <!-- 新增监测点弹窗 -->
    <el-dialog v-model="addPointDialogVisible" title="新增监测点" width="480px">
      <el-form :model="addPointForm" label-width="100px">
        <el-form-item label="监测点名称" required>
          <el-input v-model="addPointForm.point_name" placeholder="请输入监测点名称" />
        </el-form-item>
        <el-form-item label="监测点类型" required>
          <el-select v-model="addPointForm.point_type" placeholder="选择监测点类型" style="width: 100%">
            <el-option v-for="t in POINT_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="addPointForm.location" placeholder="请输入位置" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="addPointForm.description" type="textarea" :rows="2" placeholder="请输入描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="addPointDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitAddPoint">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Edit, Plus, Loading } from '@element-plus/icons-vue'
import ExcelImportPanel from '../components/ExcelImportPanel.vue'
import { API_DATA } from '../config/api'

const token = localStorage.getItem('token')
const route = useRoute()
const router = useRouter()

/** 与基础数据模块（监测点管理）口径一致 */
const POINT_TYPES = ['地表位移监测点', '沉降监测点', '深部位移测斜孔']
const me = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}')
  } catch {
    return {}
  }
})
const isAdmin = computed(() => me.value?.role === 'admin')

const slopes = ref([])
const points = ref([])
/** 当前边坡下全部测点（不按类型过滤），用于统计数量 */
const allPointsOnSlope = ref([])
const selectedSlopeId = ref('')
const selectedPointType = ref('')
const slopeContextLoading = ref(false)
const currentSlopeDetail = ref(null)

// 阈值：小于该值用批量表格，大于等于用 Excel
const bulkModeThreshold = ref(10)

// 录入模式：single | batch | excel
const entryMode = ref('single')

// 单条表单
const singleForm = reactive({
  point_id: null,
  monitor_date: '',
  value: 0,
  remark: ''
})

// 批量行
const batchRows = ref([])
const pasteText = ref('')

// 新增监测点弹窗
const addPointDialogVisible = ref(false)
const addPointForm = reactive({
  point_name: '',
  point_type: '',
  location: '',
  description: ''
})

const activeSlopeName = computed(() => {
  const s = slopes.value.find(x => String(x.id) === selectedSlopeId.value)
  return s?.slope_name || ''
})

// 按类型统计当前边坡下的测点数量
const pointTypeCounts = computed(() => {
  const counts = {}
  for (const t of POINT_TYPES) counts[t] = 0
  for (const p of allPointsOnSlope.value) {
    const t = p.point_type
    if (POINT_TYPES.includes(t)) {
      counts[t] = (counts[t] || 0) + 1
    }
  }
  return counts
})

// 加载边坡列表（带测点数量）
const loadSlopes = async () => {
  try {
    const res = await fetch(`${API_DATA}/api/slopes`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.success) {
      slopes.value = data.data || []
    }
  } catch (e) {
    console.error(e)
  }
}

// 加载当前边坡下某类型的测点
const loadPoints = async () => {
  points.value = []
  if (!selectedSlopeId.value || !selectedPointType.value) return
  try {
    const res = await fetch(
      `${API_DATA}/api/points?slope_id=${selectedSlopeId.value}&point_type=${encodeURIComponent(selectedPointType.value)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (data.success) {
      points.value = data.data || []
    }
  } catch (e) {
    console.error(e)
  }
}

// 加载当前边坡全部测点（用于统计）
const loadAllPointsOnSlope = async () => {
  allPointsOnSlope.value = []
  if (!selectedSlopeId.value) return
  try {
    const res = await fetch(
      `${API_DATA}/api/points?slope_id=${selectedSlopeId.value}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (data.success) {
      allPointsOnSlope.value = data.data || []
    }
  } catch (e) {
    console.error(e)
  }
}

// 加载边坡详情
const loadSlopeDetail = async () => {
  currentSlopeDetail.value = null
  if (!selectedSlopeId.value) return
  try {
    const res = await fetch(`${API_DATA}/api/slopes/${selectedSlopeId.value}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.success) {
      currentSlopeDetail.value = data.data || null
    }
  } catch (e) {
    console.error(e)
  }
}

// 选择类型
const selectPointType = (t) => {
  selectedPointType.value = t
  loadPoints()
}

// 监听边坡变化
watch(selectedSlopeId, async (val) => {
  selectedPointType.value = ''
  points.value = []
  if (!val) {
    allPointsOnSlope.value = []
    currentSlopeDetail.value = null
    return
  }
  slopeContextLoading.value = true
  await Promise.all([loadAllPointsOnSlope(), loadSlopeDetail()])
  slopeContextLoading.value = false
  // 默认选中第一个有测点的类型
  const firstWithPoints = POINT_TYPES.find(t => (pointTypeCounts.value[t] || 0) > 0)
  if (firstWithPoints) {
    selectedPointType.value = firstWithPoints
    await loadPoints()
  }
})

// 单条提交
const submitSingle = async () => {
  if (!singleForm.point_id || !singleForm.monitor_date) {
    ElMessage.warning('请选择监测点和日期')
    return
  }
  try {
    const res = await fetch(`${API_DATA}/api/monitoring-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        point_id: singleForm.point_id,
        monitor_date: singleForm.monitor_date,
        value: singleForm.value,
        remark: singleForm.remark
      })
    })
    const data = await res.json()
    if (data.success) {
      ElMessage.success('录入成功')
      resetSingle()
    } else {
      ElMessage.error(data.message || '录入失败')
    }
  } catch (e) {
    ElMessage.error('网络错误')
  }
}

const resetSingle = () => {
  singleForm.point_id = null
  singleForm.monitor_date = ''
  singleForm.value = 0
  singleForm.remark = ''
}

// 批量行操作
const removeBatchRow = (idx) => {
  batchRows.value.splice(idx, 1)
}

const fillBatchDemo = () => {
  const today = new Date().toISOString().slice(0, 10)
  batchRows.value = points.value.slice(0, 3).map((p, i) => ({
    point_id: p.id,
    monitor_date: today,
    value: parseFloat((Math.random() * 10).toFixed(3)),
    remark: `示例${i + 1}`
  }))
}

const submitBatch = async () => {
  if (batchRows.value.length === 0) {
    ElMessage.warning('没有可提交的数据')
    return
  }
  const invalid = batchRows.value.some(r => !r.point_id || !r.monitor_date)
  if (invalid) {
    ElMessage.warning('请完善监测点和日期')
    return
  }
  try {
    const res = await fetch(`${API_DATA}/api/monitoring-data/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ rows: batchRows.value })
    })
    const data = await res.json()
    if (data.success) {
      ElMessage.success(`成功录入 ${data.inserted || batchRows.value.length} 条`)
      batchRows.value = []
    } else {
      ElMessage.error(data.message || '批量录入失败')
    }
  } catch (e) {
    ElMessage.error('网络错误')
  }
}

// 粘贴解析
const parsePaste = () => {
  const text = pasteText.value.trim()
  if (!text) return
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const rows = []
  for (const line of lines) {
    const parts = line.split(/\t|,/)
    const name = (parts[0] || '').trim()
    const date = (parts[1] || '').trim()
    const valueStr = (parts[2] || '').trim()
    const remark = (parts[3] || '').trim()
    const point = points.value.find(p => p.point_name === name)
    if (point && date) {
      rows.push({
        point_id: point.id,
        monitor_date: date,
        value: parseFloat(valueStr) || 0,
        remark
      })
    }
  }
  if (rows.length) {
    batchRows.value.push(...rows)
    ElMessage.success(`解析并添加 ${rows.length} 条`)
    pasteText.value = ''
  } else {
    ElMessage.warning('未解析到有效数据，请检查格式')
  }
}

// Excel 导入完成回调
const onExcelImported = (payload) => {
  ElMessage.success(`Excel 导入完成：成功 ${payload.success} 条，失败 ${payload.failed} 条`)
}

// 打开新增监测点弹窗
const openAddPointDialog = () => {
  addPointForm.point_name = ''
  addPointForm.point_type = selectedPointType.value || POINT_TYPES[0]
  addPointForm.location = ''
  addPointForm.description = ''
  addPointDialogVisible.value = true
}

// 提交新增监测点
const submitAddPoint = async () => {
  if (!addPointForm.point_name) {
    ElMessage.warning('请输入监测点名称')
    return
  }
  if (!addPointForm.point_type) {
    ElMessage.warning('请选择监测点类型')
    return
  }
  try {
    const res = await fetch(`${API_DATA}/api/points`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        slope_id: selectedSlopeId.value,
        point_name: addPointForm.point_name,
        point_type: addPointForm.point_type,
        location: addPointForm.location,
        description: addPointForm.description
      })
    })
    const data = await res.json()
    if (data.success) {
      ElMessage.success('监测点添加成功')
      addPointDialogVisible.value = false
      // 刷新数据
      await loadAllPointsOnSlope()
      if (selectedPointType.value === addPointForm.point_type) {
        await loadPoints()
      }
    } else {
      ElMessage.error(data.message || '添加失败')
    }
  } catch (e) {
    ElMessage.error('网络错误')
  }
}

// 跳转边坡与测点管理（带上当前边坡ID）
const goPointManagement = () => {
  router.push({ path: '/slope-management', query: { slope_id: selectedSlopeId.value } })
}

onMounted(() => {
  loadSlopes()
  // 如果 URL 带有 slope_id，自动选中
  if (route.query.slope_id) {
    selectedSlopeId.value = String(route.query.slope_id)
  }
})
</script>

<style scoped>
.data-entry-page {
  padding: 16px;
}
.side-card {
  height: 100%;
}
.side-card-title {
  font-weight: 600;
}
.side-section {
  margin-bottom: 12px;
}
.side-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 6px;
}
.side-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #909399;
  font-size: 13px;
}
.slope-name-line {
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 8px;
}
.type-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.type-btn {
  min-width: 90px;
}
.type-count-tag {
  margin-left: 6px;
}
.warn-text {
  color: #e6a23c;
  font-size: 12px;
  margin: 8px 0 0 0;
}
.side-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.threshold-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.threshold-hint {
  font-size: 12px;
  color: #909399;
}
.main-entry-card {
  min-height: 600px;
}
.empty-main {
  padding: 40px 0;
}
.mode-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.mode-hint {
  font-size: 12px;
  color: #909399;
}
.entry-section {
  margin-top: 8px;
}
.single-form {
  max-width: 600px;
}
.batch-toolbar {
  margin-bottom: 12px;
}
.batch-table-wrap {
  margin-bottom: 16px;
}
.paste-area {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 6px;
}
.paste-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
}
.paste-actions {
  margin-top: 8px;
}
</style>
