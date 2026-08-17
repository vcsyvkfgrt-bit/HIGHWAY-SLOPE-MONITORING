<template>
  <div class="word-template-parser">
    <el-card class="parser-card">
      <template #header>
        <div class="card-header">
          <span>Word 模板解析</span>
          <el-button type="primary" size="small" @click="triggerFileUpload">
            <el-icon><Upload /></el-icon>
            上传 Word 模板
          </el-button>
        </div>
      </template>

      <input
        ref="fileInput"
        type="file"
        accept=".docx"
        style="display: none"
        @change="handleFileChange"
      />

      <!-- 上传提示 -->
      <div v-if="!parsedContent && !isParsing" class="upload-tip">
        <el-icon :size="48" color="#909399"><Document /></el-icon>
        <p>点击上方按钮上传 Word 模板文件 (.docx)</p>
        <p class="tip-text">系统会自动识别模板中的占位符，如：{{placeholderExample}}</p>
      </div>

      <!-- 解析状态 -->
      <div v-if="isParsing" class="parsing-status">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <p>正在解析 Word 文档...</p>
      </div>

      <!-- 解析结果 -->
      <div v-if="parsedContent && !isParsing" class="parse-result">
        <!-- 占位符列表 -->
        <div v-if="placeholders.length > 0" class="placeholders-section">
          <h4>识别到的占位符 ({{ placeholders.length }} 个)</h4>
          <el-table :data="placeholders" style="width: 100%" size="small">
            <el-table-column prop="name" label="占位符名称" width="180">
              <template #default="scope">
                <el-tag type="primary" size="small">{{ scope.row.name }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="type" label="类型" width="120">
              <template #default="scope">
                <el-tag :type="getPlaceholderTypeTag(scope.row.type)" size="small">
                  {{ getPlaceholderTypeLabel(scope.row.type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="description" label="说明" />
            <el-table-column label="映射字段" width="200">
              <template #default="scope">
                <el-select
                  v-model="scope.row.mapping"
                  placeholder="选择映射字段"
                  size="small"
                  style="width: 100%"
                  @change="updateMapping"
                >
                  <el-option
                    v-for="field in availableFields"
                    :key="field.value"
                    :label="field.label"
                    :value="field.value"
                  />
                </el-select>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 文档结构 -->
        <div class="structure-section">
          <h4>文档结构</h4>
          <el-timeline>
            <el-timeline-item
              v-for="(item, index) in documentStructure"
              :key="index"
              :type="getTimelineItemType(item.type)"
              :icon="getTimelineItemIcon(item.type)"
            >
              <div class="structure-item">
                <span class="item-type">[{{ getItemTypeLabel(item.type) }}]</span>
                <span class="item-content">{{ item.content }}</span>
                <span v-if="item.hasPlaceholder" class="placeholder-badge">含占位符</span>
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <el-button type="primary" @click="applyTemplate">
            <el-icon><Check /></el-icon>
            应用模板到报告
          </el-button>
          <el-button @click="resetParser">
            <el-icon><RefreshRight /></el-icon>
            重新上传
          </el-button>
          <el-button type="success" @click="saveAsSystemTemplate">
            <el-icon><FolderAdd /></el-icon>
            保存为系统模板
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 保存模板对话框 -->
    <el-dialog
      v-model="saveDialogVisible"
      title="保存为系统模板"
      width="500px"
    >
      <el-form :model="templateForm" label-width="100px">
        <el-form-item label="模板名称" required>
          <el-input v-model="templateForm.name" placeholder="请输入模板名称" />
        </el-form-item>
        <el-form-item label="模板类型">
          <el-select v-model="templateForm.type" style="width: 100%">
            <el-option label="周报模板" value="weekly" />
            <el-option label="月报模板" value="monthly" />
            <el-option label="自定义模板" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="模板描述">
          <el-input
            v-model="templateForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入模板描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSaveTemplate">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import mammoth from 'mammoth'
import { API_APP, TEMPLATES_PATH } from '../config/api'
import {
  Upload,
  Document,
  Loading,
  Check,
  RefreshRight,
  FolderAdd,
  DocumentChecked,
  List,
  Picture,
  Grid
} from '@element-plus/icons-vue'

const emit = defineEmits(['apply-template', 'save-template'])

// 文件输入引用
const fileInput = ref(null)
const sourceFile = ref(null)

// 状态
const isParsing = ref(false)
const parsedContent = ref(null)
const placeholders = ref([])
const documentStructure = ref([])
const saveDialogVisible = ref(false)
const standardPlaceholders = ref([])

// 模板表单
const templateForm = reactive({
  name: '',
  type: 'custom',
  description: ''
})

// 占位符示例
const placeholderExample = '{日期}, {监测边坡}, {编制人}, {图表位置}'

// 可用的映射字段
const baseAvailableFields = [
  { value: 'reportType', label: '报告类型' },
  { value: 'dateRange', label: '日期范围' },
  { value: 'slopes', label: '监测边坡' },
  { value: 'title', label: '报告标题' },
  { value: 'author', label: '编制人' },
  { value: 'generateTime', label: '生成时间' },
  { value: 'maxValue', label: '最大值' },
  { value: 'minValue', label: '最小值' },
  { value: 'avgValue', label: '平均值' },
  { value: 'custom', label: '自定义内容' }
]
const availableFields = computed(() => {
  const fields = [...baseAvailableFields]
  standardPlaceholders.value.forEach(item => {
    if (!fields.some(field => field.value === item.field)) {
      fields.push({ value: item.field, label: item.label })
    }
  })
  return fields
})

// 预定义的占位符类型
const placeholderTypes = {
  '{日期}': { type: 'date', description: '报告日期' },
  '{日期范围}': { type: 'dateRange', description: '报告日期范围' },
  '{监测边坡}': { type: 'slope', description: '监测边坡名称' },
  '{编制人}': { type: 'author', description: '报告编制人' },
  '{报告标题}': { type: 'title', description: '报告标题' },
  '{报告类型}': { type: 'reportType', description: '周报/月报' },
  '{图表位置}': { type: 'chart', description: '图表插入位置' },
  '{表格位置}': { type: 'table', description: '表格插入位置' },
  '{最大值}': { type: 'data', description: '监测数据最大值' },
  '{最小值}': { type: 'data', description: '监测数据最小值' },
  '{平均值}': { type: 'data', description: '监测数据平均值' }
}

// 触发文件上传
const triggerFileUpload = () => {
  fileInput.value.click()
}

const loadPlaceholderDictionary = async () => {
  try {
    const response = await fetch(`${API_APP}${TEMPLATES_PATH}/placeholders/dictionary`)
    const result = await response.json()
    if (result.success) {
      standardPlaceholders.value = result.data || []
    }
  } catch (error) {
    console.warn('加载标准占位符字典失败:', error)
  }
}

// 处理文件选择
const handleFileChange = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  sourceFile.value = file

  // 检查文件类型
  if (!file.name.endsWith('.docx')) {
    ElMessage.error('请上传 .docx 格式的 Word 文档')
    return
  }

  // 检查文件大小（最大 10MB）
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('文件大小不能超过 10MB')
    return
  }

  isParsing.value = true

  try {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })

    parsedContent.value = result.value

    // 解析占位符
    parsePlaceholders(result.value)

    // 解析文档结构
    parseDocumentStructure(result.value)

    ElMessage.success('Word 模板解析成功')
  } catch (error) {
    console.error('解析 Word 文档失败:', error)
    ElMessage.error('解析 Word 文档失败，请检查文件格式')
  } finally {
    isParsing.value = false
    // 清空文件输入，允许重复上传同一文件
    event.target.value = ''
  }
}

// 解析占位符
const parsePlaceholders = (content) => {
  const regex = /\{([^}]+)\}/g
  const matches = content.matchAll(regex)
  const found = new Set()

  placeholders.value = []

  for (const match of matches) {
    const placeholderName = `{${match[1]}}`

    if (!found.has(placeholderName)) {
      found.add(placeholderName)

      const dictionaryItem = standardPlaceholders.value.find(item => item.key === placeholderName)
      const predefined = dictionaryItem
        ? {
            type: dictionaryItem.type,
            description: dictionaryItem.description,
            mapping: dictionaryItem.field,
            source: dictionaryItem.source
          }
        : placeholderTypes[placeholderName]

      placeholders.value.push({
        name: placeholderName,
        type: predefined?.type || 'custom',
        description: predefined?.description || '自定义占位符',
        mapping: predefined?.mapping || predefined?.type || '',
        source: predefined?.source || ''
      })
    }
  }
}

// 解析文档结构
const parseDocumentStructure = (content) => {
  const lines = content.split('\n').filter(line => line.trim())
  const structure = []

  lines.forEach((line, index) => {
    const trimmedLine = line.trim()
    let type = 'text'
    let hasPlaceholder = false

    // 判断类型
    if (/^第[一二三四五六七八九十]+[章节]/.test(trimmedLine) ||
        /^[一二三四五六七八九十]+[、.]/.test(trimmedLine) ||
        /^\d+[、.]/.test(trimmedLine)) {
      type = 'heading'
    } else if (trimmedLine.includes('表') && trimmedLine.includes('：')) {
      type = 'tableTitle'
    } else if (trimmedLine.includes('图') && trimmedLine.includes('：')) {
      type = 'chartTitle'
    }

    // 检查是否包含占位符
    if (trimmedLine.includes('{') && trimmedLine.includes('}')) {
      hasPlaceholder = true
    }

    if (trimmedLine) {
      structure.push({
        type,
        content: trimmedLine.substring(0, 100) + (trimmedLine.length > 100 ? '...' : ''),
        fullContent: trimmedLine,
        hasPlaceholder,
        index
      })
    }
  })

  documentStructure.value = structure
}

// 获取占位符类型标签样式
const getPlaceholderTypeTag = (type) => {
  const tagMap = {
    date: 'success',
    dateRange: 'success',
    slope: 'warning',
    author: 'info',
    title: 'primary',
    reportType: 'info',
    chart: 'danger',
    table: 'danger',
    data: 'warning',
    custom: ''
  }
  return tagMap[type] || ''
}

// 获取占位符类型标签文本
const getPlaceholderTypeLabel = (type) => {
  const labelMap = {
    date: '日期',
    dateRange: '日期范围',
    slope: '边坡',
    author: '人员',
    title: '标题',
    reportType: '报告类型',
    chart: '图表',
    table: '表格',
    data: '数据',
    custom: '自定义',
  }
  return labelMap[type] || type
}

// 获取时间线项类型
const getTimelineItemType = (type) => {
  const typeMap = {
    heading: 'primary',
    tableTitle: 'warning',
    chartTitle: 'success',
    text: ''
  }
  return typeMap[type] || ''
}

// 获取时间线项图标
const getTimelineItemIcon = (type) => {
  // 返回组件引用
  const iconMap = {
    heading: DocumentChecked,
    tableTitle: Grid,
    chartTitle: Picture,
    text: List
  }
  return iconMap[type] || List
}

// 获取项类型标签
const getItemTypeLabel = (type) => {
  const labelMap = {
    heading: '标题',
    tableTitle: '表格',
    chartTitle: '图表',
    text: '正文'
  }
  return labelMap[type] || type
}

// 更新映射
const updateMapping = () => {
  console.log('占位符映射已更新:', placeholders.value)
}

// 应用模板
const applyTemplate = () => {
  const templateData = {
    content: parsedContent.value,
    placeholders: placeholders.value,
    structure: documentStructure.value
  }

  emit('apply-template', templateData)
  ElMessage.success('模板已应用到报告')
}

// 重置解析
const resetParser = () => {
  parsedContent.value = null
  sourceFile.value = null
  placeholders.value = []
  documentStructure.value = []
  fileInput.value.value = ''
}

// 保存为系统模板
const saveAsSystemTemplate = () => {
  templateForm.name = ''
  templateForm.type = 'custom'
  templateForm.description = ''
  saveDialogVisible.value = true
}

// 确认保存模板
const confirmSaveTemplate = () => {
  if (!templateForm.name.trim()) {
    ElMessage.warning('请输入模板名称')
    return
  }

  const templateData = {
    name: templateForm.name,
    type: templateForm.type,
    description: templateForm.description,
    content: parsedContent.value,
    placeholders: placeholders.value,
    structure: documentStructure.value,
    file: sourceFile.value,
    createdAt: new Date()
  }

  emit('save-template', templateData)
  saveDialogVisible.value = false
}

onMounted(() => {
  loadPlaceholderDictionary()
})
</script>

<style scoped>
.word-template-parser {
  margin: 20px 0;
}

.parser-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.upload-tip {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
}

.upload-tip p {
  margin: 10px 0;
}

.tip-text {
  font-size: 12px;
  color: #c0c4cc;
}

.parsing-status {
  text-align: center;
  padding: 40px 20px;
  color: #409eff;
}

.parsing-status p {
  margin-top: 10px;
}

.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.parse-result {
  padding: 10px 0;
}

.placeholders-section,
.structure-section {
  margin-bottom: 20px;
}

.placeholders-section h4,
.structure-section h4 {
  margin-bottom: 15px;
  color: #303133;
  font-weight: 600;
}

.structure-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.item-type {
  font-size: 12px;
  color: #909399;
  min-width: 50px;
}

.item-content {
  color: #303133;
  flex: 1;
  word-break: break-all;
}

.placeholder-badge {
  font-size: 11px;
  color: #e6a23c;
  background: #fdf6ec;
  padding: 2px 6px;
  border-radius: 4px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #ebeef5;
}
</style>
