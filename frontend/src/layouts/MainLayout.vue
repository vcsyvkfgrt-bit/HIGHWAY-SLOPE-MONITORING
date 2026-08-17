<template>
  <el-container class="main-layout">
    <el-aside width="220px" class="layout-aside">
      <div class="logo" @click="router.push('/home')">高边坡监测预警平台</div>
      <el-menu
        :default-active="activeMenu"
        router
        class="side-menu"
        background-color="#1d2b3a"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item index="/home">
          <span>工作流首页</span>
        </el-menu-item>

        <el-sub-menu index="template-group">
          <template #title>
            <span>模板</span>
          </template>
          <el-menu-item index="/template-list">系统模板</el-menu-item>
          <el-menu-item index="/word-template">Word 模板</el-menu-item>
        </el-sub-menu>

        <el-menu-item index="/data-entry">
          <span>数据录入</span>
        </el-menu-item>
        <el-menu-item index="/data-view">
          <span>数据查看</span>
        </el-menu-item>
        <el-menu-item index="/inspection-management">
          <span>边坡巡检</span>
        </el-menu-item>

        <el-sub-menu index="engineering-flow">
          <template #title>
            <span>工程监测流程</span>
          </template>
          <el-menu-item index="/project-lifecycle">项目生命周期</el-menu-item>
          <el-menu-item index="/alarm-management">异常报警处理</el-menu-item>
          <el-menu-item index="/operation-logs">操作日志</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="base-data">
          <template #title>
            <span>基础数据</span>
          </template>
          <el-menu-item index="/slope-management">边坡与测点管理</el-menu-item>
          <el-menu-item index="/slope-ledger">边坡监测台账</el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container class="layout-main-wrap">
      <el-header class="layout-header" height="52px">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item :to="{ path: '/home' }">首页</el-breadcrumb-item>
          <el-breadcrumb-item v-for="(b, i) in breadcrumbs" :key="i">
            <span v-if="i === breadcrumbs.length - 1">{{ b.title }}</span>
            <router-link v-else :to="b.path">{{ b.title }}</router-link>
          </el-breadcrumb-item>
        </el-breadcrumb>
        <div class="header-actions">
          <el-button v-if="token" link type="primary" @click="showPermissionDialog">权限申请</el-button>
          <el-dropdown v-if="token">
            <span class="user-name">
              {{ userLabel }} <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push('/user-profile')">个人信息</el-dropdown-item>
                <el-dropdown-item @click="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button v-else link type="primary" @click="router.push('/login')">登录</el-button>
        </div>
      </el-header>
      <el-main class="layout-main">
        <slot />
      </el-main>
    </el-container>
  </el-container>

  <!-- 权限申请对话框 -->
  <el-dialog
    v-model="permissionDialogVisible"
    title="权限申请"
    width="400px"
    center
  >
    <div class="permission-content">
      <p class="permission-info">如需申请平台管理员权限，请联系以下管理人员：</p>
      <div class="admin-info">
        <div class="admin-item">
          <span class="admin-label">姓名：</span>
          <span class="admin-value">郭紫锦</span>
        </div>
        <div class="admin-item">
          <span class="admin-label">电话：</span>
          <span class="admin-value">15827175932</span>
        </div>
      </div>
      <p class="permission-note">请说明您的单位、姓名和权限申请原因，以便我们及时处理。</p>
    </div>
    <template #footer>
      <span class="dialog-footer">
        <el-button type="primary" @click="permissionDialogVisible = false">我知道了</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const token = ref('')
const permissionDialogVisible = ref(false)

function syncToken() {
  token.value = localStorage.getItem('token') || ''
}

onMounted(syncToken)
watch(() => route.fullPath, syncToken)

const userLabel = computed(() => {
  try {
    const u = localStorage.getItem('user')
    if (!u) return ''
    const j = JSON.parse(u)
    return j.real_name || j.username || ''
  } catch {
    return ''
  }
})

/** 高亮菜单：子路径归到父菜单项 */
const activeMenu = computed(() => {
  const p = route.path
  if (p.startsWith('/template-create') || p.startsWith('/template-edit')) {
    return '/template-list'
  }
  if (p === '/report-generate' || p === '/report-list') {
    return '/home'
  }
  return p
})

const breadcrumbs = computed(() => {
  const matched = route.matched.filter((r) => r.meta?.title)
  return matched.map((r) => ({
    title: r.meta.title,
    path: r.path,
  }))
})

function showPermissionDialog() {
  permissionDialogVisible.value = true
}

async function logout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '退出确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    token.value = ''
    ElMessage.success('已退出登录')
    router.push('/login')
  } catch (error) {
    // 用户取消退出
  }
}
</script>

<style scoped>
.main-layout {
  min-height: 100vh;
}

.layout-aside {
  background: #1d2b3a;
  display: flex;
  flex-direction: column;
}

.logo {
  height: 52px;
  line-height: 52px;
  text-align: center;
  color: #fff;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.side-menu {
  border-right: none;
  flex: 1;
}

.layout-main-wrap {
  flex-direction: column;
  background: #f0f2f5;
}

.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  padding: 0 20px;
}

.layout-main {
  padding: 16px;
  overflow: auto;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-name {
  font-size: 13px;
  color: #606266;
}

/* 权限申请对话框样式 */
.permission-content {
  padding: 20px 0;
}

.permission-info {
  margin-bottom: 20px;
  color: #606266;
  line-height: 1.5;
}

.admin-info {
  background-color: #f5f7fa;
  border-radius: 4px;
  padding: 16px;
  margin-bottom: 20px;
}

.admin-item {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
}

.admin-item:last-child {
  margin-bottom: 0;
}

.admin-label {
  font-weight: 500;
  color: #303133;
  width: 60px;
}

.admin-value {
  color: #606266;
}

.permission-note {
  color: #909399;
  font-size: 13px;
  line-height: 1.5;
}

.dialog-footer {
  display: flex;
  justify-content: center;
}
</style>
