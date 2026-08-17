<template>
  <div class="template-select-workflow">
    <el-card class="step-card">
      <template #header>
        <div class="step-card-header">
          <el-icon><Collection /></el-icon>
          <span>模板选择</span>
        </div>
      </template>

      <div class="template-selection">
        <!-- 报告类型选择 -->
        <div class="selection-section">
          <h4>1. 选择报告类型</h4>
          <el-radio-group v-model="selectedReportType" size="large">
            <el-radio-button value="weekly">
              <el-icon><Calendar /></el-icon>
              周报
            </el-radio-button>
            <el-radio-button value="monthly">
              <el-icon><Calendar /></el-icon>
              月报
            </el-radio-button>
          </el-radio-group>
        </div>

        <!-- 系统模板选择 -->
        <div class="selection-section">
          <h4>2. 选择系统模板（可选）</h4>
          <!-- 搜索框 -->
          <el-input
            v-model="searchKeyword"
            placeholder="搜索模板名称"
            prefix-icon="Search"
            style="width: 300px; margin-bottom: 20px"
            clearable
          />
          <el-row :gutter="20">
            <el-col :span="8" v-for="template in filteredTemplates" :key="template.id">
              <el-card
                :class="['template-card', { 'selected': selectedSystemTemplate === template.id }]"
                shadow="hover"
                @click="selectSystemTemplate(template.id)"
              >
                <div class="template-icon">
                  <el-icon :size="32"><Document /></el-icon>
                </div>
                <div class="template-info">
                  <h5>{{ template.name }}</h5>
                  <p>{{ template.description || '暂无描述' }}</p>
                  <div class="template-tags">
                    <el-tag size="small" :type="template.type === 'weekly' ? 'primary' : 'success'">
                      {{ template.type === 'weekly' ? '周报' : '月报' }}
                    </el-tag>
                    <el-tag v-if="template.is_system" size="small" type="danger" style="margin-left: 5px">系统</el-tag>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>
          <el-empty v-if="filteredTemplates.length === 0" description="暂无模板">
            <template #default>
              <p style="color: #909399; margin-bottom: 16px;">暂无{{ selectedReportType === 'weekly' ? '周报' : '月报' }}模板</p>
              <el-button type="primary" @click="goToTemplateCreate">
                <el-icon><Plus /></el-icon>
                制作模板
              </el-button>
              <el-button @click="goToWordTemplate">
                <el-icon><Upload /></el-icon>
                上传Word模板
              </el-button>
            </template>
          </el-empty>
        </div>

        <!-- Word模板选择 -->
        <div class="selection-section">
          <h4>3. 选择 Word 模板（可选）</h4>
          <el-select
            v-model="selectedWordTemplate"
            placeholder="选择 Word 模板"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="template in wordTemplates"
              :key="template.id"
              :label="template.name"
              :value="template.id"
            >
              <div class="word-template-option">
                <el-icon><DocumentCopy /></el-icon>
                <span>{{ template.name }}</span>
                <el-tag size="small" type="info">{{ template.placeholders?.length || 0 }} 个占位符</el-tag>
              </div>
            </el-option>
          </el-select>
          <div class="template-hint">
            <el-link type="primary" @click="goToWordTemplate">
              <el-icon><Plus /></el-icon>
              管理 Word 模板
            </el-link>
          </div>
        </div>

        <!-- 模板预览 -->
        <div class="selection-section" v-if="showPreview">
          <h4>模板预览</h4>
          <el-card class="preview-card">
            <template #header>
              <div class="preview-header">
                <el-icon><View /></el-icon>
                <span>{{ previewData.name }}</span>
              </div>
            </template>
            <div class="preview-content">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="报告类型">
                  {{ selectedReportType === 'weekly' ? '周报' : '月报' }}
                </el-descriptions-item>
                <el-descriptions-item label="模板来源">
                  {{ previewData.source }}
                </el-descriptions-item>
                <el-descriptions-item label="包含模块" :span="2">
                  <el-tag
                    v-for="(module, index) in previewData.modules"
                    :key="index"
                    size="small"
                    style="margin-right: 5px; margin-bottom: 5px;"
                  >
                    {{ module.name }}
                  </el-tag>
                </el-descriptions-item>
              </el-descriptions>
            </div>
          </el-card>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="step-actions">
        <el-button @click="prevStep">
          <el-icon><ArrowLeft /></el-icon>
          上一步
        </el-button>
        <el-button type="primary" @click="nextStep">
          下一步
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { API_APP, TEMPLATES_PATH } from '../config/api'
import { Collection, Calendar, Document, DocumentCopy, Plus, View, ArrowLeft, ArrowRight, Search, Upload } from '@element-plus/icons-vue'

const props = defineProps({
  workflowData: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['next', 'prev'])
const router = useRouter()

// 选择状态
const selectedReportType = ref('weekly')
const selectedSystemTemplate = ref('')
const selectedWordTemplate = ref('')
const searchKeyword = ref('')

// 系统模板列表（从数据库加载）
const systemTemplates = ref([])
const loading = ref(false)

// 加载系统模板
const loadSystemTemplates = async () => {
  loading.value = true
  try {
    const response = await axios.get(`${API_APP}${TEMPLATES_PATH}`)
    if (response.data.success) {
      systemTemplates.value = (response.data.data || []).filter(template => template.template_kind !== 'word')
    } else {
      ElMessage.error('加载模板列表失败')
    }
  } catch (error) {
    console.error('加载模板列表失败:', error)
    ElMessage.error('加载模板列表失败')
  } finally {
    loading.value = false
  }
}

// 根据报告类型和搜索关键词过滤模板
const filteredTemplates = computed(() => {
  let templates = systemTemplates.value
  
  // 按报告类型过滤
  if (selectedReportType.value) {
    templates = templates.filter(t => t.type === selectedReportType.value)
  }
  
  // 按搜索关键词过滤
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    templates = templates.filter(t => 
      t.name.toLowerCase().includes(keyword) || 
      (t.description && t.description.toLowerCase().includes(keyword))
    )
  }
  
  return templates
})

// Word 模板列表
const wordTemplates = ref([])

// 加载 Word 模板
const loadWordTemplates = async () => {
  try {
    const response = await axios.get(`${API_APP}${TEMPLATES_PATH}`, {
      params: { template_kind: 'word' }
    })
    if (response.data.success) {
      wordTemplates.value = response.data.data || []
    }
  } catch (error) {
    console.error('加载 Word 模板失败:', error)
    ElMessage.error('加载 Word 模板失败')
  }
}

// 选择系统模板
const selectSystemTemplate = (templateId) => {
  selectedSystemTemplate.value = templateId
}

// 是否显示预览
const showPreview = computed(() => {
  return selectedSystemTemplate.value || selectedWordTemplate.value
})

// 预览数据
const previewData = computed(() => {
  if (selectedSystemTemplate.value) {
    const template = systemTemplates.value.find(t => t.id === selectedSystemTemplate.value)
    return {
      templateId: template?.id,
      templateKind: template?.template_kind || 'system',
      versionNo: template?.version_no || 1,
      name: template?.name || '系统模板',
      source: '系统模板',
      modules: template?.modules || [],
      dataBindings: template?.data_bindings || {},
      placeholders: template?.placeholders || []
    }
  }
  
  if (selectedWordTemplate.value) {
    const template = wordTemplates.value.find(t => t.id === selectedWordTemplate.value)
    return {
      templateId: template?.id,
      templateKind: 'word',
      versionNo: template?.version_no || 1,
      name: template?.name || 'Word模板',
      source: 'Word模板',
      modules: template?.modules?.length
        ? template.modules
        : template?.placeholders?.map(p => ({ name: p.name || p.key || p, type: 'placeholder', children: [] })) || [],
      dataBindings: template?.data_bindings || {},
      placeholders: template?.placeholders || []
    }
  }
  
  return { name: '', source: '', modules: [] }
})

// 跳转到 Word 模板管理
const goToWordTemplate = () => {
  router.push('/word-template')
}

// 跳转到模板制作
const goToTemplateCreate = () => {
  router.push('/template-create')
}

// 上一步
const prevStep = () => {
  emit('prev')
}

// 下一步
const nextStep = () => {
  // 确保用户选择了模板
  if (!selectedSystemTemplate.value && !selectedWordTemplate.value) {
    ElMessage.warning('请选择一个模板！')
    return
  }
  
  // 保存到工作流数据
  props.workflowData.templateSelect = {
    reportType: selectedReportType.value,
    systemTemplate: selectedSystemTemplate.value,
    wordTemplate: selectedWordTemplate.value,
    preview: previewData.value
  }
  
  ElMessage.success('模板选择完成')
  emit('next')
}

// 监听报告类型变化，清空已选模板
watch(() => selectedReportType.value, () => {
  selectedSystemTemplate.value = ''
})

// 初始化
onMounted(() => {
  loadSystemTemplates()
  loadWordTemplates()
})
</script>

<style scoped>
.template-select-workflow {
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

.template-selection {
  padding: 20px 0;
}

.selection-section {
  margin-bottom: 40px;
}

.selection-section h4 {
  margin: 0 0 20px 0;
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  padding-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
}

.template-card {
  cursor: pointer;
  transition: all 0.3s;
  height: 100%;
}

.template-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.template-card.selected {
  border: 2px solid #409eff;
  background-color: #f0f9ff;
}

.template-icon {
  text-align: center;
  margin-bottom: 15px;
  color: #409eff;
}

.template-info {
  text-align: center;
}

.template-info h5 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #303133;
}

.template-info p {
  margin: 0 0 10px 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.template-tags {
  display: flex;
  justify-content: center;
  align-items: center;
}

.word-template-option {
  display: flex;
  align-items: center;
  gap: 10px;
}

.template-hint {
  margin-top: 10px;
}

.preview-card {
  background-color: #f5f7fa;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
}

.preview-content {
  padding: 10px 0;
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
