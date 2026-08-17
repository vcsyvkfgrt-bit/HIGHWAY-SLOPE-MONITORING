<template>
  <div class="report-list">
    <el-card>
      <template #header>
        <div class="header">
          <div>
            <div class="title">报告列表</div>
            <div class="subtitle">查看、归档和重新导出已生成的监测报告</div>
          </div>
          <el-button type="primary" @click="router.push('/report-generate')">生成新报告</el-button>
        </div>
      </template>

      <div class="filters">
        <el-select v-model="query.report_type" clearable placeholder="报告类型" @change="loadReports">
          <el-option label="周报" value="weekly" />
          <el-option label="月报" value="monthly" />
          <el-option label="自定义" value="custom" />
        </el-select>
        <el-select v-model="query.status" clearable placeholder="状态" @change="loadReports">
          <el-option label="草稿" value="draft" />
          <el-option label="待审核" value="pending_review" />
          <el-option label="已审核" value="reviewed" />
          <el-option label="已导出" value="exported" />
          <el-option label="已归档" value="archived" />
        </el-select>
        <el-input v-model="query.q" clearable placeholder="搜索标题/编制人/审核人" @keyup.enter="loadReports" />
        <el-checkbox v-model="query.include_archived" @change="loadReports">包含归档</el-checkbox>
        <el-button :icon="Search" @click="loadReports">查询</el-button>
      </div>

      <el-table v-loading="loading" :data="reports" border>
        <el-table-column prop="title" label="报告标题" min-width="220" show-overflow-tooltip />
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">{{ typeLabel(row.report_type) }}</template>
        </el-table-column>
        <el-table-column prop="report_period" label="周期" width="120" align="center" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" effect="plain">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="version_no" label="版本" width="70" align="center" />
        <el-table-column prop="author" label="编制人" width="110" align="center" />
        <el-table-column prop="reviewer" label="审核人" width="110" align="center" />
        <el-table-column prop="report_date" label="报告日期" width="120" align="center" />
        <el-table-column prop="updated_by_name" label="更新人" width="110" align="center" />
        <el-table-column prop="updated_at" label="更新时间" width="180" align="center" />
        <el-table-column label="操作" width="260" align="center" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">查看</el-button>
            <el-button size="small" type="primary" @click="exportWord(row)">导出 Word</el-button>
            <el-button
              size="small"
              :type="row.status === 'archived' ? 'warning' : 'success'"
              @click="toggleArchive(row)"
            >
              {{ row.status === 'archived' ? '取消归档' : '归档' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-drawer v-model="detailVisible" title="报告详情" size="52%">
      <div v-if="detail.report">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="标题">{{ detail.report.title }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusLabel(detail.report.status) }}</el-descriptions-item>
          <el-descriptions-item label="编制人">{{ detail.report.author || '-' }}</el-descriptions-item>
          <el-descriptions-item label="审核人">{{ detail.report.reviewer || '-' }}</el-descriptions-item>
          <el-descriptions-item label="报告日期">{{ detail.report.report_date || '-' }}</el-descriptions-item>
          <el-descriptions-item label="版本">V{{ detail.report.version_no }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">报告内容</el-divider>
        <div class="content-preview">
          <div v-for="item in contentItems(detail.report.content_json?.moduleContents)" :key="item.key" class="content-item">
            <h4>{{ item.key }}</h4>
            <p>{{ item.value || '未填写' }}</p>
          </div>
        </div>

        <el-divider content-position="left">版本记录</el-divider>
        <el-table :data="detail.versions" border size="small">
          <el-table-column prop="version_no" label="版本" width="80" align="center" />
          <el-table-column prop="title" label="标题" min-width="180" />
          <el-table-column prop="created_by_name" label="保存人" width="100" />
          <el-table-column prop="created_at" label="保存时间" width="180" />
        </el-table>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { API_DATA } from '../config/api'
import { exportReportToWord } from '../utils/reportExport'

const router = useRouter()
const loading = ref(false)
const reports = ref([])
const detailVisible = ref(false)
const detail = reactive({ report: null, versions: [] })
const query = reactive({
  report_type: '',
  status: '',
  q: '',
  include_archived: false,
})

function headers(extra = {}) {
  return { ...extra, Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: headers(options.headers || {}) })
  const data = await response.json()
  if (!response.ok || !data.success) throw new Error(data.message || '请求失败')
  return data.data
}

function typeLabel(type) {
  return ({ weekly: '周报', monthly: '月报', custom: '自定义' })[type] || type
}

function statusLabel(status) {
  return ({
    draft: '草稿',
    pending_review: '待审核',
    reviewed: '已审核',
    exported: '已导出',
    archived: '已归档',
  })[status] || status
}

function statusType(status) {
  if (status === 'archived') return 'info'
  if (status === 'reviewed' || status === 'exported') return 'success'
  if (status === 'pending_review') return 'warning'
  return ''
}

function contentItems(contents = {}) {
  return Object.entries(contents || {}).map(([key, value]) => ({ key, value }))
}

async function loadReports() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (query.report_type) params.append('report_type', query.report_type)
    if (query.status) params.append('status', query.status)
    if (query.q) params.append('q', query.q)
    if (query.include_archived) params.append('include_archived', 'true')
    reports.value = await request(`${API_DATA}/api/reports?${params}`)
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '加载报告列表失败')
  } finally {
    loading.value = false
  }
}

async function openDetail(row) {
  try {
    const data = await request(`${API_DATA}/api/reports/${row.id}`)
    detail.report = data.report
    detail.versions = data.versions || []
    detailVisible.value = true
  } catch (error) {
    ElMessage.error(error.message || '加载报告详情失败')
  }
}

async function exportWord(row) {
  try {
    const data = await request(`${API_DATA}/api/reports/${row.id}`)
    await exportReportToWord(data.report)
    await request(`${API_DATA}/api/reports/${row.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: data.report.status === 'archived' ? 'archived' : 'exported' }),
    })
    ElMessage.success('Word 已导出')
    loadReports()
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '导出 Word 失败')
  }
}

async function toggleArchive(row) {
  try {
    await request(`${API_DATA}/api/reports/${row.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: row.status === 'archived' ? 'draft' : 'archived' }),
    })
    ElMessage.success(row.status === 'archived' ? '已取消归档' : '已归档')
    loadReports()
  } catch (error) {
    ElMessage.error(error.message || '操作失败')
  }
}

onMounted(loadReports)
</script>

<style scoped>
.report-list {
  max-width: 1280px;
  margin: 0 auto;
}

.header,
.filters {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header {
  justify-content: space-between;
}

.title {
  font-size: 18px;
  font-weight: 700;
}

.subtitle {
  margin-top: 4px;
  color: #909399;
  font-size: 13px;
}

.filters {
  margin-bottom: 16px;
}

.filters .el-select {
  width: 150px;
}

.filters .el-input {
  width: 280px;
}

.content-preview {
  display: grid;
  gap: 12px;
}

.content-item {
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fafcff;
}

.content-item h4 {
  margin: 0 0 8px;
  color: #303133;
}

.content-item p {
  margin: 0;
  white-space: pre-wrap;
  color: #606266;
  line-height: 1.6;
}
</style>
