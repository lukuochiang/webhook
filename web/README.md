# Webhook Inbox & Inspector — Vercel 演示前端

这是一个**自包含、零构建**的 Webhook 接收与调试面板演示，用于部署到 Vercel 进行展示。
它与仓库根目录的 Cloudflare Workers + D1 生产后端**完全独立**：这里用 Vercel 无服务器函数
（`/api` 下纯 Node JS）+ 内存存储实现同一套 API 契约，方便单独演示，但**数据不持久、不共享**。

## 目录结构

```
web/
  index.html         # 单页前端
  styles.css         # 暗色主题样式
  app.js             # 前端逻辑（端点管理 / 事件查看 / 详情 / 测试发送 / 统计 / 健康）
  api/[...slug].js   # Vercel 无服务器函数（catch-all 路由，内存存储 + 鉴权 + 捕获）
  vercel.json        # 将 /hook/* 重写到 /api/hook/*
  README.md
```

## 功能

- 创建 / 列出 / 查看 / 删除端点，轮换 Token
- 任意方法（GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD）捕获 Webhook，支持多级子路径
- 请求体：文本/JSON 原样保存，JSON 额外存解析副本；二进制 Base64；`MAX_BODY_SIZE` 限制
- 敏感请求头（Authorization / Proxy-Authorization / Cookie / Set-Cookie）入库前脱敏
- 按端点 / 方法 / 时间筛选、分页查看事件，查看详情（头、体、来源 IP、UA）
- 一键「发送测试」Webhook、复制 Webhook URL、统计与后端健康检查
- 管理员 Token 鉴权（演示默认 `demo-admin-token`）

## 本地预览

Vercel 函数需要一个运行时来模拟。最简单的方式是用 Vercel CLI：

```bash
cd web
npm i -g vercel      # 若尚未安装
vercel dev           # 启动本地预览，默认 http://localhost:3000
```

也可以直接用 Node 拉起一个最小静态服务器（仅静态资源，不含 /api 函数）：

```bash
cd web
npx serve .          # 或 python3 -m http.server 8080
```

> 注意：不借助 Vercel 运行时时，`/api/*` 与 `/hook/*` 不可用；需用 `vercel dev` 才能跑通完整功能。

## 部署到 Vercel

### 方式一：CLI

```bash
cd web
vercel                # 按提示完成，首次部署即为生产
vercel --prod         # 切到生产域名
```

### 方式二：GitHub 导入

1. 在 Vercel 新建项目，导入本仓库。
2. **Root Directory（根目录）设为 `web`**（关键，确保只部署演示目录）。
3. Framework Preset 选 «Other»，Build Command / Output 留空（零构建）。
4. 可选：在 Environment Variables 添加 `ADMIN_TOKEN`（不填则默认 `demo-admin-token`）。
5. Deploy。

部署后：

- 页面：`https://<your-project>.vercel.app`
- Webhook 接收地址：`https://<your-project>.vercel.app/hook/<token>`（已通过 `vercel.json` 重写到 `/api/hook/*`）
- 在页面里「创建端点」即可拿到 Webhook URL 与 Token，点「发送测试」立即看到捕获的请求。

## 重要说明（演示性质）

- **内存存储**：数据保存在函数实例内存中，冷启动 / 多实例会重置，**请勿用于生产或真实数据**。
- 生产环境请使用仓库根目录的 Cloudflare Workers + D1 方案（见主 `README.md`），它提供持久化、
  索引、定时清理与 OpenAPI 文档。
- 本演示后端默认 Admin Token 为 `demo-admin-token`，仅用于展示；上线前请务必通过环境变量设置强 Token。
- 列表接口支持 `?include_token=1` 以方便演示复制 Webhook URL；生产 API 不返回明文 Token。
