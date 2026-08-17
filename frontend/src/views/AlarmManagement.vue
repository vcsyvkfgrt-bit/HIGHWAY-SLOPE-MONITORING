<template>
  <div class="alarm-management">
    <el-card>
      <template #header>
        <div class="page-header">
          <div>
            <h2>监测异常处理</h2>
            <p>数据异常 → 系统报警 → 管理员确认 → 现场复核 → 处理措施 → 关闭报警</p>
          </div>
          <el-button type="danger" @click="openCreateDialog">新增报警</el-button>
        </div>
      </template>

      <el-table :data="alarms" border>
        <el-table-column prop="project_name" label="项目" min-width="140" />
        <el-table-column prop="point_name" label="监测点" min-width="120" />
        <el-table-column prop="alarm_type" label="异常类型" width="120" />
        <el-table-column label="等级" width="100"><template #default="{ row }">{{ levelLabel(row.alarm_level) }}</template></el-table-column>
        <el-table-column label="状态" width="130"><template #default="{ row }">{{ statusLabel(row.status) }}</template></el-table-column>
        <el-table-column prop="description" label="描述" min-width="180" />
        <el-table-column label="流程操作" width="390" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="loadDetail(row)">记录</el-button>
            <el-button size="small" type="primary" @click="updateStatus(row, 'confirmed')">确认</el-button>
            <el-button size="small" type="warning" @click="openStatusDialog(row, 'field_review')">现场复核</el-button>
            <el-button size="small" type="success" @click="openStatusDialog(row, 'processing')">处理措施</el-button>
            <el-button size="small" type="info" @click="openStatusDialog(row, 'closed')">关闭</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="createDialogVisible" title="新增报警" width="520px">
      <el-form :model="alarmForm" label-width="100px">
        <el-form-item label="项目"><el-select v-model="alarmForm.project_id" clearable><el-option v-for="p in projects" :key="p.id" :label="p.project_name" :value="p.id" /></el-select></el-form-item>
        <el-form-item label="异常类型" required><el-input v-model="alarmForm.alarm_type" /></el-form-item>
        <el-form-item label="报警等级"><el-select v-model="alarmForm.alarm_level"><el-option label="提示" value="info" /><el-option label="预警" value="warning" /><el-option label="严重" value="serious" /><el-option label="危急" value="critical" /></el-select></el-form-item>
        <el-form-item label="异常值"><el-input-number v-model="alarmForm.abnormal_value" :controls="false" /></el-form-item>
        <el-form-item label="阈值"><el-input-number v-model="alarmForm.threshold_value" :controls="false" /></el-form-item>
        <el-form-item label="异常描述"><el-input v-model="alarmForm.description" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAlarm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="statusDialogVisible" :title="statusLabel(targetStatus)" width="520px">
      <el-form :model="statusForm" label-width="100px">
        <el-form-item label="说明"><el-input v-model="statusForm.description" type="textarea" /></el-form-item>
        <el-form-item v-if="targetStatus === 'field_review'" label="复核结果"><el-input v-model="statusForm.field_review_result" type="textarea" /></el-form-item>
        <el-form-item v-if="targetStatus === 'processing'" label="处理措施"><el-input v-model="statusForm.measures" type="textarea" /></el-form-item>
        <el-form-item v-if="targetStatus === 'closed'" label="关闭说明"><el-input v-model="statusForm.close_summary" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="statusDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitStatus">确认</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="报警处理记录" size="40%">
      <el-timeline v-if="detail">
        <el-timeline-item v-for="event in detail.events" :key="event.id" :timestamp="event.created_at">
          {{ statusLabel(event.status) }}：{{ event.description || '-' }}
        </el-timeline-item>
      </el-timeline>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { API_DATA } from '../config/api'
import { apiRequest } from '../utils/request'

const alarms = ref([])
const projects = ref([])
const detail = ref(null)
const currentAlarm = ref(null)
const targetStatus = ref('')

const createDialogVisible = ref(false)
const statusDialogVisible = ref(false)
const detailVisible = ref(false)

const alarmForm = reactive({ project_id: '', alarm_type: '', alarm_level: 'warning', abnormal_value: null, threshold_value: null, description: '' })
const statusForm = reactive({ description: '', field_review_result: '', measures: '', close_summary: '' })

const statuses = { data_abnormal: '数据异常', alarming: '系统报警', confirmed: '管理员确认', field_review: '现场复核', processing: '处理措施', closed: '关闭报警' }
const levels = { info: '提示', warning: '预警', serious: '严重', critical: '危急' }

function token() {
  return localStorage.getItem('token') || ''
}

function statusLabel(status) {
  return statuses[status] || status || '-'
}

function levelLabel(level) {
  return levels[level] || level || '-'
}

async function request(url, options = {}) {
  return apiRequest(url, options)

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  })
  const data = await res.json()
  if (!res.ok || !data.success) throw new Error(data.message || '请求失败')
  return data
}

async function loadAlarms() {
  const data = await request(`${API_DATA}/api/alarms`)
  alarms.value = data.data || []
}

async function loadProjects() {
  const data = await request(`${API_DATA}/api/projects`)
  projects.value = data.data || []
}

function openCreateDialog() {
  Object.assign(alarmForm, { project_id: '', alarm_type: '', alarm_level: 'warning', abnormal_value: null, threshold_value: null, description: '' })
  createDialogVisible.value = true
}

async function submitAlarm() {
  await request(`${API_DATA}/api/alarms`, { method: 'POST', body: JSON.stringify(alarmForm) })
  createDialogVisible.value = false
  ElMessage.success('报警已创建')
  loadAlarms()
}

async function updateStatus(row, status) {
  await request(`${API_DATA}/api/alarms/${row.id}/status`, { method: 'PUT', body: JSON.stringify({ status, description: statusLabel(status) }) })
  ElMessage.success('报警流程已更新')
  loadAlarms()
}

function openStatusDialog(row, status) {
  currentAlarm.value = row
  targetStatus.value = status
  Object.assign(statusForm, { description: '', field_review_result: '', measures: '', close_summary: '' })
  statusDialogVisible.value = true
}

async function submitStatus() {
  await request(`${API_DATA}/api/alarms/${currentAlarm.value.id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: targetStatus.value, ...statusForm }),
  })
  statusDialogVisible.value = false
  ElMessage.success('报警流程已更新')
  loadAlarms()
}

async function loadDetail(row) {
  const data = await request(`${API_DATA}/api/alarms/${row.id}`)
  detail.value = data.data
  detailVisible.value = true
}

onMounted(() => {
  loadAlarms()
  loadProjects()
})
</script>

<style scoped>
.alarm-management {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.page-header h2 {
  margin: 0 0 6px;
}
.page-header p {
  margin: 0;
  color: #909399;
}
</style>
