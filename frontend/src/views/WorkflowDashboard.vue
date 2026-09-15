<template>
  <div class="monitoring-workbench" v-loading="loading">
    <header class="workbench-header">
      <div>
        <span class="eyebrow">MONITORING DESK · {{ today }}</span>
        <h1>监测工作台</h1>
        <p>从数据完整性、现场巡查和活动预警出发，组织当天需要推进的工作。</p>
      </div>
      <div class="header-actions">
        <el-select v-model="section" clearable filterable placeholder="全部标段" @change="loadWorkbench">
          <el-option v-for="item in sections" :key="item" :label="item" :value="item" />
        </el-select>
        <el-button @click="loadWorkbench">刷新</el-button>
        <el-button type="primary" @click="router.push('/report-generate')">生成监测报告</el-button>
      </div>
    </header>

    <section class="status-rail">
      <button v-for="item in statusItems" :key="item.label" type="button" @click="router.push(item.path)">
        <span>{{ item.label }}</span>
        <strong :class="item.tone">{{ item.value }}</strong>
        <small>{{ item.note }}</small>
      </button>
    </section>

    <div class="workbench-grid">
      <section class="priority-panel">
        <div class="section-heading">
          <div>
            <span class="section-index">今日研判</span>
            <h2>需要优先处理</h2>
          </div>
          <el-button link type="primary" @click="router.push('/map-overview')">进入空间态势</el-button>
        </div>
        <div class="priority-list">
          <button v-for="item in priorities" :key="item.title" type="button" @click="router.push(item.path)">
            <i :class="item.tone"></i>
            <span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span>
            <b>{{ item.value }}</b>
          </button>
        </div>
      </section>

      <aside class="action-panel">
        <div class="section-heading">
          <div>
            <span class="section-index">快捷入口</span>
            <h2>继续工作</h2>
          </div>
        </div>
        <button v-for="action in quickActions" :key="action.title" type="button" @click="router.push(action.path)">
          <span><strong>{{ action.title }}</strong><small>{{ action.note }}</small></span>
          <b>→</b>
        </button>
      </aside>
    </div>

    <section class="recent-reports">
      <div class="section-heading">
        <div>
          <span class="section-index">成果追踪</span>
          <h2>最近报告</h2>
        </div>
        <el-button link type="primary" @click="router.push('/report-list')">查看全部报告</el-button>
      </div>
      <el-table :data="reports" :show-header="reports.length > 0" empty-text="尚无报告，完成数据核验后可生成第一份报告">
        <el-table-column prop="title" label="报告" min-width="260" />
        <el-table-column label="类型" width="100"><template #default="{ row }">{{ reportTypeLabel(row.report_type) }}</template></el-table-column>
        <el-table-column prop="author" label="编制人" width="120" />
        <el-table-column prop="report_date" label="报告日期" width="130" />
        <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag effect="plain">{{ reportStatusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column width="90" align="right"><template #default="{ row }"><el-button link type="primary" @click="router.push('/report-list')">查看</el-button></template></el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { API_DATA } from '../config/api'

const router = useRouter()
const loading = ref(false)
const section = ref('')
const slopes = ref([])
const overview = ref({ slope_count: 0, point_count: 0, missing_count: 0, alarm_count: 0 })
const inspection = ref({ open_rectifications: 0, overdue_rectifications: 0, month_inspections: 0, overdue_plans: 0 })
const reports = ref([])
const today = new Date().toISOString().slice(0, 10)
const sections = computed(() => [...new Set(slopes.value.map(item => item.section).filter(Boolean))])

function headers() {
  return { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
}

async function getJson(url) {
  const response = await fetch(url, { headers: headers() })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.message || '加载失败')
  return result.data
}

const statusItems = computed(() => [
  { label: '纳入监测边坡', value: overview.value.slope_count || 0, note: section.value || '全部标段', path: '/data-view', tone: '' },
  { label: '实体监测点', value: overview.value.point_count || 0, note: '当前筛选范围', path: '/slope-management', tone: '' },
  { label: '30天未更新', value: overview.value.missing_count || 0, note: '需要核查监测计划', path: '/data-view', tone: overview.value.missing_count ? 'warning' : '' },
  { label: '活动预警', value: overview.value.alarm_count || 0, note: '尚未关闭', path: '/alarm-management', tone: overview.value.alarm_count ? 'danger' : '' },
  { label: '本月巡查', value: inspection.value.month_inspections || 0, note: '现场记录', path: '/inspection-management', tone: '' },
])

const priorities = computed(() => [
  { title: '监测数据更新', description: '超过30天没有有效数据的测点', value: `${overview.value.missing_count || 0} 点`, path: '/data-view', tone: 'warning' },
  { title: '异常预警处置', description: '需要确认、复核或关闭的活动预警', value: `${overview.value.alarm_count || 0} 条`, path: '/alarm-management', tone: 'danger' },
  { title: '巡查整改闭环', description: '现场问题尚未完成整改复核', value: `${inspection.value.open_rectifications || 0} 项`, path: '/inspection-management', tone: 'attention' },
  { title: '逾期巡查计划', description: '计划日期已经到期但尚未执行', value: `${inspection.value.overdue_plans || 0} 项`, path: '/inspection-management', tone: 'muted' },
])

const quickActions = [
  { title: '录入监测数据', note: '按标段、边坡和监测类型录入', path: '/data-entry' },
  { title: '查看监测变化', note: '核验频率、变化量与变化速率', path: '/data-view' },
  { title: '新增边坡巡查', note: '记录现场情况并跟踪整改', path: '/inspection-management' },
  { title: '生成监测报告', note: '从真实数据范围开始组织报告', path: '/report-generate' },
]

function reportTypeLabel(value) {
  return ({ weekly: '周报', monthly: '月报', custom: '自定义' })[value] || value || '-'
}

function reportStatusLabel(value) {
  return ({ draft: '草稿', pending_review: '待审核', reviewed: '已审核', exported: '已导出', archived: '已归档' })[value] || value || '-'
}

async function loadWorkbench() {
  loading.value = true
  try {
    if (!slopes.value.length) slopes.value = await getJson(`${API_DATA}/api/slopes`)
    const params = new URLSearchParams({ cutoff: today })
    if (section.value) params.set('section', section.value)
    const inspectionParams = section.value ? `?section=${encodeURIComponent(section.value)}` : ''
    const [overviewData, inspectionData, reportData] = await Promise.all([
      getJson(`${API_DATA}/api/monitoring-data/overview?${params}`),
      getJson(`${API_DATA}/api/inspections/dashboard${inspectionParams}`),
      getJson(`${API_DATA}/api/reports?include_archived=false`),
    ])
    overview.value = overviewData.summary || overview.value
    inspection.value = inspectionData || inspection.value
    reports.value = (reportData || []).slice(0, 5)
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '工作台数据加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadWorkbench)
</script>

<style scoped>
.monitoring-workbench { --ink:#17324d; --line:#dce5ec; --muted:#708395; max-width:1440px; margin:0 auto; color:var(--ink); }
.workbench-header { display:flex; align-items:flex-end; justify-content:space-between; gap:32px; padding:14px 4px 24px; border-bottom:2px solid var(--ink); }
.eyebrow,.section-index { color:#5d7c93; font-family:Consolas,"Microsoft YaHei",sans-serif; font-size:11px; letter-spacing:.12em; }
h1 { margin:8px 0 6px; font-family:"Microsoft YaHei",sans-serif; font-size:30px; line-height:1.2; letter-spacing:.04em; }
.workbench-header p { margin:0; color:var(--muted); font-size:14px; }
.header-actions { display:flex; align-items:center; gap:10px; }
.header-actions .el-select { width:180px; }
.status-rail { display:grid; grid-template-columns:repeat(5,1fr); border-bottom:1px solid var(--line); }
.status-rail button { min-width:0; padding:20px 18px; border:0; border-right:1px solid var(--line); background:#fff; color:inherit; cursor:pointer; text-align:left; }
.status-rail button:first-child { border-left:1px solid var(--line); }
.status-rail span,.status-rail small { display:block; color:var(--muted); font-size:12px; }
.status-rail strong { display:block; margin:8px 0 5px; font-family:Arial,sans-serif; font-size:27px; }
.status-rail strong.warning { color:#b56a00; }.status-rail strong.danger { color:#c23b33; }
.workbench-grid { display:grid; grid-template-columns:minmax(0,1.65fr) minmax(300px,.75fr); gap:18px; margin-top:22px; }
.priority-panel,.action-panel,.recent-reports { border:1px solid var(--line); background:#fff; }
.section-heading { display:flex; align-items:center; justify-content:space-between; min-height:64px; padding:0 20px; border-bottom:1px solid var(--line); }
.section-heading h2 { margin:4px 0 0; font-size:17px; }
.priority-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
.priority-list button { display:grid; grid-template-columns:5px minmax(0,1fr) auto; gap:14px; align-items:center; min-height:86px; padding:15px 18px; border:0; border-right:1px solid var(--line); border-bottom:1px solid var(--line); background:#fff; color:inherit; cursor:pointer; text-align:left; }
.priority-list button:nth-child(2n) { border-right:0; }.priority-list button:nth-last-child(-n+2) { border-bottom:0; }
.priority-list i { width:4px; height:34px; background:#7697ad; }.priority-list i.warning{background:#d69a2d}.priority-list i.danger{background:#c94a43}.priority-list i.attention{background:#8f6dad}.priority-list i.muted{background:#9ba8b2}
.priority-list span strong,.priority-list span small,.action-panel span strong,.action-panel span small { display:block; }
.priority-list span strong,.action-panel strong { font-size:14px; }.priority-list span small,.action-panel small { margin-top:5px; color:var(--muted); font-size:12px; }
.priority-list b { font-family:Arial,sans-serif; font-size:18px; white-space:nowrap; }
.action-panel>button { display:flex; align-items:center; justify-content:space-between; width:100%; min-height:66px; padding:12px 20px; border:0; border-bottom:1px solid var(--line); background:#fff; color:inherit; cursor:pointer; text-align:left; }
.action-panel>button:last-child { border-bottom:0; }.action-panel>button b { color:#3a7dad; font-size:20px; }
.recent-reports { margin-top:18px; }
@media(max-width:1000px){.workbench-header{align-items:flex-start;flex-direction:column}.status-rail{grid-template-columns:repeat(2,1fr)}.workbench-grid{grid-template-columns:1fr}}
@media(max-width:640px){.header-actions{align-items:stretch;flex-direction:column;width:100%}.header-actions .el-select{width:100%}.status-rail,.priority-list{grid-template-columns:1fr}.status-rail button,.priority-list button{border-right:0;border-bottom:1px solid var(--line)}.priority-list button:nth-last-child(-n+2){border-bottom:1px solid var(--line)}.priority-list button:last-child{border-bottom:0}}
</style>
