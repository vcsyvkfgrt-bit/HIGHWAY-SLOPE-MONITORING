# 生产部署说明

## 运行环境

- Node.js 18+
- MySQL 8.x 或兼容版本
- 前端端口：3000
- 后端业务数据端口：3002
- 后端用户/模板端口：3003

## 后端配置

复制配置模板：

```bash
cd backend
cp .env.example .env
```

生产环境必须修改：

- `DB_PASSWORD`
- `JWT_SECRET`
- `UPLOAD_MAX_SIZE`

## 数据库初始化/迁移

```bash
cd backend
npm install
npm run db:migrate
```

迁移脚本采用非破坏式策略：只创建数据库、创建缺失表、补充缺失字段和索引，不删除历史数据。

## 启动服务

开发/测试：

```bash
cd backend
npm run dev
```

生产建议使用进程管理器运行：

```bash
cd backend
npm run start
```

前端：

```bash
cd frontend
npm install
npm run build
```

## 文件目录

上传文件保存在：

```text
backend/uploads
```

数据库只保存文件路径和元数据。生产环境应定期备份该目录和 MySQL 数据库。

## 基础验证

```text
http://localhost:3002/health
http://localhost:3003/health
```

两个接口都返回成功，说明后端基础服务正常。
