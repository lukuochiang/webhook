# Webhook — 官网 + Vercel 演示

这是一个**自包含、零构建**的静态官网（Landing Page）与在线演示，用于部署到 Vercel 展示产品。
它与仓库根目录的 Cloudflare Workers + D1 生产后端**完全独立**：这里用 Vercel 无服务器函数
（`/api` 下纯 Node JS）+ 内存存储复刻同一套 API 契约，方便单独演示，但**数据不持久、不共享**。

## 目录结构

```
web/
  index.html            官网首页（Hero / 特性 / 流程 / Live Demo / API / 场景 / FAQ / CTA）
  app.html              完整控制台（/app）：端点管理、事件检索、详情、统计
  styles.css app.js     控制台的样式与逻辑
  assets/
    landing.css         官网样式（响应式、深色视觉、动效）
    landing.js          官网交互（中英切换、Live Demo 轮询、代码 tabs、导航、入场动画）
    i18n.js             英文文案（中文为 index.html 源文案，运行时缓存）
    config.js           站点外链与品牌配置 ← 部署前改这里
    theme.js            三态主题控制器（跟随系统 / 日间 / 夜间）
  api/[...slug].js      Vercel 无服务器 catch-all 函数
  vercel.json           /app 与 /hook/* 重写
  README.md
```

## 页面

| 路径 | 内容 |
|------|------|
| `/` | 官网首页：产品介绍、6 项特性、三步流程、**可交互 Live Demo**、REST API 示例、使用场景、部署引导、FAQ、CTA |
| `/app` | 完整控制台：创建/删除/轮换端点、一键发送测试、事件筛选分页、详情（请求头/体/来源）、统计、健康检查 |

官网支持**中英双语切换**（右上角 `EN` / `中`，记忆在 localStorage）；默认中文，英文文案集中在
`assets/i18n.js`，共 108 个文案 key。主题按钮的提示文案也跟随语言。无 JS 时正文仍完整可读（渐进增强）。

## 主题切换

官网导航与 `/app` 顶栏各有**一个图标按钮**，点击在三种模式间循环：

| 模式 | 图标 | 行为 |
|------|------|------|
| 跟随系统 | 桌面显示器 | 实时跟随 `prefers-color-scheme`，系统主题变化自动切换 |
| 日间 | 太阳 | 强制浅色 |
| 夜间 | 月亮 | 强制深色 |

- 选择保存在 `localStorage`（`wh_theme`），`assets/theme.js` 在 `<head>` 同步加载，首屏无闪烁。
- 同时设置 `color-scheme`（原生控件/滚动条）与 `theme-color`（移动端地址栏）。
- 浅色主题对官网与控制台两套样式都做了完整覆盖（含代码块、JSON 高亮、方法徽章、弹层等）。
- 默认模式为「跟随系统」；按钮 `title` / `aria-label` 会提示当前模式与下一次切换的目标。

## 首页 Live Demo（重点）

访客**无需注册、无需 Admin Token** 即可体验：

1. 点击「生成临时 Webhook 地址」→ `POST /api/demo/endpoint` 创建 30 分钟有效的临时端点
2. 复制地址，用页面给出的 cURL 示例或「发送示例请求」按钮调用 `/hook/<token>`
3. 右侧收件箱每 2 秒轮询 `GET /api/demo/events?token=…`，实时显示捕获结果，点击可展开完整快照

配套的安全约束（见 `api/[...slug].js`）：

- 临时端点最多 60 个、每个最多保留 20 条事件，30 分钟过期，自动裁剪
- 只读自己 token 对应的事件；`/api/v1/*` 管理接口仍需 Admin Token，不受影响
- 敏感请求头入库前脱敏为 `[redacted]`

## 部署到 Vercel

### 方式一：CLI

```bash
cd web
npm i -g vercel      # 若尚未安装
vercel               # 预览部署
vercel --prod        # 生产部署
```

### 方式二：GitHub 导入

1. Vercel 新建项目，导入本仓库。
2. **Root Directory（根目录）设为 `web`**（关键）。
3. Framework Preset 选 «Other»，Build / Output 留空（零构建）。
4. 可选环境变量：`ADMIN_TOKEN`（控制台鉴权，不填为 `demo-admin-token`）、`PUBLIC_BASE_URL`。
5. Deploy。

部署后首页 `https://<项目>.vercel.app`，控制台 `/app`，Webhook 地址 `/hook/<token>`（由
`vercel.json` 重写到 `/api/hook/*`）。

### 本地预览

必须用 Vercel 运行时，`/api/*` 与 `/hook/*` 才能工作：

```bash
cd web
vercel dev           # 默认 http://localhost:3000
```

只用普通静态服务器（`npx serve` / `python -m http.server`）时官网能打开，但 Live Demo 会提示
「演示服务暂不可用」——这是预期行为。

## 部署前建议修改

编辑 `assets/config.js`（无需构建，改完直接生效）：

| 字段 | 说明 |
|------|------|
| `productName` | 品牌名 |
| `github` | 仓库地址，用于导航 / 页脚 / Hero 徽章 |
| `docs` | API 文档链接 |
| `deploy` | Vercel 一键部署链接（`root-directory=web`） |
| `dashboard` | 控制台路径，默认 `./app` |
| `statusNote` | 页脚状态文案，设为 `null` 隐藏 |

## 重要说明（演示性质）

- **内存存储**：数据保存在函数实例内存中，冷启动 / 多实例会重置，**请勿用于生产或真实数据**。
- 首页 Live Demo 的临时端点**公开可读**，任何拿到地址的人都能查看该端点的事件；页面已明确提示不要发送真实数据。
- 控制台默认 Admin Token 为 `demo-admin-token`，等于公开。若把 `/app` 暴露在公网，请务必设置强
  `ADMIN_TOKEN`，或在 Vercel 项目中移除 `/app` 路由。
- 生产环境请使用仓库根目录的 Cloudflare Workers + D1 方案（见主 `README.md`），它提供持久化、
  索引、定时清理与 OpenAPI 文档。
- 列表接口支持 `?include_token=1` 仅为方便演示复制 Webhook URL；生产 API 不返回明文 Token。
