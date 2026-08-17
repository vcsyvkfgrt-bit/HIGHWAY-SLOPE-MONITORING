<template>
  <div class="operation-logs">
    <el-card>
      <template #header>
        <div class="page-header">
          <h2>操作日志</h2>
          <el-button @click="loadLogs">刷新</el-button>
        </div>
      </template>
      <el-table :data="logs" border>
        <el-table-column prop="created_at" label="时间" width="180" />
        <el-table-column prop="username" label="用户" width="120" />
        <el-table-column prop="method" label="方法" width="90" />
        <el-table-column prop="path" label="接口路径" min-width="260" />
        <el-table-column prop="status_code" label="状态码" width="90" />
        <el-table-column prop="duration_ms" label="耗时(ms)" width="100" />
        <el-table-column prop="ip" label="IP" width="140" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { API_DATA } from '../config/api'
import { apiRequest } from '../utils/request'

const logs = ref([])

async function loadLogs() {
  try {
    const data = await apiRequest(`${API_DATA}/api/operation-logs?limit=200`)
    logs.value = data.data || []
    return

    const res = await fetch(`${API_DATA}/api/operation-logs?limit=200`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    })
    const legacyData = await res.json()
    if (!res.ok || !legacyData.success) throw new Error(legacyData.message || '获取日志失败')
    logs.value = legacyData.data || []
  } catch (error) {
    ElMessage.error(error.message)
  }
}

onMounted(loadLogs)
</script>

<style scoped>
.operation-logs {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.page-header h2 {
  margin: 0;
}
</style>
