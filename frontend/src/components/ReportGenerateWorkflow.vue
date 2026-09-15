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

      <div v-if="materialsLoading || materialPackage" class="material-status" v-loading="materialsLoading">
        <template v-if="materialPackage">
          <span><small>报告素材</small><strong>{{ materialPackage.summary?.observationCount || 0 }} 条监测数据</strong></span>
          <span><small>平均监测间隔</small><strong>{{ materialPackage.summary?.averageIntervalDays ?? '—' }} d</strong></span>
          <span><small>速率达到参考值</small><strong>{{ materialPackage.summary?.rateExceededPointCount || 0 }} 点</strong></span>
          <span><small>巡查问题 / 活动预警</small><strong>{{ materialPackage.summary?.inspectionProblemCount || 0 }} / {{ materialPackage.summary?.activeAlarmCount || 0 }}</strong></span>
          <span><small>系统建议等级</small><strong>{{ materialPackage.summary?.conclusionGrade || '—' }}</strong></span>
          <span><small>统计截止</small><strong>{{ materialPackage.scope?.endDate || '—' }}</strong></span>
        </template>
      </div>

      <div class="research-assistant-strip">
        <div class="assistant-mark">AI</div>
        <div class="assistant-copy">
          <strong>智能初稿助手</strong>
          <span v-if="aiStatus.configured">仅根据当前统计素材生成，每段保留数据依据，确认后才写入正文。</span>
          <span v-else>未启用；系统继续使用现有规则模板，不影响报告生成。</span>
        </div>
        <el-tag v-if="reportForm.aiReview?.status === 'confirmed'" type="success" effect="plain">已人工确认</el-tag>
        <el-button v-if="aiStatus.configured" :loading="aiGenerating" @click="generateAiDraft">
          {{ reportForm.aiDraft ? '重新生成初稿' : '生成智能初稿' }}
        </el-button>
        <el-button v-if="reportForm.aiDraft" type="primary" plain @click="openAiReview">审阅初稿</el-button>
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
            <div class="preview-heading-row">
              <h4>{{ step.title }}</h4>
              <el-button :loading="qualityLoading" @click="runQualityCheck">运行质量检查</el-button>
            </div>
            <div v-if="qualityReport" class="quality-board" :class="`is-${qualityReport.level}`">
              <div class="quality-score">
                <small>报告质量</small>
                <strong>{{ qualityReport.score }}</strong>
                <span>{{ qualityLevelLabel(qualityReport.level) }}</span>
              </div>
              <div class="quality-summary">
                <span><b>{{ qualityReport.counts.error }}</b> 项必须修正</span>
                <span><b>{{ qualityReport.counts.warning }}</b> 项建议复核</span>
                <span><b>{{ qualityReport.counts.info }}</b> 项提示</span>
              </div>
              <div class="quality-findings">
                <div v-for="item in qualityReport.checks.slice(0, 5)" :key="`${item.code}-${item.location}`">
                  <el-tag :type="qualitySeverityType(item.severity)" effect="plain" size="small">{{ item.severity === 'error' ? '必须修正' : item.severity === 'warning' ? '复核' : '提示' }}</el-tag>
                  <span><b>{{ item.title }}</b>：{{ item.message }}</span>
                </div>
              </div>
            </div>
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
                    <div v-if="getModuleContent(subStep.title)" class="preview-rich-content" :style="styleToCss(getModuleStyle(subStep.title))">
                      <template v-for="part in getPreviewParts(getModuleContent(subStep.title))" :key="part.key">
                        <p v-if="part.type === 'text'">{{ part.text }}</p>
                        <figure v-else-if="part.material" class="preview-chart">
                          <img :src="part.material.imageUrl" :alt="part.material.title" />
                          <figcaption>{{ part.material.title }}</figcaption>
                        </figure>
                        <p v-else class="missing-chart">图表素材缺失：{{ part.id }}</p>
                      </template>
                    </div>
                    <!-- 预览子内容 -->
                    <div v-if="getModuleChildren(subStep.title) && getModuleChildren(subStep.title).length > 0">
                      <div v-for="(child, childIndex) in getModuleChildren(subStep.title)" :key="childIndex" class="preview-sub-section">
                        <h6 :style="styleToCss(child.style, 'heading')">{{ child.name }}</h6>
                        <StructuredReportMaterial
                          v-if="getStructuredMaterial(`${subStep.title}-${child.name}`)"
                          :material="getStructuredMaterial(`${subStep.title}-${child.name}`)"
                        />
                        <div v-else class="preview-rich-content" :style="styleToCss(child.style)">
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
                <div v-if="unplacedStructuredMaterials.length" class="preview-section">
                  <h5>模板自动绑定素材</h5>
                  <StructuredReportMaterial
                    v-for="item in unplacedStructuredMaterials"
                    :key="`preview-${item.key}`"
                    :material="item.material"
                    class="bound-material-item"
                  />
                </div>
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
                <el-form-item label="Word版式">
                  <div class="word-layout-options" :class="{ 'is-template-controlled': usesOriginalDocxTemplate }">
                    <template v-if="usesOriginalDocxTemplate">
                      <div class="layout-mode-mark">DOCX 母版控制</div>
                      <span>封面、目录、页眉页脚、纸张方向和表格样式均继承上传的 Word 模板。</span>
                    </template>
                    <template v-else>
                      <el-checkbox v-model="reportForm.exportOptions.includeCover">生成封面</el-checkbox>
                      <el-checkbox v-model="reportForm.exportOptions.includeToc" :disabled="!reportForm.exportOptions.includeCover">生成目录</el-checkbox>
                      <el-checkbox v-model="reportForm.exportOptions.includeSelectedData">附原始数据表</el-checkbox>
                      <span class="layout-rule-note">超过 7 列的统计表自动转为横向页面</span>
                    </template>
                  </div>
                </el-form-item>
                <el-divider content-position="left">{{ step.title }}</el-divider>
                <div v-if="unplacedStructuredMaterials.length" class="bound-materials-note">
                  <strong>模板自动绑定素材</strong>
                  <span>以下内容已按当前数据范围自动解析，将随报告一并保存和导出。</span>
                </div>
                <StructuredReportMaterial
                  v-for="item in unplacedStructuredMaterials"
                  :key="item.key"
                  :material="item.material"
                  editable
                  class="bound-material-item"
                />
              </template>
              
              <!-- 检查是否有子内容 -->
              <template v-if="getModuleChildren(step.title) && getModuleChildren(step.title).length > 0">
                <!-- 生成子内容表单 -->
                <div v-for="(child, childIndex) in getModuleChildren(step.title)" :key="childIndex" class="child-form-item">
                  <el-form-item :label="child.name">
                    <!-- 根据子内容类型生成不同的表单控件 -->
                    <template v-if="getStructuredMaterial(`${step.title}-${child.name}`)">
                      <StructuredReportMaterial :material="getStructuredMaterial(`${step.title}-${child.name}`)" editable />
                    </template>
                    <template v-else-if="child.type === 'text'">
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

      <div
        v-if="generating || generationStatus"
        class="report-generation-progress"
        :class="`is-${generationStatus || 'running'}`"
        role="status"
        aria-live="polite"
      >
        <div class="generation-progress-heading">
          <div>
            <small>报告生成进度</small>
            <strong>{{ generationStage }}</strong>
          </div>
          <span>{{ generationProgress }}%</span>
        </div>
        <el-progress
          :percentage="generationProgress"
          :status="generationProgressStatus"
          :stroke-width="10"
          :show-text="false"
          striped
          :striped-flow="generating"
        />
        <div class="generation-progress-scale" aria-hidden="true">
          <span :class="{ active: generationProgress >= 10 }">整理内容</span>
          <span :class="{ active: generationProgress >= 35 }">质量检查</span>
          <span :class="{ active: generationProgress >= 65 }">保存报告</span>
          <span :class="{ active: generationProgress >= 100 }">完成</span>
        </div>
        <p>{{ generationDetail }}</p>
      </div>

      <!-- 子工作流操作按钮 -->
      <div class="step-actions" v-if="subSteps.length > 0">
        <el-button @click="prevSubStep" :disabled="generating">
          <el-icon><ArrowLeft /></el-icon>
          {{ currentSubStep === 0 ? '返回模板选择' : '上一个模块' }}
        </el-button>
        <el-button v-if="isLastSubStep" type="success" @click="generateReport" :loading="generating">
          <el-icon><Check /></el-icon>
          完成并生成报告
        </el-button>
        <el-button v-else type="primary" @click="nextSubStep" :disabled="generating">
          下一个模块
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </el-card>

    <el-dialog v-model="aiReviewVisible" title="智能初稿审阅" width="min(920px, 92vw)" class="ai-review-dialog">
      <el-alert type="warning" :closable="false" show-icon title="初稿不代表最终技术结论，请核对点位、日期、单位、变化速率和现场处置记录。" />
      <div class="ai-review-meta">
        <span>服务：{{ reportForm.aiDraft?.provider === 'openrouter' ? 'OpenRouter' : 'OpenAI' }}</span>
        <span>模型：{{ reportForm.aiDraft?.model || '—' }}</span>
        <span>生成时间：{{ formatDateTime(reportForm.aiDraft?.generatedAt) }}</span>
        <span>缺失信息：{{ reportForm.aiDraft?.missingInformation?.length || 0 }} 项</span>
      </div>
      <div v-for="section in reportForm.aiDraft?.sections || []" :key="section.sectionKey" class="ai-section">
        <h4>{{ section.title }}</h4>
        <div v-for="(paragraph, index) in section.paragraphs" :key="index" class="ai-paragraph">
          <div class="ai-paragraph-meta">
            <el-tag size="small" effect="plain" :type="paragraph.kind === 'missing' ? 'warning' : paragraph.kind === 'recommendation' ? 'success' : 'info'">{{ aiKindLabel(paragraph.kind) }}</el-tag>
            <span>依据：{{ paragraph.evidenceRefs?.join('、') || '待人工补充' }}</span>
          </div>
          <el-input v-model="paragraph.text" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" />
        </div>
      </div>
      <template #footer>
        <div class="ai-review-footer">
          <el-checkbox v-model="aiConfirmChecked">我已核对上述内容与数据依据</el-checkbox>
          <span>
            <el-button @click="aiReviewVisible = false">暂不采用</el-button>
            <el-button type="primary" :disabled="!aiConfirmChecked" @click="applyAndConfirmAiDraft">采用并确认</el-button>
          </span>
        </div>
      </template>
    </el-dialog>

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
          <el-button type="primary" :loading="chartGenerating" @click="confirmChartSelection">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Plus, ArrowUp, ArrowDown, Delete, Check, ArrowLeft, ArrowRight, TrendCharts, Grid } from '@element-plus/icons-vue'
import { API_DATA } from '../config/api'
import StructuredReportMaterial from './StructuredReportMaterial.vue'
import { findBindingForChild, generateReportAiDraft, getReportAiStatus, resolveBindingMaterial, resolveReportMaterials } from '../utils/reportMaterials'
import { renderAcademicChartImage } from '../utils/academicChart'
import { inspectReportQualityPreview, qualityLevelLabel, qualitySeverityType } from '../utils/reportQuality'

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
const generationProgress = ref(0)
const generationStage = ref('准备生成')
const generationDetail = ref('正在准备报告内容。')
const generationStatus = ref('')
const generationProgressStatus = computed(() => {
  if (generationStatus.value === 'success') return 'success'
  if (generationStatus.value === 'error') return 'exception'
  return undefined
})
const materialsLoading = ref(false)
const materialPackage = ref(null)
const aiGenerating = ref(false)
const aiReviewVisible = ref(false)
const aiConfirmChecked = ref(false)
const aiStatus = reactive({ configured: false, model: null })
const qualityLoading = ref(false)
const qualityReport = ref(null)

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
const previousReportForm = props.workflowData?.reportGenerate || {}
const reportForm = reactive({
  title: previousReportForm.title || '',
  author: previousReportForm.author || '',
  reviewer: previousReportForm.reviewer || '',
  reportDate: previousReportForm.reportDate || new Date().toISOString().split('T')[0],
  // 动态模块内容
  moduleContents: { ...(previousReportForm.moduleContents || {}) },
  structuredContents: { ...(previousReportForm.structuredContents || {}) },
  chartAssets: [...(previousReportForm.chartAssets || [])],
  exportOptions: {
    includeCover: previousReportForm.exportOptions?.includeCover ?? true,
    includeToc: previousReportForm.exportOptions?.includeToc ?? true,
    includeSelectedData: previousReportForm.exportOptions?.includeSelectedData ?? false,
  },
  aiDraft: previousReportForm.aiDraft || null,
  aiReview: previousReportForm.aiReview || null,
})

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function aiKindLabel(kind) {
  return ({ fact: '事实', calculation: '计算', analysis: '分析', recommendation: '建议', missing: '待补充' })[kind] || kind
}

function reportPayload() {
  // 结构化图表可以由保存的序列数据在导出时重新绘制，无需把大尺寸 PNG 重复写入报告 JSON。
  // 同时过滤旧工作流中已经生成的此类图片，避免保存请求膨胀到上百 MB。
  const persistedChartAssets = (reportForm.chartAssets || []).filter(
    asset => !String(asset?.generatedFrom || '').startsWith('structured-')
  )
  return {
    title: reportForm.title,
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
      scope: props.workflowData.scope || {},
      dataReview: props.workflowData.dataReview || null,
      materialSummary: materialPackage.value?.summary || {},
      materialProvenance: materialPackage.value?.provenance || {},
      moduleContents: reportForm.moduleContents,
      structuredContents: reportForm.structuredContents,
      exportOptions: reportForm.exportOptions,
      aiDraft: reportForm.aiDraft,
      aiReview: reportForm.aiReview,
    },
    chart_assets: persistedChartAssets,
    status: 'draft',
  }
}

async function loadAiStatus() {
  try {
    Object.assign(aiStatus, await getReportAiStatus())
  } catch (error) {
    console.warn('读取智能初稿状态失败', error)
  }
}

async function generateAiDraft() {
  if (!materialPackage.value) return ElMessage.warning('请等待报告素材加载完成')
  if (reportForm.aiDraft) {
    try {
      await ElMessageBox.confirm('重新生成将替换当前未保存的智能初稿，是否继续？', '重新生成', { type: 'warning' })
    } catch { return }
  }
  aiGenerating.value = true
  try {
    reportForm.aiDraft = await generateReportAiDraft({
      title: reportForm.title,
      reportType: props.workflowData.templateSelect?.reportType || 'weekly',
      reportDate: reportForm.reportDate,
    }, materialPackage.value)
    reportForm.aiReview = { status: 'draft', generatedAt: reportForm.aiDraft.generatedAt }
    aiConfirmChecked.value = false
    aiReviewVisible.value = true
  } catch (error) {
    ElMessage.error(error.message || '生成智能初稿失败')
  } finally {
    aiGenerating.value = false
  }
}

function openAiReview() {
  aiConfirmChecked.value = reportForm.aiReview?.status === 'confirmed'
  aiReviewVisible.value = true
}

function findModuleTarget(sectionKey) {
  const patterns = {
    monitoring_overview: [/监测概况/, /监测进展/],
    data_analysis: [/数据分析/, /数据趋势/, /监测数据/],
    inspection_analysis: [/巡检/, /巡查/],
    conclusion: [/结论/],
    recommendations: [/建议/],
  }
  const keys = []
  ;(props.subSteps || []).forEach(step => {
    keys.push(step.title)
    ;(getModuleChildren(step.title) || []).forEach(child => keys.push(`${step.title}-${child.name}`))
  })
  return keys.find(key => (patterns[sectionKey] || []).some(pattern => pattern.test(key))) || null
}

function applyAndConfirmAiDraft() {
  if (!aiConfirmChecked.value) return
  const applied = []
  ;(reportForm.aiDraft?.sections || []).forEach(section => {
    const target = findModuleTarget(section.sectionKey)
    if (!target) return
    const value = (section.paragraphs || []).map(item => item.text.trim()).filter(Boolean).join('\n\n')
    if (!value) return
    reportForm.moduleContents[target] = value
    applied.push(target)
  })
  const currentUser = (() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      return user.real_name || user.username || ''
    } catch { return '' }
  })()
  reportForm.aiReview = {
    status: 'confirmed',
    confirmedAt: new Date().toISOString(),
    confirmedBy: currentUser,
    appliedTargets: applied,
  }
  aiReviewVisible.value = false
  qualityReport.value = null
  ElMessage.success(`智能初稿已写入 ${applied.length} 个报告模块，并记录人工确认`)
}

async function runQualityCheck() {
  qualityLoading.value = true
  try {
    qualityReport.value = await inspectReportQualityPreview(reportPayload())
  } catch (error) {
    ElMessage.error(error.message || '报告质量检查失败')
  } finally {
    qualityLoading.value = false
  }
}

const usesOriginalDocxTemplate = computed(() => {
  const preview = props.workflowData?.templateSelect?.preview || {}
  return preview.templateKind === 'word' && preview.sourceFormat !== 'pdf' && Boolean(preview.fileAssetId)
})

function initMeetingDefaults() {
  const reportType = props.workflowData?.templateSelect?.reportType
  if (reportType !== 'supervision_meeting') return
  const scope = props.workflowData?.scope || {}
  const sectionText = scope.section || (scope.sections || []).join('、') || '高边坡'
  const monthText = (scope.dateRange?.[1] || scope.cutoff || reportForm.reportDate || '').slice(0, 7)
  if (!reportForm.title) reportForm.title = `${sectionText}高边坡监测月度例会汇报材料`
  if (!reportForm.reportDate && monthText) reportForm.reportDate = `${monthText}-01`
}

// 图表选择对话框
const chartDialogVisible = ref(false)
const chartGenerating = ref(false)
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

const unplacedStructuredMaterials = computed(() => Object.entries(reportForm.structuredContents)
  .filter(([key]) => key.startsWith('binding:'))
  .map(([key, material]) => ({ key, material })))

function getStructuredMaterial(contentKey) {
  return reportForm.structuredContents?.[contentKey] || null
}

function applyTemplateBindings() {
  if (!materialPackage.value) return
  const preview = props.workflowData?.templateSelect?.preview || {}
  const placedBindings = new Set()
  ;(preview.modules || []).forEach(module => {
    ;(module.children || []).forEach(child => {
      const binding = findBindingForChild(props.workflowData.templateSelect, module, child)
      if (!binding) return
      const material = resolveBindingMaterial(materialPackage.value, binding, child.placeholderKey)
      if (!material) return
      reportForm.structuredContents[`${module.name}-${child.name}`] = material
      if (binding.placeholderKey) placedBindings.add(binding.placeholderKey)
    })
  })
  Object.entries(preview.dataBindings || {}).forEach(([key, binding]) => {
    if (key === '__sourceFormat') return
    const placeholder = binding?.placeholderKey || key
    if (placedBindings.has(placeholder)) return
    const material = resolveBindingMaterial(materialPackage.value, binding, placeholder)
    if (material) reportForm.structuredContents[`binding:${placeholder}`] = material
  })
}

async function loadReportMaterials() {
  materialsLoading.value = true
  try {
    materialPackage.value = await resolveReportMaterials({
      ...(props.workflowData?.scope || {}),
      reportType: props.workflowData?.templateSelect?.reportType || 'weekly',
    })
    props.workflowData.reportMaterials = materialPackage.value
    applyTemplateBindings()
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '加载报告业务素材失败')
  } finally {
    materialsLoading.value = false
  }
}

// 获取模块内容
const getModuleContent = (moduleTitle) => {
  return reportForm.moduleContents[moduleTitle] || ''
}

function getAllChartMaterials() {
  let localAssets = []
  try {
    localAssets = JSON.parse(localStorage.getItem('reportChartMaterials') || '[]')
  } catch {
    localAssets = []
  }
  const formAssets = reportForm.chartAssets || []
  const workflowAssets = props.workflowData?.reportGenerate?.chartAssets || []
  return [...formAssets, ...workflowAssets, ...localAssets]
}

function getChartMaterial(id) {
  return getAllChartMaterials().find((item) => String(item.id) === String(id))
}

function cleanPlaceholderKey(key = '') {
  return String(key).replace(/^binding:/, '').replace(/^[{]|[}]$/g, '')
}

async function materializeStructuredChartAssets() {
  const generated = []
  for (const [rawKey, material] of Object.entries(reportForm.structuredContents || {})) {
    const placeholderKey = cleanPlaceholderKey(rawKey)
    if (material?.kind === 'chart' && (material.series || []).some(series => (series.data || []).length)) {
      generated.push({
        id: `structured:${placeholderKey}`,
        placeholderKey,
        title: material.title || placeholderKey,
        imageUrl: await renderAcademicChartImage(material),
        generatedFrom: 'structured-material',
      })
    }
    if (material?.kind === 'section-list') {
      for (const [sectionIndex, section] of (material.sections || []).entries()) {
        for (const [blockIndex, block] of (section.blocks || []).entries()) {
          if (block?.kind !== 'chart' || !(block.series || []).some(series => (series.data || []).length)) continue
          const imageKey = `section:${placeholderKey}:${sectionIndex}:${blockIndex}`
          generated.push({
            id: imageKey,
            placeholderKey: imageKey,
            title: block.title || `${section.title || '分边坡'}监测图`,
            imageUrl: await renderAcademicChartImage(block),
            generatedFrom: 'structured-section',
          })
        }
      }
    }
  }

  const generatedIds = new Set(generated.map(item => item.id))
  reportForm.chartAssets = [
    ...(reportForm.chartAssets || []).filter(item => !generatedIds.has(item.id)),
    ...generated,
  ]
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
  const groups = {}
  rows.forEach((item) => {
    const pointName = getItemPointName(item)
    const date = getItemDate(item)
    const value = Number(item.value ?? item.monitoringData)
    if (!date || !Number.isFinite(value)) return
    if (!groups[pointName]) groups[pointName] = []
    groups[pointName].push([date, value])
  })
  const series = Object.entries(groups).map(([name, data]) => ({
    name,
    unit: 'mm',
    data: data.sort(([a], [b]) => a.localeCompare(b)),
  }))
  const definition = { key: `workflow_chart_${Date.now()}`, kind: 'chart', title, chartType: 'line', xName: '监测日期', yName: '监测值 (mm)', series, source: 'monitoring_data' }
  const imageUrl = await renderAcademicChartImage(definition)

  return {
    id: definition.key,
    title,
    slope: chartForm.slopeCategory,
    monitoringType: chartForm.monitoringType,
    chartType: chartForm.chartType,
    dataCount: rows.length,
    createdAt: new Date().toISOString(),
    imageUrl,
    definition,
  }
}

function saveChartMaterial(material) {
  const oldFormAssets = reportForm.chartAssets || []
  reportForm.chartAssets = [material, ...oldFormAssets.filter((item) => item.id !== material.id)]
  if (!props.workflowData.reportGenerate) props.workflowData.reportGenerate = {}
  props.workflowData.reportGenerate.chartAssets = [...reportForm.chartAssets]
}

// 确认图表选择
const confirmChartSelection = async () => {
  if (!chartForm.slopeCategory) {
    ElMessage.warning('请选择边坡类别')
    return
  }

  chartGenerating.value = true
  try {
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
    props.workflowData.reportGenerate.moduleContents = { ...reportForm.moduleContents }

    chartDialogVisible.value = false
    ElMessage.success(`已根据真实数据生成图表素材：${rows.length} 条数据`)
  } catch (error) {
    console.error(error)
    ElMessage.error(error.message || '图表生成失败')
  } finally {
    chartGenerating.value = false
  }
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
    chartAssets: [...reportForm.chartAssets],
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
    chartAssets: [...reportForm.chartAssets],
    id: Date.now().toString(),
    generateTime: new Date().toISOString()
  }
  emit('next')
}

// 返回模板选择
const goToTemplateSelect = () => {
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
  generationStatus.value = ''

  const updateProgress = async (percentage, stage, detail) => {
    generationProgress.value = percentage
    generationStage.value = stage
    generationDetail.value = detail
    await new Promise(resolve => requestAnimationFrame(resolve))
  }

  try {
    await updateProgress(10, '正在整理报告内容', '清理重复图表，并汇总当前模板、监测数据和分析内容。')
    reportForm.chartAssets = (reportForm.chartAssets || []).filter(
      asset => !String(asset?.generatedFrom || '').startsWith('structured-')
    )
    // 保存到工作流数据
    props.workflowData.reportGenerate = {
      ...reportForm,
      chartAssets: [...reportForm.chartAssets],
      id: Date.now().toString(),
      generateTime: new Date().toISOString()
    }

    const payload = reportPayload()
    await updateProgress(35, '正在进行质量检查', '核对标题、正文、图表数据和需要人工复核的内容。')
    const quality = await inspectReportQualityPreview(payload)
    qualityReport.value = quality
    if (!quality.canExport) ElMessage.warning(`报告将保存为草稿，导出前还需修正 ${quality.counts.error} 项问题`)

    await updateProgress(65, '正在保存报告', '正在写入报告正文、结构化数据和版本信息。')
    const report = await request(`${API_DATA}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    await updateProgress(90, '正在建立报告记录', '报告已写入，正在完成列表索引和工作流状态。')
    props.workflowData.report = {
      id: report.id,
      title: reportForm.title,
      author: reportForm.author,
      reviewer: reportForm.reviewer,
      reportDate: reportForm.reportDate,
      reportType: props.workflowData.templateSelect?.reportType || 'weekly',
      version_no: report.version_no,
    }

    generationStatus.value = 'success'
    await updateProgress(100, '报告生成完成', '报告已保存到报告列表，可继续预览或导出。')
    ElMessage.success('报告已保存到报告列表')
    await new Promise(resolve => setTimeout(resolve, 350))
    emit('next')
  } catch (error) {
    console.error(error)
    generationStatus.value = 'error'
    generationStage.value = `${generationStage.value}失败`
    generationDetail.value = error.message || '报告保存失败，请检查当前数据后重试。'
    ElMessage.error(error.message || '报告保存失败')
  } finally {
    generating.value = false
  }
}

// 初始化
onMounted(async () => {
  console.log('报告生成组件加载完成')
  // 加载模板默认值
  initMeetingDefaults()
  loadTemplateDefaults()
  await Promise.all([loadReportMaterials(), loadAiStatus()])
})

// 加载模板默认值
const loadTemplateDefaults = () => {
  const templateSelect = props.workflowData.templateSelect
  const preview = templateSelect?.preview
  const modules = preview?.modules || []
  
  modules.forEach(module => {
    // 加载模块默认值
    if (module.default && !reportForm.moduleContents[module.name]) {
      reportForm.moduleContents[module.name] = module.default
    }
    
    // 加载子内容默认值
    if (module.children && module.children.length > 0) {
      module.children.forEach(child => {
        if (child.default && !reportForm.moduleContents[`${module.name}-${child.name}`]) {
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

.material-status {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  min-height: 64px;
  margin: 0 0 18px;
  border: 1px solid #dce5eb;
  background: #f8fafb;
}

.material-status span {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 10px 14px;
  border-right: 1px solid #e3e9ed;
}

.material-status span:last-child { border-right: 0; }
.material-status small { color: #788b99; font-size: 10px; }
.material-status strong { margin-top: 5px; overflow: hidden; color: #24465f; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.research-assistant-strip {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: -6px 0 18px;
  padding: 11px 14px;
  border: 1px solid #d7e1e6;
  border-left: 3px solid #2d607b;
  background: #fbfcfd;
}
.assistant-mark { display: grid; width: 32px; height: 32px; place-items: center; color: #fff; background: #244f67; font: 700 11px/1 Georgia, serif; letter-spacing: .08em; }
.assistant-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.assistant-copy strong { color: #1f3442; font-size: 13px; }
.assistant-copy span { margin-top: 2px; color: #748592; font-size: 12px; }
.preview-heading-row { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #ebeef5; }
.preview-heading-row h4 { flex: 1; margin-bottom: 0; border-bottom: 0; }
.quality-board { display: grid; grid-template-columns: 110px 240px 1fr; margin: 14px 0; border: 1px solid #d9e2e7; background: #fbfcfd; }
.quality-board.is-blocked { border-left: 4px solid #b84d4d; }
.quality-board.is-review { border-left: 4px solid #b48732; }
.quality-board.is-ready { border-left: 4px solid #39765d; }
.quality-score { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px; border-right: 1px solid #e3e9ed; }
.quality-score small { color: #71828e; }
.quality-score strong { color: #213d4f; font: 700 30px/1.15 Georgia, serif; }
.quality-score span { color: #546d7c; font-size: 12px; }
.quality-summary { display: grid; align-content: center; gap: 5px; padding: 12px 18px; border-right: 1px solid #e3e9ed; color: #5e707c; font-size: 12px; }
.quality-summary b { color: #233e50; font-size: 15px; }
.quality-findings { display: grid; gap: 6px; padding: 10px 14px; font-size: 12px; }
.quality-findings > div { display: flex; align-items: flex-start; gap: 8px; color: #5c6d78; }
.quality-findings b { color: #293f4d; }
.ai-review-meta { display: flex; flex-wrap: wrap; gap: 8px 22px; margin: 14px 0; color: #73838e; font-size: 12px; }
.ai-section { margin: 0 0 16px; border-top: 1px solid #dce4e8; }
.ai-section h4 { margin: 0; padding: 12px 0 8px; color: #223e50; }
.ai-paragraph { margin-bottom: 10px; padding: 10px; background: #f7f9fa; }
.ai-paragraph-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; color: #6f808c; font-size: 11px; }
.ai-review-footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.bound-materials-note { display: flex; align-items: baseline; gap: 12px; margin: 14px 0 10px; color: #25485f; }
.bound-materials-note span { color: #7c8d99; font-size: 12px; }
.bound-material-item { margin: 0 0 16px; }

.word-layout-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 22px;
  width: 100%;
  min-height: 42px;
  padding: 8px 14px;
  border: 1px solid #d8e2e8;
  border-left: 3px solid #315f7d;
  background: #f8fafb;
}

.word-layout-options.is-template-controlled {
  color: #536b7a;
  border-left-color: #8b6b2f;
  background: #fbfaf6;
}

.layout-mode-mark {
  padding-right: 12px;
  border-right: 1px solid #d8d1bf;
  color: #6f5422;
  font-weight: 600;
  letter-spacing: .04em;
}

.layout-rule-note {
  margin-left: auto;
  color: #718392;
  font-size: 12px;
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

.report-generation-progress {
  width: min(760px, 100%);
  margin: 24px auto 0;
  padding: 15px 18px 13px;
  border: 1px solid #d7e1e6;
  border-left: 4px solid #315f7d;
  background: #f8fafb;
}

.report-generation-progress.is-success { border-left-color: #39765d; background: #f7fbf8; }
.report-generation-progress.is-error { border-left-color: #b84d4d; background: #fffafa; }

.generation-progress-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}

.generation-progress-heading > div { display: flex; flex-direction: column; gap: 2px; }
.generation-progress-heading small { color: #7a8b96; font-size: 11px; letter-spacing: .08em; }
.generation-progress-heading strong { color: #203d50; font-size: 14px; }
.generation-progress-heading > span { color: #315f7d; font: 700 20px/1 Georgia, serif; }
.is-success .generation-progress-heading > span { color: #39765d; }
.is-error .generation-progress-heading > span { color: #b84d4d; }

.generation-progress-scale {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin-top: 7px;
  color: #9aa7af;
  font-size: 10px;
}

.generation-progress-scale span:nth-child(2),
.generation-progress-scale span:nth-child(3) { text-align: center; }
.generation-progress-scale span:last-child { text-align: right; }
.generation-progress-scale span.active { color: #315f7d; font-weight: 600; }
.is-success .generation-progress-scale span.active { color: #39765d; }
.is-error .generation-progress-scale span.active { color: #8e5555; }

.report-generation-progress p {
  margin: 9px 0 0;
  color: #6c7d88;
  font-size: 12px;
}

@media (max-width: 900px) {
  .research-assistant-strip { align-items: flex-start; flex-wrap: wrap; }
  .assistant-copy { flex-basis: calc(100% - 50px); }
  .quality-board { grid-template-columns: 90px 1fr; }
  .quality-findings { grid-column: 1 / -1; border-top: 1px solid #e3e9ed; }
  .ai-review-footer { align-items: stretch; flex-direction: column; }
  .report-generation-progress { width: 100%; box-sizing: border-box; }
}
</style>

