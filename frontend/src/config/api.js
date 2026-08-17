/**
 * 后端双端口说明（与 backend/server.js 一致）
 * - 3002：边坡、测点、监测数据、模板（与业务数据同机）
 * - 3003：用户认证、模板（与工作流/登录同机）
 * 模板 CRUD 统一走 APP 端口，与登录、模板列表一致。
 */
export const API_DATA =
  import.meta.env.VITE_API_DATA_URL || 'http://localhost:3002'
export const API_APP =
  import.meta.env.VITE_API_APP_URL || 'http://localhost:3003'

/** 模板 REST 基路径（仅路径，不含 host） */
export const TEMPLATES_PATH = '/api/templates'
