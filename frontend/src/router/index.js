import { createRouter, createWebHistory } from 'vue-router'

import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import ForgotPassword from '../views/ForgotPassword.vue'
import Home from '../views/Home.vue'
import WorkflowDashboard from '../views/WorkflowDashboard.vue'
import UserProfile from '../views/UserProfile.vue'

import TemplateList from '../views/TemplateList.vue'
import TemplateCreate from '../views/TemplateCreate.vue'
import TemplateEdit from '../views/TemplateEdit.vue'
import WordTemplate from '../views/WordTemplate.vue'

import BasicDataManagement from '../views/BasicDataManagement.vue'
import DataEntryMatrix from '../views/DataEntryMatrix.vue'
import DataView from '../views/DataView.vue'
import InspectionManagement from '../views/InspectionManagement.vue'
import ProjectLifecycle from '../views/ProjectLifecycle.vue'
import AlarmManagement from '../views/AlarmManagement.vue'
import OperationLogs from '../views/OperationLogs.vue'
import SlopeLedger from '../views/SlopeLedger.vue'
import MapOverview from '../views/MapOverview.vue'
import SpatialDataManagement from '../views/SpatialDataManagement.vue'
import WeatherRainfall from '../views/WeatherRainfall.vue'
import ReportList from '../views/ReportList.vue'
import StandardCompliance from '../views/StandardCompliance.vue'

const routes = [
  { path: '/', redirect: '/home' },
  {
    path: '/login',
    component: Login,
    meta: { layout: 'blank', title: '登录' },
  },
  {
    path: '/register',
    component: Register,
    meta: { layout: 'blank', title: '注册' },
  },
  {
    path: '/forgot-password',
    component: ForgotPassword,
    meta: { layout: 'blank', title: '忘记密码' },
  },
  { path: '/home', component: WorkflowDashboard, meta: { title: '监测工作台' } },

  { path: '/template-list', component: TemplateList, meta: { title: '系统模板' } },
  {
    path: '/template-create/:id',
    component: TemplateCreate,
    meta: { title: '编辑模板' },
  },
  { path: '/template-create', component: TemplateCreate, meta: { title: '制作模板' } },
  { path: '/template-edit', component: TemplateEdit, meta: { title: '模板编辑(旧)' } },
  { path: '/template-edit/:id', component: TemplateEdit, meta: { title: '模板编辑(旧)' } },

  { path: '/word-template', component: WordTemplate, meta: { title: 'Word / PDF 模板' } },
  { path: '/report-generate', component: Home, meta: { title: '报告生成' } },
  { path: '/report-list', component: ReportList, meta: { title: '报告列表' } },

  { path: '/slope-management', component: BasicDataManagement, meta: { title: '边坡与测点管理' } },
  { path: '/slope-ledger', component: SlopeLedger, meta: { title: '边坡监测台账' } },
  { path: '/map-overview', component: MapOverview, meta: { title: '边坡空间态势' } },
  { path: '/spatial-data', component: SpatialDataManagement, meta: { title: '空间资料管理' } },
  { path: '/weather-rainfall', component: WeatherRainfall, meta: { title: '天气与雨情' } },
  {
    path: '/point-management',
    redirect: (to) => ({ path: '/slope-management', query: to.query }),
    meta: { title: '边坡与测点管理' },
  },
  { path: '/inspection-management', component: InspectionManagement, meta: { title: '边坡巡检' } },
  {
    path: '/inspection-detail/:id',
    redirect: to => ({ path: '/inspection-management', query: { inspection_id: to.params.id } }),
    meta: { title: '巡检详情' },
  },
  { path: '/project-lifecycle', component: ProjectLifecycle, meta: { title: '项目生命周期' } },
  { path: '/alarm-management', component: AlarmManagement, meta: { title: '异常报警处理' } },
  { path: '/operation-logs', component: OperationLogs, meta: { title: '操作日志' } },

  { path: '/data-entry', component: DataEntryMatrix, meta: { title: '数据录入' } },
  { path: '/data-view', component: DataView, meta: { title: '数据查看' } },
  { path: '/user-profile', component: UserProfile, meta: { title: '个人信息' } },
  { path: '/standards-compliance', component: StandardCompliance, meta: { title: '规范与合规' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const publicPaths = new Set(['/login', '/register', '/forgot-password'])

router.beforeEach((to) => {
  if (publicPaths.has(to.path)) return true

  const token = localStorage.getItem('token')
  if (!token) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    }
  }

  return true
})

export default router

