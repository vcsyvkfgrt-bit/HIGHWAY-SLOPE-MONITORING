<template>
  <div class="report-list">
    <el-card>
      <template #header>
        <div class="header">
          <div>
            <div class="title">报告列表</div>
            <div class="subtitle">查看、归档、删除和重新导出已生成的监测报告</div>
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
        <el-table-column label="操作" width="480" align="center" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">查看</el-button>
            <el-button size="small" @click="openQuality(row)">质量检查</el-button>
            <el-button size="small" @click="previewWordLayout(row)">版式预览</el-button>
            <el-button size="small" type="primary" @click="exportWord(row)">导出 Word</el-button>
            <el-button
              size="small"
              :type="row.status === 'archived' ? 'warning' : 'success'"
              @click="toggleArchive(row)"
            >
              {{ row.status === 'archived' ? '取消归档' : '归档' }}
            </el-button>
            <el-button
              size="small"
              type="danger"
              plain
              :loading="deletingId === row.id"
              @click="deleteReport(row)"
            >
              删除
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
          <el-table-column label="版本对比" width="110" align="center">
            <template #default="{ row }">
              <el-button link type="primary" :disabled="row.version_no === detail.report.version_no" @click="compareVersion(row)">与当前比较</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="versionComparison" class="version-comparison">
          <strong>V{{ versionComparison.versionNo }} → V{{ detail.report.version_no }}</strong>
          <span v-if="!versionComparison.items.length">正文模块没有变化</span>
          <div v-for="item in versionComparison.items" :key="item.key">
            <b>{{ item.key }}</b><span>{{ item.message }}</span>
          </div>
        </div>
      </div>
    </el-drawer>

    <el-dialog v-model="qualityVisible" title="报告质量检查" width="min(860px, 92vw)">
      <div v-loading="qualityLoading">
        <div v-if="qualityReport" class="quality-overview" :class="['is-' + qualityReport.level]">
          <div><small>质量得分</small><strong>{{ qualityReport.score }}</strong></div>
          <span>{{ qualityLevelLabel(qualityReport.level) }}</span>
          <span>{{ qualityReport.counts.error }} 项必须修正</span>
          <span>{{ qualityReport.counts.warning }} 项建议复核</span>
          <span>{{ qualityReport.counts.info }} 项提示</span>
        </div>
        <div v-if="qualityReport" class="quality-list">
          <div v-for="(item, index) in qualityReport.checks" :key="item.code + '-' + index" class="quality-item">
            <el-tag :type="qualitySeverityType(item.severity)" effect="plain" size="small">
              {{ item.severity === 'error' ? '必须修正' : item.severity === 'warning' ? '复核' : '提示' }}
            </el-tag>
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.message }}</p>
              <small v-if="item.location">位置：{{ item.location }}</small>
              <small v-if="item.action">建议：{{ item.action }}</small>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="qualityVisible = false">关闭</el-button>
        <el-button v-if="qualityTarget" type="primary" plain @click="previewWordLayout(qualityTarget)">打开版式预览</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { API_DATA } from '../config/api'
import { exportReportToWord, inspectReportForExport, previewReportAsPdf } from '../utils/reportExport'
import { inspectSavedReportQuality, qualityLevelLabel, qualitySeverityType } from '../utils/reportQuality'

const router = useRouter()
const loading = ref(false)
const reports = ref([])
const deletingId = ref(null)
const detailVisible = ref(false)
const detail = reactive({ report: null, versions: [] })
const qualityVisible = ref(false)
const qualityLoading = ref(false)
const qualityReport = ref(null)
const qualityTarget = ref(null)
const versionComparison = ref(null)
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
    versionComparison.value = null
    detailVisible.value = true
  } catch (error) {
    ElMessage.error(error.message || '加载报告详情失败')
  }
}

async function openQuality(row) {
  qualityVisible.value = true
  qualityLoading.value = true
  qualityTarget.value = row
  qualityReport.value = null
  try {
    qualityReport.value = await inspectSavedReportQuality(row.id)
  } catch (error) {
    ElMessage.error(error.message || '报告质量检查失败')
  } finally {
    qualityLoading.value = false
  }
}

function diffModuleContents(oldContents = {}, currentContents = {}) {
  const keys = [...new Set([...Object.keys(oldContents || {}), ...Object.keys(currentContents || {})])]
  return keys
    .filter(key => String(oldContents?.[key] || '') !== String(currentContents?.[key] || ''))
    .map(key => {
      if (!(key in (oldContents || {}))) return { key, message: '当前版本新增' }
      if (!(key in (currentContents || {}))) return { key, message: '当前版本已删除' }
      return { key, message: '内容已修改（' + String(oldContents[key] || '').length + ' → ' + String(currentContents[key] || '').length + ' 字）' }
    })
}

async function compareVersion(row) {
  try {
    const oldVersion = await request(API_DATA + '/api/reports/' + detail.report.id + '/versions/' + row.version_no)
    versionComparison.value = {
      versionNo: row.version_no,
      items: diffModuleContents(oldVersion.content_json?.moduleContents, detail.report.content_json?.moduleContents),
    }
  } catch (error) {
    ElMessage.error(error.message || '加载历史版本失败')
  }
}

async function exportWord(row) {
  try {
    const data = await request(`${API_DATA}/api/reports/${row.id}`)
    const quality = await inspectSavedReportQuality(row.id)
    if (!quality.canExport) {
      qualityTarget.value = row
      qualityReport.value = quality
      qualityVisible.value = true
      throw new Error('报告仍有 ' + quality.counts.error + ' 项必须修正的问题，暂不能导出')
    }
    const inspection = inspectReportForExport(data.report)
    if (inspection.warnings.length) {
      await ElMessageBox.confirm(
        `导出检查发现以下事项：\n${inspection.warnings.slice(0, 6).map(item => `· ${item}`).join('\n')}\n\n是否仍然导出？`,
        'Word 导出检查',
        { confirmButtonText: '仍然导出', cancelButtonText: '返回修改', type: 'warning' }
      )
    }
    await exportReportToWord(data.report)
    await request(`${API_DATA}/api/reports/${row.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: data.report.status === 'archived' ? 'archived' : 'exported' }),
    })
    ElMessage.success('Word 已导出')
    loadReports()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    console.error(error)
    ElMessage.error(error.message || '导出 Word 失败')
  }
}

async function previewWordLayout(row) {
  try {
    const data = await request(`${API_DATA}/api/reports/${row.id}`)
    const inspection = inspectReportForExport(data.report)
    if (inspection.errors.length) throw new Error(inspection.errors.join('；'))
    if (inspection.warnings.length) {
      await ElMessageBox.confirm(
        `预览检查发现以下事项：\n${inspection.warnings.slice(0, 6).map(item => `· ${item}`).join('\n')}\n\n是否继续生成预览？`,
        'Word 版式检查',
        { confirmButtonText: '继续预览', cancelButtonText: '返回修改', type: 'warning' }
      )
    }
    await previewReportAsPdf(data.report)
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    console.error(error)
    ElMessage.error(error.message || 'Word 版式预览失败')
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

async function deleteReport(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除报告“${row.title}”吗？报告正文及全部版本记录将同时删除，删除后无法恢复。`,
      '删除报告',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning',
        closeOnClickModal: false,
      }
    )
    deletingId.value = row.id
    await request(`${API_DATA}/api/reports/${row.id}`, { method: 'DELETE' })
    if (detail.report?.id === row.id) {
      detailVisible.value = false
      detail.report = null
      detail.versions = []
    }
    ElMessage.success('报告已删除')
    await loadReports()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error.message || '删除报告失败')
  } finally {
    deletingId.value = null
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

.version-comparison {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding: 12px 14px;
  border-left: 3px solid #315f7d;
  background: #f7f9fa;
  color: #5c6f7c;
  font-size: 12px;
}

.version-comparison > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-top: 7px;
  border-top: 1px solid #e2e8ec;
}

.version-comparison b { color: #263f50; }

.quality-overview {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 12px 16px;
  border: 1px solid #dbe3e7;
  background: #fafcfd;
  color: #60727e;
  font-size: 12px;
}

.quality-overview.is-blocked { border-left: 4px solid #b84d4d; }
.quality-overview.is-review { border-left: 4px solid #b48732; }
.quality-overview.is-ready { border-left: 4px solid #39765d; }
.quality-overview > div { display: flex; align-items: baseline; gap: 7px; }
.quality-overview strong { color: #233f50; font: 700 28px/1 Georgia, serif; }
.quality-list { display: grid; gap: 8px; margin-top: 14px; }
.quality-item { display: grid; grid-template-columns: 76px 1fr; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #e7ecef; }
.quality-item strong { color: #263e4d; font-size: 13px; }
.quality-item p { margin: 3px 0; color: #5e707b; font-size: 12px; }
.quality-item small { display: block; color: #87949c; }
</style>
