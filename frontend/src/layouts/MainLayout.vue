<template>
  <el-container class="main-layout">
    <el-aside width="220px" class="layout-aside">
      <div class="logo" @click="router.push('/home')">
        <span>高边坡</span>
        <strong>监测预警平台</strong>
      </div>
      <el-menu
        :default-active="activeMenu"
        :default-openeds="defaultOpeneds"
        :unique-opened="true"
        router
        class="side-menu"
        background-color="#1d2b3a"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <template v-for="section in menuSections" :key="section.key">
          <div class="menu-section-label">{{ section.label }}</div>
          <template v-for="item in section.items" :key="item.index || item.key">
            <el-menu-item v-if="!item.children" :index="item.index">
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.title }}</span>
            </el-menu-item>
            <el-sub-menu v-else :index="item.key">
              <template #title>
                <el-icon><component :is="item.icon" /></el-icon>
                <span>{{ item.title }}</span>
              </template>
              <el-menu-item v-for="child in item.children" :key="child.index" :index="child.index">
                <el-icon><component :is="child.icon" /></el-icon>
                <span>{{ child.title }}</span>
              </el-menu-item>
            </el-sub-menu>
          </template>
        </template>
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
import {
  ArrowDown,
  Bell,
  Cloudy,
  Collection,
  DataAnalysis,
  Document,
  EditPen,
  Files,
  FolderOpened,
  Histogram,
  List,
  Location,
  Monitor,
  Notebook,
  Operation,
  Search,
  SetUp,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const token = ref('')
const permissionDialogVisible = ref(false)

const menuSections = [
  {
    key: 'daily-work',
    label: '日常工作',
    items: [
      { index: '/home', title: '监测工作台', icon: Monitor },
      { index: '/data-entry', title: '数据录入', icon: EditPen },
      { index: '/data-view', title: '数据查看', icon: DataAnalysis },
      { index: '/inspection-management', title: '边坡巡检', icon: Search },
    ],
  },
  {
    key: 'analysis-report',
    label: '研判与报告',
    items: [
      {
        key: 'monitoring-analysis',
        title: '监测研判',
        icon: Histogram,
        children: [
          { index: '/map-overview', title: '边坡监测地图', icon: Location },
          { index: '/weather-rainfall', title: '天气与雨情', icon: Cloudy },
          { index: '/alarm-management', title: '异常报警', icon: Bell },
        ],
      },
      {
        key: 'template-group',
        title: '报告与模板',
        icon: Document,
        children: [
          { index: '/report-generate', title: '报告生成', icon: Files },
          { index: '/report-list', title: '报告列表', icon: List },
          { index: '/template-list', title: '系统模板', icon: Collection },
          { index: '/word-template', title: 'Word / PDF 模板', icon: Notebook },
        ],
      },
      { index: '/standards-compliance', title: '规范与合规', icon: SetUp },
    ],
  },
  {
    key: 'base-data',
    label: '基础资料',
    items: [
      {
        key: 'base-data-group',
        title: '边坡与空间资料',
        icon: FolderOpened,
        children: [
          { index: '/slope-management', title: '边坡与测点管理', icon: Operation },
          { index: '/slope-ledger', title: '边坡监测台账', icon: Notebook },
          { index: '/spatial-data', title: '空间资料管理', icon: Location },
        ],
      },
    ],
  },
  {
    key: 'system',
    label: '系统',
    items: [
      {
        key: 'engineering-flow',
        title: '工程与日志',
        icon: SetUp,
        children: [
          { index: '/project-lifecycle', title: '项目生命周期', icon: Operation },
          { index: '/operation-logs', title: '操作日志', icon: List },
        ],
      },
    ],
  },
]

const menuParentByPath = menuSections.reduce((map, section) => {
  section.items.forEach(item => {
    if (item.children) {
      item.children.forEach(child => map.set(child.index, item.key))
    }
  })
  return map
}, new Map())

const defaultOpeneds = computed(() => {
  const parent = menuParentByPath.get(activeMenu.value)
  return parent ? [parent] : []
})

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
  background: #162536;
  display: flex;
  flex-direction: column;
  box-shadow: 1px 0 0 rgba(15, 23, 42, 0.08);
}

.logo {
  height: 64px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 0 22px;
  color: #fff;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  flex-shrink: 0;
}

.logo span {
  color: #7cc7ff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.logo strong {
  color: #f7fbff;
  font-size: 17px;
  font-weight: 750;
  line-height: 1.2;
}

.side-menu {
  border-right: none;
  flex: 1;
  padding: 12px 10px 18px;
  overflow-y: auto;
  background: transparent !important;
}

.menu-section-label {
  margin: 14px 8px 6px;
  color: #6f879b;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.menu-section-label:first-child {
  margin-top: 4px;
}

.side-menu :deep(.el-menu-item),
.side-menu :deep(.el-sub-menu__title) {
  height: 42px;
  margin: 2px 0;
  padding: 0 12px !important;
  border-radius: 6px;
  color: #c8d7e5;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0;
}

.side-menu :deep(.el-menu-item .el-icon),
.side-menu :deep(.el-sub-menu__title .el-icon) {
  width: 18px;
  margin-right: 10px;
  color: #8fb3cf;
  font-size: 17px;
}

.side-menu :deep(.el-menu-item:hover),
.side-menu :deep(.el-sub-menu__title:hover) {
  background: rgba(255, 255, 255, 0.07);
  color: #fff;
}

.side-menu :deep(.el-menu-item.is-active) {
  position: relative;
  background: linear-gradient(90deg, rgba(49, 143, 255, 0.28), rgba(49, 143, 255, 0.08));
  color: #fff;
}

.side-menu :deep(.el-menu-item.is-active::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  width: 3px;
  height: 24px;
  border-radius: 0 2px 2px 0;
  background: #43a3ff;
}

.side-menu :deep(.el-menu-item.is-active .el-icon) {
  color: #ffffff;
}

.side-menu :deep(.el-sub-menu .el-menu) {
  padding: 2px 0 6px 20px;
  background: transparent !important;
}

.side-menu :deep(.el-sub-menu .el-menu-item) {
  height: 36px;
  padding-left: 12px !important;
  color: #aebfd0;
  font-size: 13px;
}

.side-menu :deep(.el-sub-menu__icon-arrow) {
  right: 10px;
  color: #7f93a5;
  font-size: 12px;
}

.side-menu::-webkit-scrollbar {
  width: 6px;
}

.side-menu::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(143, 179, 207, 0.28);
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
