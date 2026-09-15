<template>
  <div class="point-management">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <el-icon><DataAnalysis /></el-icon>
          <span>监测点管理</span>
          <div style="margin-left: auto; display: flex; gap: 10px;">
            <el-button type="primary" size="small" @click="handleAdd">
              <el-icon><Plus /></el-icon>
              添加监测点
            </el-button>
            <el-button type="success" size="small" @click="showBatchAddDialog">
              <el-icon><Plus /></el-icon>
              一键添加监测点
            </el-button>
          </div>
        </div>
      </template>
      
      <div class="point-filter">
        <el-select
          v-model="selectedSlope"
          placeholder="选择边坡"
          clearable
          filterable
          style="width: 260px"
          @change="handleSlopeChange"
        >
          <el-option label="全部边坡" value="" />
          <el-option v-for="slope in slopes" :key="slope.id" :label="slope.slope_name" :value="slope.id" />
        </el-select>
        <el-input
          v-model="pointKeyword"
          clearable
          placeholder="搜索监测点名称"
          style="width: 220px"
          @keyup.enter="loadPoints"
          @clear="loadPoints"
        />
        <el-select
          v-model="selectedPointType"
          clearable
          placeholder="监测点类型"
          style="width: 180px"
          @change="loadPoints"
        >
          <el-option v-for="type in POINT_TYPES" :key="type" :label="type" :value="type" />
        </el-select>
        <el-button type="primary" @click="loadPoints">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
        <el-button
          v-if="selectedSlope"
          type="warning"
          plain
          @click="openMapViewer"
        >
          <el-icon><Location /></el-icon>
          查看布点图
        </el-button>
      </div>

      <section class="point-overview">
        <div class="overview-heading">
          <div>
            <div class="overview-title">测点概况</div>
            <div class="overview-subtitle">{{ selectedSlope ? selectedSlopeName : '全部边坡' }}</div>
          </div>
          <el-tag v-if="selectedSlope" :type="hasCurrentMap ? 'success' : 'info'" effect="plain">
            {{ hasCurrentMap ? '已有布点图' : '尚无布点图' }}
          </el-tag>
        </div>

        <div class="overview-metrics">
          <div class="metric-item metric-total">
            <span class="metric-mark"></span>
            <div>
              <div class="metric-value">{{ physicalPointCount }}</div>
              <div class="metric-label">测点总数</div>
            </div>
          </div>
          <div v-for="item in pointTypeSummary" :key="item.type" class="metric-item">
            <span class="metric-mark" :style="{ backgroundColor: item.color }"></span>
            <div>
              <div class="metric-value">{{ item.count }}</div>
              <div class="metric-label">{{ item.shortLabel }}</div>
            </div>
          </div>
        </div>
      </section>
      
      <div class="point-list">
        <div class="detail-toolbar">
          <span>测点明细用于搜索、编辑和删除，默认收起，避免页面被大量测点占满。</span>
          <el-button size="small" @click="showPointDetail = !showPointDetail">
            {{ showPointDetail ? '收起明细' : '展开明细' }}
          </el-button>
        </div>
        <el-table v-show="showPointDetail" :data="points" style="width: 100%" border>
          <el-table-column type="index" label="序号" width="80" :index="indexMethod" align="center" />
          <el-table-column prop="point_name" label="监测点名称" align="center" />
          <el-table-column prop="slope_name" label="所属边坡" align="center" />
          <el-table-column prop="location" label="位置" align="center" />
          <el-table-column prop="point_type" label="监测点类型" align="center" />
          <el-table-column prop="description" label="描述" show-overflow-tooltip align="center" />
          <el-table-column prop="created_at" label="创建时间" width="180" align="center" />
          <el-table-column label="操作" width="150" align="center">
            <template #default="scope">
              <el-button size="small" @click="handleEdit(scope.row)">
                <el-icon><Edit /></el-icon>
                编辑
              </el-button>
              <el-button size="small" type="danger" @click="handleDelete(scope.row.id)">
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>
    
    <!-- 编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="500px"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="边坡" required>
          <el-select v-model="form.slope_id" placeholder="选择边坡">
            <el-option v-for="slope in slopes" :key="slope.id" :label="slope.slope_name" :value="slope.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="监测点名称" required>
          <el-input v-model="form.point_name" placeholder="请输入监测点名称" />
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="form.location" placeholder="请输入位置" />
        </el-form-item>
        <el-form-item label="监测点类型">
          <el-select v-model="form.point_type" placeholder="选择监测点类型">
            <el-option v-for="type in POINT_TYPES" :key="type" :label="type" :value="type" />
          </el-select>
        </el-form-item>
        <el-form-item label="布点图片">
          <el-upload
            class="avatar-uploader"
            action="#"
            :auto-upload="false"
            :on-change="handleFormImageChange"
            :show-file-list="false"
            accept="image/*"
          >
            <img v-if="form.photo" :src="form.photo" class="avatar" />
            <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
          </el-upload>
          <div class="photo-hint">点击上传或查看现场布点图</div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="请输入描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSubmit">确定</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 一键添加监测点对话框 -->
    <el-dialog
      v-model="batchAddDialogVisible"
      title="一键添加监测点"
      width="600px"
    >
      <el-form :model="batchAddForm" label-width="120px">
        <el-form-item label="选择边坡" required>
          <el-select v-model="batchAddForm.slope_id" placeholder="选择边坡">
            <el-option v-for="slope in slopes" :key="slope.id" :label="slope.slope_name" :value="slope.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="监测点数量" required>
          <el-input v-model.number="batchAddForm.count" type="number" min="1" max="100" placeholder="请输入监测点数量" />
        </el-form-item>
        <el-form-item label="监测点类型" required>
          <el-select v-model="batchAddForm.point_type" placeholder="选择监测点类型">
            <el-option v-for="type in POINT_TYPES" :key="type" :label="type" :value="type" />
          </el-select>
        </el-form-item>
        <el-form-item label="布点图片">
          <el-upload
            class="avatar-uploader"
            action="#"
            :auto-upload="false"
            :on-change="handleImageChange"
            :show-file-list="false"
            accept="image/*"
          >
            <img v-if="batchAddForm.photo" :src="batchAddForm.photo" class="avatar" />
            <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
          </el-upload>
          <div class="photo-hint">点击上传或查看现场布点图</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="batchAddDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleBatchAdd">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog
      v-model="mapViewerVisible"
      :title="`${selectedSlopeName} - 布点图`"
      width="min(1080px, 92vw)"
      class="map-viewer-dialog"
      destroy-on-close
    >
      <div v-if="currentMap" class="map-viewer">
        <div class="map-viewer-meta">
          <span>{{ currentMapName }}</span>
          <el-tag type="success" effect="plain">已布设 {{ mapPositions.length }} 个测点</el-tag>
        </div>
        <div class="map-preview">
          <img :src="currentMapUrl" :alt="`${selectedSlopeName}布点图`" />
          <div
            v-for="position in visibleMapPositions"
            :key="position.point_id"
            class="preview-marker"
            :style="previewMarkerStyle(position)"
          >
            <span class="preview-marker-dot"></span>
            <span v-if="position.label_visible !== false" class="preview-marker-label">
              {{ mapPointName(position.point_id) }}
            </span>
          </div>
        </div>
      </div>
      <el-empty v-else description="当前边坡尚未制作布点图">
        <el-button type="primary" @click="openMapSetup">
          <el-icon><Location /></el-icon>
          图上布点
        </el-button>
      </el-empty>
      <template #footer>
        <el-button @click="mapViewerVisible = false">关闭</el-button>
        <el-button v-if="currentMap" type="primary" @click="openMapSetup">编辑布点图</el-button>
      </template>
    </el-dialog>

    <SlopePointMapEditor
      v-model="mapEditorVisible"
      :slopes="slopes"
      :slope-id="selectedSlope"
      @saved="handleMapSaved"
    />
  </div>
</template>

<script setup>
import { computed, ref, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DataAnalysis, Plus, Edit, Delete, Location } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import { API_DATA } from '../config/api'
import SlopePointMapEditor from '../components/SlopePointMapEditor.vue'

const route = useRoute()
const emit = defineEmits(['changed'])

// 数据
const slopes = ref([])
const points = ref([])
const summaryPoints = ref([])
const selectedSlope = ref('')
const selectedPointType = ref('')
const pointKeyword = ref('')
const showPointDetail = ref(false)
const currentMap = ref(null)
const mapPositions = ref([])
const mapPoints = ref([])
const mapViewerVisible = ref(false)
const dialogVisible = ref(false)
const dialogTitle = ref('添加监测点')
const batchAddDialogVisible = ref(false)
const mapEditorVisible = ref(false)
const form = reactive({
  id: null,
  slope_id: null,
  point_name: '',
  location: '',
  point_type: '',
  description: '',
  photo: ''
})
const batchAddForm = reactive({
  slope_id: null,
  count: 1,
  point_type: '',
  photo: ''
})

const POINT_TYPES = ['地表位移监测点', '沉降监测点', '深部位移测斜孔', '裂缝观测点', '锚索应力监测点']
const POINT_TYPE_META = {
  地表位移监测点: { shortLabel: '地表位移/沉降点', color: '#409eff' },
  深部位移测斜孔: { shortLabel: '深部测斜孔', color: '#e6a23c' },
  裂缝观测点: { shortLabel: '裂缝观测', color: '#b36bce' },
  锚索应力监测点: { shortLabel: '锚索应力', color: '#1aa6a6' },
}
const SHARED_SURFACE_TYPES = new Set(['地表位移监测点', '沉降监测点', 'surface'])

const selectedSlopeName = computed(() => {
  return slopes.value.find((slope) => String(slope.id) === String(selectedSlope.value))?.slope_name || '当前边坡'
})

const physicalPointKey = (point) => {
  if (!SHARED_SURFACE_TYPES.has(point.point_type)) return `point:${point.id}`
  const location = String(point.location || '').trim().toLowerCase()
  return location
    ? `surface-settlement:${point.slope_id}:${location}`
    : `point:${point.id}`
}

const physicalPointCount = computed(() => {
  return new Set(summaryPoints.value.map(physicalPointKey)).size
})

const pointTypeSummary = computed(() => {
  const sharedKeys = new Set(
    summaryPoints.value
      .filter((point) => SHARED_SURFACE_TYPES.has(point.point_type))
      .map(physicalPointKey)
  )
  const deepCount = summaryPoints.value.filter((point) => ['深部位移测斜孔', 'deep'].includes(point.point_type)).length
  return [
    {
      type: 'surface-settlement',
      count: sharedKeys.size,
      ...POINT_TYPE_META.地表位移监测点,
    },
    {
      type: 'deep',
      count: deepCount,
      ...POINT_TYPE_META.深部位移测斜孔,
    },
  ]
})

const hasCurrentMap = computed(() => Boolean(currentMap.value))

const currentMapName = computed(() => {
  return currentMap.value?.original_name || currentMap.value?.file_name || `布点图 ${currentMap.value?.id || ''}`
})

const currentMapUrl = computed(() => {
  if (!currentMap.value?.file_path) return ''
  return /^https?:\/\//.test(currentMap.value.file_path)
    ? currentMap.value.file_path
    : `${API_DATA}${currentMap.value.file_path}`
})

const visibleMapPositions = computed(() => {
  const pointIds = new Set(mapPoints.value.map((point) => Number(point.id)))
  return mapPositions.value.filter((position) => pointIds.has(Number(position.point_id)))
})

// 加载边坡列表
const loadSlopes = async () => {
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`${API_DATA}/api/slopes`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    const result = await response.json()
    if (result.success) {
      slopes.value = result.data
    }
  } catch (error) {
    console.error('加载边坡失败:', error)
  }
}

// 加载监测点列表
const loadPoints = async () => {
  try {
    const token = localStorage.getItem('token')
    const params = new URLSearchParams()
    if (selectedSlope.value) params.set('slope_id', selectedSlope.value)
    if (selectedPointType.value) params.set('point_type', selectedPointType.value)
    if (pointKeyword.value.trim()) params.set('q', pointKeyword.value.trim())
    const query = params.toString()
    const url = `${API_DATA}/api/points${query ? `?${query}` : ''}`
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    const result = await response.json()
    if (result.success) {
      points.value = result.data
      if (pointKeyword.value || selectedPointType.value) {
        await loadPointSummary()
      } else {
        summaryPoints.value = result.data
      }
      if (pointKeyword.value || selectedPointType.value) showPointDetail.value = true
      await loadMapInfo()
    } else {
      ElMessage.error('获取监测点列表失败')
    }
  } catch (error) {
    console.error('加载监测点失败:', error)
    ElMessage.error('网络错误，请稍后重试')
  }
}

const loadPointSummary = async () => {
  const token = localStorage.getItem('token')
  const params = new URLSearchParams()
  if (selectedSlope.value) params.set('slope_id', selectedSlope.value)
  const query = params.toString()
  const response = await fetch(`${API_DATA}/api/points${query ? `?${query}` : ''}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  const result = await response.json()
  if (result.success) summaryPoints.value = result.data
}

const loadMapInfo = async () => {
  currentMap.value = null
  mapPositions.value = []
  mapPoints.value = []
  if (!selectedSlope.value) return
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`${API_DATA}/api/slope-map-positions/${selectedSlope.value}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    const result = await response.json()
    if (result.success) {
      currentMap.value = result.data?.current_map || null
      mapPositions.value = result.data?.positions || []
      mapPoints.value = result.data?.points || []
    }
  } catch (error) {
    console.error('加载布点图状态失败:', error)
  }
}

const handleSlopeChange = async () => {
  showPointDetail.value = false
  await loadPoints()
}

const resetFilters = async () => {
  selectedSlope.value = ''
  selectedPointType.value = ''
  pointKeyword.value = ''
  showPointDetail.value = false
  currentMap.value = null
  mapPositions.value = []
  mapPoints.value = []
  await loadPoints()
}

// 序号计算方法
const indexMethod = (index) => {
  return index + 1
}

const openMapViewer = async () => {
  if (!selectedSlope.value) {
    ElMessage.warning('请先选择边坡')
    return
  }
  await loadMapInfo()
  mapViewerVisible.value = true
}

const openMapSetup = () => {
  mapViewerVisible.value = false
  mapEditorVisible.value = true
}

const handleMapSaved = async () => {
  await loadPoints()
  emit('changed')
}

const mapPointName = (pointId) => {
  return mapPoints.value.find((point) => Number(point.id) === Number(pointId))?.point_name || String(pointId)
}

const mapPointType = (pointId) => {
  return mapPoints.value.find((point) => Number(point.id) === Number(pointId))?.point_type || ''
}

const parseMapPositionStyle = (position) => {
  if (position?.style && typeof position.style === 'object') return position.style
  if (!position?.style_json) return {}
  if (typeof position.style_json === 'object') return position.style_json
  try {
    return JSON.parse(position.style_json)
  } catch {
    return {}
  }
}

const previewMarkerStyle = (position) => {
  const style = parseMapPositionStyle(position)
  const typeColor = POINT_TYPE_META[mapPointType(position.point_id)]?.color || '#909399'
  const markerSize = Number(style.markerSize) || 28
  const fontSize = Number(style.labelFontSize) || 17
  const labelPadding = Number(style.labelPadding) || 8
  return {
    left: `${Number(position.x_percent)}%`,
    top: `${Number(position.y_percent)}%`,
    '--preview-dot-size': `${markerSize}px`,
    '--preview-font-size': `${fontSize}px`,
    '--preview-padding-x': `${labelPadding}px`,
    '--preview-padding-y': `${Math.max(2, Math.round(labelPadding / 2))}px`,
    '--preview-marker-color': style.markerColor || typeColor,
    '--preview-label-color': style.labelColor || '#111827',
    '--preview-label-bg': style.labelBgColor || '#ffffff',
    '--preview-shadow': style.showShadow === false ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.35)',
  }
}

watch(mapEditorVisible, async (visible, previousVisible) => {
  if (previousVisible && !visible) {
    await loadPoints()
    emit('changed')
  }
})

// 处理表单图片上传
const handleFormImageChange = (file) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    form.photo = e.target.result
  }
  reader.readAsDataURL(file.raw)
}

// 添加监测点
const handleAdd = () => {
  form.id = null
  form.slope_id = null
  form.point_name = ''
  form.location = ''
  form.point_type = ''
  form.description = ''
  form.photo = ''
  dialogTitle.value = '添加监测点'
  dialogVisible.value = true
}

// 编辑监测点
const handleEdit = (row) => {
  form.id = row.id
  form.slope_id = row.slope_id
  form.point_name = row.point_name
  form.location = row.location
  form.point_type = row.point_type
  form.description = row.description
  form.photo = row.photo || ''
  dialogTitle.value = '编辑监测点'
  dialogVisible.value = true
}

// 提交表单
const handleSubmit = async () => {
  try {
    const token = localStorage.getItem('token')
    const url = form.id ? `${API_DATA}/api/points/${form.id}` : `${API_DATA}/api/points`
    const method = form.id ? 'PUT' : 'POST'
    
    const formData = {
      ...form,
      photo: form.photo || null
    }
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(formData)
    })
    
    const result = await response.json()
    if (result.success) {
      ElMessage.success(result.message)
      dialogVisible.value = false
      await loadPoints()
      emit('changed')
    } else {
      ElMessage.error(result.message)
    }
  } catch (error) {
    console.error('提交失败:', error)
    ElMessage.error('网络错误，请稍后重试')
  }
}

// 删除监测点
const handleDelete = async (id) => {
  const token = localStorage.getItem('token')
  let lastDeleteStatus = null

  const doDelete = async (action) => {
    const url = action
      ? `${API_DATA}/api/points/${id}?action=${encodeURIComponent(action)}`
      : `${API_DATA}/api/points/${id}`

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    const result = await response.json().catch(() => ({}))
    lastDeleteStatus = response.status
    if (response.ok && result.success) {
      ElMessage.success(result.message || '删除成功')
      await loadPoints()
      emit('changed')
      return true
    }

    if (response.status === 409) {
      // points 删除接口：存在历史数据，需要 action=archive 或 action=cascade
      return false
    }

    ElMessage.error(result.message || '删除失败')
    return false
  }

  try {
    const ok = await doDelete()
    if (ok) return
    if (lastDeleteStatus !== 409) return

    const actionMsg =
      '该监测点存在历史数据，必须选择删除方式：\n' +
      '确认：级联删除（删除监测点及历史数据）\n' +
      '取消：归档（保留历史数据）'

    await ElMessageBox.confirm(actionMsg, '需要选择删除方式', {
      type: 'warning',
      confirmButtonText: '级联删除',
      cancelButtonText: '归档',
      closeOnClickModal: false,
    }).then(async () => {
      await doDelete('cascade')
    }).catch(async () => {
      await doDelete('archive')
    })
  } catch (error) {
    console.error('删除失败:', error)
    ElMessage.error('网络错误，请稍后重试')
  }
}

// 显示批量添加监测点弹窗
const showBatchAddDialog = () => {
  // 重置表单
  batchAddForm.slope_id = selectedSlope.value || null
  batchAddForm.count = 1
  batchAddForm.point_type = ''
  batchAddForm.photo = ''
  batchAddDialogVisible.value = true
}

// 处理图片上传
const handleImageChange = (file) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    batchAddForm.photo = e.target.result
  }
  reader.readAsDataURL(file.raw)
}

const POINT_TYPE_PREFIX = {
  地表位移监测点: 'BP',
  沉降监测点: 'CJ',
  深部位移测斜孔: 'LC',
  裂缝观测点: 'LF',
  锚索应力监测点: 'MS',
}

const getPointNamePrefix = (slope, pointType) => {
  return POINT_TYPE_PREFIX[pointType] || 'JC'
}

const getNextPointIndex = (slopeId, prefix, sourcePoints = points.value) => {
  const pattern = new RegExp(`^${prefix}[-_]?0*(\\d+)$`, 'i')
  const maxIndex = sourcePoints
    .filter(point => String(point.slope_id) === String(slopeId))
    .map(point => String(point.point_name || '').trim().match(pattern)?.[1])
    .filter(Boolean)
    .map(Number)
    .reduce((max, value) => Math.max(max, value), 0)

  return maxIndex + 1
}

const loadExistingPointsForSlope = async (slopeId) => {
  const token = localStorage.getItem('token')
  const response = await fetch(`${API_DATA}/api/points?slope_id=${slopeId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  const result = await response.json()
  return result.success ? result.data : []
}

// 生成监测点名称：按边坡/测点业务类型生成短编号，避免布点图标签过长
const generatePointName = (slope, pointType, index) => {
  const prefix = getPointNamePrefix(slope, pointType)
  const serialNumber = String(index).padStart(2, '0')
  return `${prefix}-${serialNumber}`
}

// 批量添加监测点
const handleBatchAdd = async () => {
  try {
    const { slope_id, count, point_type } = batchAddForm
    
    if (!slope_id) {
      ElMessage.error('请选择边坡')
      return
    }
    
    if (!count || count < 1) {
      ElMessage.error('请输入有效的监测点数量')
      return
    }
    
    if (!point_type) {
      ElMessage.error('请选择监测点类型')
      return
    }
    
    // 获取边坡信息
    const slope = slopes.value.find(s => s.id === slope_id)
    if (!slope) {
      ElMessage.error('边坡信息不存在')
      return
    }
    
    const token = localStorage.getItem('token')
    
    const existingPoints = await loadExistingPointsForSlope(slope_id)
    const prefix = getPointNamePrefix(slope, point_type)
    const startIndex = getNextPointIndex(slope_id, prefix, existingPoints)

    // 批量添加监测点
    const promises = []
    for (let i = 1; i <= count; i++) {
      const pointName = generatePointName(slope, point_type, startIndex + i - 1)
      const pointData = {
        slope_id,
        point_name: pointName,
        location: `位置${i}`,
        point_type,
        description: `${point_type} ${i}`,
        photo: batchAddForm.photo || null
      }
      
      const response = fetch(`${API_DATA}/api/points`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(pointData)
      })
      
      promises.push(response)
    }
    
    // 等待所有请求完成
    const responses = await Promise.all(promises)
    const results = await Promise.all(responses.map(r => r.json()))
    
    // 检查是否所有请求都成功
    const allSuccess = results.every(r => r.success)
    
    if (allSuccess) {
      ElMessage.success(`成功添加 ${count} 个监测点`)
      batchAddDialogVisible.value = false
      await loadPoints()
      emit('changed')
    } else {
      ElMessage.error('部分监测点添加失败，请重试')
    }
  } catch (error) {
    console.error('批量添加监测点失败:', error)
    ElMessage.error('网络错误，请稍后重试')
  }
}

// 初始加载（支持从数据录入页带 ?slope_id= 跳转过滤）
onMounted(async () => {
  await loadSlopes()
  const q = route.query.slope_id
  if (q !== undefined && q !== null && q !== '') {
    selectedSlope.value = Number(q) || q
  }
  await loadPoints()
})
</script>

<style scoped>
.point-management {
  max-width: 1200px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: bold;
}

.point-filter {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.point-overview {
  margin: 16px 0 18px;
  padding: 16px 20px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fafbfc;
}

.overview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.overview-title {
  color: #303133;
  font-size: 15px;
  font-weight: 600;
}

.overview-subtitle {
  margin-top: 3px;
  color: #909399;
  font-size: 12px;
}

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr));
  border-top: 1px solid #ebeef5;
}

.metric-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 16px 20px 2px;
}

.metric-item + .metric-item::before {
  position: absolute;
  top: 15px;
  bottom: 0;
  left: 0;
  width: 1px;
  background: #e4e7ed;
  content: '';
}

.metric-item:first-child {
  padding-left: 0;
}

.metric-mark {
  width: 8px;
  height: 32px;
  flex: none;
  border-radius: 2px;
  background: #303133;
}

.metric-total .metric-mark {
  background: #303133;
}

.metric-value {
  color: #303133;
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}

.metric-label {
  margin-top: 6px;
  overflow: hidden;
  color: #606266;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.point-list {
  margin-top: 20px;
}

.detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: #606266;
  font-size: 13px;
}

.map-viewer-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: #606266;
  font-size: 13px;
}

.map-preview {
  position: relative;
  overflow: hidden;
  width: 100%;
  background: #1f2937;
}

.map-preview > img {
  display: block;
  width: 100%;
  height: auto;
}

.preview-marker {
  position: absolute;
  z-index: 2;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.preview-marker-dot {
  display: block;
  width: var(--preview-dot-size);
  height: var(--preview-dot-size);
  border: 3px solid #ffffff;
  border-radius: 50%;
  background: var(--preview-marker-color);
  box-shadow: var(--preview-shadow);
}

.preview-marker-label {
  position: absolute;
  top: 50%;
  left: calc(100% + 7px);
  padding: var(--preview-padding-y) var(--preview-padding-x);
  border-radius: 3px;
  background: var(--preview-label-bg);
  box-shadow: var(--preview-shadow);
  color: var(--preview-label-color);
  font-size: var(--preview-font-size);
  line-height: 1.2;
  white-space: nowrap;
  transform: translateY(-50%);
}

@media (max-width: 760px) {
  .overview-metrics {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }

  .metric-item:nth-child(3)::before {
    display: none;
  }

  .metric-item:nth-child(3) {
    padding-left: 0;
  }
}

/* 布点图片上传样式 */
.avatar-uploader .avatar {
  width: 120px;
  height: 120px;
  display: block;
  border-radius: 4px;
}

.avatar-uploader-icon {
  font-size: 28px;
  color: #999;
  width: 120px;
  height: 120px;
  line-height: 120px;
  text-align: center;
  border: 1px dashed #d9d9d9;
  border-radius: 4px;
  cursor: pointer;
}

.photo-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
}
</style>

