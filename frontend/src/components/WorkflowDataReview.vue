<template>
  <div class="workflow-data-review">
    <el-card class="step-card">
      <template #header>
        <div class="card-header">
          <div>
            <h3>数据核验</h3>
            <p>确认本次报告的数据边界、覆盖情况和时间连续性。</p>
          </div>
          <el-button @click="openDataView">进入完整数据查看</el-button>
        </div>
      </template>

      <div class="scope-line">
        <span><small>标段</small><strong>{{ scopeSections }}</strong></span>
        <span><small>边坡</small><strong>{{ selectedSlopes.length }} 处</strong></span>
        <span><small>监测类型</small><strong>{{ selectedTypes.length }} 类</strong></span>
        <span><small>有效数据</small><strong>{{ selectedData.length }} 条</strong></span>
        <span><small>统计范围</small><strong>{{ scopeDateRange }}</strong></span>
      </div>

      <el-alert v-if="issues.length" type="warning" :closable="false" show-icon class="review-alert">
        <template #title>发现 {{ issues.length }} 项需要留意的数据情况</template>
        <template #default><ul><li v-for="item in issues" :key="item">{{ item }}</li></ul></template>
      </el-alert>
      <el-alert v-else title="当前数据范围通过基础核验，可以继续选择报告模板" type="success" :closable="false" show-icon class="review-alert" />

      <el-table :data="summaryRows" border stripe>
        <el-table-column prop="slope" label="边坡" min-width="180" />
        <el-table-column prop="type" label="监测类型" min-width="170" />
        <el-table-column prop="pointCount" label="测点数" width="90" align="center" />
        <el-table-column prop="dataCount" label="数据量" width="90" align="center" />
        <el-table-column prop="firstDate" label="首期日期" width="120" />
        <el-table-column prop="lastDate" label="末期日期" width="120" />
        <el-table-column prop="status" label="核验" width="100" align="center">
          <template #default="{ row }"><el-tag :type="row.status === '可分析' ? 'success' : 'warning'" effect="plain">{{ row.status }}</el-tag></template>
        </el-table-column>
      </el-table>

      <div class="step-actions">
        <el-button @click="emit('prev')">返回修改范围</el-button>
        <el-button type="primary" @click="confirmReview">确认数据并选择模板</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const props = defineProps({ workflowData: { type: Object, required: true } })
const emit = defineEmits(['next', 'prev'])
const router = useRouter()
const selectedData = computed(() => props.workflowData?.dataEntry?.selectedData || [])
const selectedSlopes = computed(() => props.workflowData?.dataEntry?.selectedSlopes || [])
const selectedTypes = computed(() => props.workflowData?.scope?.monitoringTypes || props.workflowData?.dataEntry?.monitoringTypes || [])
const scopeSections = computed(() => (props.workflowData?.scope?.sections || []).join('、') || '未限定')
const scopeDateRange = computed(() => {
  const range = props.workflowData?.scope?.dateRange || []
  return range.length === 2 ? `${range[0]} 至 ${range[1]}` : '全部已录入日期'
})

const summaryRows = computed(() => {
  const groups = new Map()
  selectedData.value.forEach(item => {
    const key = `${item.slopeId}|${item.monitoringType}`
    if (!groups.has(key)) groups.set(key, { slope: item.slope || '-', type: item.monitoringType || '-', pointIds: new Set(), dates: [], dataCount: 0 })
    const group = groups.get(key)
    group.pointIds.add(String(item.pointId || item.pointName || ''))
    if (item.monitorDate) group.dates.push(item.monitorDate)
    group.dataCount += 1
  })
  return [...groups.values()].map(group => {
    const dates = [...new Set(group.dates)].sort()
    return {
      slope: group.slope,
      type: group.type,
      pointCount: group.pointIds.size,
      dataCount: group.dataCount,
      firstDate: dates[0] || '-',
      lastDate: dates[dates.length - 1] || '-',
      status: dates.length >= 2 ? '可分析' : '仅一期',
    }
  })
})

const issues = computed(() => {
  const result = []
  const expected = selectedSlopes.value.length * selectedTypes.value.length
  if (expected && summaryRows.value.length < expected) result.push('部分边坡在所选监测类型下没有有效数据。')
  const single = summaryRows.value.filter(item => item.status === '仅一期')
  if (single.length) result.push(`${single.length} 个“边坡—监测类型”组合只有一期数据，不能计算变化趋势和变化速率。`)
  if (!props.workflowData?.scope?.dateRange?.length) result.push('当前未限定时间范围，报告将使用该边坡全部已录入数据。')
  return result
})

function openDataView() {
  const scope = props.workflowData?.scope || {}
  const query = {}
  if (scope.slopeIds?.length === 1) query.slopeId = scope.slopeIds[0]
  if (scope.monitoringTypes?.length === 1) query.monitoringType = scope.monitoringTypes[0]
  router.push({ path: '/data-view', query })
}

function confirmReview() {
  props.workflowData.dataReview = {
    reviewedAt: new Date().toISOString(),
    issues: [...issues.value],
    summary: summaryRows.value.map(item => ({ ...item })),
  }
  ElMessage.success('数据范围已核验')
  emit('next')
}
</script>

<style scoped>
.workflow-data-review { margin:20px 0; }.step-card { box-shadow:0 2px 12px rgba(0,0,0,.08); }
.card-header { display:flex; align-items:center; justify-content:space-between; gap:20px; }.card-header h3 { margin:0; font-size:17px; }.card-header p { margin:5px 0 0; color:#8492a6; font-size:13px; }
.scope-line { display:grid; grid-template-columns:1fr .7fr .8fr .8fr 1.4fr; margin-bottom:18px; border:1px solid #dfe7ed; background:#fbfcfd; }
.scope-line span { min-width:0; padding:13px 16px; border-right:1px solid #e7edf1; }.scope-line span:last-child { border-right:0; }.scope-line small,.scope-line strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.scope-line small { color:#8492a6; font-size:11px; }.scope-line strong { margin-top:6px; color:#25445e; font-size:14px; }
.review-alert { margin-bottom:18px; }.review-alert ul { margin:5px 0 0; padding-left:20px; }.step-actions { display:flex; justify-content:space-between; margin-top:22px; }
@media(max-width:800px){.scope-line{grid-template-columns:1fr 1fr}.scope-line span{border-bottom:1px solid #e7edf1}.card-header{align-items:flex-start;flex-direction:column}}
</style>
