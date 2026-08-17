<template>
  <div class="inspection-detail">
    <el-card class="page-card">
      <template #header>
        <div class="card-header">
          <span>巡检记录详情</span>
          <el-button @click="goBack">
            <el-icon><ArrowLeft /></el-icon>
            返回列表
          </el-button>
        </div>
      </template>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <p>加载中...</p>
      </div>

      <!-- 详情内容 -->
      <div v-else-if="inspection" class="detail-content">
        <!-- 基本信息 -->
        <el-descriptions class="info-section" :column="1">
          <el-descriptions-item label="边坡名称">
            {{ inspection.slope_name }}
          </el-descriptions-item>
          <el-descriptions-item label="巡检日期">
            {{ formatDate(inspection.inspection_date) }}
          </el-descriptions-item>
          <el-descriptions-item label="巡检人员">
            {{ inspection.inspector }}
          </el-descriptions-item>
          <el-descriptions-item label="巡检类型">
            {{ inspection.inspection_type }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(inspection.status)">
              {{ getStatusLabel(inspection.status) }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 巡检内容 -->
        <div class="section">
          <h4>巡检内容</h4>
          <el-divider />
          <div class="content-box">
            {{ inspection.content || '无' }}
          </div>
        </div>

        <!-- 问题描述 -->
        <div class="section">
          <h4>问题描述</h4>
          <el-divider />
          <div class="content-box">
            {{ inspection.problems || '无' }}
          </div>
        </div>

        <!-- 建议措施 -->
        <div class="section">
          <h4>建议措施</h4>
          <el-divider />
          <div class="content-box">
            {{ inspection.suggestions || '无' }}
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <el-button type="primary" @click="openEditDialog">
            <el-icon><Edit /></el-icon>
            编辑
          </el-button>
          <el-button type="danger" @click="deleteInspection">
            <el-icon><Delete /></el-icon>
            删除
          </el-button>
        </div>
      </div>

      <!-- 未找到记录 -->
      <div v-else class="not-found">
        <el-icon :size="48" color="#909399"><InfoFilled /></el-icon>
        <p>未找到巡检记录</p>
      </div>
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      title="编辑巡检记录"
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
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveInspection">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Edit, Delete, Loading, InfoFilled } from '@element-plus/icons-vue'
import axios from 'axios'
import { API_DATA } from '../config/api'

const route = useRoute()
const router = useRouter()

// 状态
const loading = ref(true)
const inspection = ref(null)
const slopes = ref([])
const dialogVisible = ref(false)

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
  result: ''
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
  }
}

// 获取巡检记录详情
const getInspectionDetail = async () => {
  const { id } = route.params
  try {
    const response = await axios.get(`${API_DATA}/api/inspections/${id}`)
    if (response.data.success) {
      inspection.value = response.data.data
      // 填充表单数据
      Object.assign(inspectionForm, {
        slope_id: inspection.value.slope_id,
        inspection_date: new Date(inspection.value.inspection_date),
        inspector: inspection.value.inspector,
        inspection_type: inspection.value.inspection_type,
        status: inspection.value.status,
        content: inspection.value.content,
        problems: inspection.value.problems,
        suggestions: inspection.value.suggestions,
        result: inspection.value.result || ''
      })
    }
  } catch (error) {
    console.error('获取巡检记录详情失败:', error)
    ElMessage.error('获取巡检记录详情失败')
  } finally {
    loading.value = false
  }
}

// 保存巡检记录
const saveInspection = async () => {
  try {
    const { id } = route.params
    const response = await axios.put(`${API_DATA}/api/inspections/${id}`, inspectionForm)
    if (response.data.success) {
      ElMessage.success(response.data.message)
      dialogVisible.value = false
      getInspectionDetail()
    }
  } catch (error) {
    console.error('保存巡检记录失败:', error)
    ElMessage.error('保存巡检记录失败')
  }
}

// 删除巡检记录
const deleteInspection = async () => {
  try {
    const { id } = route.params
    const response = await axios.delete(`${API_DATA}/api/inspections/${id}`)
    if (response.data.success) {
      ElMessage.success(response.data.message)
      goBack()
    }
  } catch (error) {
    console.error('删除巡检记录失败:', error)
    ElMessage.error('删除巡检记录失败')
  }
}

// 打开编辑对话框
const openEditDialog = () => {
  dialogVisible.value = true
}

// 返回列表
const goBack = () => {
  router.push('/inspection-management')
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString()
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
  getInspectionDetail()
})
</script>

<style scoped>
.inspection-detail {
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

.loading-container {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
}

.loading-container p {
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

.detail-content {
  padding: 20px 0;
}

.info-section {
  margin-bottom: 30px;
}

.section {
  margin-bottom: 30px;
}

.section h4 {
  margin-bottom: 10px;
  color: #303133;
  font-weight: 600;
}

.content-box {
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #ebeef5;
}

.not-found {
  text-align: center;
  padding: 60px 20px;
  color: #909399;
}

.not-found p {
  margin-top: 15px;
  font-size: 16px;
}

.inspection-form {
  max-height: 600px;
  overflow-y: auto;
}
</style>
