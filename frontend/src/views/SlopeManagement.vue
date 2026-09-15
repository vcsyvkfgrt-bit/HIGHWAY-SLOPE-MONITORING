<template>
  <div class="slope-management">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <el-icon><Collection /></el-icon>
          <span>边坡管理</span>
          <el-button type="primary" size="small" @click="handleAdd" style="margin-left: auto">
            <el-icon><Plus /></el-icon>
            添加边坡
          </el-button>
        </div>
      </template>
      
      <div class="slope-filter">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索边坡名称、标段、桩号或责任人"
          style="width: 300px"
          clearable
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-select
          v-model="selectedSlopeType"
          placeholder="边坡类型"
          clearable
          style="width: 170px"
          @change="handleSearch"
        >
          <el-option v-for="type in SLOPE_TYPES" :key="type" :label="type" :value="type" />
        </el-select>
        <el-select
          v-model="selectedSection"
          placeholder="所属标段"
          clearable
          filterable
          style="width: 170px"
          @change="handleSearch"
        >
          <el-option v-for="section in sectionOptions" :key="section" :label="section" :value="section" />
        </el-select>
        <el-button type="primary" @click="handleSearch">
          <el-icon><Search /></el-icon>
          查询
        </el-button>
        <el-button @click="resetSearch">重置</el-button>
      </div>

      <section class="slope-overview">
        <div class="overview-heading">
          <div>
            <div class="overview-title">边坡概况</div>
            <div class="overview-subtitle">{{ selectedSection || '全部标段' }}</div>
          </div>
          <el-tag effect="plain">共 {{ overviewSource.length }} 处</el-tag>
        </div>

        <div class="overview-metrics">
          <div v-for="item in slopeOverview" :key="item.label" class="metric-item">
            <span class="metric-mark" :style="{ backgroundColor: item.color }"></span>
            <div>
              <div class="metric-value">{{ item.value }}</div>
              <div class="metric-label">{{ item.label }}</div>
            </div>
          </div>
        </div>
      </section>
      
      <div class="slope-list">
        <div class="detail-toolbar">
          <span>
            {{ hasActiveFilter ? `当前筛选到 ${filteredSlopes.length} 处边坡` : '边坡明细用于查询、编辑和维护属性，默认收起。' }}
          </span>
          <el-button size="small" @click="showSlopeDetail = !showSlopeDetail">
            {{ showSlopeDetail ? '收起明细' : '展开明细' }}
          </el-button>
        </div>
        <el-table v-show="showSlopeDetail" :data="filteredSlopes" style="width: 100%" border>
          <el-table-column type="index" label="序号" width="80" :index="indexMethod" align="center" />
          <el-table-column prop="slope_name" label="边坡名称" align="center" />
          <el-table-column prop="section" label="所属标段" align="center" />
          <el-table-column prop="start_stake" label="起始桩号" width="120" align="center" />
          <el-table-column prop="end_stake" label="结束桩号" width="120" align="center" />
          <el-table-column prop="slope_type" label="边坡类型" width="100" align="center" />
          <el-table-column prop="max_height" label="最大坡高 (m)" width="120" align="center" />
          <el-table-column label="例会概况" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="meeting-summary">{{ meetingSummary(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="point_count" label="测点数量" width="100" align="center" />
          <el-table-column prop="contact_person" label="责任人" show-overflow-tooltip align="center" />
          <el-table-column prop="created_at" label="创建时间" width="180" align="center" />
          <el-table-column label="操作" width="180" align="center" fixed="right">
            <template #default="scope">
              <el-button size="small" type="primary" @click="handleEdit(scope.row)">
                <el-icon><Edit /></el-icon>
                编辑
              </el-button>
              <el-button size="small" type="danger" @click="handleDelete(scope.row.id)">
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>
    
    <!-- 编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="760px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="110px">
        <el-form-item label="边坡名称" prop="slope_name">
          <el-input v-model="form.slope_name" placeholder="请输入边坡名称" />
        </el-form-item>
        <el-form-item label="所属标段">
          <el-input v-model="form.section" placeholder="请输入所属标段" />
        </el-form-item>
        <el-form-item label="起始桩号">
          <el-input v-model="form.start_stake" placeholder="请输入起始桩号" />
        </el-form-item>
        <el-form-item label="结束桩号">
          <el-input v-model="form.end_stake" placeholder="请输入结束桩号" />
        </el-form-item>
        <el-form-item label="边坡类型">
          <el-select v-model="form.slope_type" placeholder="选择边坡类型">
            <el-option label="滑坡" value="滑坡" />
            <el-option label="崩塌" value="崩塌" />
            <el-option label="泥石流" value="泥石流" />
            <el-option label="深挖路堑" value="深挖路堑" />
            <el-option label="高填方" value="高填方" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="最大坡高 (m)">
          <el-input v-model="form.max_height" type="number" placeholder="请输入最大坡高" />
        </el-form-item>
        <div class="form-section">
          <div class="form-section__title">监理例会概况</div>
          <div class="form-section__desc">用于自动生成“施工与监控概况表”；不填写时系统会用已维护测点数量兜底。</div>
          <div class="form-grid">
            <el-form-item label="边坡长度 (m)">
              <el-input v-model="form.slope_length" type="number" placeholder="如 237.87" />
            </el-form-item>
            <el-form-item label="位置">
              <el-select v-model="form.slope_position" placeholder="选择或输入位置" filterable allow-create clearable>
                <el-option v-for="item in SLOPE_POSITIONS" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item label="位移桩 (个)">
              <el-input v-model="form.design_displacement_piles" type="number" min="0" placeholder="设计/计划数量" />
            </el-form-item>
            <el-form-item label="沉降板 (个)">
              <el-input v-model="form.design_settlement_plates" type="number" min="0" placeholder="设计/计划数量" />
            </el-form-item>
            <el-form-item label="锚测力计 (个)">
              <el-input v-model="form.design_anchor_dynamometers" type="number" min="0" placeholder="设计/计划数量" />
            </el-form-item>
            <el-form-item label="测斜管 (m)">
              <el-input v-model="form.design_inclinometer_length" type="number" min="0" placeholder="设计/计划长度" />
            </el-form-item>
            <el-form-item label="施工状态">
              <el-select v-model="form.construction_status" placeholder="选择或输入施工状态" filterable allow-create clearable>
                <el-option v-for="item in CONSTRUCTION_STATUS_OPTIONS" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item label="例会排序">
              <el-input v-model="form.meeting_display_order" type="number" min="0" placeholder="数字越小越靠前" />
            </el-form-item>
          </div>
          <el-form-item label="工作进展">
            <el-input
              v-model="form.meeting_work_progress"
              type="textarea"
              :rows="2"
              maxlength="255"
              show-word-limit
              placeholder="如：本月已完成布点并开展常规监测；或填写施工、监测同步进展"
            />
          </el-form-item>
          <el-form-item label="备注">
            <el-input
              v-model="form.meeting_remark"
              maxlength="255"
              show-word-limit
              placeholder="如：顺层岩质边坡、重点跟踪、暂缓施工等"
            />
          </el-form-item>
          <el-form-item label="纳入例会">
            <el-switch
              v-model="form.include_in_meeting"
              active-text="纳入"
              inactive-text="暂不纳入"
            />
          </el-form-item>
        </div>
        <el-form-item label="责任人/联系人">
          <el-input v-model="form.contact_person" placeholder="请输入责任人/联系人" />
        </el-form-item>
        <el-form-item label="其他描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="请输入其他描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">
            {{ form.id ? '保存修改' : '确定' }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Collection, Plus, Edit, Delete, Search } from '@element-plus/icons-vue'
import { API_DATA } from '../config/api'

const emit = defineEmits(['changed'])

// 数据
const slopes = ref([])
const filteredSlopes = ref([])
const searchKeyword = ref('')
const selectedSlopeType = ref('')
const selectedSection = ref('')
const showSlopeDetail = ref(false)
const dialogVisible = ref(false)
const dialogTitle = ref('添加边坡')
const submitting = ref(false)
const formRef = ref(null)
const SLOPE_TYPES = ['滑坡', '崩塌', '泥石流', '深挖路堑', '高填方', '其他']
const GEOLOGICAL_TYPES = new Set(['滑坡', '崩塌', '泥石流'])
const SLOPE_POSITIONS = ['左幅', '右幅', '左侧', '右侧', '路基左侧', '路基右侧', '桥台', '匝道', '中线']
const CONSTRUCTION_STATUS_OPTIONS = ['暂未施工', '施工中', '已布点监测', '防护施工中', '已完成防护', '暂停施工', '重点跟踪']

const sectionOptions = computed(() => {
  return [...new Set(slopes.value.map((slope) => slope.section).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), 'zh-CN', { numeric: true }))
})

const overviewSource = computed(() => {
  if (!selectedSection.value) return slopes.value
  return slopes.value.filter((slope) => slope.section === selectedSection.value)
})

const slopeOverview = computed(() => {
  const source = overviewSource.value
  return [
    { label: '边坡总数', value: source.length, color: '#303133' },
    { label: '深挖路堑', value: source.filter((slope) => slope.slope_type === '深挖路堑').length, color: '#409eff' },
    { label: '高填方', value: source.filter((slope) => slope.slope_type === '高填方').length, color: '#67c23a' },
    { label: '不良地质', value: source.filter((slope) => GEOLOGICAL_TYPES.has(slope.slope_type)).length, color: '#e6a23c' },
    {
      label: '测点总数',
      value: source.reduce((total, slope) => total + Number(slope.point_count || 0), 0),
      color: '#8b5cf6',
    },
  ]
})

const hasActiveFilter = computed(() => {
  return Boolean(searchKeyword.value.trim() || selectedSlopeType.value || selectedSection.value)
})

const form = reactive({
  id: null,
  slope_name: '',
  section: '',
  start_stake: '',
  end_stake: '',
  slope_type: '滑坡',
  max_height: '',
  slope_length: '',
  slope_position: '',
  design_displacement_piles: '',
  design_settlement_plates: '',
  design_anchor_dynamometers: '',
  design_inclinometer_length: '',
  construction_status: '',
  meeting_work_progress: '',
  meeting_remark: '',
  include_in_meeting: true,
  meeting_display_order: '',
  contact_person: '',
  description: ''
})
const formRules = {
  slope_name: [
    { required: true, message: '请输入边坡名称', trigger: 'blur' },
    { max: 100, message: '边坡名称不能超过100个字符', trigger: 'blur' }
  ]
}

const resetForm = () => {
  form.id = null
  form.slope_name = ''
  form.section = ''
  form.start_stake = ''
  form.end_stake = ''
  form.slope_type = '滑坡'
  form.max_height = ''
  form.slope_length = ''
  form.slope_position = ''
  form.design_displacement_piles = ''
  form.design_settlement_plates = ''
  form.design_anchor_dynamometers = ''
  form.design_inclinometer_length = ''
  form.construction_status = ''
  form.meeting_work_progress = ''
  form.meeting_remark = ''
  form.include_in_meeting = true
  form.meeting_display_order = ''
  form.contact_person = ''
  form.description = ''
  formRef.value?.clearValidate()
}

const fillForm = (row) => {
  form.id = row.id
  form.slope_name = row.slope_name || ''
  form.section = row.section || ''
  form.start_stake = row.start_stake || ''
  form.end_stake = row.end_stake || ''
  form.slope_type = row.slope_type || '滑坡'
  form.max_height = row.max_height ?? ''
  form.slope_length = row.slope_length ?? ''
  form.slope_position = row.slope_position || ''
  form.design_displacement_piles = row.design_displacement_piles ?? ''
  form.design_settlement_plates = row.design_settlement_plates ?? ''
  form.design_anchor_dynamometers = row.design_anchor_dynamometers ?? ''
  form.design_inclinometer_length = row.design_inclinometer_length ?? ''
  form.construction_status = row.construction_status || ''
  form.meeting_work_progress = row.meeting_work_progress || ''
  form.meeting_remark = row.meeting_remark || ''
  form.include_in_meeting = row.include_in_meeting !== 0
  form.meeting_display_order = row.meeting_display_order ?? ''
  form.contact_person = row.contact_person || ''
  form.description = row.description || ''
}

const meetingSummary = (row) => {
  const parts = []
  const length = Number(row.slope_length) > 0 ? row.slope_length : ''
  const height = Number(row.max_height) > 0 ? row.max_height : ''
  if (length || height) parts.push(`长/高 ${length || '-'} / ${height || '-'}m`)
  if (row.slope_position) parts.push(row.slope_position)
  if (row.construction_status) parts.push(row.construction_status)
  if (row.meeting_work_progress) parts.push(row.meeting_work_progress)
  return parts.join('，') || '未维护'
}

// 加载边坡列表
const loadSlopes = async () => {
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`${API_DATA}/api/slopes`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    const result = await response.json()
    if (result.success) {
      slopes.value = result.data
      handleSearch()
    } else {
      ElMessage.error('获取边坡列表失败')
    }
  } catch (error) {
    console.error('加载边坡失败:', error)
    ElMessage.error('网络错误，请稍后重试')
  }
}

// 序号计算方法
const indexMethod = (index) => {
  return index + 1
}

// 搜索处理
const handleSearch = () => {
  const keyword = searchKeyword.value.trim().toLowerCase()

  filteredSlopes.value = slopes.value.filter(slope => {
    const matchesKeyword = !keyword || (
      (slope.slope_name && slope.slope_name.toLowerCase().includes(keyword)) ||
      (slope.section && slope.section.toLowerCase().includes(keyword)) ||
      (slope.start_stake && slope.start_stake.toLowerCase().includes(keyword)) ||
      (slope.end_stake && slope.end_stake.toLowerCase().includes(keyword)) ||
      (slope.contact_person && slope.contact_person.toLowerCase().includes(keyword))
    )
    const matchesType = !selectedSlopeType.value || slope.slope_type === selectedSlopeType.value
    const matchesSection = !selectedSection.value || slope.section === selectedSection.value
    return matchesKeyword && matchesType && matchesSection
  })

  if (hasActiveFilter.value) showSlopeDetail.value = true
}

// 重置搜索
const resetSearch = () => {
  searchKeyword.value = ''
  selectedSlopeType.value = ''
  selectedSection.value = ''
  filteredSlopes.value = slopes.value
  showSlopeDetail.value = false
}

// 添加边坡
const handleAdd = () => {
  resetForm()
  dialogTitle.value = '添加边坡'
  dialogVisible.value = true
}

// 编辑边坡
const handleEdit = async (row) => {
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`${API_DATA}/api/slopes/${row.id}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    const result = await response.json()
    if (!result.success) {
      ElMessage.error(result.message || '获取边坡详情失败')
      return
    }
    fillForm(result.data)
    dialogTitle.value = '编辑边坡'
    dialogVisible.value = true
  } catch (error) {
    console.error('获取边坡详情失败:', error)
    ElMessage.error('获取边坡详情失败')
  }
}

// 提交表单
const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  try {
    submitting.value = true
    const token = localStorage.getItem('token')
    const url = form.id ? `${API_DATA}/api/slopes/${form.id}` : `${API_DATA}/api/slopes`
    const method = form.id ? 'PUT' : 'POST'
    const payload = {
      slope_name: form.slope_name.trim(),
      section: form.section || null,
      start_stake: form.start_stake || null,
      end_stake: form.end_stake || null,
      slope_type: form.slope_type || '滑坡',
      max_height: form.max_height === '' ? null : form.max_height,
      slope_length: form.slope_length === '' ? null : form.slope_length,
      slope_position: form.slope_position || null,
      design_displacement_piles: form.design_displacement_piles === '' ? null : form.design_displacement_piles,
      design_settlement_plates: form.design_settlement_plates === '' ? null : form.design_settlement_plates,
      design_anchor_dynamometers: form.design_anchor_dynamometers === '' ? null : form.design_anchor_dynamometers,
      design_inclinometer_length: form.design_inclinometer_length === '' ? null : form.design_inclinometer_length,
      construction_status: form.construction_status || null,
      meeting_work_progress: form.meeting_work_progress || null,
      meeting_remark: form.meeting_remark || null,
      include_in_meeting: form.include_in_meeting,
      meeting_display_order: form.meeting_display_order === '' ? null : form.meeting_display_order,
      contact_person: form.contact_person || null,
      description: form.description || null
    }
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
    
    const result = await response.json()
    if (result.success) {
      ElMessage.success(result.message)
      dialogVisible.value = false
      await loadSlopes()
      emit('changed')
    } else {
      ElMessage.error(result.message)
    }
  } catch (error) {
    console.error('提交失败:', error)
    ElMessage.error('网络错误，请稍后重试')
  } finally {
    submitting.value = false
  }
}

// 删除边坡
const handleDelete = async (id) => {
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`${API_DATA}/api/slopes/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    
    const result = await response.json()
    if (result.success) {
      ElMessage.success('删除成功')
      await loadSlopes()
      emit('changed')
    } else {
      ElMessage.error(result.message)
    }
  } catch (error) {
    console.error('删除失败:', error)
    ElMessage.error('网络错误，请稍后重试')
  }
}

// 初始加载
onMounted(() => {
  loadSlopes()
})
</script>

<style scoped>
.slope-management {
  max-width: 1200px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: bold;
}

.slope-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.slope-overview {
  margin: 16px 0 18px;
  padding: 16px 20px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fafbfc;
}

.overview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.overview-title {
  color: #303133;
  font-size: 15px;
  font-weight: 600;
}

.overview-subtitle {
  margin-top: 3px;
  color: #909399;
  font-size: 12px;
}

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(120px, 1fr));
  border-top: 1px solid #ebeef5;
}

.metric-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 16px 20px 2px;
}

.metric-item + .metric-item::before {
  position: absolute;
  top: 15px;
  bottom: 0;
  left: 0;
  width: 1px;
  background: #e4e7ed;
  content: '';
}

.metric-item:first-child {
  padding-left: 0;
}

.metric-mark {
  width: 8px;
  height: 32px;
  flex: none;
  border-radius: 2px;
}

.metric-value {
  color: #303133;
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}

.metric-label {
  margin-top: 6px;
  overflow: hidden;
  color: #606266;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slope-list {
  margin-top: 20px;
}

.detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: #606266;
  font-size: 13px;
}

.meeting-summary {
  color: #606266;
  font-size: 13px;
}

.form-section {
  margin: 12px 0 18px;
  padding: 14px 16px 4px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fafcff;
}

.form-section__title {
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.form-section__desc {
  margin: 4px 0 14px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 14px;
}

.form-grid :deep(.el-form-item) {
  margin-bottom: 14px;
}

@media (max-width: 900px) {
  .overview-metrics {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }

  .metric-item:nth-child(odd)::before {
    display: none;
  }

  .metric-item:nth-child(odd) {
    padding-left: 0;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
