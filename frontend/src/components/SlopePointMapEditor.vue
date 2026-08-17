<template>
  <el-dialog
    :model-value="modelValue"
    title="监测点图上布设"
    fullscreen
    destroy-on-close
    class="point-map-dialog"
    @update:model-value="emit('update:modelValue', $event)"
    @opened="handleOpened"
  >
    <div class="map-editor">
      <aside class="left-panel">
        <div class="panel-title">边坡与图件</div>
        <el-select v-model="activeSlopeId" placeholder="选择边坡" filterable style="width: 100%" @change="loadMapData">
          <el-option v-for="slope in slopes" :key="slope.id" :label="slope.slope_name" :value="String(slope.id)" />
        </el-select>

        <el-upload
          class="upload-block"
          action="#"
          :auto-upload="false"
          :show-file-list="false"
          accept="image/*"
          :on-change="handleImageUpload"
        >
          <el-button type="primary" plain style="width: 100%">
            <el-icon><Upload /></el-icon>
            上传无人机图片
          </el-button>
        </el-upload>

        <el-select
          v-model="activeMapId"
          placeholder="选择历史图片"
          clearable
          style="width: 100%"
          @change="loadMapData"
        >
          <el-option
            v-for="map in maps"
            :key="map.id"
            :label="`${map.is_current ? '当前 - ' : ''}${map.original_name || `图片${map.id}`}`"
            :value="String(map.id)"
          />
        </el-select>

        <div class="panel-actions">
          <el-button :disabled="!currentMap" @click="setCurrentMap">设为当前图</el-button>
          <el-button :disabled="!previousMap" @click="copyPreviousPositions">复制上一版点位</el-button>
        </div>

        <el-divider content-position="left">测点列表</el-divider>
        <el-input v-model="keyword" placeholder="搜索测点编号" clearable />

        <el-tabs v-model="pointTab" class="point-tabs">
          <el-tab-pane :label="`未布设 ${unplacedPoints.length}`" name="unplaced">
            <div class="point-list">
              <div
                v-for="point in groupedUnplacedPoints"
                :key="point.id"
                class="point-item"
                draggable="true"
                @dragstart="handlePointDragStart(point)"
                @click="selectedPointId = String(point.id)"
              >
                <span class="type-dot" :style="{ backgroundColor: pointColor(point.point_type) }"></span>
                <span>{{ point.point_name }}</span>
                <el-tag size="small" effect="plain">{{ point.point_type }}</el-tag>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane :label="`已布设 ${placedPoints.length}`" name="placed">
            <div class="point-list">
              <div
                v-for="point in groupedPlacedPoints"
                :key="point.id"
                class="point-item"
                @click="focusPoint(point.id)"
              >
                <span class="type-dot" :style="{ backgroundColor: pointColor(point.point_type) }"></span>
                <span>{{ point.point_name }}</span>
                <el-button text size="small" @click.stop="removePosition(point.id)">取消定位</el-button>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </aside>

      <main class="canvas-panel">
        <div class="toolbar">
          <el-button type="primary" :loading="saving" :disabled="!currentMap" @click="savePositions">
            <el-icon><Check /></el-icon>
            保存布点
          </el-button>
          <el-button :disabled="!currentMap" @click="resetView">适应窗口</el-button>
          <el-button :disabled="!currentMap" @click="exportAnnotatedMap">导出布点图</el-button>
          <el-button :disabled="!currentMap" @click="saveReportMaterial">加入报告素材</el-button>
          <el-button type="success" plain :disabled="!currentMap" @click="quickCreateVisible = true">
            图上新建测点
          </el-button>
          <span class="toolbar-hint">滚轮缩放，拖动空白处平移；拖动左侧测点到图片，或拖动已布设点位调整。</span>
        </div>

        <el-empty v-if="!activeSlopeId" description="请先选择边坡" />
        <el-empty v-else-if="!currentMap" description="当前边坡暂无无人机布点图，请先上传图片" />

        <div
          v-else
          ref="viewportRef"
          class="map-viewport"
          @wheel.prevent="handleWheel"
          @mousedown="startPan"
          @dragover.prevent
          @drop.prevent="handleDrop"
          @click="handleViewportClick"
        >
          <div class="map-stage" :style="stageStyle">
            <img ref="imageRef" class="map-image" :src="currentMapUrl" @load="resetView" />
            <div
              v-for="position in positionList"
              :key="position.point_id"
              class="map-marker"
              :class="{ active: selectedPointId === String(position.point_id) }"
              :style="markerStyle(position)"
              @mousedown.stop.prevent="startMarkerDrag(position, $event)"
              @click.stop="selectedPointId = String(position.point_id)"
            >
              <span class="marker-dot"></span>
              <span v-if="position.label_visible !== false" class="marker-label">
                {{ pointById(position.point_id)?.point_name || position.point_id }}
              </span>
            </div>
          </div>
        </div>
      </main>

      <aside class="right-panel">
        <div class="panel-title">图例与记录</div>
        <div class="legend-item" v-for="item in legendItems" :key="item.type">
          <span class="type-dot" :style="{ backgroundColor: item.color }"></span>
          <span>{{ item.type }}</span>
        </div>

        <el-divider content-position="left">当前统计</el-divider>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="测点总数">{{ points.length }}</el-descriptions-item>
          <el-descriptions-item label="已布设">{{ placedPoints.length }}</el-descriptions-item>
          <el-descriptions-item label="未布设">{{ unplacedPoints.length }}</el-descriptions-item>
          <el-descriptions-item label="当前图片">{{ currentMap?.original_name || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">显示样式</el-divider>
        <div class="style-controls">
          <el-switch
            v-model="styleSettings.uniformStyle"
            active-text="统一样式"
            inactive-text="单点样式"
          />
          <div v-if="!styleSettings.uniformStyle" class="selected-point-tip">
            当前点位：{{ selectedPoint?.point_name || '请先点击图上的测点' }}
          </div>
          <div class="style-row">
            <span>点位大小</span>
            <el-input-number
              v-model="activeStyleForm.markerSize"
              :min="1"
              :step="1"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="style-row">
            <span>字体大小</span>
            <el-input-number
              v-model="activeStyleForm.labelFontSize"
              :min="1"
              :step="1"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="style-row">
            <span>点位颜色</span>
            <div class="color-control">
              <el-color-picker v-model="activeStyleForm.markerColor" />
              <el-input v-model="activeStyleForm.markerColor" placeholder="#2f7de1" />
            </div>
          </div>
          <div class="style-row">
            <span>字体颜色</span>
            <div class="color-control">
              <el-color-picker v-model="activeStyleForm.labelColor" />
              <el-input v-model="activeStyleForm.labelColor" placeholder="#111827" />
            </div>
          </div>
          <div class="style-row">
            <span>标签背景</span>
            <div class="color-control">
              <el-color-picker v-model="activeStyleForm.labelBgColor" />
              <el-input v-model="activeStyleForm.labelBgColor" placeholder="#ffffff" />
            </div>
          </div>
          <div class="style-row">
            <span>背景透明</span>
            <el-input-number
              v-model="activeStyleForm.labelOpacity"
              :min="0"
              :max="100"
              :step="5"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <div class="style-row">
            <span>标签边距</span>
            <el-input-number
              v-model="activeStyleForm.labelPadding"
              :min="0"
              :step="1"
              controls-position="right"
              style="width: 100%"
            />
          </div>
          <el-checkbox v-model="activeStyleForm.showShadow">显示阴影</el-checkbox>
          <el-button
            v-if="!styleSettings.uniformStyle"
            :disabled="!selectedPosition"
            size="small"
            @click="applySelectedStyleToAll"
          >
            将当前点样式应用到全部点位
          </el-button>
        </div>

        <el-divider content-position="left">保存日志</el-divider>
        <el-timeline>
          <el-timeline-item v-for="log in logs" :key="log.id" :timestamp="formatTime(log.created_at)">
            <div>{{ log.summary }}</div>
            <small>{{ log.created_by_name || '-' }}</small>
          </el-timeline-item>
        </el-timeline>
      </aside>
    </div>

    <el-dialog v-model="quickCreateVisible" title="图上快速新建测点" width="420px" append-to-body>
      <el-form :model="quickForm" label-width="100px">
        <el-form-item label="测点编号" required>
          <el-input v-model="quickForm.point_name" placeholder="请输入测点编号" />
        </el-form-item>
        <el-form-item label="测点类型" required>
          <el-select v-model="quickForm.point_type" style="width: 100%">
            <el-option label="地表位移监测点" value="地表位移监测点" />
            <el-option label="沉降监测点" value="沉降监测点" />
            <el-option label="深部位移测斜孔" value="深部位移测斜孔" />
          </el-select>
        </el-form-item>
        <el-form-item label="位置描述">
          <el-input v-model="quickForm.location" placeholder="例如：二级平台左侧" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quickCreateVisible = false">取消</el-button>
        <el-button type="primary" :loading="creatingPoint" @click="createPointThenPlace">创建并等待点击定位</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Upload } from '@element-plus/icons-vue'
import { API_DATA } from '../config/api'
import { dataRequest } from '../utils/request'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  slopes: {
    type: Array,
    default: () => [],
  },
  slopeId: {
    type: [String, Number],
    default: '',
  },
})

const emit = defineEmits(['update:modelValue', 'saved'])

const activeSlopeId = ref('')
const activeMapId = ref('')
const maps = ref([])
const currentMap = ref(null)
const points = ref([])
const positions = ref([])
const logs = ref([])
const keyword = ref('')
const pointTab = ref('unplaced')
const selectedPointId = ref('')
const draggedPoint = ref(null)
const saving = ref(false)
const uploading = ref(false)
const viewportRef = ref(null)
const imageRef = ref(null)
const scale = ref(1)
const translate = reactive({ x: 0, y: 0 })
const isPanning = ref(false)
const panStart = reactive({ x: 0, y: 0, tx: 0, ty: 0 })
const draggingMarker = ref(null)
const pendingMarkerEvent = ref(null)
const pendingPanEvent = ref(null)
let markerMoveFrame = 0
let panMoveFrame = 0
const quickCreateVisible = ref(false)
const creatingPoint = ref(false)
const quickForm = reactive({
  point_name: '',
  point_type: '地表位移监测点',
  location: '',
})
const styleSettings = reactive({
  uniformStyle: false,
  markerSize: 28,
  labelFontSize: 17,
  labelPadding: 8,
  labelOpacity: 92,
  markerColor: '#2f7de1',
  labelColor: '#111827',
  labelBgColor: '#ffffff',
  showShadow: true,
})
const selectedStyleForm = reactive({
  markerSize: 28,
  labelFontSize: 17,
  labelPadding: 8,
  labelOpacity: 92,
  markerColor: '#2f7de1',
  labelColor: '#111827',
  labelBgColor: '#ffffff',
  showShadow: true,
})

const colorMap = {
  地表位移监测点: '#2f7de1',
  沉降监测点: '#28a745',
  深部位移测斜孔: '#f59e0b',
}

const legendItems = [
  { type: '地表位移监测点', color: colorMap.地表位移监测点 },
  { type: '沉降监测点', color: colorMap.沉降监测点 },
  { type: '深部位移测斜孔', color: colorMap.深部位移测斜孔 },
  { type: '其他类型', color: '#8c8c8c' },
]

const currentMapUrl = computed(() => currentMap.value?.file_path ? `${API_DATA}${currentMap.value.file_path}` : '')
const previousMap = computed(() => maps.value.find((item) => String(item.id) !== String(currentMap.value?.id)))
const stageStyle = computed(() => ({
  transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale.value})`,
  '--marker-size': `${styleSettings.markerSize}px`,
  '--marker-dot-size': `${styleSettings.markerSize}px`,
  '--label-font-size': `${styleSettings.labelFontSize}px`,
  '--label-padding-x': `${styleSettings.labelPadding}px`,
  '--label-padding-y': `${Math.max(3, Math.round(styleSettings.labelPadding / 2))}px`,
  '--label-opacity': styleSettings.labelOpacity / 100,
  '--marker-shadow': styleSettings.showShadow ? '0 2px 8px rgba(0,0,0,0.38)' : 'none',
}))

const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase())
const filteredPoints = computed(() => {
  if (!normalizedKeyword.value) return points.value
  return points.value.filter((point) => String(point.point_name).toLowerCase().includes(normalizedKeyword.value))
})

const positionMap = computed(() => new Map(positions.value.map((item) => [Number(item.point_id), item])))
const placedPoints = computed(() => filteredPoints.value.filter((point) => positionMap.value.has(Number(point.id))))
const unplacedPoints = computed(() => filteredPoints.value.filter((point) => !positionMap.value.has(Number(point.id))))
const groupedPlacedPoints = computed(() => naturalSortPoints(placedPoints.value))
const groupedUnplacedPoints = computed(() => naturalSortPoints(unplacedPoints.value))
const positionList = computed(() => positions.value.filter((item) => pointById(item.point_id)))
const selectedPoint = computed(() => pointById(selectedPointId.value))
const selectedPosition = computed(() => positions.value.find((item) => Number(item.point_id) === Number(selectedPointId.value)))
const activeStyleForm = computed(() => (styleSettings.uniformStyle ? styleSettings : selectedStyleForm))

function naturalSortPoints(list) {
  return [...list].sort((a, b) => {
    const typeCompare = String(a.point_type || '').localeCompare(String(b.point_type || ''), 'zh-Hans-CN')
    if (typeCompare !== 0) return typeCompare
    return String(a.point_name || '').localeCompare(String(b.point_name || ''), 'zh-Hans-CN', { numeric: true })
  })
}

function pointColor(type) {
  return colorMap[type] || '#8c8c8c'
}

function pointById(pointId) {
  return points.value.find((point) => Number(point.id) === Number(pointId))
}

function parsePositionStyle(styleJson) {
  if (!styleJson) return null
  if (typeof styleJson === 'object') return styleJson
  try {
    return JSON.parse(styleJson)
  } catch {
    return null
  }
}

function normalizeStyle(style, fallbackPoint) {
  return {
    markerSize: Number(style?.markerSize) || 28,
    labelFontSize: Number(style?.labelFontSize) || 17,
    labelPadding: Number(style?.labelPadding) || 8,
    labelOpacity: Number(style?.labelOpacity ?? 92),
    markerColor: style?.markerColor || pointColor(fallbackPoint?.point_type),
    labelColor: style?.labelColor || '#111827',
    labelBgColor: style?.labelBgColor || '#ffffff',
    showShadow: style?.showShadow !== undefined ? Boolean(style.showShadow) : true,
  }
}

function hexToRgba(color, alpha = 1) {
  const value = String(color || '#ffffff').trim()
  const hex = value.startsWith('#') ? value.slice(1) : value
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16)
    const g = parseInt(hex[1] + hex[1], 16)
    const b = parseInt(hex[2] + hex[2], 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  return value
}

function resolvedPointStyle(position) {
  const point = pointById(position.point_id)
  if (styleSettings.uniformStyle) return normalizeStyle(styleSettings, point)
  return normalizeStyle(position.style, point)
}

function markerStyle(position) {
  const style = resolvedPointStyle(position)
  return {
    left: `${position.x_percent}%`,
    top: `${position.y_percent}%`,
    '--marker-dot-size': `${style.markerSize}px`,
    '--label-font-size': `${style.labelFontSize}px`,
    '--label-padding-x': `${style.labelPadding}px`,
    '--label-padding-y': `${Math.max(0, Math.round(style.labelPadding / 2))}px`,
    '--label-opacity': style.labelOpacity / 100,
    '--marker-color': style.markerColor,
    '--label-color': style.labelColor,
    '--label-bg-color': style.labelBgColor,
    '--label-bg-rgba': hexToRgba(style.labelBgColor, style.labelOpacity / 100),
    '--marker-shadow': style.showShadow ? '0 2px 8px rgba(0,0,0,0.38)' : 'none',
  }
}

function assignSelectedStyleFromPosition() {
  if (!selectedPosition.value) return
  Object.assign(selectedStyleForm, resolvedPointStyle(selectedPosition.value))
}

function applySelectedStyleToPosition() {
  if (!selectedPosition.value || styleSettings.uniformStyle) return
  selectedPosition.value.style = normalizeStyle(selectedStyleForm, selectedPoint.value)
}

function applySelectedStyleToAll() {
  positions.value.forEach((position) => {
    position.style = normalizeStyle(selectedStyleForm, pointById(position.point_id))
  })
  ElMessage.success('已将当前点样式应用到全部点位，请保存布点')
}

function formatTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('zh-CN')
}

function loadStyleSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('slopePointMapStyle') || '{}')
    Object.assign(styleSettings, {
      uniformStyle: saved.uniformStyle !== undefined ? Boolean(saved.uniformStyle) : false,
      markerSize: Number(saved.markerSize) || styleSettings.markerSize,
      labelFontSize: Number(saved.labelFontSize) || styleSettings.labelFontSize,
      labelPadding: Number(saved.labelPadding) || styleSettings.labelPadding,
      labelOpacity: Number(saved.labelOpacity) || styleSettings.labelOpacity,
      markerColor: saved.markerColor || styleSettings.markerColor,
      labelColor: saved.labelColor || styleSettings.labelColor,
      labelBgColor: saved.labelBgColor || styleSettings.labelBgColor,
      showShadow: saved.showShadow !== undefined ? Boolean(saved.showShadow) : styleSettings.showShadow,
    })
  } catch {
    // ignore invalid local settings
  }
}

async function handleOpened() {
  loadStyleSettings()
  activeSlopeId.value = props.slopeId ? String(props.slopeId) : (activeSlopeId.value || String(props.slopes[0]?.id || ''))
  await loadMapData()
}

async function loadMapData() {
  if (!activeSlopeId.value) return
  try {
    const query = activeMapId.value ? `?map_id=${activeMapId.value}` : ''
    const result = await dataRequest(`/api/slope-map-positions/${activeSlopeId.value}${query}`)
    const data = result.data
    maps.value = data.maps || []
    currentMap.value = data.current_map || null
    activeMapId.value = currentMap.value ? String(currentMap.value.id) : ''
    points.value = data.points || []
    positions.value = (data.positions || []).map((item) => ({
      point_id: Number(item.point_id),
      x_percent: Number(item.x_percent),
      y_percent: Number(item.y_percent),
      label_visible: item.label_visible !== false && item.label_visible !== 0,
      style: parsePositionStyle(item.style_json),
    }))
    logs.value = data.logs || []
    await nextTick()
    resetView()
  } catch (error) {
    ElMessage.error(error.message || '加载图上布点数据失败')
  }
}

async function uploadFile(file) {
  const formData = new FormData()
  formData.append('module', 'slope-map')
  formData.append('business_id', String(activeSlopeId.value))
  formData.append('files', file)
  const result = await dataRequest(`/api/files/upload?module=slope-map&business_id=${encodeURIComponent(String(activeSlopeId.value))}`, {
    method: 'POST',
    body: formData,
  })
  return result.data?.[0]
}

async function handleImageUpload(file) {
  if (!activeSlopeId.value) {
    ElMessage.warning('请先选择边坡')
    return
  }
  uploading.value = true
  try {
    const asset = await uploadFile(file.raw)
    if (!asset?.id) throw new Error('图片上传失败')
    await dataRequest(`/api/slope-map-positions/${activeSlopeId.value}/maps`, {
      method: 'POST',
      body: {
        file_asset_id: asset.id,
        is_current: true,
      },
    })
    activeMapId.value = ''
    await loadMapData()
    ElMessage.success('无人机图片已上传并设为当前布点图')
  } catch (error) {
    ElMessage.error(error.message || '图片上传失败')
  } finally {
    uploading.value = false
  }
}

async function setCurrentMap() {
  if (!currentMap.value) return
  try {
    await dataRequest(`/api/slope-map-positions/maps/${currentMap.value.id}/current`, { method: 'PUT' })
    await loadMapData()
    ElMessage.success('已设为当前布点图')
  } catch (error) {
    ElMessage.error(error.message || '设置失败')
  }
}

async function copyPreviousPositions() {
  if (!previousMap.value) return
  try {
    const result = await dataRequest(`/api/slope-map-positions/${activeSlopeId.value}?map_id=${previousMap.value.id}`)
    positions.value = (result.data.positions || []).map((item) => ({
      point_id: Number(item.point_id),
      x_percent: Number(item.x_percent),
      y_percent: Number(item.y_percent),
      label_visible: item.label_visible !== false && item.label_visible !== 0,
      style: parsePositionStyle(item.style_json),
    }))
    ElMessage.success('已复制上一版点位，请根据新图微调后保存')
  } catch (error) {
    ElMessage.error(error.message || '复制失败')
  }
}

function resetView() {
  scale.value = 1
  translate.x = 0
  translate.y = 0
}

function imageRelativePosition(event) {
  const img = imageRef.value
  if (!img) return null
  const rect = img.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * 100
  const y = ((event.clientY - rect.top) / rect.height) * 100
  if (x < 0 || x > 100 || y < 0 || y > 100) return null
  return { x_percent: Math.round(x * 1000000) / 1000000, y_percent: Math.round(y * 1000000) / 1000000 }
}

function upsertPosition(pointId, percent) {
  const existing = positions.value.find((item) => Number(item.point_id) === Number(pointId))
  if (existing) {
    existing.x_percent = percent.x_percent
    existing.y_percent = percent.y_percent
    return
  }
  positions.value.push({
    point_id: Number(pointId),
    x_percent: percent.x_percent,
    y_percent: percent.y_percent,
    label_visible: true,
    style: normalizeStyle(null, pointById(pointId)),
  })
}

function handlePointDragStart(point) {
  draggedPoint.value = point
  selectedPointId.value = String(point.id)
}

function handleDrop(event) {
  if (!draggedPoint.value) return
  const percent = imageRelativePosition(event)
  if (!percent) return
  upsertPosition(draggedPoint.value.id, percent)
  draggedPoint.value = null
  pointTab.value = 'placed'
}

function handleViewportClick(event) {
  if (!selectedPointId.value || positionMap.value.has(Number(selectedPointId.value))) return
  const percent = imageRelativePosition(event)
  if (!percent) return
  upsertPosition(selectedPointId.value, percent)
  pointTab.value = 'placed'
}

function startPan(event) {
  if (!currentMap.value) return
  isPanning.value = true
  panStart.x = event.clientX
  panStart.y = event.clientY
  panStart.tx = translate.x
  panStart.ty = translate.y
  window.addEventListener('mousemove', handlePanMove)
  window.addEventListener('mouseup', stopPan)
}

function handlePanMove(event) {
  if (!isPanning.value) return
  pendingPanEvent.value = event
  if (panMoveFrame) return
  panMoveFrame = window.requestAnimationFrame(() => {
    const current = pendingPanEvent.value
    if (current && isPanning.value) {
      translate.x = panStart.tx + current.clientX - panStart.x
      translate.y = panStart.ty + current.clientY - panStart.y
    }
    panMoveFrame = 0
  })
}

function stopPan() {
  isPanning.value = false
  if (panMoveFrame) window.cancelAnimationFrame(panMoveFrame)
  panMoveFrame = 0
  pendingPanEvent.value = null
  window.removeEventListener('mousemove', handlePanMove)
  window.removeEventListener('mouseup', stopPan)
}

function handleWheel(event) {
  const delta = event.deltaY > 0 ? -0.08 : 0.08
  scale.value = Math.max(0.3, Math.min(4, Math.round((scale.value + delta) * 100) / 100))
}

function startMarkerDrag(position) {
  draggingMarker.value = position
  window.addEventListener('mousemove', handleMarkerMove)
  window.addEventListener('mouseup', stopMarkerDrag)
}

function handleMarkerMove(event) {
  if (!draggingMarker.value) return
  pendingMarkerEvent.value = event
  if (markerMoveFrame) return
  markerMoveFrame = window.requestAnimationFrame(() => {
    const current = pendingMarkerEvent.value
    if (current && draggingMarker.value) {
      const percent = imageRelativePosition(current)
      if (percent) {
        draggingMarker.value.x_percent = percent.x_percent
        draggingMarker.value.y_percent = percent.y_percent
      }
    }
    markerMoveFrame = 0
  })
}

function stopMarkerDrag() {
  draggingMarker.value = null
  if (markerMoveFrame) window.cancelAnimationFrame(markerMoveFrame)
  markerMoveFrame = 0
  pendingMarkerEvent.value = null
  window.removeEventListener('mousemove', handleMarkerMove)
  window.removeEventListener('mouseup', stopMarkerDrag)
}

function removePosition(pointId) {
  positions.value = positions.value.filter((item) => Number(item.point_id) !== Number(pointId))
}

function focusPoint(pointId) {
  selectedPointId.value = String(pointId)
}

function suggestPointName(type) {
  const prefixMap = {
    地表位移监测点: 'BP',
    沉降监测点: 'CJ',
    深部位移测斜孔: 'LC',
  }
  const prefix = prefixMap[type] || 'P'
  const nums = points.value
    .filter((point) => point.point_type === type)
    .map((point) => String(point.point_name).match(/(\d+)$/)?.[1])
    .filter(Boolean)
    .map(Number)
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `${prefix}-${String(next).padStart(2, '0')}`
}

async function createPointThenPlace() {
  if (!quickForm.point_name.trim()) quickForm.point_name = suggestPointName(quickForm.point_type)
  creatingPoint.value = true
  try {
    const draftPositions = positions.value.map((item) => ({ ...item }))
    const result = await dataRequest(`/api/slope-map-positions/${activeSlopeId.value}/points`, {
      method: 'POST',
      body: { ...quickForm },
    })
    quickCreateVisible.value = false
    quickForm.point_name = ''
    quickForm.location = ''
    await loadMapData()
    const serverPointIds = new Set(positions.value.map((item) => Number(item.point_id)))
    draftPositions.forEach((item) => {
      if (!serverPointIds.has(Number(item.point_id))) positions.value.push(item)
    })
    selectedPointId.value = String(result.data.id)
    pointTab.value = 'unplaced'
    ElMessage.success('测点已创建，请在图片上点击位置完成定位')
  } catch (error) {
    ElMessage.error(error.message || '新建测点失败')
  } finally {
    creatingPoint.value = false
  }
}

async function savePositions() {
  if (!currentMap.value) return
  saving.value = true
  try {
    const result = await dataRequest(`/api/slope-map-positions/${activeSlopeId.value}/positions`, {
      method: 'POST',
      body: {
        map_id: currentMap.value.id,
        positions: positions.value,
      },
    })
    await loadMapData()
    emit('saved')
    ElMessage.success(result.data?.summary || '布点已保存')
  } catch (error) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function drawAnnotatedMap() {
  const img = imageRef.value
  if (!img || !currentMap.value) return null

  const canvas = document.createElement('canvas')
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = currentMapUrl.value
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
  })

  const headerHeight = 72
  const footerHeight = 46
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight + headerHeight + footerHeight
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#111827'
  ctx.font = `${Math.max(28, Math.round(canvas.width / 46))}px SimHei`
  ctx.textAlign = 'center'
  const slopeName = props.slopes.find((slope) => String(slope.id) === String(activeSlopeId.value))?.slope_name || '边坡'
  ctx.fillText(`${slopeName} - 监测点布设图`, canvas.width / 2, 46)
  ctx.drawImage(image, 0, headerHeight, image.naturalWidth, image.naturalHeight)

  positionList.value.forEach((position) => {
    const point = pointById(position.point_id)
    const style = resolvedPointStyle(position)
    const x = (position.x_percent / 100) * image.naturalWidth
    const y = headerHeight + (position.y_percent / 100) * image.naturalHeight
    const markerRadius = Math.max(6, Math.round((style.markerSize / 1800) * image.naturalWidth))
    const labelFontSize = Math.max(12, Math.round((style.labelFontSize / 1500) * image.naturalWidth))
    const labelPadding = Math.max(2, Math.round((style.labelPadding / 1800) * image.naturalWidth))
    ctx.fillStyle = style.markerColor
    ctx.beginPath()
    ctx.arc(x, y, markerRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    if (position.label_visible !== false) {
      ctx.font = `${labelFontSize}px SimHei`
      const text = point?.point_name || String(position.point_id)
      const metrics = ctx.measureText(text)
      const labelHeight = labelFontSize + labelPadding
      ctx.fillStyle = hexToRgba(style.labelBgColor, style.labelOpacity / 100)
      ctx.fillRect(x + markerRadius + 8, y - labelHeight / 2, metrics.width + labelPadding * 2, labelHeight)
      ctx.fillStyle = style.labelColor
      ctx.textAlign = 'left'
      ctx.fillText(text, x + markerRadius + 8 + labelPadding, y + labelFontSize / 3)
    }
  })

  ctx.textAlign = 'left'
  let legendX = 18
  const legendY = canvas.height - 20
  legendItems.forEach((item) => {
    ctx.fillStyle = item.color
    ctx.beginPath()
    ctx.arc(legendX, legendY - 5, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#374151'
    ctx.font = '18px SimSun'
    ctx.fillText(item.type, legendX + 14, legendY)
    legendX += ctx.measureText(item.type).width + 52
  })
  ctx.textAlign = 'right'
  ctx.fillText(`导出时间：${new Date().toLocaleString('zh-CN')}`, canvas.width - 18, legendY)
  return canvas.toDataURL('image/png')
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',')
  const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mimeType })
}

async function exportAnnotatedMap() {
  try {
    const dataUrl = await drawAnnotatedMap()
    if (!dataUrl) throw new Error('布点图尚未生成')
    const objectUrl = URL.createObjectURL(dataUrlToBlob(dataUrl))
    const slopeName = props.slopes.find((slope) => String(slope.id) === String(activeSlopeId.value))?.slope_name || '边坡'
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `${slopeName}-监测点布设图.png`.replace(/[\\/:*?"<>|]/g, '_')
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch (error) {
    ElMessage.error(error.message || '导出失败')
  }
}

async function saveReportMaterial() {
  try {
    const imageUrl = await drawAnnotatedMap()
    if (!imageUrl) throw new Error('布点图尚未生成')
    const slopeName = props.slopes.find((slope) => String(slope.id) === String(activeSlopeId.value))?.slope_name || '边坡'
    const materials = JSON.parse(localStorage.getItem('reportChartMaterials') || '[]')
    materials.unshift({
      id: `${Date.now()}`,
      title: `${slopeName} - 监测点布设图`,
      slopeName,
      monitoringType: '监测布点图',
      imageUrl,
      createdAt: new Date().toISOString(),
    })
    localStorage.setItem('reportChartMaterials', JSON.stringify(materials.slice(0, 30)))
    ElMessage.success('已加入报告素材')
  } catch (error) {
    ElMessage.error(error.message || '加入报告素材失败')
  }
}

watch(
  styleSettings,
  () => {
    localStorage.setItem('slopePointMapStyle', JSON.stringify(styleSettings))
  },
  { deep: true }
)

watch(selectedPointId, () => {
  assignSelectedStyleFromPosition()
})

watch(
  selectedStyleForm,
  () => {
    applySelectedStyleToPosition()
  },
  { deep: true }
)
</script>

<style scoped>
.map-editor {
  height: calc(100vh - 112px);
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 280px;
  gap: 12px;
  background: #f5f7fa;
  padding: 12px;
  box-sizing: border-box;
}

.left-panel,
.right-panel,
.canvas-panel {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  min-height: 0;
}

.left-panel,
.right-panel {
  padding: 12px;
  overflow: auto;
}

.canvas-panel {
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-title {
  font-weight: 700;
  margin-bottom: 12px;
}

.upload-block {
  margin: 10px 0;
}

.panel-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 10px;
}

.point-tabs {
  margin-top: 8px;
}

.point-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.point-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  cursor: grab;
}

.point-item:hover {
  border-color: #409eff;
  background: #f0f9ff;
}

.type-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.toolbar-hint {
  color: #909399;
  font-size: 12px;
}

.map-viewport {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: #1f2937;
  border-radius: 4px;
  cursor: grab;
}

.map-stage {
  position: absolute;
  left: 32px;
  top: 32px;
  transform-origin: top left;
  will-change: transform;
  contain: layout paint;
}

.map-image {
  display: block;
  width: auto;
  height: auto;
  max-width: min(1500px, calc(100vw - 660px));
  max-height: calc(100vh - 210px);
  object-fit: contain;
  user-select: none;
  pointer-events: auto;
}

.map-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: move;
  z-index: 3;
  will-change: left, top;
  touch-action: none;
}

.marker-dot {
  width: var(--marker-dot-size, 28px);
  height: var(--marker-dot-size, 28px);
  border-radius: 50%;
  border: 3px solid #fff;
  background: var(--marker-color, #2f7de1);
  box-shadow: var(--marker-shadow, 0 2px 8px rgba(0, 0, 0, 0.38));
}

.marker-label {
  padding: var(--label-padding-y, 4px) var(--label-padding-x, 8px);
  border-radius: 4px;
  background: var(--label-bg-rgba, rgba(255, 255, 255, 0.92));
  border: 1px solid rgba(17, 24, 39, 0.16);
  box-shadow: var(--marker-shadow, 0 2px 8px rgba(0, 0, 0, 0.18));
  color: var(--label-color, #111827);
  font-size: var(--label-font-size, 17px);
  font-weight: 600;
  white-space: nowrap;
}

.map-marker.active .marker-label {
  outline: 2px solid #409eff;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.style-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.style-row {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 10px;
  align-items: center;
  color: #606266;
  font-size: 13px;
}

.style-row :deep(.el-slider) {
  margin: 0;
}

.selected-point-tip {
  padding: 6px 8px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background: #f8fafc;
  color: #606266;
  font-size: 12px;
}

.color-control {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px;
  align-items: center;
}

@media (max-width: 1200px) {
  .map-editor {
    grid-template-columns: 260px minmax(0, 1fr);
  }

  .right-panel {
    display: none;
  }
}
</style>
