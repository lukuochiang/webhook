// Self-contained Vercel demo backend for the Webhook Inbox & Inspector.
// Zero-build Node serverless function (catch-all) backed by in-memory storage.
// NOTE: in-memory state is per warm instance and resets on cold starts — this is
// fine for a showcase, not for production persistence (use the Cloudflare/D1
// project for that).

import crypto from 'node:crypto'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'demo-admin-token'
const SENSITIVE_HEADERS = ['authorization', 'proxy-authorization', 'cookie', 'set-cookie']
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || ''

const endpoints = new Map() // id -> endpoint
const events = [] // newest-first array
const tokenIndex = new Map() // tokenHash -> endpointId

// Public Live Demo limits (the landing page lets anonymous visitors create a
// throwaway endpoint; keep it bounded so it cannot be abused as free storage).
const DEMO_TTL_MS = 30 * 60 * 1000
const MAX_DEMO_ENDPOINTS = 60
const MAX_DEMO_EVENTS = 20

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex')
}
function genId(prefix) {
  return prefix + '_' + crypto.randomBytes(8).toString('hex')
}
function genToken() {
  return crypto.randomBytes(32).toString('hex')
}
function nowIso() {
  return new Date().toISOString()
}
function redactHeaders(headers) {
  const out = {}
  for (const [k, v] of Object.entries(headers || {})) {
    out[k] = SENSITIVE_HEADERS.includes(k.toLowerCase()) ? '[redacted]' : v
  }
  return out
}

function send(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(obj))
}
function corsPreflight(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end()
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })
}
function isAdmin(req) {
  const auth = req.headers['authorization'] || ''
  if (!auth.startsWith('Bearer ')) return false
  return auth.slice(7) === ADMIN_TOKEN
}
function parseJson(text) {
  try {
    return { ok: true, value: text ? JSON.parse(text) : {} }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

function toPublic(ep) {
  return {
    id: ep.id,
    name: ep.name,
    description: ep.description,
    enabled: ep.enabled === 1,
    auth_mode: ep.auth_mode,
    retention_days: ep.retention_days,
    response_status: ep.response_status ?? 200,
    request_count: ep.request_count,
    created_at: ep.created_at,
    updated_at: ep.updated_at,
    last_received_at: ep.last_received_at,
  }
}

function eventToPublic(e) {
  let headers = {}
  try {
    const parsed = JSON.parse(e.headers_json)
    if (parsed && typeof parsed === 'object') headers = parsed
  } catch {}
  let body = null
  if (e.body_encoding === 'base64' && e.body_data) {
    try {
      body = Buffer.from(e.body_data, 'base64').toString('utf8')
    } catch {
      body = null
    }
  } else {
    body = e.body_data
  }
  return {
    id: e.id,
    endpoint_id: e.endpoint_id,
    method: e.method,
    path: e.path,
    query_string: e.query_string,
    headers,
    content_type: e.content_type,
    body,
    body_json: e.body_json,
    body_encoding: e.body_encoding,
    body_size: e.body_size,
    source_ip: e.source_ip,
    user_agent: e.user_agent,
    received_at: e.received_at,
  }
}

function removeEndpoint(id) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].endpoint_id === id) events.splice(i, 1)
  }
  const ep = endpoints.get(id)
  if (ep) {
    tokenIndex.delete(ep.token_hash)
    endpoints.delete(id)
  }
}

function pruneDemo() {
  const now = Date.now()
  for (const ep of [...endpoints.values()]) {
    if (ep.demo && now - new Date(ep.created_at).getTime() > DEMO_TTL_MS) removeEndpoint(ep.id)
  }
  const demoEps = [...endpoints.values()]
    .filter((ep) => ep.demo)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  while (demoEps.length > MAX_DEMO_ENDPOINTS) removeEndpoint(demoEps.shift().id)
}

async function handleCapture(req, res, url, path) {
  const rest = path.slice('/api/hook/'.length)
  const slash = rest.indexOf('/')
  const token = slash === -1 ? rest : rest.slice(0, slash)
  const subpath = slash === -1 ? '' : rest.slice(slash)
  const endpointId = tokenIndex.get(sha256Hex(token))
  if (!endpointId) return send(res, 404, { error: 'NOT_FOUND', message: 'Unknown endpoint token' })
  const ep = endpoints.get(endpointId)
  if (!ep || ep.enabled !== 1) return send(res, 403, { error: 'FORBIDDEN', message: 'Endpoint disabled' })

  const raw = await readBody(req)
  const ct = (req.headers['content-type'] || '').toLowerCase()
  let bodyData = null
  let bodyEncoding = 'empty'
  let bodyJson = null
  let bodySize = 0
  if (raw && raw.length) {
    bodySize = Buffer.byteLength(raw)
    const textual =
      ct.startsWith('text/') ||
      ct.includes('json') ||
      ct.includes('xml') ||
      ct.includes('yaml') ||
      ct.includes('javascript') ||
      ct.includes('x-www-form-urlencoded') ||
      ct.includes('form-data')
    if (textual) {
      bodyData = raw
      bodyEncoding = 'utf8'
      if (ct.includes('json')) {
        try {
          bodyJson = JSON.stringify(JSON.parse(raw))
        } catch {
          bodyJson = null
        }
      }
    } else {
      bodyData = Buffer.from(raw).toString('base64')
      bodyEncoding = 'base64'
    }
  }

  const headers = redactHeaders(req.headers)
  const event = {
    id: genId('evt'),
    endpoint_id: endpointId,
    method: req.method,
    path: subpath,
    query_string: url.search,
    headers_json: JSON.stringify(headers),
    content_type: ct || null,
    body_data: bodyData,
    body_encoding: bodyEncoding,
    body_json: bodyJson,
    body_size: bodySize,
    source_ip: req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || 'unknown',
    user_agent: req.headers['user-agent'] || '',
    received_at: nowIso(),
  }
  events.unshift(event)
  ep.request_count += 1
  ep.last_received_at = event.received_at
  ep.updated_at = event.received_at
  if (ep.demo) {
    let seen = 0
    for (let i = 0; i < events.length; i++) {
      if (events[i].endpoint_id !== endpointId) continue
      seen++
      if (seen > MAX_DEMO_EVENTS) {
        events.splice(i, 1)
        i--
      }
    }
  }
  return send(res, 200, { event_id: event.id, received_at: event.received_at })
}

function buildWebhookUrl(token) {
  return (PUBLIC_BASE || '') + '/hook/' + token
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return corsPreflight(res)
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname
  const method = req.method

  if (path === '/api/health' && method === 'GET') {
    return send(res, 200, { status: 'ok', time: nowIso(), store: 'vercel-memory' })
  }

  if (path.startsWith('/api/hook/')) {
    return handleCapture(req, res, url, path)
  }

  // ---- Public Live Demo (no admin token; anonymous, bounded, ephemeral) ----
  if (path === '/api/demo/endpoint' && method === 'POST') {
    pruneDemo()
    const id = genId('ep')
    const token = genToken()
    const tokenHash = sha256Hex(token)
    const now = nowIso()
    const ep = {
      id,
      token_hash: tokenHash,
      name: 'Live Demo',
      description: null,
      enabled: 1,
      auth_mode: 'url',
      retention_days: 0,
      response_status: 200,
      request_count: 0,
      created_at: now,
      updated_at: now,
      last_received_at: null,
      demo: true,
    }
    endpoints.set(id, ep)
    ep.token = token
    tokenIndex.set(tokenHash, id)
    return send(res, 200, {
      token,
      webhook_url: buildWebhookUrl(token),
      expires_at: new Date(Date.now() + DEMO_TTL_MS).toISOString(),
    })
  }

  if (path === '/api/demo/events' && method === 'GET') {
    const token = url.searchParams.get('token') || ''
    const endpointId = token ? tokenIndex.get(sha256Hex(token)) : undefined
    const ep = endpointId ? endpoints.get(endpointId) : undefined
    if (!ep || !ep.demo) {
      return send(res, 404, { error: 'NOT_FOUND', message: 'Demo endpoint not found or expired' })
    }
    const items = events
      .filter((e) => e.endpoint_id === endpointId)
      .slice(0, MAX_DEMO_EVENTS)
      .map(eventToPublic)
    return send(res, 200, {
      items,
      total: items.length,
      expires_at: new Date(new Date(ep.created_at).getTime() + DEMO_TTL_MS).toISOString(),
    })
  }

  // Everything else requires admin auth.
  if (!isAdmin(req)) {
    return send(res, 401, { error: 'UNAUTHORIZED', message: 'Admin token required' })
  }

  // ---- Endpoints ----
  if (path === '/api/v1/endpoints' && method === 'POST') {
    const text = await readBody(req)
    const { ok, value, error } = parseJson(text)
    if (!ok) return send(res, 400, { error: 'BAD_REQUEST', message: 'Invalid JSON: ' + error })
    const input = value || {}
    if (!input.name || !String(input.name).trim()) {
      return send(res, 400, { error: 'VALIDATION_ERROR', message: 'name is required' })
    }
    const id = genId('ep')
    const token = genToken()
    const tokenHash = sha256Hex(token)
    const now = nowIso()
    const ep = {
      id,
      token_hash: tokenHash,
      name: String(input.name).trim(),
      description: input.description ? String(input.description) : null,
      enabled: input.enabled === false ? 0 : 1,
      auth_mode: ['url', 'header', 'both'].includes(input.auth_mode) ? input.auth_mode : 'url',
      retention_days:
        input.retention_days === undefined || input.retention_days === null
          ? 7
          : Number(input.retention_days),
      response_status: 200,
      request_count: 0,
      created_at: now,
      updated_at: now,
      last_received_at: null,
    }
    endpoints.set(id, ep)
    ep.token = token
    tokenIndex.set(tokenHash, id)
    return send(res, 200, { ...toPublic(ep), webhook_url: buildWebhookUrl(token), token })
  }

  if (path === '/api/v1/endpoints' && method === 'GET') {
    const includeToken = url.searchParams.get('include_token') === '1'
    const items = [...endpoints.values()]
      .map((ep) => {
        const p = toPublic(ep)
        if (includeToken && ep.token) {
          p.token = ep.token
          p.webhook_url = buildWebhookUrl(ep.token)
        }
        return p
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return send(res, 200, { items, total: items.length, page: 1, limit: items.length })
  }

  const epMatch = path.match(/^\/api\/v1\/endpoints\/([^/]+)(\/rotate-token)?$/)
  if (epMatch) {
    const id = epMatch[1]
    const ep = endpoints.get(id)
    if (!ep) return send(res, 404, { error: 'NOT_FOUND', message: 'Endpoint not found' })

    if (method === 'GET' && !epMatch[2]) {
      return send(res, 200, toPublic(ep))
    }
    if (method === 'PATCH' && !epMatch[2]) {
      const text = await readBody(req)
      const { ok, value, error } = parseJson(text)
      if (!ok) return send(res, 400, { error: 'BAD_REQUEST', message: 'Invalid JSON: ' + error })
      const p = value || {}
      if (p.name !== undefined) ep.name = String(p.name).trim()
      if (p.description !== undefined) ep.description = p.description ? String(p.description) : null
      if (p.enabled !== undefined) ep.enabled = p.enabled ? 1 : 0
      if (p.auth_mode !== undefined && ['url', 'header', 'both'].includes(p.auth_mode)) ep.auth_mode = p.auth_mode
      if (p.retention_days !== undefined) ep.retention_days = Number(p.retention_days)
      ep.updated_at = nowIso()
      return send(res, 200, toPublic(ep))
    }
    if (method === 'DELETE' && !epMatch[2]) {
      removeEndpoint(id)
      return send(res, 200, { deleted: true })
    }
    if (method === 'POST' && epMatch[2]) {
      const token = genToken()
      ep.token_hash = sha256Hex(token)
      ep.token = token
      tokenIndex.set(ep.token_hash, id)
      ep.updated_at = nowIso()
      return send(res, 200, { ...toPublic(ep), webhook_url: buildWebhookUrl(token), token })
    }
  }

  // ---- Events ----
  if (path === '/api/v1/events' && method === 'GET') {
    const endpointId = url.searchParams.get('endpoint_id') || ''
    const methodFilter = (url.searchParams.get('method') || '').toUpperCase()
    let items = events
    if (endpointId) items = items.filter((e) => e.endpoint_id === endpointId)
    if (methodFilter) items = items.filter((e) => e.method === methodFilter)
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20))
    const total = items.length
    const slice = items.slice((page - 1) * limit, page * limit)
    return send(res, 200, {
      items: slice.map((e) => ({
        id: e.id,
        endpoint_id: e.endpoint_id,
        method: e.method,
        path: e.path,
        content_type: e.content_type,
        body_size: e.body_size,
        source_ip: e.source_ip,
        user_agent: e.user_agent,
        received_at: e.received_at,
      })),
      total,
      page,
      limit,
    })
  }

  const evMatch = path.match(/^\/api\/v1\/events\/([^/]+)$/)
  if (evMatch) {
    const id = evMatch[1]
    const e = events.find((x) => x.id === id)
    if (!e) return send(res, 404, { error: 'NOT_FOUND', message: 'Event not found' })
    if (method === 'GET') {
      return send(res, 200, eventToPublic(e))
    }
    if (method === 'DELETE') {
      const idx = events.findIndex((x) => x.id === id)
      if (idx >= 0) events.splice(idx, 1)
      return send(res, 200, { deleted: true })
    }
  }

  // ---- Stats ----
  if (path === '/api/v1/stats' && method === 'GET') {
    const totalEvents = events.length
    const since = Date.now() - 24 * 3600 * 1000
    const last24h = events.filter((e) => new Date(e.received_at).getTime() >= since).length
    const byEndpoint = {}
    for (const e of events) byEndpoint[e.endpoint_id] = (byEndpoint[e.endpoint_id] || 0) + 1
    const top = Object.entries(byEndpoint)
      .map(([endpoint_id, count]) => ({ endpoint_id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
    return send(res, 200, {
      total_endpoints: endpoints.size,
      total_events: totalEvents,
      events_last_24h: last24h,
      top_endpoints: top,
    })
  }

  return send(res, 404, { error: 'NOT_FOUND', message: 'No such route: ' + method + ' ' + path })
}
