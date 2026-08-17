<template>
  <div class="project-lifecycle">
    <el-card>
      <template #header>
        <div class="page-header">
          <div>
            <h2>项目生命周期管理</h2>
            <p>项目创建 → 监测方案配置 → 设备安装 → 数据接入 → 自动监测 → 风险分析 → 报告生成</p>
          </div>
          <el-button type="primary" @click="openProjectDialog">创建项目</el-button>
        </div>
      </template>

      <el-table :data="projects" border>
        <el-table-column prop="project_name" label="项目名称" min-width="160" />
        <el-table-column prop="project_code" label="项目编号" width="120" />
        <el-table-column prop="location" label="位置" min-width="140" />
        <el-table-column label="当前阶段" width="160">
          <template #default="{ row }">{{ stageLabel(row.lifecycle_stage) }}</template>
        </el-table-column>
        <el-table-column prop="device_count" label="设备数" width="90" />
        <el-table-column prop="open_alarm_count" label="未关闭报警" width="110" />
        <el-table-column label="操作" width="360" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="loadDetail(row)">详情</el-button>
            <el-button size="small" type="primary" @click="openPlanDialog(row)">配置方案</el-button>
            <el-button size="small" type="success" @click="openDeviceDialog(row)">登记设备</el-button>
            <el-button size="small" type="warning" @click="openRiskDialog(row)">风险分析</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="projectDialogVisible" title="创建项目" width="520px">
      <el-form :model="projectForm" label-width="100px">
        <el-form-item label="项目名称" required><el-input v-model="projectForm.project_name" /></el-form-item>
        <el-form-item label="项目编号"><el-input v-model="projectForm.project_code" /></el-form-item>
        <el-form-item label="项目位置"><el-input v-model="projectForm.location" /></el-form-item>
        <el-form-item label="建设/业主单位"><el-input v-model="projectForm.owner_unit" /></el-form-item>
        <el-form-item label="开始日期"><el-date-picker v-model="projectForm.start_date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="projectForm.description" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="projectDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitProject">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="planDialogVisible" title="监测方案配置" width="560px">
      <el-form :model="planForm" label-width="110px">
        <el-form-item label="方案名称" required><el-input v-model="planForm.plan_name" /></el-form-item>
        <el-form-item label="监测频率"><el-input v-model="planForm.frequency" placeholder="如：每小时/每日/雨后加密" /></el-form-item>
        <el-form-item label="监测项目"><el-input v-model="planForm.monitor_items_text" type="textarea" placeholder="每行一个监测项目" /></el-form-item>
        <el-form-item label="阈值规则"><el-input v-model="planForm.threshold_rules_text" type="textarea" placeholder="每行一条阈值规则" /></el-form-item>
        <el-form-item label="责任人"><el-input v-model="planForm.responsible_person" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="planDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitPlan">保存方案</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="deviceDialogVisible" title="设备安装登记" width="560px">
      <el-form :model="deviceForm" label-width="100px">
        <el-form-item label="设备名称" required><el-input v-model="deviceForm.device_name" /></el-form-item>
        <el-form-item label="设备编号"><el-input v-model="deviceForm.device_code" /></el-form-item>
        <el-form-item label="设备类型"><el-input v-model="deviceForm.device_type" /></el-form-item>
        <el-form-item label="安装位置"><el-input v-model="deviceForm.install_location" /></el-form-item>
        <el-form-item label="安装时间"><el-date-picker v-model="deviceForm.install_time" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" /></el-form-item>
        <el-form-item label="数据源"><el-input v-model="deviceForm.data_source" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="deviceDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitDevice">保存设备</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="riskDialogVisible" title="风险分析" width="560px">
      <el-form :model="riskForm" label-width="100px">
        <el-form-item label="风险等级">
          <el-select v-model="riskForm.risk_level">
            <el-option label="低" value="low" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
            <el-option label="极高" value="critical" />
          </el-select>
        </el-form-item>
        <el-form-item label="分析结论"><el-input v-model="riskForm.conclusion" type="textarea" /></el-form-item>
        <el-form-item label="处置建议"><el-input v-model="riskForm.measures" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="riskDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRisk">保存分析</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="项目详情" size="45%">
      <template v-if="detail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="项目名称">{{ detail.project.project_name }}</el-descriptions-item>
          <el-descriptions-item label="当前阶段">{{ stageLabel(detail.project.lifecycle_stage) }}</el-descriptions-item>
          <el-descriptions-item label="说明">{{ detail.project.description || '-' }}</el-descriptions-item>
        </el-descriptions>
        <h3>生命周期记录</h3>
        <el-timeline>
          <el-timeline-item v-for="event in detail.events" :key="event.id" :timestamp="event.created_at">
            {{ stageLabel(event.stage) }}：{{ event.description || '-' }}
          </el-timeline-item>
        </el-timeline>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { API_DATA } from '../config/api'
import { apiRequest } from '../utils/request'

const projects = ref([])
const currentProject = ref(null)
const detail = ref(null)
const detailVisible = ref(false)

const projectDialogVisible = ref(false)
const planDialogVisible = ref(false)
const deviceDialogVisible = ref(false)
const riskDialogVisible = ref(false)

const projectForm = reactive({ project_name: '', project_code: '', location: '', owner_unit: '', start_date: '', description: '' })
const planForm = reactive({ plan_name: '', frequency: '', monitor_items_text: '', threshold_rules_text: '', responsible_person: '' })
const deviceForm = reactive({ device_name: '', device_code: '', device_type: '', install_location: '', install_time: '', data_source: '' })
const riskForm = reactive({ risk_level: 'low', conclusion: '', measures: '' })

const stages = {
  project_created: '项目创建',
  plan_configured: '监测方案配置',
  device_installed: '设备安装',
  data_connected: '数据接入',
  auto_monitoring: '自动监测',
  risk_analysis: '风险分析',
  report_generated: '报告生成',
}

function stageLabel(stage) {
  return stages[stage] || stage || '-'
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

async function loadProjects() {
  try {
    const data = await request(`${API_DATA}/api/projects`)
    projects.value = data.data || []
  } catch (error) {
    ElMessage.error(error.message)
  }
}

function openProjectDialog() {
  Object.assign(projectForm, { project_name: '', project_code: '', location: '', owner_unit: '', start_date: '', description: '' })
  projectDialogVisible.value = true
}

async function submitProject() {
  await request(`${API_DATA}/api/projects`, { method: 'POST', body: JSON.stringify(projectForm) })
  projectDialogVisible.value = false
  ElMessage.success('项目创建成功')
  loadProjects()
}

async function loadDetail(row) {
  const data = await request(`${API_DATA}/api/projects/${row.id}`)
  detail.value = data.data
  detailVisible.value = true
}

function openPlanDialog(row) {
  currentProject.value = row
  Object.assign(planForm, { plan_name: '', frequency: '', monitor_items_text: '', threshold_rules_text: '', responsible_person: '' })
  planDialogVisible.value = true
}

async function submitPlan() {
  const payload = {
    plan_name: planForm.plan_name,
    frequency: planForm.frequency,
    monitor_items: planForm.monitor_items_text.split('\n').map(s => s.trim()).filter(Boolean),
    threshold_rules: planForm.threshold_rules_text.split('\n').map(s => s.trim()).filter(Boolean),
    responsible_person: planForm.responsible_person,
  }
  await request(`${API_DATA}/api/projects/${currentProject.value.id}/plans`, { method: 'POST', body: JSON.stringify(payload) })
  planDialogVisible.value = false
  ElMessage.success('方案已保存')
  loadProjects()
}

function openDeviceDialog(row) {
  currentProject.value = row
  Object.assign(deviceForm, { device_name: '', device_code: '', device_type: '', install_location: '', install_time: '', data_source: '' })
  deviceDialogVisible.value = true
}

async function submitDevice() {
  await request(`${API_DATA}/api/projects/${currentProject.value.id}/devices`, { method: 'POST', body: JSON.stringify(deviceForm) })
  deviceDialogVisible.value = false
  ElMessage.success('设备已登记')
  loadProjects()
}

function openRiskDialog(row) {
  currentProject.value = row
  Object.assign(riskForm, { risk_level: 'low', conclusion: '', measures: '' })
  riskDialogVisible.value = true
}

async function submitRisk() {
  await request(`${API_DATA}/api/projects/${currentProject.value.id}/risk-analysis`, { method: 'POST', body: JSON.stringify(riskForm) })
  riskDialogVisible.value = false
  ElMessage.success('风险分析已保存')
  loadProjects()
}

onMounted(loadProjects)
</script>

<style scoped>
.project-lifecycle {
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
