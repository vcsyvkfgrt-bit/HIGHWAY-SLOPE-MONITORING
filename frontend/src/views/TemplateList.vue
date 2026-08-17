<template>
  <div class="template-list">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>模板管理</span>
          <div class="header-actions">
            <el-button type="primary" @click="createTemplate">
              <el-icon><Plus /></el-icon> 创建模板
            </el-button>
            <el-button @click="importTemplate">
              <el-icon><Upload /></el-icon> 导入模板
            </el-button>
          </div>
        </div>
      </template>
      
      <div class="template-search">
        <el-input
          v-model="searchForm.name"
          placeholder="搜索模板名称"
          prefix-icon="Search"
          style="width: 300px; margin-bottom: 20px"
        />
        <el-select v-model="searchForm.type" placeholder="选择模板类型" style="width: 150px; margin-left: 10px">
          <el-option label="全部" value="" />
          <el-option label="周报" value="weekly" />
          <el-option label="月报" value="monthly" />
          <el-option label="自定义" value="custom" />
        </el-select>
      </div>
      
      <div class="template-grid">
        <el-card 
          v-for="template in templates" 
          :key="template.id" 
          class="template-card"
        >
          <template #header>
            <div class="template-header">
              <span class="template-name">{{ template.name }}</span>
              <div class="template-tags">
                <el-tag v-if="template.is_system" type="danger" size="small" style="margin-right: 5px">系统</el-tag>
                <el-tag
                  :type="template.template_kind === 'word' ? 'success' : 'info'"
                  size="small"
                  style="margin-right: 5px"
                >
                  {{ template.template_kind === 'word' ? 'Word' : '系统模板' }}
                </el-tag>
                <el-tag size="small" effect="plain" style="margin-right: 5px">v{{ template.version_no || 1 }}</el-tag>
                <el-tag :type="template.type === 'weekly' ? 'success' : template.type === 'monthly' ? 'warning' : 'primary'">
                  {{ template.type === 'weekly' ? '周报' : template.type === 'monthly' ? '月报' : '自定义' }}
                </el-tag>
              </div>
            </div>
          </template>
          
          <div class="template-content">
            <p class="template-description">{{ template.description || '暂无描述' }}</p>
            <div class="template-info">
              <span>模块数量：{{ template.modules ? template.modules.length : 0 }}</span>
              <span>绑定数量：{{ template.data_bindings ? Object.keys(template.data_bindings).length : 0 }}</span>
              <span>创建时间：{{ formatDate(template.created_at) }}</span>
            </div>
          </div>
          
          <div class="template-actions">
            <el-button size="small" @click="editTemplate(template.id)">
              <el-icon><Edit /></el-icon> 编辑
            </el-button>
            <el-button size="small" type="primary" @click="useTemplate(template.id)">
              <el-icon><Check /></el-icon> 使用
            </el-button>
            <el-button size="small" @click="exportTemplate(template)">
              <el-icon><Download /></el-icon> 导出
            </el-button>
            <el-button size="small" type="danger" @click="deleteTemplate(template.id)" :disabled="template.is_system">
              <el-icon><Delete /></el-icon> 删除
            </el-button>
          </div>
        </el-card>
        
        <el-card v-if="templates.length === 0" class="empty-card">
          <div class="empty-content">
            <el-icon class="empty-icon"><Document /></el-icon>
            <p>暂无模板，请创建新模板</p>
          </div>
        </el-card>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Check, Search, Document, Upload, Download } from '@element-plus/icons-vue'
import axios from 'axios'
import { API_APP, TEMPLATES_PATH } from '../config/api'

const router = useRouter()
const searchForm = ref({
  name: '',
  type: ''
})

// 模板列表
const templates = ref([])
const loading = ref(false)

// 格式化日期
const formatDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleDateString()
}

// 获取模板列表
const fetchTemplates = async () => {
  loading.value = true
  try {
    const params = {}
    if (searchForm.value.type) {
      params.type = searchForm.value.type
    }
    
    const response = await axios.get(`${API_APP}${TEMPLATES_PATH}`, { params })
    if (response.data.success) {
      templates.value = response.data.data
    } else {
      ElMessage.error('获取模板列表失败')
    }
  } catch (error) {
    console.error('获取模板列表失败:', error)
    ElMessage.error('获取模板列表失败')
  } finally {
    loading.value = false
  }
}

// 创建模板
const createTemplate = () => {
  router.push('/template-create')
}

// 编辑模板
const editTemplate = (id) => {
  router.push(`/template-create/${id}`)
}

// 使用模板
const useTemplate = (id) => {
  // 跳转到报告生成页面并传递模板ID
  router.push({
    path: '/report-generate',
    query: { templateId: id }
  })
  ElMessage.success('模板已选择，正在跳转到报告生成页面...')
}

// 删除模板
const deleteTemplate = async (id) => {
  ElMessageBox.confirm('确定要删除此模板吗？删除后无法恢复。', '删除模板', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.delete(`${API_APP}${TEMPLATES_PATH}/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.success) {
        ElMessage.success('模板删除成功')
        fetchTemplates()
      } else {
        ElMessage.error(response.data.error || '删除失败')
      }
    } catch (error) {
      console.error('删除模板失败:', error)
      ElMessage.error(error.response?.data?.error || '删除模板失败')
    }
  }).catch(() => {
    // 取消删除
  })
}

// 导入模板
const importTemplate = () => {
  // 创建文件输入元素
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          const templateData = JSON.parse(event.target.result)
          // 验证模板格式
          if (validateTemplate(templateData)) {
            // 调用API创建模板
            const token = localStorage.getItem('token')
            const response = await axios.post(`${API_APP}${TEMPLATES_PATH}`, {
              name: templateData.name,
              type: templateData.type,
              description: templateData.description,
              modules: templateData.modules
            }, {
              headers: { Authorization: `Bearer ${token}` }
            })
            
            if (response.data.success) {
              ElMessage.success('模板导入成功')
              fetchTemplates()
            } else {
              ElMessage.error(response.data.error || '导入失败')
            }
          } else {
            ElMessage.error('模板格式不正确')
          }
        } catch (error) {
          console.error('导入失败:', error)
          ElMessage.error(error.response?.data?.error || '文件解析失败，请确保文件为有效的JSON格式')
        }
      }
      reader.readAsText(file)
    }
  }
  input.click()
}

// 导出模板
const exportTemplate = (template) => {
  // 复制模板数据，移除不需要的字段
  const templateData = {
    name: template.name,
    description: template.description,
    type: template.type,
    modules: template.modules
  }
  
  // 转换为 JSON 字符串
  const jsonString = JSON.stringify(templateData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  // 创建下载链接
  const a = document.createElement('a')
  a.href = url
  a.download = `${template.name}-template.json`
  a.click()
  
  // 释放URL
  URL.revokeObjectURL(url)
  ElMessage.success('模板导出成功')
}

// 验证模板格式
const validateTemplate = (template) => {
  // 检查必要字段
  if (!template.name || !template.type || !Array.isArray(template.modules)) {
    return false
  }
  
  // 检查模块格式
  for (const module of template.modules) {
    if (!module.name) {
      return false
    }
  }
  
  return true
}

onMounted(() => {
  fetchTemplates()
})
</script>

<style scoped>
.template-list {
  max-width: 1200px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 18px;
  font-weight: bold;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.template-search {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}

.template-card {
  transition: all 0.3s ease;
  cursor: pointer;
}

.template-card:hover {
  box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.template-name {
  font-weight: bold;
  font-size: 16px;
}

.template-tags {
  display: flex;
  align-items: center;
}

.template-content {
  margin: 15px 0;
}

.template-description {
  color: #606266;
  line-height: 1.5;
  margin-bottom: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.template-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #909399;
}

.template-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 15px;
}

.empty-card {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 300px;
}

.empty-content {
  text-align: center;
  color: #909399;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 10px;
}
</style>
