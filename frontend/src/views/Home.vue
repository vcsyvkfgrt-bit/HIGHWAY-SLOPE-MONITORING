<template>
  <div class="workflow-home">
    <el-card class="workflow-card">
      <template #header>
        <div class="workflow-header">
          <h2>高速公路高边坡及不良地质监测预警报告生成</h2>
          <p class="subtitle">先确认数据边界与完整性，再组织模板、内容和成果文件</p>
        </div>
      </template>

      <!-- 工作流导航 -->
      <div class="workflow-navigation">
        <el-steps :active="currentStep" :space="200" finish-status="success">
          <el-step 
            v-for="(step, index) in workflowSteps" 
            :key="index"
            :title="step.title"
            :description="step.description"
          >
            <template #icon>
              <div class="step-icon" :class="{ 'completed': index < currentStep, 'active': index === currentStep }">
                {{ index + 1 }}
              </div>
            </template>
          </el-step>
        </el-steps>
      </div>

      <!-- 工作流内容 -->
      <div class="workflow-content">
        <!-- 步骤1：数据选择 -->
        <div v-if="currentStep === 0" class="step-content">
          <DataEntryWorkflow :workflow-data="workflowData" @next="nextStep" />
        </div>

        <!-- 步骤2：数据核验 -->
        <div v-if="currentStep === 1" class="step-content">
          <WorkflowDataReview :workflow-data="workflowData" @next="nextStep" @prev="prevStep" />
        </div>

        <!-- 步骤3：模板选择 -->
        <div v-if="currentStep === 2" class="step-content">
          <TemplateSelectWorkflow :workflow-data="workflowData" @next="nextStep" @prev="prevStep" />
        </div>

        <!-- 步骤4：报告生成 -->
        <div v-if="currentStep === 3" class="step-content">
          <ReportGenerateWorkflow 
            :workflow-data="workflowData" 
            :sub-steps="workflowSteps[3].subSteps"
            :current-sub-step="currentSubStep"
            @next="nextStep" 
            @prev="prevStep" 
          />
        </div>

        <!-- 步骤5：报告导出 -->
        <div v-if="currentStep === 4" class="step-content">
          <div class="export-step">
            <div class="export-icon">
              <el-icon :size="64" color="#409eff"><Document /></el-icon>
            </div>
            <h3>报告导出</h3>
            <p class="export-message">请选择要下载的报告格式</p>
            
            <div class="export-actions">
              <el-button size="large" @click="previewWordLayout">
                <el-icon><DocumentChecked /></el-icon>
                预览 Word 版式
              </el-button>
              <el-button type="primary" size="large" @click="downloadWord">
                <el-icon><Document /></el-icon>
                下载 Word 版本
              </el-button>
              <el-button type="success" size="large" @click="downloadPDF">
                <el-icon><DocumentChecked /></el-icon>
                下载 PDF 版本
              </el-button>
            </div>
            
            <el-divider />
            
            <div class="other-actions">
              <el-button @click="resetWorkflow">
                <el-icon><Refresh /></el-icon>
                开始新报告
              </el-button>
              <el-button @click="viewReports">
                <el-icon><List /></el-icon>
                查看报告列表
              </el-button>
            </div>
          </div>
        </div>
      </div>

    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'
import { API_APP, API_DATA, TEMPLATES_PATH } from '../config/api'
import { exportReportToWord, exportReportToPdf, inspectReportForExport, previewReportAsPdf } from '../utils/reportExport'
import DataEntryWorkflow from '../components/DataEntryWorkflow.vue'
import WorkflowDataReview from '../components/WorkflowDataReview.vue'
import TemplateSelectWorkflow from '../components/TemplateSelectWorkflow.vue'
import ReportGenerateWorkflow from '../components/ReportGenerateWorkflow.vue'
import { Refresh, List, Document, DocumentChecked } from '@element-plus/icons-vue'
import { renderAcademicChartImage } from '../utils/academicChart'
import { absoluteAssetUrl } from '../utils/reportMaterials'

const router = useRouter()
const route = useRoute()

// 工作流步骤
const workflowSteps = [
  {
    title: '数据选择',
    description: '选择已录入的监测数据'
  },
  {
    title: '数据核验',
    description: '确认覆盖范围和连续性'
  },
  {
    title: '模板选择',
    description: '选择报告模板类型'
  },
  {
    title: '内容补充',
    description: '填写报告各模块内容',
    subSteps: []
  },
  {
    title: '报告导出',
    description: '下载Word或PDF版本'
  }
]

// 当前步骤
const currentStep = ref(0)
// 当前子步骤
const currentSubStep = ref(0)
const CONTENT_STEP = 3

// 工作流数据
const workflowData = reactive({
  scope: {
    sections: [],
    section: '',
    slopeIds: [],
    monitoringTypes: [],
    dateRange: [],
    cutoff: new Date().toISOString().slice(0, 10),
  },
  // 数据录入
  dataEntry: {
    slope: '',
    monitoringType: '',
    date: new Date(),
    values: []
  },
  dataReview: null,
  reportMaterials: null,
  // 模板选择
  templateSelect: {
    reportType: 'weekly',
    systemTemplate: '',
    wordTemplate: '',
    preview: null
  },
  // 报告生成
  reportGenerate: {
    title: '',
    author: '',
    modules: []
  },
  // 最终报告
  report: null
})

// 根据选择的模板获取子工作流步骤
const getSubStepsByTemplate = (templateSelect) => {
  // 从模板选择数据中获取模块信息
  const preview = templateSelect?.preview
  const modules = preview?.modules || []
  
  // 提取一级标题作为子工作流步骤
  const subSteps = modules
    .map(module => ({
      title: module.name || module.content || '模块',
      description: `填写${module.name || module.content || '模块'}的内容`
    }))
  
  // 确保最后添加报告预览步骤
  if (subSteps.length > 0 && subSteps[subSteps.length - 1].title !== '报告预览') {
    subSteps.push({ title: '报告预览', description: '预览生成的报告' })
  }
  
  // 如果没有模块，返回默认步骤
  if (subSteps.length === 0) {
    return [
      { title: '报告内容', description: '填写报告内容' },
      { title: '报告预览', description: '预览生成的报告' }
    ]
  }
  
  return subSteps
}

// 下一步
const nextStep = () => {
  if (currentStep.value === CONTENT_STEP && workflowSteps[CONTENT_STEP].subSteps.length > 0) {
    // 在报告生成步骤，先完成子步骤
    if (currentSubStep.value < workflowSteps[CONTENT_STEP].subSteps.length - 1) {
      currentSubStep.value++
    } else {
      // 子步骤完成，进入完成步骤
      currentStep.value++
      currentSubStep.value = 0
    }
  } else if (currentStep.value < workflowSteps.length - 1) {
    currentStep.value++
    // 如果进入报告生成步骤，根据模板选择设置子步骤
    if (currentStep.value === CONTENT_STEP) {
      workflowSteps[CONTENT_STEP].subSteps = getSubStepsByTemplate(workflowData.templateSelect)
      currentSubStep.value = 0
    }
  }
}

// 上一步
const prevStep = () => {
  if (currentStep.value === CONTENT_STEP && workflowSteps[CONTENT_STEP].subSteps.length > 0 && currentSubStep.value > 0) {
    // 在报告生成步骤，先退回到上一个子步骤
    currentSubStep.value--
  } else if (currentStep.value > 0) {
    currentStep.value--
    currentSubStep.value = 0
  }
}

// 下载Word版本
const previewWordLayout = async () => {
  try {
    if (!workflowData.report?.id) {
      ElMessage.warning('请先完成报告生成，再预览最终 Word 版式')
      return
    }
    const response = await fetch(`${API_DATA}/api/reports/${workflowData.report.id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    })
    const result = await response.json()
    if (!response.ok || !result.success) throw new Error(result.message || '获取报告失败')
    const report = result.data.report
    const inspection = inspectReportForExport(report)
    if (inspection.warnings.length) {
      await ElMessageBox.confirm(
        `预览检查发现以下事项：\n${inspection.warnings.slice(0, 6).map(item => `· ${item}`).join('\n')}\n\n是否继续生成预览？`,
        'Word 版式检查',
        { confirmButtonText: '继续预览', cancelButtonText: '返回修改', type: 'warning' }
      )
    }
    await previewReportAsPdf(report)
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    console.error(error)
    ElMessage.error(error.message || 'Word 版式预览失败')
  }
}

const downloadWord = async () => {
  try {
    let report
    if (workflowData.report?.id) {
      const response = await fetch(`${API_DATA}/api/reports/${workflowData.report.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || '获取报告失败')
      report = result.data.report
    } else {
      const form = workflowData.reportGenerate || {}
      report = {
        title: form.title || '监测报告',
        author: form.author || '',
        reviewer: form.reviewer || '',
        report_date: form.reportDate || new Date().toISOString().slice(0, 10),
        selected_data: workflowData.dataEntry?.selectedData || [],
        chart_assets: form.chartAssets || [],
        template_snapshot: workflowData.templateSelect?.preview || null,
        content_json: {
          title: form.title,
          author: form.author,
          reviewer: form.reviewer,
          reportDate: form.reportDate,
          scope: workflowData.scope || {},
          dataReview: workflowData.dataReview || null,
          materialSummary: workflowData.reportMaterials?.summary || {},
          materialProvenance: workflowData.reportMaterials?.provenance || {},
          moduleContents: form.moduleContents || {},
          structuredContents: form.structuredContents || {},
          exportOptions: form.exportOptions || {},
        },
      }
    }
    const inspection = inspectReportForExport(report)
    if (inspection.warnings.length) {
      await ElMessageBox.confirm(
        `导出检查发现以下事项：\n${inspection.warnings.slice(0, 6).map(item => `· ${item}`).join('\n')}\n\n是否仍然导出？`,
        'Word 导出检查',
        { confirmButtonText: '仍然导出', cancelButtonText: '返回修改', type: 'warning' }
      )
    }
    await exportReportToWord(report)
    if (workflowData.report?.id) {
      await fetch(`${API_DATA}/api/reports/${workflowData.report.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ status: 'exported' }),
      })
    }
    ElMessage.success('Word报告生成成功！')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    console.error(error)
    ElMessage.error(error.message || 'Word报告生成失败')
  }
}

// 生成图表
const generateChart = async (slopeCategory = '') => {
  let selectedData = workflowData.dataEntry.selectedData || []
  if (slopeCategory) {
    selectedData = selectedData.filter(item => item.slope === slopeCategory || item.monitoringPoint?.includes(slopeCategory))
  }

  const groups = {}
  selectedData.forEach(item => {
    const pointName = item.pointName || item.monitoringPoint || item.slope || '监测点'
    const monitorDate = item.monitorDate || item.monitoringTime
    const value = Number(item.value ?? item.monitoringData)
    if (!monitorDate || !Number.isFinite(value)) return
    if (!groups[pointName]) groups[pointName] = []
    groups[pointName].push([monitorDate, value])
  })

  const series = Object.entries(groups).map(([name, data]) => ({
    name,
    data: data.sort(([a], [b]) => String(a).localeCompare(String(b))),
  }))

  return renderAcademicChartImage({
    key: `home-export-${Date.now()}`,
    kind: 'chart',
    title: slopeCategory ? `${slopeCategory} 监测数据趋势图` : '监测数据趋势图',
    chartType: 'line',
    xName: '监测日期',
    yName: '监测值',
    source: 'selected_data',
    series: series.length ? series : [{ name: '无数据', data: [[new Date().toISOString().slice(0, 10), 0]] }],
  })
}

// 下载PDF版本
function getPdfChartAssets() {
  let localAssets = []
  try {
    localAssets = JSON.parse(localStorage.getItem('reportChartMaterials') || '[]')
  } catch {
    localAssets = []
  }
  const workflowAssets = workflowData.reportGenerate?.chartAssets || []
  return [...workflowAssets, ...localAssets]
}

function appendPdfParagraph(parent, text) {
  const value = String(text || '').trim()
  if (!value) return
  const paragraph = document.createElement('div')
  paragraph.style.lineHeight = '1.8'
  paragraph.style.marginBottom = '12px'
  paragraph.style.whiteSpace = 'pre-wrap'
  paragraph.textContent = value
  parent.appendChild(paragraph)
}

function appendPdfChart(parent, imageUrl, title = '') {
  const chartContainer = document.createElement('figure')
  chartContainer.style.margin = '18px 0 22px'
  chartContainer.style.textAlign = 'center'

  const imgElement = document.createElement('img')
  imgElement.src = imageUrl
  imgElement.style.maxWidth = '100%'
  imgElement.style.height = 'auto'
  imgElement.style.border = '1px solid #ddd'
  chartContainer.appendChild(imgElement)

  if (title) {
    const caption = document.createElement('figcaption')
    caption.style.marginTop = '8px'
    caption.style.fontSize = '12px'
    caption.style.color = '#555'
    caption.textContent = title
    chartContainer.appendChild(caption)
  }

  parent.appendChild(chartContainer)
}

async function appendProcessedPdfContent(parent, content) {
  const text = String(content || '')
  const assets = getPdfChartAssets()
  const tokenRegex = /(\[图表素材：([^\]]+)\]|\[图表：([^\s\]]+)\s+数据(?:趋势|对比)图\])/g
  let lastIndex = 0
  let match

  while ((match = tokenRegex.exec(text)) !== null) {
    appendPdfParagraph(parent, text.slice(lastIndex, match.index))

    if (match[2]) {
      const material = assets.find((item) => String(item.id) === String(match[2]))
      if (material?.imageUrl) {
        appendPdfChart(parent, material.imageUrl, material.title || '监测数据图表')
      } else {
        appendPdfParagraph(parent, `图表素材缺失：${match[2]}`)
      }
    } else if (match[3]) {
      const chartImage = await generateChart(match[3])
      appendPdfChart(parent, chartImage, `${match[3]} 监测数据趋势图`)
    }

    lastIndex = tokenRegex.lastIndex
  }

  appendPdfParagraph(parent, text.slice(lastIndex))
}

async function appendPdfStructuredMaterial(parent, material) {
  if (!material) return
  if (material.kind === 'text') {
    appendPdfParagraph(parent, material.value)
    return
  }
  if (material.kind === 'table') {
    if (material.note) appendPdfParagraph(parent, material.note)
    const table = document.createElement('table')
    table.style.width = '100%'
    table.style.borderCollapse = 'collapse'
    table.style.fontSize = '10px'
    const header = document.createElement('tr')
    ;(material.columns || []).forEach(column => {
      const th = document.createElement('th')
      th.textContent = column.label
      Object.assign(th.style, { border: '1px solid #7d8a93', padding: '6px', background: '#eef2f4', textAlign: 'center' })
      header.appendChild(th)
    })
    table.appendChild(header)
    ;(material.rows || []).slice(0, 1000).forEach(row => {
      const tr = document.createElement('tr')
      ;(material.columns || []).forEach(column => {
        const td = document.createElement('td')
        td.textContent = row?.[column.key] ?? ''
        Object.assign(td.style, { border: '1px solid #9da8af', padding: '5px', verticalAlign: 'top' })
        tr.appendChild(td)
      })
      table.appendChild(tr)
    })
    parent.appendChild(table)
    return
  }
  if (material.kind === 'chart') {
    const hasChartData = (material.series || []).some(series => (series.data || []).length > 0)
    if (hasChartData) appendPdfChart(parent, await renderAcademicChartImage(material), material.title)
    else appendPdfParagraph(parent, '当前报告范围内暂无可绘制数据')
    return
  }
  if (material.kind === 'section-list') {
    const sections = material.sections || []
    if (!sections.length) {
      appendPdfParagraph(parent, '当前报告范围内暂无可生成的边坡章节')
      return
    }
    for (const section of sections) {
      const title = document.createElement('h3')
      title.style.margin = '18px 0 8px'
      title.style.fontSize = '15px'
      title.textContent = section.title || '分边坡监测进展'
      parent.appendChild(title)
      for (const block of (section.blocks || [])) {
        if (block.title && block.kind !== 'chart') {
          const subTitle = document.createElement('h4')
          subTitle.style.margin = '12px 0 6px'
          subTitle.style.fontSize = '13px'
          subTitle.textContent = block.title
          parent.appendChild(subTitle)
        }
        await appendPdfStructuredMaterial(parent, block)
      }
    }
    return
  }
  if (material.kind === 'image-list') {
    for (const item of (material.items || []).slice(0, 20)) appendPdfChart(parent, absoluteAssetUrl(item.file_path), item.caption || item.original_name)
  }
}

// 下载 PDF 使用与 Word 预览相同的分页排版。
const downloadPDF = async () => {
  try {
    ElMessage.info('正在排版并生成 PDF 报告，请稍候……')
    let report
    if (workflowData.report?.id) {
      const response = await fetch(`${API_DATA}/api/reports/${workflowData.report.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || '获取报告失败')
      report = result.data.report
    } else {
      const form = workflowData.reportGenerate || {}
      report = {
        title: form.title || '监测报告',
        author: form.author || '',
        reviewer: form.reviewer || '',
        report_date: form.reportDate || new Date().toISOString().slice(0, 10),
        selected_data: workflowData.dataEntry?.selectedData || [],
        chart_assets: form.chartAssets || [],
        template_snapshot: workflowData.templateSelect?.preview || null,
        content_json: {
          title: form.title,
          author: form.author,
          reviewer: form.reviewer,
          reportDate: form.reportDate,
          scope: workflowData.scope || {},
          dataReview: workflowData.dataReview || null,
          materialSummary: workflowData.reportMaterials?.summary || {},
          materialProvenance: workflowData.reportMaterials?.provenance || {},
          moduleContents: form.moduleContents || {},
          structuredContents: form.structuredContents || {},
          exportOptions: form.exportOptions || {},
        },
      }
    }
    await exportReportToPdf(report)
    ElMessage.success('PDF 报告生成成功')
  } catch (error) {
    console.error('生成 PDF 失败:', error)
    ElMessage.error(error.message || '生成 PDF 失败，请重试')
  }
}

// 简单的中文转英文函数
const translateToEnglish = (text) => {
  // 基本的中文到英文的映射
  const translations = {
    '项目基本信息': 'Project Basic Information',
    '监测目的': 'Monitoring Purpose',
    '监测范围': 'Monitoring Scope',
    '设计参数复核': 'Design Parameter Review',
    '监测分析': 'Monitoring Analysis',
    '监测数据': 'Monitoring Data',
    '边坡稳定情况': 'Slope Stability Status',
    '边坡巡查情况': 'Slope Inspection Status',
    '未填写': 'Not filled',
    '未选择': 'Not selected',
    '正常': 'Normal',
    '异常': 'Abnormal',
    '未发现': 'Not found',
    '发现': 'Found'
  }
  
  // 替换常见的中文词汇
  let result = text
  for (const [chinese, english] of Object.entries(translations)) {
    result = result.replace(new RegExp(chinese, 'g'), english)
  }
  
  // 处理日期格式
  const dateRegex = /(\d{4})年(\d{1,2})月(\d{1,2})日/g
  result = result.replace(dateRegex, '$1-$2-$3')
  
  return result
}

// 重置工作流
const resetWorkflow = () => {
  // 重置所有数据
  Object.keys(workflowData).forEach(key => {
    if (typeof workflowData[key] === 'object' && workflowData[key] !== null) {
      Object.keys(workflowData[key]).forEach(subKey => {
        if (Array.isArray(workflowData[key][subKey])) {
          workflowData[key][subKey] = []
        } else if (workflowData[key][subKey] instanceof Date) {
          workflowData[key][subKey] = new Date()
        } else {
          workflowData[key][subKey] = ''
        }
      })
    } else {
      workflowData[key] = null
    }
  })
  workflowSteps[CONTENT_STEP].subSteps = []
  currentSubStep.value = 0
  currentStep.value = 0
  router.replace('/report-generate')
  ElMessage.success('工作流已重置')
}

// 查看报告列表
const viewReports = () => {
  router.push('/report-list')
}

/** 从模板列表「使用」或带 ?templateId= 进入时，拉取模板并跳到内容填写 */
async function applyTemplateIdFromRoute(templateId) {
  if (!templateId) return
  try {
    const { data } = await axios.get(`${API_APP}${TEMPLATES_PATH}/${templateId}`)
    if (!data.success || !data.data) {
      ElMessage.warning('未找到所选模板')
      return
    }
    const t = data.data
    const rawModules = Array.isArray(t.modules) ? t.modules : []
    const modules = rawModules.map((m) => ({
      id: m.id,
      name: m.name || m.content || '模块',
      children: Array.isArray(m.children)
          ? m.children.map((c) => ({
            id: c.id,
            name: c.name || '内容',
            type: c.type || 'text',
            options: c.options,
            default: c.default,
            style: c.style,
            dataSource: c.dataSource,
            placeholderKey: c.placeholderKey,
            monitoringType: c.monitoringType,
            chartType: c.chartType,
            columns: c.columns,
          }))
        : [],
      default: m.default,
      style: m.style,
    }))
    const isWordTemplate = t.template_kind === 'word'
    const isPdfTemplate = t.data_bindings?.__sourceFormat === 'pdf'

    workflowData.templateSelect = {
      reportType: t.type || 'weekly',
      systemTemplate: isWordTemplate ? '' : String(t.id),
      wordTemplate: isWordTemplate ? String(t.id) : '',
      preview: {
        templateId: t.id,
        templateKind: t.template_kind || 'system',
        versionNo: t.version_no || 1,
        name: t.name,
        source: isWordTemplate ? (isPdfTemplate ? 'PDF模板' : 'Word模板') : '系统模板',
        modules,
        dataBindings: t.data_bindings || {},
        placeholders: t.placeholders || [],
      },
    }

    workflowSteps[CONTENT_STEP].subSteps = getSubStepsByTemplate(workflowData.templateSelect)
    currentSubStep.value = 0
    currentStep.value = 0
    ElMessage.success(`已预选模板「${t.name}」，请先确定本次报告的数据范围`)
    router.replace({ path: '/report-generate', query: {} })
  } catch (e) {
    console.error(e)
    ElMessage.error('加载模板失败，请检查网络或登录状态')
  }
}

watch(
  () => route.query.templateId,
  (id) => {
    if (id) applyTemplateIdFromRoute(id)
  },
  { immediate: true }
)
</script>

<style scoped>
.workflow-home {
  padding: 20px;
  min-height: 100vh;
  background-color: #f0f2f5;
}

.workflow-card {
  min-height: calc(100vh - 40px);
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.workflow-header {
  text-align: center;
  margin-bottom: 40px;
}

.workflow-header h2 {
  margin: 0 0 10px 0;
  font-size: 24px;
  color: #303133;
}

.subtitle {
  margin: 0;
  color: #909399;
  font-size: 16px;
}

.workflow-navigation {
  margin: 40px 0;
  padding: 0 40px;
}

.step-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  background-color: #e4e7ed;
  color: #909399;
  transition: all 0.3s;
}

.step-icon.completed {
  background-color: #67c23a;
  color: white;
}

.step-icon.active {
  background-color: #409eff;
  color: white;
}

.workflow-content {
  margin: 40px 0;
  min-height: 500px;
}

.step-content {
  padding: 0 40px;
}

.workflow-actions {
  margin: 40px 0;
  padding: 0 40px;
  display: flex;
  justify-content: center;
  gap: 20px;
  border-top: 1px solid #ebeef5;
  padding-top: 40px;
}

.finish-step {
  text-align: center;
  padding: 60px 0;
}

.finish-icon {
  margin-bottom: 20px;
}

.finish-step h3 {
  margin: 0 0 10px 0;
  font-size: 24px;
  color: #67c23a;
}

.finish-message {
  margin: 0 0 40px 0;
  color: #606266;
  font-size: 16px;
}

.finish-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
}

/* 响应式设计 */
@media screen and (max-width: 1200px) {
  .workflow-navigation {
    padding: 0 20px;
  }
  
  .step-content {
    padding: 0 20px;
  }
  
  .workflow-actions {
    padding: 0 20px;
  }
}

@media screen and (max-width: 768px) {
  .workflow-header h2 {
    font-size: 20px;
  }
  
  .workflow-navigation {
    padding: 0 10px;
  }
  
  .step-content {
    padding: 0 10px;
  }
  
  .workflow-actions {
    flex-direction: column;
    align-items: center;
  }
  
  .finish-actions {
    flex-direction: column;
    align-items: center;
  }
}
</style>

