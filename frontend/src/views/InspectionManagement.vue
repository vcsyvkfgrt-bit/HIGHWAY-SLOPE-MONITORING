<template>
  <div class="inspection-management">
    <el-card class="page-card">
      <template #header>
        <div class="card-header">
          <span>边坡巡检管理</span>
          <el-button type="primary" @click="openAddDialog">
            <el-icon><Plus /></el-icon>
            新增巡检记录
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <div class="search-bar">
        <el-row :gutter="16" align="middle">
          <el-col :xs="24" :sm="12" :md="6" :lg="6">
            <div class="search-item">
              <span class="search-label">边坡</span>
              <el-select v-model="searchForm.slope_id" placeholder="选择边坡" clearable class="search-input">
                <el-option
                  v-for="slope in slopes"
                  :key="slope.id"
                  :label="slope.slope_name"
                  :value="slope.id"
                />
              </el-select>
            </div>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6" :lg="6">
            <div class="search-item">
              <span class="search-label">状态</span>
              <el-select v-model="searchForm.status" placeholder="选择状态" clearable class="search-input">
                <el-option label="正常" value="normal" />
                <el-option label="需关注" value="attention" />
                <el-option label="异常" value="abnormal" />
              </el-select>
            </div>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6" :lg="6">
            <div class="search-item">
              <span class="search-label">巡检类型</span>
              <el-select v-model="searchForm.inspection_type" placeholder="选择巡检类型" clearable class="search-input">
                <el-option label="日常巡检" value="日常巡检" />
                <el-option label="周巡检" value="周巡检" />
                <el-option label="月巡检" value="月巡检" />
                <el-option label="专项巡检" value="专项巡检" />
              </el-select>
            </div>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6" :lg="6">
            <div class="search-actions">
              <el-button type="primary" @click="search" class="search-btn">
                <el-icon><Search /></el-icon>
                搜索
              </el-button>
              <el-button @click="resetSearch" class="reset-btn">
                <el-icon><Refresh /></el-icon>
                重置
              </el-button>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 巡检记录列表 -->
      <el-table :data="inspections" style="width: 100%" stripe>
        <el-table-column prop="id" label="序号" width="80" />
        <el-table-column prop="slope_name" label="边坡名称" width="180" />
        <el-table-column prop="inspection_date" label="巡检日期" width="180">
          <template #default="scope">
            {{ formatDate(scope.row.inspection_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="inspector" label="巡检人员" width="120" />
        <el-table-column prop="inspection_type" label="巡检类型" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusLabel(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="照片" width="120">
          <template #default="scope">
            <el-button 
              v-if="hasImages(scope.row)" 
              size="small" 
              type="info" 
              @click="viewImages(scope.row)"
            >
              <el-icon><Picture /></el-icon>
              查看照片
            </el-button>
            <span v-else>无照片</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="scope">
            <el-button size="small" type="primary" @click="openEditDialog(scope.row)">
              <el-icon><Edit /></el-icon>
              编辑
            </el-button>
            <el-button size="small" type="danger" @click="deleteInspection(scope.row.id)">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.limit"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增巡检记录' : '编辑巡检记录'"
      width="700px"
    >
      <el-form :model="inspectionForm" label-width="120px" class="inspection-form">
        <el-form-item label="边坡" required>
          <el-select v-model="inspectionForm.slope_id" placeholder="选择边坡" style="width: 100%">
            <el-option
              v-for="slope in slopes"
              :key="slope.id"
              :label="slope.slope_name"
              :value="slope.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="巡检日期" required>
          <el-date-picker
            v-model="inspectionForm.inspection_date"
            type="datetime"
            placeholder="选择巡检日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="巡检人员" required>
          <el-input v-model="inspectionForm.inspector" placeholder="输入巡检人员" />
        </el-form-item>
        <el-form-item label="巡检类型" required>
          <el-select v-model="inspectionForm.inspection_type" placeholder="选择巡检类型" style="width: 100%">
            <el-option label="日常巡检" value="日常巡检" />
            <el-option label="周巡检" value="周巡检" />
            <el-option label="月巡检" value="月巡检" />
            <el-option label="专项巡检" value="专项巡检" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" required>
          <el-select v-model="inspectionForm.status" placeholder="选择状态" style="width: 100%">
            <el-option label="正常" value="normal" />
            <el-option label="需关注" value="attention" />
            <el-option label="异常" value="abnormal" />
          </el-select>
        </el-form-item>
        <el-form-item label="巡检内容">
          <el-input
            v-model="inspectionForm.content"
            type="textarea"
            :rows="3"
            placeholder="输入巡检内容"
          />
        </el-form-item>
        <el-form-item label="问题描述">
          <el-input
            v-model="inspectionForm.problems"
            type="textarea"
            :rows="2"
            placeholder="输入发现的问题"
          />
        </el-form-item>
        <el-form-item label="建议措施">
          <el-input
            v-model="inspectionForm.suggestions"
            type="textarea"
            :rows="2"
            placeholder="输入建议措施"
          />
        </el-form-item>
        <el-form-item label="巡检照片">
          <el-input
            v-model="inspectionForm.result"
            type="textarea"
            :rows="2"
            placeholder="输入现场处理结果"
            style="margin-bottom: 8px"
          />
          <el-upload
            v-model:file-list="inspectionForm.images"
            action="#"
            list-type="picture-card"
            :auto-upload="false"
            :on-change="handleImageChange"
            :before-remove="beforeImageRemove"
            multiple
            accept="image/*"
          >
            <el-icon><Plus /></el-icon>
            <template #tip>
              <div class="el-upload__tip">
                支持上传多张图片，单张不超过 5MB
              </div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveInspection">确定</el-button>
      </template>
    </el-dialog>

    <!-- 查看照片对话框 -->
    <el-dialog v-model="imageDialogVisible" :title="currentImageTitle" width="800px">
      <div class="image-gallery">
        <el-row :gutter="20">
          <el-col v-for="(img, index) in currentImages" :key="index" :span="8">
            <div class="image-item">
              <el-image 
                :src="img" 
                :preview-src-list="currentImages"
                :initial-index="index"
                fit="cover"
                style="width: 100%; height: 200px;"
              />
              <div class="image-index">图片 {{ index + 1 }}</div>
            </div>
          </el-col>
        </el-row>
      </div>
      <template #footer>
        <el-button @click="imageDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Search, Refresh, Edit, Delete, Picture } from '@element-plus/icons-vue'
import axios from 'axios'
import { API_DATA } from '../config/api'

// 状态
const inspections = ref([])
const slopes = ref([])
const dialogVisible = ref(false)
const dialogType = ref('add')
const currentInspectionId = ref(null)

// 查看照片对话框
const imageDialogVisible = ref(false)
const currentImages = ref([])
const currentImageTitle = ref('')

// 搜索表单
const searchForm = reactive({
  slope_id: '',
  status: '',
  inspection_type: ''
})

// 分页
const pagination = reactive({
  page: 1,
  limit: 10,
  total: 0
})

// 巡检表单
const inspectionForm = reactive({
  slope_id: '',
  inspection_date: new Date(),
  inspector: '',
  inspection_type: '日常巡检',
  status: 'normal',
  content: '',
  problems: '',
  suggestions: '',
  result: '',
  images: []
})

// 获取边坡列表
const getSlopes = async () => {
  try {
    const response = await axios.get(`${API_DATA}/api/slopes`)
    if (response.data.success) {
      slopes.value = response.data.data
    }
  } catch (error) {
    console.error('获取边坡列表失败:', error)
    ElMessage.error('获取边坡列表失败')
  }
}

// 获取巡检记录
const getInspections = async () => {
  try {
    const params = {
      ...searchForm,
      page: pagination.page,
      limit: pagination.limit
    }
    const response = await axios.get(`${API_DATA}/api/inspections`, { params })
    if (response.data.success) {
      inspections.value = response.data.data
      pagination.total = response.data.total
    }
  } catch (error) {
    console.error('获取巡检记录失败:', error)
    ElMessage.error('获取巡检记录失败')
  }
}

// 搜索
const search = () => {
  pagination.page = 1
  getInspections()
}

// 重置搜索
const resetSearch = () => {
  searchForm.slope_id = ''
  searchForm.status = ''
  searchForm.inspection_type = ''
  pagination.page = 1
  getInspections()
}

// 分页处理
const handleSizeChange = (size) => {
  pagination.limit = size
  getInspections()
}

const handleCurrentChange = (current) => {
  pagination.page = current
  getInspections()
}

// 处理图片变更
const handleImageChange = async (file, fileList) => {
  // 检查文件大小（5MB限制）
  const isLt5M = file.size / 1024 / 1024 < 5
  if (!isLt5M) {
    ElMessage.error('图片大小不能超过 5MB')
    const index = fileList.indexOf(file)
    if (index > -1) {
      fileList.splice(index, 1)
    }
    return false
  }
  
  // 将图片转换为 base64
  try {
    const base64 = await fileToBase64(file.raw)
    file.url = base64
    file.base64 = base64
  } catch (error) {
    console.error('图片转换失败:', error)
    ElMessage.error('图片转换失败')
    const index = fileList.indexOf(file)
    if (index > -1) {
      fileList.splice(index, 1)
    }
  }
}

// 将文件转换为 base64
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result)
    reader.onerror = (error) => reject(error)
  })
}

// 图片移除前确认
const beforeImageRemove = (file, fileList) => {
  return true
}

// 打开新增对话框
const openAddDialog = () => {
  dialogType.value = 'add'
  currentInspectionId.value = null
  Object.assign(inspectionForm, {
    slope_id: '',
    inspection_date: new Date(),
    inspector: '',
    inspection_type: '日常巡检',
    status: 'normal',
    content: '',
    problems: '',
    suggestions: '',
    result: '',
    images: []
  })
  dialogVisible.value = true
}

// 打开编辑对话框
const openEditDialog = (inspection) => {
  dialogType.value = 'edit'
  currentInspectionId.value = inspection.id
  
  // 处理图片数据
  let images = []
  if (inspection.images) {
    try {
      const imageArray = typeof inspection.images === 'string' ? JSON.parse(inspection.images) : inspection.images
      images = imageArray.map((img, index) => ({
        name: `图片${index + 1}`,
        url: img,
        base64: img
      }))
    } catch (e) {
      console.error('解析图片数据失败:', e)
      images = []
    }
  }
  
  Object.assign(inspectionForm, {
    slope_id: inspection.slope_id,
    inspection_date: new Date(inspection.inspection_date),
    inspector: inspection.inspector,
    inspection_type: inspection.inspection_type,
    status: inspection.status,
    content: inspection.content,
    problems: inspection.problems,
    suggestions: inspection.suggestions,
    result: inspection.result || '',
    images: images
  })
  dialogVisible.value = true
}

// 保存巡检记录
const saveInspection = async () => {
  try {
    // 验证必填字段
    if (!inspectionForm.slope_id) {
      ElMessage.error('请选择边坡')
      return
    }
    if (!inspectionForm.inspection_date) {
      ElMessage.error('请选择巡检日期')
      return
    }
    if (!inspectionForm.inspector) {
      ElMessage.error('请输入巡检人员')
      return
    }
    if (!inspectionForm.inspection_type) {
      ElMessage.error('请选择巡检类型')
      return
    }
    if (!inspectionForm.status) {
      ElMessage.error('请选择状态')
      return
    }
    
    // 处理日期格式 - 转换为 YYYY-MM-DD HH:mm:ss 格式
    let dateStr = inspectionForm.inspection_date
    if (dateStr instanceof Date) {
      const year = dateStr.getFullYear()
      const month = String(dateStr.getMonth() + 1).padStart(2, '0')
      const day = String(dateStr.getDate()).padStart(2, '0')
      const hours = String(dateStr.getHours()).padStart(2, '0')
      const minutes = String(dateStr.getMinutes()).padStart(2, '0')
      const seconds = String(dateStr.getSeconds()).padStart(2, '0')
      dateStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }
    
    // 处理图片数据
    console.log('原始图片数据:', inspectionForm.images)
    
    const imageList = inspectionForm.images
      .filter(img => {
        const hasData = img.base64 || img.url
        console.log('检查图片:', img.name, 'hasData:', hasData, 'base64:', !!img.base64, 'url:', !!img.url)
        return hasData
      })
      .map(img => {
        const data = img.base64 || img.url
        console.log('映射图片数据长度:', data ? data.length : 0)
        return data
      })
    
    console.log('处理后的图片列表:', imageList)
    
    const formData = {
      slope_id: inspectionForm.slope_id,
      inspection_date: dateStr,
      inspector: inspectionForm.inspector,
      inspection_type: inspectionForm.inspection_type,
      status: inspectionForm.status,
      content: inspectionForm.content || '',
      problems: inspectionForm.problems || '',
      suggestions: inspectionForm.suggestions || '',
      result: inspectionForm.result || '',
      images: JSON.stringify(imageList)
    }
    
    console.log('保存巡检记录，发送的数据：', formData)
    console.log('图片数据JSON长度:', formData.images.length)
    
    let response
    if (dialogType.value === 'add') {
      response = await axios.post(`${API_DATA}/api/inspections`, formData)
    } else {
      response = await axios.put(`${API_DATA}/api/inspections/${currentInspectionId.value}`, formData)
    }
    if (response.data.success) {
      ElMessage.success(response.data.message)
      dialogVisible.value = false
      getInspections()
    }
  } catch (error) {
    console.error('保存巡检记录失败:', error)
    if (error.response) {
      console.error('错误响应:', error.response.data)
      ElMessage.error(error.response.data.message || '保存巡检记录失败')
    } else {
      ElMessage.error('保存巡检记录失败')
    }
  }
}

// 删除巡检记录
const deleteInspection = async (id) => {
  try {
    const response = await axios.delete(`${API_DATA}/api/inspections/${id}`)
    if (response.data.success) {
      ElMessage.success(response.data.message)
      getInspections()
    }
  } catch (error) {
    console.error('删除巡检记录失败:', error)
    ElMessage.error('删除巡检记录失败')
  }
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString()
}

// 检查是否有照片
const hasImages = (row) => {
  return Number(row?.has_images) === 1
}

// 查看照片
const viewImages = async (inspection) => {
  try {
    const response = await axios.get(`${API_DATA}/api/inspections/${inspection.id}`)
    if (response.data.success) {
      const data = response.data.data
      currentImageTitle.value = `${data.slope_name} - ${formatDate(data.inspection_date)}`
      const imageArray = typeof data.images === 'string' ? JSON.parse(data.images) : data.images
      currentImages.value = Array.isArray(imageArray) ? imageArray : []
      imageDialogVisible.value = true
    }
  } catch (e) {
    console.error('获取图片数据失败:', e)
    ElMessage.error('获取图片数据失败')
  }
}

// 获取状态类型
const getStatusType = (status) => {
  const typeMap = {
    normal: 'success',
    attention: 'warning',
    abnormal: 'danger'
  }
  return typeMap[status] || ''
}

// 获取状态标签
const getStatusLabel = (status) => {
  const labelMap = {
    normal: '正常',
    attention: '需关注',
    abnormal: '异常'
  }
  return labelMap[status] || status
}

// 初始化
onMounted(() => {
  getSlopes()
  getInspections()
})
</script>

<style scoped>
.inspection-management {
  padding: 20px;
}

.page-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-bar {
  margin-bottom: 20px;
  background: #f5f7fa;
  padding: 20px;
  border-radius: 8px;
}

.search-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 0;
}

.search-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
  white-space: nowrap;
}

.search-input {
  width: 100%;
}

.search-actions {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  height: 100%;
  padding-top: 22px;
}

.search-btn,
.reset-btn {
  flex: 1;
  min-width: 80px;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.inspection-form {
  max-height: 600px;
  overflow-y: auto;
}

.image-gallery {
  max-height: 600px;
  overflow-y: auto;
}

.image-item {
  margin-bottom: 20px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  overflow: hidden;
}

.image-index {
  text-align: center;
  padding: 8px;
  background: #f5f7fa;
  font-size: 14px;
  color: #606266;
}
</style>
