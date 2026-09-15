<template>
  <div class="word-template-page">
    <el-card class="page-card">
      <template #header>
        <div class="page-header">
          <div class="header-title">
            <h2>Word / PDF 模板管理</h2>
            <p class="subtitle">上传、解析和管理 Word、PDF 文档模板，单个文件最大 100MB</p>
          </div>
          <el-button type="primary" @click="showUploadDialog = true">
            <el-icon><Upload /></el-icon>
            上传文档模板
          </el-button>
        </div>
      </template>

      <!-- 模板列表 -->
      <div class="template-list">
        <el-empty v-if="templates.length === 0" description="暂无文档模板，请上传 Word 或 PDF 模板">
          <el-button type="primary" @click="showUploadDialog = true">上传模板</el-button>
        </el-empty>

        <el-row v-else :gutter="20">
          <el-col :span="8" v-for="template in templates" :key="template.id">
            <el-card class="template-card" shadow="hover">
              <template #header>
                <div class="template-card-header">
                  <div class="template-info">
                    <el-icon :size="24" color="#409eff"><Document /></el-icon>
                    <div class="template-meta">
                      <h4>{{ template.name }}</h4>
                      <el-tag :type="getTypeTag(template.type)" size="small">
                        {{ getTypeLabel(template.type) }}
                      </el-tag>
                      <el-tag size="small" effect="plain">v{{ template.version_no || 1 }}</el-tag>
                      <el-tag size="small" effect="plain">{{ sourceFormatLabel(template) }}</el-tag>
                    </div>
                  </div>
                  <el-dropdown trigger="click">
                    <el-button type="text" size="small">
                      <el-icon><More /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item @click="previewTemplate(template)">
                          <el-icon><View /></el-icon> 预览
                        </el-dropdown-item>
                        <el-dropdown-item @click="editTemplate(template)">
                          <el-icon><Edit /></el-icon> 编辑
                        </el-dropdown-item>
                        <el-dropdown-item @click="useTemplate(template)">
                          <el-icon><Check /></el-icon> 使用此模板
                        </el-dropdown-item>
                        <el-dropdown-item divided @click="downloadTemplate(template)">
                          <el-icon><Download /></el-icon> 下载
                        </el-dropdown-item>
                        <el-dropdown-item type="danger" @click="deleteTemplate(template)">
                          <el-icon><Delete /></el-icon> 删除
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>

              <div class="template-content">
                <p class="description">{{ template.description || '暂无描述' }}</p>
                <div class="template-stats">
                  <el-tag size="small" effect="plain">
                    <el-icon><DocumentCopy /></el-icon>
                    {{ template.placeholders?.length || 0 }} 个占位符
                  </el-tag>
                  <el-tag size="small" effect="plain">
                    <el-icon><List /></el-icon>
                    {{ template.structure?.length || 0 }} 个模块
                  </el-tag>
                </div>
                <p class="create-time">创建于 {{ formatDate(template.created_at || template.createdAt) }}</p>
              </div>

              <div class="template-actions">
                <el-button type="primary" size="small" @click="useTemplate(template)">
                  <el-icon><Check /></el-icon>
                  使用模板
                </el-button>
                <el-button size="small" @click="previewTemplate(template)">
                  <el-icon><View /></el-icon>
                  预览
                </el-button>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>
    </el-card>

    <!-- 上传模板对话框 -->
    <el-dialog
      v-model="showUploadDialog"
      title="上传 Word / PDF 模板"
      width="800px"
      destroy-on-close
    >
      <WordTemplateParser
        ref="parserRef"
        @apply-template="handleTemplateParsed"
        @save-template="handleTemplateSaved"
      />
    </el-dialog>

    <!-- 预览模板对话框 -->
    <el-dialog
      v-model="showPreviewDialog"
      title="模板预览"
      width="700px"
    >
      <div v-if="currentTemplate" class="preview-content">
        <h3>{{ currentTemplate.name }}</h3>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="模板类型">
            {{ getTypeLabel(currentTemplate.type) }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDate(currentTemplate.created_at || currentTemplate.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="模板版本">
            v{{ currentTemplate.version_no || 1 }}
          </el-descriptions-item>
          <el-descriptions-item label="占位符数量">
            {{ currentTemplate.placeholders?.length || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="模块数量">
            {{ currentTemplate.structure?.length || 0 }}
          </el-descriptions-item>
        </el-descriptions>

        <h4 style="margin-top: 20px;">占位符列表</h4>
        <el-table :data="currentTemplate.placeholders" size="small" border>
          <el-table-column prop="name" label="占位符" width="150">
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
        </el-table>

        <h4 style="margin-top: 20px;">文档结构</h4>
        <el-timeline>
          <el-timeline-item
            v-for="(item, index) in currentTemplate.structure"
            :key="index"
            :type="getTimelineItemType(item.type)"
          >
            <div class="structure-item">
              <span class="item-type">[{{ getItemTypeLabel(item.type) }}]</span>
              <span class="item-content">{{ item.content }}</span>
              <el-tag v-if="item.hasPlaceholder" type="warning" size="small">含占位符</el-tag>
            </div>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-dialog>

    <!-- 编辑模板对话框 -->
    <el-dialog
      v-model="showEditDialog"
      title="编辑模板"
      width="500px"
    >
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="模板名称" required>
          <el-input v-model="editForm.name" placeholder="请输入模板名称" />
        </el-form-item>
        <el-form-item label="模板类型">
          <el-select v-model="editForm.type" style="width: 100%">
            <el-option label="周报模板" value="weekly" />
            <el-option label="月报模板" value="monthly" />
            <el-option label="监理例会材料" value="supervision_meeting" />
            <el-option label="自定义模板" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="模板描述">
          <el-input
            v-model="editForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入模板描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import WordTemplateParser from '../components/WordTemplateParser.vue'
import { API_APP, API_DATA, TEMPLATES_PATH } from '../config/api'
import {
  Upload,
  Document,
  More,
  View,
  Edit,
  Check,
  Download,
  Delete,
  DocumentCopy,
  List
} from '@element-plus/icons-vue'

const router = useRouter()

// 状态
const templates = ref([])
const showUploadDialog = ref(false)
const showPreviewDialog = ref(false)
const showEditDialog = ref(false)
const currentTemplate = ref(null)
const editForm = ref({
  id: '',
  name: '',
  type: 'custom',
  description: ''
})

const authHeaders = () => {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// 加载模板列表
const loadTemplates = async () => {
  try {
    const response = await fetch(`${API_APP}${TEMPLATES_PATH}?template_kind=word`, {
      headers: authHeaders()
    })
    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error || '加载失败')
    }
    templates.value = result.data || []
  } catch (error) {
    console.error('加载文档模板失败:', error)
    ElMessage.error(error.message || '加载文档模板失败')
  }
}

const uploadTemplateFile = async (file) => {
  if (!file) return null

  const formData = new FormData()
  formData.append('module', 'document-template')
  formData.append('business_id', 'template')
  formData.append('files', file)

  const response = await fetch(`${API_DATA}/api/files/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  })
  const result = await response.json()
  if (!result.success) {
    throw new Error(result.message || '文档原文件归档失败')
  }

  return result.data?.[0]?.id || null
}

const buildModulesFromStructure = (structure = []) => {
  const headings = structure.filter(item => item.type === 'heading')
  if (!headings.length) {
    return [{ id: 'word-template-main', name: '文档模板正文', children: [] }]
  }

  return headings.map((item, index) => ({
    id: `word-heading-${item.index ?? index}`,
    name: item.fullContent || item.content || `模板章节${index + 1}`,
    children: []
  }))
}

const buildDataBindings = (placeholders = []) => {
  return placeholders.reduce((bindings, placeholder) => {
    bindings[placeholder.name] = {
      placeholderKey: placeholder.name,
      field: placeholder.mapping || '',
      type: placeholder.type || 'custom',
      source: placeholder.source || ''
    }
    return bindings
  }, {})
}

// 处理模板解析完成
const handleTemplateParsed = (templateData) => {
  console.log('模板解析完成:', templateData)
  ElMessage.success('模板解析成功，请在下方填写模板信息后保存')
}

// 处理模板保存
const handleTemplateSaved = async (templateData) => {
  try {
    const fileAssetId = await uploadTemplateFile(templateData.file)
    const payload = {
      name: templateData.name,
      type: templateData.type,
      description: templateData.description,
      template_kind: 'word',
      modules: buildModulesFromStructure(templateData.structure),
      file_asset_id: fileAssetId,
      placeholders: templateData.placeholders || [],
      structure: templateData.structure || [],
      content_text: templateData.content || '',
      data_bindings: {
        ...buildDataBindings(templateData.placeholders || []),
        __sourceFormat: templateData.sourceFormat || 'docx'
      }
    }

    const response = await fetch(`${API_APP}${TEMPLATES_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify(payload)
    })
    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error || '模板保存失败')
    }

    showUploadDialog.value = false
    await loadTemplates()
    ElMessage.success(`${templateData.sourceFormat === 'pdf' ? 'PDF' : 'Word'} 模板已保存并归档`)
  } catch (error) {
    console.error('保存文档模板失败:', error)
    ElMessage.error(error.message || '保存文档模板失败')
  }
}

// 预览模板
const previewTemplate = (template) => {
  currentTemplate.value = template
  showPreviewDialog.value = true
}

// 编辑模板
const editTemplate = (template) => {
  editForm.value = {
    id: template.id,
    name: template.name,
    type: template.type,
    description: template.description || ''
  }
  currentTemplate.value = template
  showEditDialog.value = true
}

// 确认编辑
const confirmEdit = async () => {
  if (!editForm.value.name.trim()) {
    ElMessage.warning('请输入模板名称')
    return
  }

  try {
    const response = await fetch(`${API_APP}${TEMPLATES_PATH}/${editForm.value.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify({
      name: editForm.value.name,
      type: editForm.value.type,
      description: editForm.value.description
      })
    })
    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error || '更新失败')
    }

    showEditDialog.value = false
    await loadTemplates()
    ElMessage.success('模板更新成功')
  } catch (error) {
    console.error('更新模板失败:', error)
    ElMessage.error(error.message || '更新模板失败')
  }
}

// 使用模板
const useTemplate = (template) => {
  ElMessageBox.confirm(
    `确定要使用模板 "${template.name}" 生成报告吗？`,
    '使用模板',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info'
    }
  ).then(() => {
    router.push(`/report-generate?templateId=${template.id}`)
    ElMessage.success('已跳转到报告生成页面，模板已加载')
  })
}

// 下载模板
const saveBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

const downloadTemplate = async (template) => {
  const sourceFormat = template?.data_bindings?.__sourceFormat
  if (template.file_asset_id && sourceFormat !== 'pdf') {
    try {
      const response = await fetch(`${API_DATA}/api/files/${template.file_asset_id}/download`, { headers: authHeaders() })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.message || '原始 DOCX 下载失败')
      }
      saveBlob(await response.blob(), `${template.name}.docx`)
      ElMessage.success('原始 DOCX 模板已下载')
      return
    } catch (error) {
      ElMessage.error(error.message || '原始 DOCX 下载失败')
      return
    }
  }

  // PDF 模板和没有原文件的旧模板导出结构化定义
  const templateData = {
    name: template.name,
    description: template.description,
    type: template.type,
    template_kind: template.template_kind,
    version_no: template.version_no || 1,
    placeholders: template.placeholders,
    structure: template.structure,
    content: template.content_text
  }

  const jsonString = JSON.stringify(templateData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  saveBlob(blob, `${template.name}-template.json`)
  ElMessage.success('模板定义已导出')
}

// 删除模板
const deleteTemplate = (template) => {
  ElMessageBox.confirm(
    `确定要删除模板 "${template.name}" 吗？此操作不可恢复。`,
    '删除模板',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      const response = await fetch(`${API_APP}${TEMPLATES_PATH}/${template.id}`, {
        method: 'DELETE',
        headers: authHeaders()
      })
      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || '删除失败')
      }
      await loadTemplates()
      ElMessage.success('模板已删除')
    } catch (error) {
      console.error('删除模板失败:', error)
      ElMessage.error(error.message || '删除模板失败')
    }
  })
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '未知'
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN')
}

const sourceFormatLabel = (template) => {
  const format = template?.data_bindings?.__sourceFormat
  return format === 'pdf' ? 'PDF' : 'DOCX'
}

// 获取类型标签
const getTypeTag = (type) => {
  const tagMap = {
    weekly: 'success',
    monthly: 'warning',
    supervision_meeting: 'info',
    custom: ''
  }
  return tagMap[type] || ''
}

// 获取类型标签文本
const getTypeLabel = (type) => {
  const labelMap = {
    weekly: '周报',
    monthly: '月报',
    supervision_meeting: '监理例会',
    custom: '自定义',
  }
  return labelMap[type] || type
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
    'section-list': 'warning',
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
    'section-list': '分章节',
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

// 初始化
onMounted(() => {
  loadTemplates()
})
</script>

<style scoped>
.word-template-page {
  padding: 20px;
}

.page-card {
  min-height: calc(100vh - 140px);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title h2 {
  margin: 0;
  font-size: 20px;
}

.subtitle {
  margin: 5px 0 0 0;
  color: #909399;
  font-size: 14px;
}

.template-list {
  margin-top: 20px;
}

.template-card {
  margin-bottom: 20px;
  transition: all 0.3s;
}

.template-card:hover {
  transform: translateY(-2px);
}

.template-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.template-info {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.template-meta h4 {
  margin: 0 0 5px 0;
  font-size: 16px;
}

.template-content {
  margin: 15px 0;
}

.description {
  color: #606266;
  font-size: 14px;
  margin-bottom: 10px;
  min-height: 40px;
}

.template-stats {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.create-time {
  color: #909399;
  font-size: 12px;
  margin: 0;
}

.template-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  padding-top: 15px;
  border-top: 1px solid #ebeef5;
}

.preview-content h3 {
  margin-top: 0;
  margin-bottom: 20px;
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
</style>
