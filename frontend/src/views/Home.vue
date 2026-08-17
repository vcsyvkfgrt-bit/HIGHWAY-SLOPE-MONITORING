<template>
  <div class="workflow-home">
    <el-card class="workflow-card">
      <template #header>
        <div class="workflow-header">
          <h2>高速公路高边坡及不良地质监测预警报告生成</h2>
          <p class="subtitle">工作流模式 - 按步骤完成监测报告</p>
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

        <!-- 步骤2：模板选择 -->
        <div v-if="currentStep === 1" class="step-content">
          <TemplateSelectWorkflow :workflow-data="workflowData" @next="nextStep" @prev="prevStep" />
        </div>

        <!-- 步骤3：报告生成 -->
        <div v-if="currentStep === 2" class="step-content">
          <ReportGenerateWorkflow 
            :workflow-data="workflowData" 
            :sub-steps="workflowSteps[2].subSteps" 
            :current-sub-step="currentSubStep"
            @next="nextStep" 
            @prev="prevStep" 
          />
        </div>

        <!-- 步骤4：报告导出 -->
        <div v-if="currentStep === 3" class="step-content">
          <div class="export-step">
            <div class="export-icon">
              <el-icon :size="64" color="#409eff"><Document /></el-icon>
            </div>
            <h3>报告导出</h3>
            <p class="export-message">请选择要下载的报告格式</p>
            
            <div class="export-actions">
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

      <!-- 操作按钮 -->
      <div class="workflow-actions" v-if="currentStep < 3">
        <el-button v-if="currentStep > 0" @click="prevStep">
          <el-icon><ArrowLeft /></el-icon>
          上一步
        </el-button>
        <el-button v-if="currentStep < 2" type="primary" @click="nextStep">
          下一步
          <el-icon><ArrowRight /></el-icon>
        </el-button>
        <el-button v-if="currentStep === 2" type="success" @click="completeWorkflow">
          <el-icon><Check /></el-icon>
          完成
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'
import { API_APP, API_DATA, TEMPLATES_PATH } from '../config/api'
import { exportReportToWord } from '../utils/reportExport'
import DataEntryWorkflow from '../components/DataEntryWorkflow.vue'
import TemplateSelectWorkflow from '../components/TemplateSelectWorkflow.vue'
import ReportGenerateWorkflow from '../components/ReportGenerateWorkflow.vue'
import {
  Check,
  Download,
  Refresh,
  List,
  ArrowLeft,
  ArrowRight,
  Document,
  DocumentChecked
} from '@element-plus/icons-vue'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import * as echarts from 'echarts'

const router = useRouter()
const route = useRoute()

// 工作流步骤
const workflowSteps = [
  {
    title: '数据选择',
    description: '选择已录入的监测数据'
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

// 工作流数据
const workflowData = reactive({
  // 数据录入
  dataEntry: {
    slope: '',
    monitoringType: '',
    date: new Date(),
    values: []
  },
  // 数据查看
  dataView: {
    selectedSlopes: [],
    dateRange: []
  },
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
  if (currentStep.value === 2 && workflowSteps[2].subSteps.length > 0) {
    // 在报告生成步骤，先完成子步骤
    if (currentSubStep.value < workflowSteps[2].subSteps.length - 1) {
      currentSubStep.value++
    } else {
      // 子步骤完成，进入完成步骤
      currentStep.value++
      currentSubStep.value = 0
    }
  } else if (currentStep.value < workflowSteps.length - 1) {
    currentStep.value++
    // 如果进入报告生成步骤，根据模板选择设置子步骤
    if (currentStep.value === 2) {
      workflowSteps[2].subSteps = getSubStepsByTemplate(workflowData.templateSelect)
      currentSubStep.value = 0
    }
  }
}

// 上一步
const prevStep = () => {
  if (currentStep.value === 2 && workflowSteps[2].subSteps.length > 0 && currentSubStep.value > 0) {
    // 在报告生成步骤，先退回到上一个子步骤
    currentSubStep.value--
  } else if (currentStep.value > 0) {
    currentStep.value--
    currentSubStep.value = 0
  }
}

// 完成工作流
const completeWorkflow = async () => {
  try {
    const reportForm = workflowData.reportGenerate || {}
    if (!reportForm.title) {
      ElMessage.warning('请先填写报告标题')
      return
    }

    const response = await fetch(`${API_DATA}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
      },
      body: JSON.stringify({
        title: reportForm.title || '监测报告',
        report_type: workflowData.templateSelect?.reportType || 'weekly',
        report_period: reportForm.reportDate ? reportForm.reportDate.slice(0, 7) : '',
        author: reportForm.author || '',
        reviewer: reportForm.reviewer || '',
        report_date: reportForm.reportDate || new Date().toISOString().slice(0, 10),
        selected_data: workflowData.dataEntry?.selectedData || [],
        template_snapshot: workflowData.templateSelect?.preview || null,
        content_json: {
          title: reportForm.title,
          author: reportForm.author,
          reviewer: reportForm.reviewer,
          reportDate: reportForm.reportDate,
          moduleContents: reportForm.moduleContents || {},
        },
        chart_assets: [],
        status: 'draft',
      }),
    })
    const result = await response.json()
    if (!response.ok || !result.success) throw new Error(result.message || '报告保存失败')

    workflowData.report = {
      id: result.data.id,
      title: reportForm.title || '监测报告',
      author: reportForm.author || '管理员',
      reportType: workflowData.templateSelect.reportType,
      generateTime: new Date().toLocaleString(),
      version_no: result.data.version_no,
    }
    currentStep.value = 3
    ElMessage.success('报告已保存到报告列表')
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '报告保存失败')
  }
}

// 下载Word版本
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
        template_snapshot: workflowData.templateSelect?.preview || null,
        content_json: {
          title: form.title,
          author: form.author,
          reviewer: form.reviewer,
          reportDate: form.reportDate,
          moduleContents: form.moduleContents || {},
        },
      }
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
    console.error(error)
    ElMessage.error(error.message || 'Word报告生成失败')
  }
}

// 生成图表
const generateChart = async (slopeCategory = '') => {
  return new Promise((resolve) => {
    // 创建临时图表容器
    const chartContainer = document.createElement('div')
    chartContainer.style.position = 'fixed'
    chartContainer.style.top = '-9999px'
    chartContainer.style.left = '-9999px'
    chartContainer.style.width = '800px'
    chartContainer.style.height = '400px'
    document.body.appendChild(chartContainer)
    
    // 初始化图表
    const chartInstance = echarts.init(chartContainer)
    
    // 获取选择的监测数据
    let selectedData = workflowData.dataEntry.selectedData || []
    
    // 根据边坡类别过滤数据
    if (slopeCategory) {
      selectedData = selectedData.filter(item => {
        // 处理不同的数据结构
        return item.slope === slopeCategory || item.monitoringPoint?.includes(slopeCategory)
      })
    }
    
    if (selectedData.length === 0) {
      // 没有数据时显示默认图表
      chartInstance.setOption({
        title: {
          text: slopeCategory ? `${slopeCategory} 无监测数据` : '无监测数据',
          left: 'center'
        },
        tooltip: {
          trigger: 'axis'
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: ['无数据']
        },
        yAxis: {
          type: 'value',
          name: '监测数据'
        },
        series: [{
          name: '无数据',
          type: 'line',
          data: [0]
        }]
      })
    } else {
      // 按监测点分组
      const groups = {}
      selectedData.forEach(item => {
        // 处理不同的数据结构
        const pointName = item.pointName || item.monitoringPoint || item.slope
        const monitorDate = item.monitorDate || item.monitoringTime
        const value = item.value || item.monitoringData
        
        if (!groups[pointName]) {
          groups[pointName] = {
            name: pointName,
            data: {}
          }
        }
        groups[pointName].data[monitorDate] = parseFloat(value)
      })
      
      // 提取日期
      const dates = [...new Set(selectedData.map(item => item.monitorDate || item.monitoringTime))].sort()
      
      // 生成系列数据
      const series = Object.values(groups).map(group => ({
        name: group.name,
        type: 'line',
        data: dates.map(date => group.data[date] || null),
        smooth: true,
        connectNulls: true
      }))
      
      // 设置图表选项
      chartInstance.setOption({
        title: {
          text: slopeCategory ? `${slopeCategory} 监测数据趋势图` : '监测数据趋势图',
          left: 'center'
        },
        tooltip: {
          trigger: 'axis'
        },
        legend: {
          data: series.map(s => s.name),
          bottom: 0
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '15%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: dates
        },
        yAxis: {
          type: 'value',
          name: '监测数据'
        },
        series: series
      })
    }
    
    // 延迟一下确保图表渲染完成
    setTimeout(() => {
      // 获取图表的base64图片
      const chartImage = chartInstance.getDataURL({
        type: 'png',
        pixelRatio: 2
      })
      
      // 销毁图表实例
      chartInstance.dispose()
      
      // 移除临时容器
      document.body.removeChild(chartContainer)
      
      resolve(chartImage)
    }, 500)
  })
}

// 下载PDF版本
function getPdfChartAssets() {
  const localAssets = JSON.parse(localStorage.getItem('reportChartMaterials') || '[]')
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

// 下载PDF版本
const downloadPDF = async () => {
  let tempElement = null
  try {
    ElMessage.info('正在生成PDF报告...')

    tempElement = document.createElement('div')
    tempElement.style.position = 'fixed'
    tempElement.style.top = '-9999px'
    tempElement.style.left = '-9999px'
    tempElement.style.width = '210mm'
    tempElement.style.padding = '20mm'
    tempElement.style.boxSizing = 'border-box'
    tempElement.style.backgroundColor = 'white'
    tempElement.style.color = '#222'
    tempElement.style.fontFamily = 'SimSun, Microsoft YaHei, serif'
    document.body.appendChild(tempElement)

    const title = workflowData.reportGenerate.title || '监测报告'
    const author = workflowData.reportGenerate.author || '未填写'
    const reviewer = workflowData.reportGenerate.reviewer || '未填写'
    const reportDate = workflowData.reportGenerate.reportDate || '未选择'

    const titleElement = document.createElement('h1')
    titleElement.style.textAlign = 'center'
    titleElement.style.margin = '0 0 18px'
    titleElement.style.fontSize = '24px'
    titleElement.textContent = title
    tempElement.appendChild(titleElement)

    const metaElement = document.createElement('div')
    metaElement.style.textAlign = 'center'
    metaElement.style.color = '#555'
    metaElement.style.marginBottom = '18px'
    metaElement.textContent = `编制人：${author}    审核人：${reviewer}    日期：${reportDate}`
    tempElement.appendChild(metaElement)

    const divider = document.createElement('hr')
    divider.style.marginBottom = '18px'
    tempElement.appendChild(divider)

    const moduleContents = workflowData.reportGenerate.moduleContents || {}
    for (const [key, content] of Object.entries(moduleContents)) {
      if (!content) continue

      const sectionTitle = key.split('-').pop() || key
      const sectionElement = document.createElement('h2')
      sectionElement.style.margin = '20px 0 10px'
      sectionElement.style.fontSize = '18px'
      sectionElement.textContent = sectionTitle
      tempElement.appendChild(sectionElement)

      await appendProcessedPdfContent(tempElement, content)
    }

    const canvas = await html2canvas(tempElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    })

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pdfWidth
    const imgHeight = (canvas.height * pdfWidth) / canvas.width
    const pageImage = canvas.toDataURL('image/png')

    let position = 0
    let remainingHeight = imgHeight
    pdf.addImage(pageImage, 'PNG', 0, position, imgWidth, imgHeight)
    remainingHeight -= pdfHeight

    while (remainingHeight > 0) {
      position -= pdfHeight
      pdf.addPage()
      pdf.addImage(pageImage, 'PNG', 0, position, imgWidth, imgHeight)
      remainingHeight -= pdfHeight
    }

    const fileName = `${workflowData.reportGenerate.title || '监测报告'}_${new Date().toISOString().split('T')[0]}.pdf`
    pdf.save(fileName)
    ElMessage.success('PDF报告生成成功')
  } catch (error) {
    console.error('生成PDF失败:', error)
    ElMessage.error(error.message || '生成PDF失败，请重试')
  } finally {
    if (tempElement?.parentNode) document.body.removeChild(tempElement)
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
  
  currentStep.value = 0
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
      name: m.name || m.content || '模块',
      children: Array.isArray(m.children)
        ? m.children.map((c) => ({
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

    workflowData.templateSelect = {
      reportType: t.type || 'weekly',
      systemTemplate: isWordTemplate ? '' : String(t.id),
      wordTemplate: isWordTemplate ? String(t.id) : '',
      preview: {
        templateId: t.id,
        templateKind: t.template_kind || 'system',
        versionNo: t.version_no || 1,
        name: t.name,
        source: isWordTemplate ? 'Word模板' : '系统模板',
        modules,
        dataBindings: t.data_bindings || {},
        placeholders: t.placeholders || [],
      },
    }

    workflowSteps[2].subSteps = getSubStepsByTemplate(workflowData.templateSelect)
    currentSubStep.value = 0
    currentStep.value = 2
    ElMessage.success(`已加载模板「${t.name}」，已进入报告内容填写`)
    router.replace({ path: '/home', query: {} })
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

