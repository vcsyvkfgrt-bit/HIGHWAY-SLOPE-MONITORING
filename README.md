# 公路边坡监测周报月报平台

一个简单的公路边坡监测周报月报报告编写平台。

## 技术栈

- **前端**：Vue 3 + Element Plus + ECharts
- **后端**：Node.js + Express
- **数据库**：MySQL

## 项目结构

```
周报月报平台/
├── frontend/          # 前端项目
│   ├── src/
│   │   ├── views/     # 页面组件
│   │   ├── router/    # 路由配置
│   │   ├── App.vue    # 主组件
│   │   └── main.js    # 入口文件
│   ├── package.json
│   └── vite.config.js
├── backend/           # 后端项目
│   ├── routes/        # API路由
│   ├── config/        # 配置文件
│   ├── server.js      # 服务器入口
│   └── package.json
└── database/          # 数据库
    └── init.sql       # 数据库初始化脚本
```

## 快速开始

### 1. 数据库配置

```bash
# 登录MySQL
mysql -u root -p

# 执行初始化脚本
source database/init.sql
```

### 2. 后端配置

```bash
cd backend

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置数据库连接信息

# 启动后端服务（开发模式）
npm run dev

# 或生产模式
npm start
```

### 3. 前端配置

```bash
cd frontend

# 安装依赖
npm install

# 启动前端服务
npm run dev
```

### 4. 访问应用

- 前端地址：http://localhost:3000
- 后端地址（业务接口）：http://localhost:3002
- 后端地址（用户/模板相关）：http://localhost:3003

## 功能模块

1. **数据录入**：手动录入监测数据
2. **数据查看**：查看历史数据和趋势图
3. **报告生成**：生成周报和月报
4. **报告列表**：管理和查看已生成的报告

## 默认账号

- 用户名：admin
- 密码：admin123

## 开发说明

### 前端开发

- 使用 Vue 3 Composition API
- 使用 Element Plus 组件库
- 使用 ECharts 进行数据可视化

### 后端开发

- 使用 Express 框架
- RESTful API 设计
- MySQL 数据库

## 注意事项

1. 首次运行需要先配置数据库
2. 确保MySQL服务已启动
3. 修改 `.env` 文件中的数据库连接信息
4. 前端当前直接请求后端 3002 / 3003 端口（可在 `frontend` 目录用环境变量覆盖：`VITE_API_DATA_URL`、`VITE_API_APP_URL`）

## 功能巡检说明（简要）

| 功能 | 说明 |
|------|------|
| 登录/注册 | 走 `3003` `/api/user/*` |
| 边坡/测点/监测数据 | 走 `3002` `/api/slopes`、`/api/points`、`/api/monitoring-data` |
| 系统报告模板 | 列表/导入/删除/制作 统一走 `3003` `/api/templates`（与登录同端口，需登录态的操作要带 Token） |
| Word 模板 | 路由 `/word-template`，数据存浏览器 `localStorage` |
| 模板列表「使用」 | 跳转 `/report-generate?templateId=`，首页工作流会自动拉取模板并进入「内容补充」步骤 |

## 许可证

MIT