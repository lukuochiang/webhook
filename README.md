# Webhook — Inbox & Inspector

A generic, self-hostable **Webhook Inbox & Inspector** that runs on [Cloudflare Workers](https://workers.cloudflare.com/). Any HTTP client (Stripe, GitHub, Shopify, CI systems, your own scripts…) can POST/GET/PUT/PATCH/DELETE to a unique URL you create, and the service will store the full request — headers, body, query string, method, source IP — for later inspection via a REST API.

> MVP focus: **receive → store → inspect → manage**. Built to be simple and stable today, while keeping clear extension points for dashboards, replay, R2 storage and forwarding later.

---

## Features

- Create multiple **endpoints**, each with its own high-entropy random URL token (`/hook/{token}`).
- Capture **any HTTP method** (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`) on **any sub-path**.
- Store the **raw body** (text/JSON/form/binary) with correct, size-bounded encoding.
- **Sensitive header redaction** (Authorization, Cookie, …) before persistence.
- **Admin REST API** protected by `ADMIN_TOKEN`; capture endpoints are protected by their URL token.
- Event **listing, filtering (endpoint / method / time), pagination, detail, deletion, bulk clear**.
- **Statistics** endpoint (totals, 24h / 7d, per-endpoint & per-method distributions).
- **Automatic cleanup** via Cron Trigger using a configurable retention window (global + per-endpoint override).
- **OpenAPI 3.1** document and a Swagger UI at `/docs`.
- **Health check** at `/health`.
- 100% TypeScript, modular layering (routes / middleware / services / repositories / storage), strict type-checking, and a real test suite running against D1.

## Tech stack

| Concern        | Choice                                            |
| -------------- | ------------------------------------------------- |
| Runtime        | Cloudflare Workers (Free plan compatible)         |
| Language       | TypeScript (strict)                               |
| HTTP framework | [Hono](https://hono.dev/)                         |
| Database       | Cloudflare D1 (plain prepared statements)         |
| Tooling        | Wrangler 4, Vitest 4 (+ `@cloudflare/vitest-pool-workers`) |
| Schema/validate| Zod                                              |

No ORM, no Docker, no Queue, no R2, no Durable Objects in the MVP — by design.

---

## Project structure

```
src/
  index.ts                 # Worker entry (fetch + scheduled cleanup)
  app.ts                   # Hono app assembly, middleware wiring
  config/env.ts            # Env parsing & validation
  routes/                  # HTTP routes per resource
  middleware/              # admin-auth, webhook-auth, error-handler, request-id
  services/                # endpoint, capture, event, stats, cleanup
  repositories/            # D1 data access
  storage/                 # StorageAdapter interface + D1 implementation
  schemas/                 # Zod schemas & shared types
  utils/                   # id, crypto, headers, response, validation, body
migrations/                # Versioned SQL migrations (0001..)
test/                      # Unit + integration tests (run on real D1)
docs/api.md                # API reference
```

---

## Requirements

- Node.js ≥ 22.5 (the test suite uses the built-in `node:sqlite`; 22.x recommended)
- npm
- Wrangler 4 (`npx wrangler --version`)
- A Cloudflare account (only for production deploy; local dev needs nothing)

## Local development

```bash
# 1. Install dependencies (dev deps require a non-production NODE_ENV)
npm install

# 2. Create local secrets / env
cp .dev.vars.example .dev.vars
#   then edit .dev.vars and set a strong ADMIN_TOKEN, e.g.:
#   ADMIN_TOKEN=$(openssl rand -hex 32)

# 3. Initialize the local D1 database & apply migrations
npx wrangler d1 migrations apply webhook-db --local

# 4. Start the dev server
npm run dev
#   Worker listens on http://localhost:8787
```

> The `npm install` step must run with a dev `NODE_ENV`. `npm` skips `devDependencies`
> when `NODE_ENV=production`, so if you ever set that globally, use
> `NODE_ENV=development npm install`.

### Type-check & test

```bash
npm run typecheck      # tsc --noEmit
npm test               # vitest run
```

> **How tests run:** the suite exercises the *real* repository / service / route code
> against an in-process SQLite engine (Node's built-in `node:sqlite`, available in
> Node 22.5+). A small `D1`-shaped adapter in `test/support/d1.ts` runs the actual
> migration SQL and every query, so behavior (tables, indexes, transactions, row
> counts, filtering, cleanup) is validated with genuine SQL — no mocks. The
> `test` script sets `NODE_OPTIONS=--experimental-sqlite` automatically.
>
> The Cloudflare Workers vitest pool (`@cloudflare/vitest-pool-workers`) is also a
> listed dev dependency and works on machines with a compatible Wrangler; this
> project's local CI uses the `node:sqlite` adapter for speed and portability.

## Database & migrations

Migrations are plain, versioned SQL files under `migrations/`, referenced by the
`d1_databases[].migrations_dir` field in `wrangler.jsonc`. Wrangler tracks applied
migrations automatically (in the `__d1_migrations` table), so you never hand-edit
the schema in production.

```bash
# Local
npx wrangler d1 migrations apply webhook-db --local

# Production (requires your account + created DB — see Deploy)
npx wrangler d1 migrations apply webhook-db --remote
```

Tables:

- `webhook_endpoints` — `id`, `token_hash` (SHA-256 of the URL token), `name`,
  `description`, `enabled`, `auth_mode` (`url` | `header` | `both`),
  `retention_days`, `response_status`, `request_count`, `created_at`,
  `updated_at`, `last_received_at`.
- `webhook_events` — `id`, `endpoint_id`, `method`, `path`, `query_string`,
  `headers_json` (already redacted), `content_type`, `body_data`, `body_encoding`
  (`utf8` | `base64` | `empty`), `body_json` (optional parsed copy), `body_size`,
  `source_ip`, `user_agent`, `received_at`.

Indexes cover `token_hash`, `enabled`, `endpoint_id`, `received_at`, `method`,
and `(endpoint_id, received_at)` for efficient, paginated queries.

---

## Configuration (environment / secrets)

| Variable             | Required | Default                | Notes |
| -------------------- | -------- | ---------------------- | ----- |
| `ADMIN_TOKEN`        | **yes**  | —                      | Management API bearer token. Must be ≥ 8 chars. Set via secret. |
| `PUBLIC_BASE_URL`    | no       | `https://hook.fs.kg`  | Used to build returned webhook URLs. |
| `MAX_BODY_SIZE`      | no       | `524288` (512 KiB)     | Max request body in bytes. Enforced before persisting. |
| `RETENTION_DAYS`     | no       | `7`                    | Global history retention. `0` disables cleanup. |
| `LOG_SOURCE_IP`      | no       | `true`                 | Set `false` to stop storing source IPs. |
| `SENSITIVE_HEADERS`  | no       | see `src/utils/headers`| Comma list of extra headers to redact. |
| `WEBHOOK_AUTH_REQUIRED` | no   | `false`                | Force an `Authorization: Bearer` check on every capture. |
| `APP_ENV`            | no       | `development`          | Reported in `/health` and stats. |

Local (`.dev.vars`) and production (Cloudflare **Secrets**) must **never** be
committed. `.dev.vars` is git-ignored.

---

## Usage

### 1. Create an endpoint

```bash
export ADMIN_TOKEN=your-admin-token

curl -X POST https://hook.fs.kg/api/v1/endpoints \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"GitHub","auth_mode":"url","retention_days":14}'
```

Response (token + URL are shown **only once**):

```json
{
  "success": true,
  "data": {
    "id": "ep_xxx",
    "name": "GitHub",
    "enabled": true,
    "auth_mode": "url",
    "retention_days": 14,
    "request_count": 0,
    "created_at": "2026-11-02T00:00:00.000Z",
    "updated_at": "2026-11-02T00:00:00.000Z",
    "last_received_at": null,
    "webhook_url": "https://hook.fs.kg/hook/eyJhb...longToken",
    "token": "eyJhb...longToken"
  },
  "error": null
}
```

### 2. Send a webhook to it

```bash
curl -X POST https://hook.fs.kg/hook/eyJhb...longToken \
  -H "Content-Type: application/json" \
  -d '{"action":"ping","ts":123}'
```

Or with a sub-path and query:

```bash
curl "https://hook.fs.kg/hook/eyJhb...longToken/api/v1/notify?evt=deploy" \
  -X PUT -d 'hello'
```

Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`.
Binary bodies are stored base64-encoded; text/JSON/form bodies as UTF-8.

### 3. Inspect captured events

```bash
# List (summary, paginated)
curl "https://hook.fs.kg/api/v1/events?endpoint_id=ep_xxx&limit=20&page=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Detail (full body + headers)
curl https://hook.fs.kg/api/v1/events/evt_xxx \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 4. Manage endpoints

```bash
curl https://hook.fs.kg/api/v1/endpoints -H "Authorization: Bearer $ADMIN_TOKEN"   # list
curl https://hook.fs.kg/api/v1/endpoints/ep_xxx -H "Authorization: Bearer $ADMIN_TOKEN"  # detail
curl -X PATCH https://hook.fs.kg/api/v1/endpoints/ep_xxx \
  -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"enabled":false}'
curl -X POST https://hook.fs.kg/api/v1/endpoints/ep_xxx/rotate-token \
  -H "Authorization: Bearer $ADMIN_TOKEN"   # invalidates the old token
curl -X DELETE https://hook.fs.kg/api/v1/endpoints/ep_xxx \
  -H "Authorization: Bearer $ADMIN_TOKEN"   # also deletes its events
```

### 5. Clear / delete events

```bash
curl -X DELETE "https://hook.fs.kg/api/v1/endpoints/ep_xxx/events?confirm=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
curl -X DELETE https://hook.fs.kg/api/v1/events/evt_xxx \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 6. Statistics & health

```bash
curl https://hook.fs.kg/api/v1/stats -H "Authorization: Bearer $ADMIN_TOKEN"
curl https://hook.fs.kg/health
curl https://hook.fs.kg/api/v1/openapi.json
```

A Swagger UI is served at `https://hook.fs.kg/docs`.

---

## Automatic cleanup

A Cron Trigger (`crons: ["0 0 * * *"]` in `wrangler.jsonc`) runs a daily job that
deletes events older than their retention window:

- **Per-endpoint** `retention_days` overrides the global `RETENTION_DAYS`.
- `RETENTION_DAYS=0` (or per-endpoint `0`) **disables** cleanup for that scope —
  it does **not** mean "delete everything now".
- Deletion is batched to avoid long transactions.

## Deploying to Cloudflare (production)

> These steps require your Cloudflare account and **must be authorized by you**.
> They are not executed automatically by this project's local setup.

```bash
# 1. Authenticate
npx wrangler login

# 2. Create the D1 database (note the returned database_id)
npx wrangler d1 create webhook-db

# 3. Put the real database_id into wrangler.jsonc (d1_databases[].database_id)

# 4. Apply migrations remotely
npx wrangler d1 migrations apply webhook-db --remote

# 5. Set secrets (NOT vars) for anything sensitive
npx wrangler secret put ADMIN_TOKEN

# 6. Deploy
npx wrangler deploy
```

### Custom domain

The `routes` entry in `wrangler.jsonc` points at `hook.fs.kg` as a
`custom_domain`. Add the domain in the Cloudflare dashboard and verify the
certificate; Wrangler will wire it up on deploy. The Worker itself stays on the
Free plan.

---

## 官网与 Vercel 演示（独立部署）

`web/` 目录包含一个**自包含、零构建**的产品官网 + 在线演示，可单独部署到 Vercel 展示。
它用 Vercel 无服务器函数（纯 Node JS，内存存储）复刻了同一套 API 契约，与 Cloudflare 生产后端互不依赖，
数据不持久、不共享。

- `/`：中英双语官网（特性、工作原理、REST API 示例、使用场景、FAQ、部署引导），首页内嵌**可交互 Live Demo**——访客无需注册即可生成 30 分钟临时端点、发送请求并实时查看捕获结果。
- `/app`：完整控制台（端点管理、事件检索与详情、统计、健康检查）。
- 部署、本地预览与外链配置见 [`web/README.md`](./web/README.md)。
- **仅用于展示**：内存存储会在冷启动时重置，请勿用于真实数据。

---

## Security notes

- Endpoint tokens are **256-bit** random values; only their **SHA-256 hash** is
  stored. The plaintext token is returned exactly once at creation / rotation.
- The admin token is a Cloudflare **Secret**, never stored in the database.
- Sensitive headers are redacted **before** being persisted, and the API only
  ever returns the redacted copy.
- The captured request **path** never contains the endpoint token.
- Request bodies are size-bounded; oversized requests get `413` before any
  persistence. We never trust `Content-Length` alone.
- Logs record only error messages and a per-request id — never bodies or tokens.

---

## Roadmap (not in MVP)

- Live event stream (SSE) — `GET /api/v1/events/stream`
- Request **replay** with SSRF protection
- Downstream **forwarding** + retries (Cloudflare Queues)
- **R2** storage for large / binary payloads (the `StorageAdapter` interface is
  already in place)
- Richer SPA dashboard (Vue 3 + Vite) — a static marketing site + dashboard already ships under `web/`
- CLI & SDKs

---

## License

[MIT](./LICENSE)
