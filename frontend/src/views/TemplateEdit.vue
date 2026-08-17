<template>
  <div class="template-edit">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>{{ isEdit ? '编辑模板' : '创建模板' }}</span>
        </div>
      </template>
      
      <el-form :model="templateForm" label-width="120px">
        <el-form-item label="模板名称">
          <el-input v-model="templateForm.name" placeholder="请输入模板名称" />
        </el-form-item>
        
        <el-form-item label="模板类型">
          <el-select v-model="templateForm.type" placeholder="请选择模板类型">
            <el-option label="周报" value="weekly" />
            <el-option label="月报" value="monthly" />
            <el-option label="自定义" value="custom" />
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
        
        <el-form-item label="模块设置">
          <div class="module-settings">
            <el-button type="primary" size="small" @click="addModule" style="margin-bottom: 10px">
              <el-icon><Plus /></el-icon> 添加模块
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
                    <el-select v-model="module.type" style="width: 150px">
                      <el-option label="标题模块" value="title" />
                      <el-option label="文字模块" value="text" />
                      <el-option label="图表模块" value="chart" />
                      <el-option label="表格模块" value="table" />
                    </el-select>
                    <span class="module-index">{{ index + 1 }}</span>
                  </div>
                  <div class="module-actions">
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
                
                <div class="module-content">
                  <el-form-item v-if="module.type === 'title'" label="标题内容">
                    <el-input v-model="module.content" placeholder="请输入标题内容" />
                  </el-form-item>
                  <el-form-item v-if="module.type === 'title'" label="标题级别">
                    <el-select v-model="module.level" style="width: 100px">
                      <el-option label="H1" value="h1" />
                      <el-option label="H2" value="h2" />
                      <el-option label="H3" value="h3" />
                    </el-select>
                  </el-form-item>
                  
                  <el-form-item v-if="module.type === 'text'" label="文字内容">
                    <el-input
                      v-model="module.content"
                      type="textarea"
                      :rows="3"
                      placeholder="请输入文字内容"
                    />
                  </el-form-item>
                  
                  <el-form-item v-if="module.type === 'chart'" label="图表标题">
                    <el-input v-model="module.title" placeholder="请输入图表标题" />
                  </el-form-item>
                  <el-form-item v-if="module.type === 'chart'" label="图表类型">
                    <el-select v-model="module.chartType" style="width: 120px">
                      <el-option label="折线图" value="line" />
                      <el-option label="柱状图" value="bar" />
                      <el-option label="饼图" value="pie" />
                    </el-select>
                  </el-form-item>
                  
                  <el-form-item v-if="module.type === 'table'" label="表格标题">
                    <el-input v-model="module.title" placeholder="请输入表格标题" />
                  </el-form-item>
                </div>
              </el-card>
            </div>
          </div>
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="saveTemplate">保存模板</el-button>
          <el-button @click="cancelEdit">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Delete, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import Sortable from 'sortablejs'

const router = useRouter()
const route = useRoute()

const templateId = computed(() => route.params.id)
const isEdit = computed(() => !!templateId.value)

// 模板表单
const templateForm = reactive({
  id: '',
  name: '',
  type: 'weekly',
  description: '',
  modules: []
})

const moduleListRef = ref(null)
const draggingModule = ref(null)

// 生成唯一ID
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// 添加模块
const addModule = () => {
  templateForm.modules.push({
    id: generateId(),
    type: 'text',
    content: '',
    title: '',
    level: 'h2',
    chartType: 'line'
  })
}

// 移除模块
const removeModule = (id) => {
  const index = templateForm.modules.findIndex(module => module.id === id)
  if (index !== -1) {
    templateForm.modules.splice(index, 1)
  }
}

// 移动模块
const moveModule = (index, direction) => {
  if (direction === 'up' && index > 0) {
    // 向上移动
    const temp = templateForm.modules[index]
    templateForm.modules[index] = templateForm.modules[index - 1]
    templateForm.modules[index - 1] = temp
  } else if (direction === 'down' && index < templateForm.modules.length - 1) {
    // 向下移动
    const temp = templateForm.modules[index]
    templateForm.modules[index] = templateForm.modules[index + 1]
    templateForm.modules[index + 1] = temp
  }
}

// 保存模板
const saveTemplate = () => {
  if (!templateForm.name) {
    ElMessage.warning('请输入模板名称')
    return
  }
  
  if (!templateForm.type) {
    ElMessage.warning('请选择模板类型')
    return
  }
  
  if (templateForm.modules.length === 0) {
    ElMessage.warning('请至少添加一个模块')
    return
  }
  
  // 这里可以调用API保存模板
  console.log('保存模板:', templateForm)
  
  ElMessage.success(isEdit.value ? '模板更新成功' : '模板创建成功')
  router.push('/template-list')
}

// 取消编辑
const cancelEdit = () => {
  router.push('/template-list')
}

onMounted(() => {
  if (moduleListRef.value) {
    new Sortable(moduleListRef.value, {
      animation: 150,
      ghostClass: 'sortable-ghost',
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
  
  // 如果是编辑模式，加载模板数据
  if (isEdit.value) {
    // 这里可以从API获取模板数据
    console.log('加载模板数据:', templateId.value)
    // 模拟加载数据
    setTimeout(() => {
      // 模拟模板数据
      templateForm.id = templateId.value
      templateForm.name = '周报模板'
      templateForm.type = 'weekly'
      templateForm.description = '标准周报模板，包含工作概述、数据汇总和工作计划'
      templateForm.modules = [
        {
          id: '1-1',
          type: 'title',
          content: '一、本周工作概述',
          level: 'h2',
          title: '',
          chartType: 'line'
        },
        {
          id: '1-2',
          type: 'text',
          content: '本周完成了以下工作...',
          level: 'h2',
          title: '',
          chartType: 'line'
        },
        {
          id: '1-3',
          type: 'title',
          content: '二、监测数据汇总',
          level: 'h2',
          title: '',
          chartType: 'line'
        },
        {
          id: '1-4',
          type: 'chart',
          title: '本周监测数据趋势',
          chartType: 'line',
          content: '',
          level: 'h2'
        },
        {
          id: '1-5',
          type: 'table',
          title: '监测数据详情',
          content: '',
          level: 'h2',
          chartType: 'line'
        },
        {
          id: '1-6',
          type: 'title',
          content: '三、下周工作计划',
          level: 'h2',
          title: '',
          chartType: 'line'
        },
        {
          id: '1-7',
          type: 'text',
          content: '下周计划开展以下工作...',
          level: 'h2',
          title: '',
          chartType: 'line'
        }
      ]
    }, 500)
  }
})
</script>

<style scoped>
.template-edit {
  max-width: 1000px;
  margin: 0 auto;
}

.card-header {
  font-size: 18px;
  font-weight: bold;
}

.module-settings {
  margin-top: 10px;
}

.module-card {
  margin-bottom: 15px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: move;
}

.module-card:hover {
  box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.15);
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e4e7ed;
}

.module-title {
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 10px;
}

.module-index {
  background-color: #409eff;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
}

.module-actions {
  display: flex;
  gap: 5px;
}

.module-content {
  padding-top: 10px;
}

.sortable-ghost {
  opacity: 0.5;
  background: #f4f4f4;
}

.dragging {
  border: 2px dashed #409eff;
}
</style>
