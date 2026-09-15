<template>
  <div class="template-create">
    <el-card class="page-card">
      <template #header>
        <div class="page-header">
          <div class="header-title">
            <h2>模板制作</h2>
            <p class="subtitle">创建和编辑报告模板，支持多级内容结构</p>
          </div>
          <el-button-group>
            <el-button type="primary" @click="saveTemplate">
              <el-icon><Check /></el-icon>
              保存模板
            </el-button>
            <el-button @click="resetForm">
              <el-icon><RefreshRight /></el-icon>
              重置
            </el-button>
          </el-button-group>
        </div>
      </template>

      <el-form :model="templateForm" label-width="120px" class="template-form">
        <!-- 基本信息 -->
        <el-divider content-position="left">基本信息</el-divider>
        
        <el-form-item label="模板名称" required>
          <el-input v-model="templateForm.name" placeholder="请输入模板名称" />
        </el-form-item>

        <el-form-item label="模板类型">
          <el-select v-model="templateForm.type" style="width: 200px">
            <el-option label="周报模板" value="weekly" />
            <el-option label="月报模板" value="monthly" />
            <el-option label="监理例会材料" value="supervision_meeting" />
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

        <!-- 模块设置 -->
        <el-divider content-position="left">模块设置（一级标题）</el-divider>
        
        <div class="module-settings">
          <el-button type="primary" size="small" @click="addModule" style="margin-bottom: 10px">
            <el-icon><Plus /></el-icon> 添加一级模块
          </el-button>

          <div class="module-list" ref="moduleListRef">
            <el-card 
              v-for="(module, index) in templateForm.modules" 
              :key="module.id" 
              class="module-card"
              :class="{ 'dragging': draggingModule === module.id }"
              :data-module-id="module.id"
            >
              <div class="module-header">
                <div class="module-title">
                  <el-tag type="primary" size="small" style="margin-right: 8px;">一级</el-tag>
                  <el-input 
                    v-model="module.name" 
                    placeholder="请输入一级标题名称" 
                    style="width: 200px"
                  />
                </div>
                <div class="module-actions">
                  <el-button size="small" type="success" @click="addChildModule(module)">
                    <el-icon><Plus /></el-icon>
                    添加子内容
                  </el-button>
                  <el-button size="small" @click="moveModule(index, 'up')" :disabled="index === 0">
                    <el-icon><ArrowUp /></el-icon>
                  </el-button>
                  <el-button size="small" @click="moveModule(index, 'down')" :disabled="index === templateForm.modules.length - 1">
                    <el-icon><ArrowDown /></el-icon>
                  </el-button>
                  <el-button size="small" type="danger" @click="removeModule(module.id)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>

              <div class="style-section">
                <div class="style-section-title">一级标题格式</div>
                <div class="style-grid">
                  <el-form-item label="字体" class="child-form-item">
                    <el-select v-model="module.style.fontFamily" style="width: 140px;">
                      <el-option v-for="font in fontOptions" :key="font.value" :label="font.label" :value="font.value" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="字号" class="child-form-item">
                    <el-input-number v-model="module.style.fontSize" :min="9" :max="36" :step="1" controls-position="right" style="width: 120px;" />
                  </el-form-item>
                  <el-form-item label="粗细" class="child-form-item">
                    <el-select v-model="module.style.fontWeight" style="width: 120px;">
                      <el-option label="常规" value="normal" />
                      <el-option label="加粗" value="bold" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="对齐" class="child-form-item">
                    <el-select v-model="module.style.textAlign" style="width: 120px;">
                      <el-option label="左对齐" value="left" />
                      <el-option label="居中" value="center" />
                      <el-option label="右对齐" value="right" />
                      <el-option label="两端对齐" value="justify" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="首行缩进" class="child-form-item">
                    <el-input-number v-model="module.style.firstLineIndent" :min="0" :max="4" :step="0.5" controls-position="right" style="width: 120px;" />
                  </el-form-item>
                  <el-form-item label="行距" class="child-form-item">
                    <el-input-number v-model="module.style.lineHeight" :min="1" :max="3" :step="0.1" controls-position="right" style="width: 120px;" />
                  </el-form-item>
                  <el-form-item label="段前" class="child-form-item">
                    <el-input-number v-model="module.style.spacingBefore" :min="0" :max="48" :step="1" controls-position="right" style="width: 120px;" />
                  </el-form-item>
                  <el-form-item label="段后" class="child-form-item">
                    <el-input-number v-model="module.style.spacingAfter" :min="0" :max="48" :step="1" controls-position="right" style="width: 120px;" />
                  </el-form-item>
                </div>
              </div>

              <!-- 子内容列表 -->
              <div v-if="module.children && module.children.length > 0" class="children-list">
                <el-divider content-position="left">子内容（二级标题/图表/表格）</el-divider>
                <div 
                  v-for="(child, childIndex) in module.children" 
                  :key="child.id"
                  class="child-item"
                >
                  <div class="child-header">
                    <el-tag type="info" size="small" style="margin-right: 8px;">{{ childIndex + 1 }}</el-tag>
                    <el-select v-model="child.type" style="width: 120px; margin-right: 8px;">
                      <el-option label="二级标题" value="title" />
                      <el-option label="文字内容" value="text" />
                      <el-option label="下拉选择" value="select" />
                      <el-option label="图表" value="chart" />
                      <el-option label="表格" value="table" />
                      <el-option label="监测数据" value="monitoring" />
                    </el-select>
                    <el-input 
                      v-model="child.name" 
                      placeholder="子内容名称" 
                      style="width: 180px; margin-right: 8px;"
                    />
                    <el-button size="small" @click="moveChildModule(module, childIndex, 'up')" :disabled="childIndex === 0">
                      <el-icon><ArrowUp /></el-icon>
                    </el-button>
                    <el-button size="small" @click="moveChildModule(module, childIndex, 'down')" :disabled="childIndex === module.children.length - 1">
                      <el-icon><ArrowDown /></el-icon>
                    </el-button>
                    <el-button size="small" type="danger" @click="removeChildModule(module, child.id)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                  
                  <!-- 子内容详细设置 -->
                  <div class="child-content">
                    <!-- 二级标题设置 -->
                    <template v-if="child.type === 'title'">
                      <el-form-item label="默认内容" class="child-form-item">
                        <el-input 
                          v-model="child.default" 
                          placeholder="请输入默认标题内容"
                          style="width: 300px;"
                        />
                      </el-form-item>
                    </template>

                    <!-- 文字内容设置 -->
                    <template v-if="child.type === 'text'">
                      <el-form-item label="默认内容" class="child-form-item">
                        <el-input 
                          v-model="child.default" 
                          type="textarea"
                          :rows="3"
                          placeholder="请输入默认文字内容"
                          style="width: 400px;"
                        />
                      </el-form-item>
                    </template>

                    <!-- 下拉选择设置 -->
                    <template v-if="child.type === 'select'">
                      <el-form-item label="选项" class="child-form-item">
                        <el-input 
                          v-model="child.optionsText" 
                          type="textarea"
                          :rows="2"
                          placeholder="请输入选项，用逗号分隔，如：选项1,选项2,选项3"
                          style="width: 400px;"
                          @change="updateOptions(child)"
                        />
                      </el-form-item>
                      <el-form-item label="默认选中" class="child-form-item">
                        <el-select v-model="child.default" style="width: 200px;">
                          <el-option 
                            v-for="(opt, idx) in child.options" 
                            :key="idx" 
                            :label="opt" 
                            :value="opt" 
                          />
                        </el-select>
                      </el-form-item>
                    </template>

                    <!-- 图表设置 -->
                    <template v-if="child.type === 'chart'">
                      <el-form-item label="图表类型" class="child-form-item">
                        <el-select v-model="child.chartType" style="width: 150px;">
                          <el-option label="折线图" value="line" />
                          <el-option label="柱状图" value="bar" />
                          <el-option label="饼图" value="pie" />
                          <el-option label="散点图" value="scatter" />
                        </el-select>
                      </el-form-item>
                      <el-form-item label="数据说明" class="child-form-item">
                        <el-input 
                          v-model="child.description" 
                          placeholder="请输入图表数据说明"
                          style="width: 300px;"
                        />
                      </el-form-item>
                    </template>

                    <!-- 表格设置 -->
                    <template v-if="child.type === 'table'">
                      <el-form-item label="表格列" class="child-form-item">
                        <el-input 
                          v-model="child.columnsText" 
                          placeholder="请输入列名，用逗号分隔，如：监测点,位移值,变化率"
                          style="width: 400px;"
                          @change="updateColumns(child)"
                        />
                      </el-form-item>
                    </template>

                    <!-- 监测数据设置 -->
                    <template v-if="child.type === 'monitoring'">
                      <el-form-item label="数据类型" class="child-form-item">
                        <el-select v-model="child.monitoringType" style="width: 150px;">
                          <el-option label="表面位移" value="surface" />
                          <el-option label="沉降监测" value="settlement" />
                          <el-option label="深部位移" value="deep" />
                          <el-option label="裂缝观测" value="crack" />
                          <el-option label="锚索应力" value="anchor-stress" />
                          <el-option label="降雨量" value="rainfall" />
                          <el-option label="地下水位" value="groundwater" />
                        </el-select>
                      </el-form-item>
                    </template>

                    <template v-if="['chart', 'table', 'monitoring'].includes(child.type)">
                      <el-form-item label="业务数据源" class="child-form-item">
                        <el-select
                          v-model="child.dataSource"
                          placeholder="请选择业务数据来源"
                          clearable
                          style="width: 260px;"
                        >
                          <el-option
                            v-for="source in businessDataSources"
                            :key="source.value"
                            :label="source.label"
                            :value="source.value"
                          />
                        </el-select>
                      </el-form-item>
                      <el-form-item label="标准占位符" class="child-form-item">
                        <el-select
                          v-model="child.placeholderKey"
                          placeholder="绑定报告占位符"
                          clearable
                          filterable
                          style="width: 260px;"
                        >
                          <el-option
                            v-for="placeholder in filteredPlaceholders(child)"
                            :key="placeholder.key"
                            :label="`${placeholder.key} - ${placeholder.label}`"
                            :value="placeholder.key"
                          />
                        </el-select>
                      </el-form-item>
                    </template>

                    <div class="style-section child-style-section">
                      <div class="style-section-title">内容格式</div>
                      <div class="style-grid">
                        <el-form-item label="字体" class="child-form-item">
                          <el-select v-model="child.style.fontFamily" style="width: 140px;">
                            <el-option v-for="font in fontOptions" :key="font.value" :label="font.label" :value="font.value" />
                          </el-select>
                        </el-form-item>
                        <el-form-item label="字号" class="child-form-item">
                          <el-input-number v-model="child.style.fontSize" :min="9" :max="36" :step="1" controls-position="right" style="width: 120px;" />
                        </el-form-item>
                        <el-form-item label="粗细" class="child-form-item">
                          <el-select v-model="child.style.fontWeight" style="width: 120px;">
                            <el-option label="常规" value="normal" />
                            <el-option label="加粗" value="bold" />
                          </el-select>
                        </el-form-item>
                        <el-form-item label="对齐" class="child-form-item">
                          <el-select v-model="child.style.textAlign" style="width: 120px;">
                            <el-option label="左对齐" value="left" />
                            <el-option label="居中" value="center" />
                            <el-option label="右对齐" value="right" />
                            <el-option label="两端对齐" value="justify" />
                          </el-select>
                        </el-form-item>
                        <el-form-item label="首行缩进" class="child-form-item">
                          <el-input-number v-model="child.style.firstLineIndent" :min="0" :max="4" :step="0.5" controls-position="right" style="width: 120px;" />
                        </el-form-item>
                        <el-form-item label="行距" class="child-form-item">
                          <el-input-number v-model="child.style.lineHeight" :min="1" :max="3" :step="0.1" controls-position="right" style="width: 120px;" />
                        </el-form-item>
                        <el-form-item label="段前" class="child-form-item">
                          <el-input-number v-model="child.style.spacingBefore" :min="0" :max="48" :step="1" controls-position="right" style="width: 120px;" />
                        </el-form-item>
                        <el-form-item label="段后" class="child-form-item">
                          <el-input-number v-model="child.style.spacingAfter" :min="0" :max="48" :step="1" controls-position="right" style="width: 120px;" />
                        </el-form-item>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else class="no-children">
                <el-empty description="暂无子内容，点击添加子内容按钮添加" :image-size="60" />
              </div>
            </el-card>
          </div>
        </div>

        <!-- 预览 -->
        <el-divider content-position="left">模板预览</el-divider>
        
        <div class="template-preview" v-if="templateForm.modules.length > 0">
          <h3>模板结构预览</h3>
          <div class="preview-content">
            <div v-for="(module, index) in templateForm.modules" :key="module.id" class="preview-module">
              <div class="preview-module-title" :style="textStyleCss(module.style)">
                <span class="level-tag">一级</span>
                {{ module.name || '未命名模块' }}
              </div>
              
              <div v-if="module.children && module.children.length > 0" class="preview-children">
                <div v-for="(child, childIndex) in module.children" :key="child.id" class="preview-child" :style="textStyleCss(child.style)">
                  <span class="child-tag" :class="child.type">{{ getChildTypeLabel(child.type) }}</span>
                  {{ child.name || '未命名子内容' }}
                  <span v-if="child.default" class="default-value">默认: {{ child.default }}</span>
                </div>
              </div>
              <div v-else class="no-children-hint">
                <el-tag type="warning" size="small">无子内容</el-tag>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="no-modules">
          <el-empty description="暂无模块，请添加一级模块" />
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter, useRoute } from 'vue-router'
import Sortable from 'sortablejs'
import axios from 'axios'
import { API_APP, TEMPLATES_PATH } from '../config/api'
import {
  Check,
  RefreshRight,
  Plus,
  ArrowUp,
  ArrowDown,
  Delete
} from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()

// 模板表单
const templateForm = reactive({
  name: '',
  type: 'custom',
  description: '',
  modules: []
})

const businessDataSources = [
  { value: 'slope_ledger', label: '边坡监测台账' },
  { value: 'monitoring_data', label: '地表位移/沉降监测数据' },
  { value: 'inclinometer_data', label: '深部测斜数据' },
  { value: 'inspections', label: '巡检记录' },
  { value: 'alarms', label: '预警记录' },
  { value: 'slope_ledger_map', label: '监测布点图' },
  { value: 'weather_rainfall', label: '天气与雨量' },
  { value: 'map_overview', label: '边坡空间位置' },
  { value: 'supervision_meeting', label: '监理例会材料' }
]
const standardPlaceholders = ref([])

const fontOptions = [
  { label: '宋体', value: 'SimSun' },
  { label: '黑体', value: 'SimHei' },
  { label: '仿宋', value: 'FangSong' },
  { label: '楷体', value: 'KaiTi' },
  { label: '微软雅黑', value: 'Microsoft YaHei' },
  { label: 'Times New Roman', value: 'Times New Roman' }
]

const createTextStyle = (kind = 'body') => ({
  fontFamily: kind === 'heading' ? 'SimHei' : 'SimSun',
  fontSize: kind === 'heading' ? 16 : 12,
  fontWeight: kind === 'heading' ? 'bold' : 'normal',
  textAlign: 'left',
  firstLineIndent: kind === 'body' ? 2 : 0,
  lineHeight: 1.5,
  spacingBefore: kind === 'heading' ? 12 : 0,
  spacingAfter: kind === 'heading' ? 8 : 6
})

const normalizeStyle = (style, kind = 'body') => ({
  ...createTextStyle(kind),
  ...(style || {})
})

// 拖拽状态
const moduleListRef = ref(null)
const draggingModule = ref(null)

// 生成唯一ID
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// 添加一级模块
const addModule = () => {
  const newModule = {
    id: generateId(),
    name: '',
    style: createTextStyle('heading'),
    children: []
  }
  templateForm.modules.push(newModule)
}

// 添加子内容
const addChildModule = (module) => {
  if (!module.children) {
    module.children = []
  }
  const newChild = {
    id: generateId(),
    type: 'text',
    name: '',
    default: '',
    options: [],
    optionsText: '',
    chartType: 'line',
    description: '',
    columns: [],
    columnsText: '',
    monitoringType: 'surface',
    dataSource: '',
    placeholderKey: '',
    style: createTextStyle('body')
  }
  module.children.push(newChild)
}

// 移除一级模块
const removeModule = (id) => {
  ElMessageBox.confirm(
    '确定要删除此模块吗？同时会删除其所有子内容。',
    '删除模块',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    const index = templateForm.modules.findIndex(module => module.id === id)
    if (index !== -1) {
      templateForm.modules.splice(index, 1)
      ElMessage.success('模块已删除')
    }
  })
}

// 移除子内容
const removeChildModule = (module, childId) => {
  const index = module.children.findIndex(child => child.id === childId)
  if (index !== -1) {
    module.children.splice(index, 1)
    ElMessage.success('子内容已删除')
  }
}

// 移动一级模块
const moveModule = (index, direction) => {
  if (direction === 'up' && index > 0) {
    const temp = templateForm.modules[index]
    templateForm.modules[index] = templateForm.modules[index - 1]
    templateForm.modules[index - 1] = temp
  } else if (direction === 'down' && index < templateForm.modules.length - 1) {
    const temp = templateForm.modules[index]
    templateForm.modules[index] = templateForm.modules[index + 1]
    templateForm.modules[index + 1] = temp
  }
}

// 移动子内容
const moveChildModule = (module, childIndex, direction) => {
  if (direction === 'up' && childIndex > 0) {
    const temp = module.children[childIndex]
    module.children[childIndex] = module.children[childIndex - 1]
    module.children[childIndex - 1] = temp
  } else if (direction === 'down' && childIndex < module.children.length - 1) {
    const temp = module.children[childIndex]
    module.children[childIndex] = module.children[childIndex + 1]
    module.children[childIndex + 1] = temp
  }
}

// 更新选项
const updateOptions = (child) => {
  if (child.optionsText) {
    child.options = child.optionsText.split(',').map(opt => opt.trim()).filter(opt => opt)
  } else {
    child.options = []
  }
}

// 更新表格列
const updateColumns = (child) => {
  if (child.columnsText) {
    child.columns = child.columnsText.split(',').map(col => col.trim()).filter(col => col)
  } else {
    child.columns = []
  }
}

// 获取子内容类型标签
const getChildTypeLabel = (type) => {
  const labelMap = {
    title: '标题',
    text: '文字',
    select: '选择',
    chart: '图表',
    table: '表格',
    monitoring: '监测'
  }
  return labelMap[type] || type
}

const textStyleCss = (style) => {
  const normalized = normalizeStyle(style)
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

const filteredPlaceholders = (child) => {
  if (!['chart', 'table', 'monitoring'].includes(child.type)) {
    return standardPlaceholders.value
  }

  const targetType = child.type === 'monitoring' ? ['chart', 'table', 'number'] : [child.type]
  return standardPlaceholders.value.filter(item => targetType.includes(item.type) || item.source === child.dataSource)
}

const loadPlaceholderDictionary = async () => {
  try {
    const response = await axios.get(`${API_APP}${TEMPLATES_PATH}/placeholders/dictionary`)
    if (response.data.success) {
      standardPlaceholders.value = response.data.data || []
    }
  } catch (error) {
    console.warn('加载标准占位符字典失败:', error)
  }
}

const normalizeModules = (modules = []) => {
  return modules.map(module => ({
    ...module,
    style: normalizeStyle(module.style, 'heading'),
    children: (Array.isArray(module.children) ? module.children : []).map(child => ({
      options: [],
      columns: [],
      dataSource: '',
      placeholderKey: '',
      ...child,
      style: normalizeStyle(child.style, child.type === 'title' ? 'heading' : 'body')
    }))
  }))
}

const buildDataBindings = () => {
  const bindings = {}
  templateForm.modules.forEach(module => {
    ;(module.children || []).forEach(child => {
      if (!child.dataSource && !child.placeholderKey) return
      bindings[`${module.id}.${child.id}`] = {
        moduleName: module.name,
        childName: child.name,
        childType: child.type,
        dataSource: child.dataSource || '',
        placeholderKey: child.placeholderKey || '',
        monitoringType: child.monitoringType || '',
        chartType: child.chartType || '',
        columns: child.columns || []
      }
    })
  })
  return bindings
}

// 保存模板
const saveTemplate = async () => {
  if (!templateForm.name.trim()) {
    ElMessage.warning('请输入模板名称')
    return
  }

  if (templateForm.modules.length === 0) {
    ElMessage.warning('请至少添加一个模块')
    return
  }

  // 验证模块名称
  for (const module of templateForm.modules) {
    if (!module.name.trim()) {
      ElMessage.warning('请填写所有一级模块的名称')
      return
    }
    if (module.children && module.children.length > 0) {
      for (const child of module.children) {
        if (!child.name.trim()) {
          ElMessage.warning(`模块"${module.name}"中有未命名的子内容`)
          return
        }
      }
    }
  }

  try {
    const token = localStorage.getItem('token')
    const templateData = {
      name: templateForm.name,
      type: templateForm.type,
      description: templateForm.description,
      template_kind: 'system',
      modules: templateForm.modules,
      data_bindings: buildDataBindings()
    }

    // 如果是编辑模式，调用更新API
    const templateId = route.params.id
    if (templateId) {
      const response = await axios.put(`${API_APP}${TEMPLATES_PATH}/${templateId}`, templateData, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.success) {
        ElMessage.success('模板更新成功')
        router.push('/template-list')
      } else {
        ElMessage.error(response.data.error || '更新失败')
      }
    } else {
      // 创建新模板
      const response = await axios.post(`${API_APP}${TEMPLATES_PATH}`, templateData, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.success) {
        ElMessage.success('模板创建成功')
        router.push('/template-list')
      } else {
        ElMessage.error(response.data.error || '创建失败')
      }
    }
  } catch (error) {
    console.error('保存模板失败:', error)
    if (error.response?.status === 409) {
      ElMessageBox.confirm(
        '已存在同名模板，是否覆盖？',
        '模板已存在',
        {
          confirmButtonText: '覆盖',
          cancelButtonText: '取消',
          type: 'warning'
        }
      ).then(async () => {
        // 先获取模板列表找到同名模板
        try {
          const response = await axios.get(`${API_APP}${TEMPLATES_PATH}`)
          if (response.data.success) {
            const existingTemplate = response.data.data.find(t => t.name === templateForm.name)
            if (existingTemplate) {
              const token = localStorage.getItem('token')
              const updateResponse = await axios.put(`${API_APP}${TEMPLATES_PATH}/${existingTemplate.id}`, {
                name: templateForm.name,
                type: templateForm.type,
                description: templateForm.description,
                template_kind: 'system',
                modules: templateForm.modules,
                data_bindings: buildDataBindings()
              }, {
                headers: { Authorization: `Bearer ${token}` }
              })
              if (updateResponse.data.success) {
                ElMessage.success('模板更新成功')
                router.push('/template-list')
              }
            }
          }
        } catch (err) {
          ElMessage.error('更新模板失败')
        }
      })
    } else {
      ElMessage.error(error.response?.data?.error || '保存模板失败')
    }
  }
}

// 加载模板详情（编辑模式）
const loadTemplate = async (id) => {
  try {
    const response = await axios.get(`${API_APP}${TEMPLATES_PATH}/${id}`)
    if (response.data.success) {
      const template = response.data.data
      templateForm.name = template.name
      templateForm.type = template.type
      templateForm.description = template.description || ''
      templateForm.modules = normalizeModules(template.modules || [])
    }
  } catch (error) {
    console.error('加载模板失败:', error)
    ElMessage.error('加载模板失败')
  }
}

// 重置表单
const resetForm = () => {
  templateForm.name = ''
  templateForm.type = 'custom'
  templateForm.description = ''
  templateForm.modules = []
}

// 初始化拖拽排序
onMounted(() => {
  loadPlaceholderDictionary()

  // 检查是否是编辑模式
  const templateId = route.params.id
  if (templateId) {
    loadTemplate(templateId)
  }

  if (moduleListRef.value) {
    new Sortable(moduleListRef.value, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      handle: '.module-card',
      onStart: function(evt) {
        draggingModule.value = evt.item.getAttribute('data-module-id')
      },
      onEnd: function(evt) {
        draggingModule.value = null
        // 重新排序模块数组
        const newOrder = [...moduleListRef.value.children].map(el => el.getAttribute('data-module-id'))
        templateForm.modules.sort((a, b) => {
          return newOrder.indexOf(a.id) - newOrder.indexOf(b.id)
        })
      }
    })
  }
})
</script>

<style scoped>
.template-create {
  padding: 20px;
}

.page-card {
  min-height: calc(100vh - 140px);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
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

.template-form {
  margin-top: 20px;
}

.module-settings {
  margin: 20px 0;
}

.module-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.module-card {
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.module-card:hover {
  box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.15);
}

.module-card.dragging {
  opacity: 0.5;
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
}

.module-title {
  display: flex;
  align-items: center;
}

.module-actions {
  display: flex;
  gap: 5px;
}

.children-list {
  margin-top: 15px;
  padding: 15px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.child-item {
  margin-bottom: 15px;
  padding: 15px;
  background-color: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}

.child-header {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.child-content {
  padding-left: 40px;
}

.child-form-item {
  margin-bottom: 10px;
}

.style-section {
  margin: 10px 0 14px;
  padding: 12px 12px 2px;
  background: #fafafa;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}

.child-style-section {
  margin-top: 12px;
}

.style-section-title {
  margin-bottom: 10px;
  color: #606266;
  font-size: 13px;
  font-weight: 600;
}

.style-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(170px, 1fr));
  column-gap: 12px;
  align-items: start;
}

.no-children {
  margin-top: 15px;
  padding: 20px;
}

.no-children-hint {
  margin-top: 10px;
  padding: 10px;
  text-align: center;
}

.template-preview {
  margin-top: 20px;
  padding: 20px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.template-preview h3 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: #303133;
}

.preview-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.preview-module {
  padding: 15px;
  background-color: #fff;
  border-left: 4px solid #409eff;
  border-radius: 4px;
}

.preview-module-title {
  font-size: 16px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 10px;
}

.level-tag {
  display: inline-block;
  padding: 2px 8px;
  margin-right: 8px;
  background-color: #409eff;
  color: #fff;
  font-size: 12px;
  border-radius: 3px;
}

.preview-children {
  margin-top: 10px;
  padding-left: 20px;
}

.preview-child {
  padding: 8px 0;
  border-bottom: 1px dashed #ebeef5;
  font-size: 14px;
  color: #606266;
}

.preview-child:last-child {
  border-bottom: none;
}

.child-tag {
  display: inline-block;
  padding: 2px 6px;
  margin-right: 8px;
  font-size: 12px;
  border-radius: 3px;
}

.child-tag.title {
  background-color: #ecf5ff;
  color: #409eff;
}

.child-tag.text {
  background-color: #f0f9eb;
  color: #67c23a;
}

.child-tag.select {
  background-color: #fdf6ec;
  color: #e6a23c;
}

.child-tag.chart {
  background-color: #f4f4f5;
  color: #909399;
}

.child-tag.table {
  background-color: #fef0f0;
  color: #f56c6c;
}

.child-tag.monitoring {
  background-color: #f0f2ff;
  color: #6366f1;
}

.default-value {
  margin-left: 10px;
  color: #909399;
  font-size: 12px;
}

.no-modules {
  margin-top: 20px;
  padding: 40px;
}

.sortable-ghost {
  opacity: 0.5;
  background-color: #f5f7fa;
}
</style>
