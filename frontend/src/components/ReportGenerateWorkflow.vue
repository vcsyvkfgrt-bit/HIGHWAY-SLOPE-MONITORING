<template>
  <div class="report-generate-workflow">
    <el-card class="step-card">
      <template #header>
        <div class="step-card-header">
          <el-icon><Document /></el-icon>
          <span>报告生成</span>
        </div>
      </template>

      <!-- 子工作流导航 -->
      <div class="sub-workflow-navigation" v-if="subSteps.length > 0">
        <el-steps :active="currentSubStep" :space="150" finish-status="success">
          <el-step 
            v-for="(step, index) in subSteps" 
            :key="index"
            :title="step.title"
            :description="step.description"
          >
            <template #icon>
              <div class="step-icon" :class="{ 'completed': index < currentSubStep, 'active': index === currentSubStep }">
                {{ index + 1 }}
              </div>
            </template>
          </el-step>
        </el-steps>
      </div>

      <div class="report-generation">
        <!-- 无子步骤时显示提示 -->
        <el-empty v-if="subSteps.length === 0" description="暂无模块内容">
          <template #default>
            <p style="color: #909399; margin-bottom: 16px;">请先选择报告模板</p>
            <el-button type="primary" @click="goToTemplateSelect">
              <el-icon><ArrowLeft /></el-icon>
              返回模板选择
            </el-button>
          </template>
        </el-empty>
        
        <!-- 动态子步骤内容 -->
        <div v-for="(step, stepIndex) in subSteps" :key="stepIndex" v-show="currentSubStep === stepIndex" class="sub-step-content">
          <!-- 报告预览步骤 -->
          <template v-if="step.title === '报告预览'">
            <h4>{{ step.title }}</h4>
            <el-card class="preview-card">
              <div class="report-preview">
                <div class="preview-title">{{ reportForm.title || '报告标题' }}</div>
                <div class="preview-meta">
                  <span>编制人：{{ reportForm.author || '未填写' }}</span>
                  <span>审核人：{{ reportForm.reviewer || '未填写' }}</span>
                  <span>日期：{{ reportForm.reportDate || '未选择' }}</span>
                </div>
                <el-divider />
                
                <!-- 动态预览各模块内容 -->
                <template v-for="(subStep, subIndex) in subSteps" :key="subIndex">
                  <div v-if="subStep.title !== '报告预览'" class="preview-section">
                    <h5 :style="styleToCss(getModuleStyle(subStep.title))">{{ subStep.title }}</h5>
                    <!-- 预览子内容 -->
                    <div v-if="getModuleChildren(subStep.title) && getModuleChildren(subStep.title).length > 0">
                      <div v-for="(child, childIndex) in getModuleChildren(subStep.title)" :key="childIndex" class="preview-sub-section">
                        <h6 :style="styleToCss(child.style, 'heading')">{{ child.name }}</h6>
                        <div class="preview-rich-content" :style="styleToCss(child.style)">
                          <template v-for="part in getPreviewParts(getModuleContent(`${subStep.title}-${child.name}`))" :key="part.key">
                            <p v-if="part.type === 'text'">{{ part.text }}</p>
                            <figure v-else-if="part.material" class="preview-chart">
                              <img :src="part.material.imageUrl" :alt="part.material.title" />
                              <figcaption>{{ part.material.title }}</figcaption>
                            </figure>
                            <p v-else class="missing-chart">图表素材缺失：{{ part.id }}</p>
                          </template>
                        </div>
                      </div>
                    </div>
                    <div v-else class="preview-rich-content" :style="styleToCss(getModuleStyle(subStep.title))">
                      <template v-for="part in getPreviewParts(getModuleContent(subStep.title))" :key="part.key">
                        <p v-if="part.type === 'text'">{{ part.text }}</p>
                        <figure v-else-if="part.material" class="preview-chart">
                          <img :src="part.material.imageUrl" :alt="part.material.title" />
                          <figcaption>{{ part.material.title }}</figcaption>
                        </figure>
                        <p v-else class="missing-chart">图表素材缺失：{{ part.id }}</p>
                      </template>
                    </div>
                  </div>
                </template>
              </div>
            </el-card>
          </template>
          
          <!-- 其他步骤 -->
          <template v-else>
            <h4>{{ step.title }}</h4>
            <!-- 图表插入提示 -->
            <el-alert
              v-if="hasSelectedData && (step.title === '监测数据分析' || step.title === '数据趋势分析' || step.title === '数据分析')"
              title="提示"
              type="info"
              :closable="false"
              show-icon
            >
              <template #default>
                <p>您已选择监测数据，可以在下方内容中插入数据趋势图表。</p>
                <el-button type="primary" size="small" @click="openChartDialog(step.title)" style="margin-top: 10px">
                  <el-icon><TrendCharts /></el-icon>
                  插入图表
                </el-button>
              </template>
            </el-alert>
            <el-form :model="reportForm" label-width="100px">
              <!-- 第一个子步骤显示报告基本信息 -->
              <template v-if="currentSubStep === 0">
                <el-divider content-position="left">报告基本信息</el-divider>
                <el-form-item label="报告标题" required>
                  <el-input
                    v-model="reportForm.title"
                    placeholder="请输入报告标题"
                    clearable
                  />
                </el-form-item>
                <el-form-item label="编制人" required>
                  <el-input
                    v-model="reportForm.author"
                    placeholder="请输入编制人姓名"
                    clearable
                  />
                </el-form-item>
                <el-form-item label="审核人">
                  <el-input
                    v-model="reportForm.reviewer"
                    placeholder="请输入审核人姓名"
                    clearable
                  />
                </el-form-item>
                <el-form-item label="报告日期">
                  <el-date-picker
                    v-model="reportForm.reportDate"
                    type="date"
                    placeholder="选择报告日期"
                    style="width: 100%"
                    value-format="YYYY-MM-DD"
                  />
                </el-form-item>
                <el-divider content-position="left">{{ step.title }}</el-divider>
              </template>
              
              <!-- 检查是否有子内容 -->
              <template v-if="getModuleChildren(step.title) && getModuleChildren(step.title).length > 0">
                <!-- 生成子内容表单 -->
                <div v-for="(child, childIndex) in getModuleChildren(step.title)" :key="childIndex" class="child-form-item">
                  <el-form-item :label="child.name">
                    <!-- 根据子内容类型生成不同的表单控件 -->
                    <template v-if="child.type === 'text'">
                      <el-input
                        v-model="reportForm.moduleContents[`${step.title}-${child.name}`]"
                        type="textarea"
                        :rows="4"
                        :placeholder="`请输入${child.name}的内容`"
                      />
                    </template>
                    <template v-else-if="child.type === 'select' && child.options">
                      <el-select
                        v-model="reportForm.moduleContents[`${step.title}-${child.name}`]"
                        :placeholder="`请选择${child.name}`"
                        style="width: 100%"
                      >
                        <el-option
                          v-for="(option, optionIndex) in child.options"
                          :key="optionIndex"
                          :label="option"
                          :value="option"
                        />
                      </el-select>
                    </template>
                    <template v-else-if="child.type === 'table'">
                      <el-input
                        v-model="reportForm.moduleContents[`${step.title}-${child.name}`]"
                        type="textarea"
                        :rows="3"
                        :placeholder="`请描述${child.name}的内容`"
                      />
                    </template>
                    <template v-else-if="child.type === 'chart'">
                      <el-input
                        v-model="reportForm.moduleContents[`${step.title}-${child.name}`]"
                        type="textarea"
                        :rows="3"
                        :placeholder="`请描述${child.name}的内容`"
                      />
                      <el-button type="primary" size="small" @click="openChartDialog(`${step.title}-${child.name}`)" style="margin-top: 10px">
                        <el-icon><TrendCharts /></el-icon>
                        插入图表
                      </el-button>
                    </template>
                    <template v-else>
                      <el-input
                        v-model="reportForm.moduleContents[`${step.title}-${child.name}`]"
                        :placeholder="`请输入${child.name}的内容`"
                      />
                    </template>
                  </el-form-item>
                </div>
              </template>
              <!-- 没有子内容时显示简单文本框 -->
              <template v-else>
                <el-form-item label="内容">
                  <el-input
                    v-model="reportForm.moduleContents[step.title]"
                    type="textarea"
                    :rows="6"
                    :placeholder="`请输入${step.title}的内容`"
                  />
                  <el-button type="primary" size="small" @click="openChartDialog(step.title)" style="margin-top: 10px">
                    <el-icon><TrendCharts /></el-icon>
                    插入图表
                  </el-button>
                  <el-button size="small" @click="insertLedgerTable(step.title)" style="margin-top: 10px; margin-left: 8px">
                    <el-icon><Grid /></el-icon>
                    插入台账表
                  </el-button>
                </el-form-item>
              </template>
            </el-form>
          </template>
        </div>
      </div>

      <!-- 子工作流操作按钮 -->
      <div class="step-actions" v-if="subSteps.length > 0">
        <el-button @click="prevSubStep" :disabled="currentSubStep === 0">
          <el-icon><ArrowLeft /></el-icon>
          上一个模块
        </el-button>
        <el-button v-if="isLastSubStep" type="success" @click="generateReport" :loading="generating">
          <el-icon><Check /></el-icon>
          完成并生成报告
        </el-button>
        <el-button v-else type="primary" @click="nextSubStep">
          下一个模块
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </el-card>

    <!-- 图表选择对话框 -->
    <el-dialog v-model="chartDialogVisible" title="选择图表" width="400px">
      <el-form :model="chartForm" label-width="80px">
        <el-form-item label="边坡类别">
          <el-select v-model="chartForm.slopeCategory" placeholder="选择边坡类别" style="width: 100%">
            <el-option
              v-for="slope in availableSlopes"
              :key="slope"
              :label="slope"
              :value="slope"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="图表类型">
          <el-select v-model="chartForm.chartType" placeholder="选择图表类型" style="width: 100%">
            <el-option label="数据趋势图" value="trend" />
            <el-option label="数据对比图" value="comparison" />
          </el-select>
        </el-form-item>
        <el-form-item label="监测类型">
          <el-select v-model="chartForm.monitoringType" placeholder="选择监测类型" clearable style="width: 100%">
            <el-option
              v-for="type in availableMonitoringTypes"
              :key="type"
              :label="type"
              :value="type"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="chartDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmChartSelection">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Plus, ArrowUp, ArrowDown, Delete, Check, ArrowLeft, ArrowRight, TrendCharts, Grid } from '@element-plus/icons-vue'
import { API_DATA } from '../config/api'
import * as echarts from 'echarts'

const props = defineProps({
  workflowData: {
    type: Object,
    required: true
  },
  currentSubStep: {
    type: Number,
    default: 0
  },
  subSteps: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['next', 'prev'])

const formRef = ref(null)
const generating = ref(false)

function tokenHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: tokenHeaders(options.headers || {}),
  })
  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.message || data.error || '请求失败')
  }
  return data.data
}

// 报告表单
const reportForm = reactive({
  title: '',
  author: '',
  reviewer: '',
  reportDate: new Date().toISOString().split('T')[0],
  // 动态模块内容
  moduleContents: {}
})

// 图表选择对话框
const chartDialogVisible = ref(false)
const currentModuleTitle = ref('')
const chartForm = reactive({
  slopeCategory: '',
  chartType: 'trend',
  monitoringType: ''
})

// 计算属性
const isLastSubStep = computed(() => {
  return props.currentSubStep === props.subSteps.length - 1
})

// 检查是否有选择的数据
const hasSelectedData = computed(() => {
  return props.workflowData?.dataEntry?.selectedData?.length > 0
})

// 获取可用的边坡类别
const availableSlopes = computed(() => {
  const selectedData = props.workflowData?.dataEntry?.selectedData || []
  const slopes = [...new Set(selectedData.map(item => {
    // 处理不同的数据结构
    return item.slope || item.slope_name || item.monitoringPoint || '未分类'
  }))]
  return slopes.filter(slope => slope)
})

const availableMonitoringTypes = computed(() => {
  const selectedData = props.workflowData?.dataEntry?.selectedData || []
  return [...new Set(selectedData.map(item => item.monitoringType || item.monitor_type).filter(Boolean))]
})

// 获取模块内容
const getModuleContent = (moduleTitle) => {
  return reportForm.moduleContents[moduleTitle] || ''
}

function getAllChartMaterials() {
  const localAssets = JSON.parse(localStorage.getItem('reportChartMaterials') || '[]')
  const workflowAssets = props.workflowData?.reportGenerate?.chartAssets || []
  return [...workflowAssets, ...localAssets]
}

function getChartMaterial(id) {
  return getAllChartMaterials().find((item) => String(item.id) === String(id))
}

function getPreviewParts(content) {
  const text = String(content || '').trim()
  if (!text) return [{ key: 'empty', type: 'text', text: '未填写' }]

  const parts = []
  const regex = /\[图表素材：([^\]]+)\]/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    const plain = text.slice(lastIndex, match.index).trim()
    if (plain) parts.push({ key: `text_${lastIndex}`, type: 'text', text: plain })
    parts.push({
      key: `chart_${match[1]}_${match.index}`,
      type: 'chart',
      id: match[1],
      material: getChartMaterial(match[1]),
    })
    lastIndex = regex.lastIndex
  }

  const rest = text.slice(lastIndex).trim()
  if (rest) parts.push({ key: `text_${lastIndex}`, type: 'text', text: rest })
  return parts.length ? parts : [{ key: 'empty', type: 'text', text: '未填写' }]
}

// 获取模块的子内容
const getModuleChildren = (moduleTitle) => {
  const templateSelect = props.workflowData.templateSelect
  const preview = templateSelect?.preview
  const modules = preview?.modules || []
  
  const module = modules.find(m => m.name === moduleTitle)
  return module?.children || []
}

const getModuleStyle = (moduleTitle) => {
  const templateSelect = props.workflowData.templateSelect
  const preview = templateSelect?.preview
  const modules = preview?.modules || []
  const module = modules.find(m => m.name === moduleTitle)
  return module?.style || null
}

const normalizeStyle = (style, kind = 'body') => ({
  fontFamily: kind === 'heading' ? 'SimHei' : 'SimSun',
  fontSize: kind === 'heading' ? 16 : 12,
  fontWeight: kind === 'heading' ? 'bold' : 'normal',
  textAlign: 'left',
  firstLineIndent: kind === 'body' ? 2 : 0,
  lineHeight: 1.5,
  spacingBefore: kind === 'heading' ? 12 : 0,
  spacingAfter: kind === 'heading' ? 8 : 6,
  ...(style || {})
})

const styleToCss = (style, kind = 'body') => {
  const normalized = normalizeStyle(style, kind)
  return {
    fontFamily: normalized.fontFamily,
    fontSize: `${normalized.fontSize}px`,
    fontWeight: normalized.fontWeight,
    textAlign: normalized.textAlign,
    textIndent: `${normalized.firstLineIndent || 0}em`,
    lineHeight: normalized.lineHeight,
    marginTop: `${normalized.spacingBefore || 0}px`,
    marginBottom: `${normalized.spacingAfter || 0}px`
  }
}

// 打开图表选择对话框
const openChartDialog = (moduleTitle) => {
  currentModuleTitle.value = moduleTitle
  chartForm.slopeCategory = ''
  chartForm.chartType = 'trend'
  chartForm.monitoringType = availableMonitoringTypes.value[0] || ''
  chartDialogVisible.value = true
}

function getItemDate(item) {
  const raw = item.monitorDate || item.monitor_date || item.monitoringTime || ''
  return String(raw).slice(0, 10)
}

function getItemSlope(item) {
  return item.slope || item.slope_name || item.monitoringPoint || '未分类'
}

function getItemPointName(item) {
  return item.pointName || item.point_name || item.monitoringPoint || getItemSlope(item) || '监测点'
}

function filterChartRows() {
  const selectedData = props.workflowData?.dataEntry?.selectedData || []
  return selectedData.filter((item) => {
    const slopeMatched = getItemSlope(item) === chartForm.slopeCategory || String(item.monitoringPoint || '').includes(chartForm.slopeCategory)
    const typeMatched = !chartForm.monitoringType || (item.monitoringType || item.monitor_type) === chartForm.monitoringType
    return slopeMatched && typeMatched
  })
}

async function createWorkflowChartMaterial(rows, title) {
  const chartContainer = document.createElement('div')
  chartContainer.style.position = 'fixed'
  chartContainer.style.left = '-10000px'
  chartContainer.style.top = '-10000px'
  chartContainer.style.width = '1000px'
  chartContainer.style.height = '520px'
  chartContainer.style.background = '#fff'
  document.body.appendChild(chartContainer)

  const chart = echarts.init(chartContainer, null, { renderer: 'canvas', width: 1000, height: 520 })
  const dates = [...new Set(rows.map(getItemDate).filter(Boolean))].sort()
  const groups = {}
  rows.forEach((item) => {
    const pointName = getItemPointName(item)
    const date = getItemDate(item)
    const value = Number(item.value ?? item.monitoringData)
    if (!date || !Number.isFinite(value)) return
    if (!groups[pointName]) groups[pointName] = {}
    groups[pointName][date] = value
  })

  const series = Object.entries(groups).map(([name, values]) => ({
    name,
    type: 'line',
    smooth: false,
    connectNulls: false,
    symbolSize: 5,
    data: dates.map((date) => values[date] ?? null),
  }))

  chart.setOption({
    animation: false,
    title: { text: title, left: 'center', top: 10, textStyle: { fontSize: 18, fontWeight: 600 } },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 8, type: 'scroll', textStyle: { fontSize: 11 } },
    grid: { left: 70, right: 38, top: 64, bottom: 92 },
    xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', name: '位移(mm)', axisLabel: { fontSize: 11 } },
    series,
  })

  await new Promise((resolve) => setTimeout(resolve, 100))
  const imageUrl = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  chart.dispose()
  document.body.removeChild(chartContainer)

  return {
    id: `workflow_chart_${Date.now()}`,
    title,
    slope: chartForm.slopeCategory,
    monitoringType: chartForm.monitoringType,
    chartType: chartForm.chartType,
    dataCount: rows.length,
    createdAt: new Date().toISOString(),
    imageUrl,
  }
}

function saveChartMaterial(material) {
  const existing = JSON.parse(localStorage.getItem('reportChartMaterials') || '[]')
  localStorage.setItem('reportChartMaterials', JSON.stringify([material, ...existing].slice(0, 100)))

  if (!props.workflowData.reportGenerate) props.workflowData.reportGenerate = {}
  const oldAssets = props.workflowData.reportGenerate.chartAssets || []
  props.workflowData.reportGenerate.chartAssets = [material, ...oldAssets.filter((item) => item.id !== material.id)]
}

// 确认图表选择
const confirmChartSelection = async () => {
  if (!chartForm.slopeCategory) {
    ElMessage.warning('请选择边坡类别')
    return
  }

  const rows = filterChartRows()
  if (rows.length === 0) {
    ElMessage.warning('当前边坡和监测类型下没有可插入的真实数据')
    return
  }

  const chartName = chartForm.chartType === 'comparison' ? '数据对比图' : '数据趋势图'
  const title = `${chartForm.slopeCategory} ${chartForm.monitoringType || '监测数据'}${chartName}`
  const material = await createWorkflowChartMaterial(rows, title)
  saveChartMaterial(material)

  const placeholder = `\n[图表素材：${material.id}]\n`
  if (reportForm.moduleContents[currentModuleTitle.value]) {
    reportForm.moduleContents[currentModuleTitle.value] += placeholder
  } else {
    reportForm.moduleContents[currentModuleTitle.value] = placeholder
  }
  
  chartDialogVisible.value = false
  ElMessage.success(`已根据真实数据生成图表素材：${rows.length} 条数据`)
}

const insertLedgerTable = (moduleTitle) => {
  const month = (reportForm.reportDate || new Date().toISOString().slice(0, 10)).slice(0, 7)
  const placeholder = `\n[台账表：${month}]\n`
  if (reportForm.moduleContents[moduleTitle]) {
    reportForm.moduleContents[moduleTitle] += placeholder
  } else {
    reportForm.moduleContents[moduleTitle] = placeholder
  }
  ElMessage.success('台账表占位符已插入，导出 Word 时会生成正式台账表')
}

// 子工作流上一步
const prevSubStep = () => {
  // 保存当前表单数据到工作流数据
  props.workflowData.reportGenerate = {
    ...reportForm,
    chartAssets: props.workflowData.reportGenerate?.chartAssets || [],
    id: Date.now().toString(),
    generateTime: new Date().toISOString()
  }
  emit('prev')
}

// 子工作流下一步
const nextSubStep = () => {
  // 保存当前表单数据到工作流数据
  props.workflowData.reportGenerate = {
    ...reportForm,
    chartAssets: props.workflowData.reportGenerate?.chartAssets || [],
    id: Date.now().toString(),
    generateTime: new Date().toISOString()
  }
  emit('next')
}

// 返回模板选择
const goToTemplateSelect = () => {
  emit('prev')
  emit('prev')
}

// 生成报告
const generateReport = async () => {
  // 验证基本信息
  if (!reportForm.title) {
    ElMessage.warning('请输入报告标题')
    return
  }
  if (!reportForm.author) {
    ElMessage.warning('请输入编制人')
    return
  }

  generating.value = true

  try {
    // 保存到工作流数据
    props.workflowData.reportGenerate = {
      ...reportForm,
      chartAssets: props.workflowData.reportGenerate?.chartAssets || [],
      id: Date.now().toString(),
      generateTime: new Date().toISOString()
    }

    const report = await request(`${API_DATA}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
      title: reportForm.title,
      reportType: props.workflowData.templateSelect?.reportType || 'weekly',
      report_type: props.workflowData.templateSelect?.reportType || 'weekly',
      report_period: reportForm.reportDate ? reportForm.reportDate.slice(0, 7) : '',
      author: reportForm.author,
      reviewer: reportForm.reviewer,
      report_date: reportForm.reportDate,
      selected_data: props.workflowData.dataEntry?.selectedData || [],
      template_snapshot: props.workflowData.templateSelect?.preview || null,
      content_json: {
        title: reportForm.title,
        author: reportForm.author,
        reviewer: reportForm.reviewer,
        reportDate: reportForm.reportDate,
        moduleContents: reportForm.moduleContents,
      },
      chart_assets: props.workflowData.reportGenerate?.chartAssets || [],
      status: 'draft',
      }),
    })
    props.workflowData.report = {
      id: report.id,
      title: reportForm.title,
      author: reportForm.author,
      reviewer: reportForm.reviewer,
      reportDate: reportForm.reportDate,
      reportType: props.workflowData.templateSelect?.reportType || 'weekly',
      version_no: report.version_no,
    }

    generating.value = false
    ElMessage.success('报告已保存到报告列表')
    emit('next')
  } catch (error) {
    console.error(error)
    generating.value = false
    ElMessage.error(error.message || '报告保存失败')
  }
}

// 初始化
onMounted(() => {
  console.log('报告生成组件加载完成')
  // 加载模板默认值
  loadTemplateDefaults()
})

// 加载模板默认值
const loadTemplateDefaults = () => {
  const templateSelect = props.workflowData.templateSelect
  const preview = templateSelect?.preview
  const modules = preview?.modules || []
  
  modules.forEach(module => {
    // 加载模块默认值
    if (module.default) {
      reportForm.moduleContents[module.name] = module.default
    }
    
    // 加载子内容默认值
    if (module.children && module.children.length > 0) {
      module.children.forEach(child => {
        if (child.default) {
          reportForm.moduleContents[`${module.name}-${child.name}`] = child.default
        }
      })
    }
  })
}
</script>

<style scoped>
.report-generate-workflow {
  margin: 20px 0;
}

.step-card {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.step-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
  font-size: 16px;
}

.sub-workflow-navigation {
  margin: 20px 0;
  padding: 0 20px;
}

.sub-step-content {
  padding: 20px 0;
}

.sub-step-content h4 {
  margin: 0 0 20px 0;
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  padding-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
}

.report-generation {
  padding: 0;
}

.section {
  margin-bottom: 30px;
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

.preview-card {
  background-color: #f5f7fa;
}

.report-preview {
  padding: 20px;
  background: white;
  border-radius: 4px;
  min-height: 300px;
}

.preview-title {
  font-size: 20px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 15px;
  color: #303133;
}

.preview-meta {
  display: flex;
  justify-content: center;
  gap: 30px;
  color: #606266;
  font-size: 14px;
  margin-bottom: 20px;
}

.preview-section {
  margin-bottom: 30px;
  padding: 15px;
  background: #f9f9f9;
  border-radius: 4px;
}

.preview-section h5 {
  margin: 0 0 15px 0;
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  padding-bottom: 10px;
  border-bottom: 1px solid #e4e7ed;
}

.preview-sub-section {
  margin-left: 20px;
  margin-top: 15px;
  padding-left: 15px;
  border-left: 2px solid #409eff;
}

.preview-sub-section h6 {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 500;
  color: #409eff;
}

.preview-section p {
  margin: 5px 0;
  line-height: 1.6;
  color: #606266;
}

.preview-rich-content {
  color: #606266;
}

.preview-rich-content p {
  white-space: pre-wrap;
}

.preview-chart {
  margin: 14px auto 18px;
  text-align: center;
}

.preview-chart img {
  display: block;
  width: min(100%, 820px);
  max-height: 430px;
  object-fit: contain;
  margin: 0 auto;
  border: 1px solid #dcdfe6;
  background: #fff;
}

.preview-chart figcaption {
  margin-top: 8px;
  color: #606266;
  font-size: 13px;
}

.missing-chart {
  color: #f56c6c;
}

.child-form-item {
  margin-bottom: 15px;
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
}

.child-form-item .el-form-item {
  margin-bottom: 10px;
}

.step-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #ebeef5;
}
</style>

