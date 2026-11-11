'use strict'

// ---- state ----
const state = {
  apiBase: localStorage.getItem('wh_api_base') || '',
  adminToken: localStorage.getItem('wh_admin_token') || 'demo-admin-token',
  view: 'endpoints',
  endpoints: new Map(),
  selectedId: null,
  events: [],
  eventPage: 1,
  eventTotal: 0,
  methodFilter: '',
}

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

// ---- api helper ----
async function api(path, opts = {}) {
  const url = (state.apiBase || '') + path
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {})
  if (!(path.startsWith('/api/hook'))) {
    headers['Authorization'] = 'Bearer ' + state.adminToken
  }
  const res = await fetch(url, Object.assign({ headers }, opts))
  let data = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const msg = (data && data.message) || (data && data.error) || ('HTTP ' + res.status)
    throw new Error(msg)
  }
  return data
}

function toast(msg) {
  const t = $('#toast')
  t.textContent = msg
  t.classList.remove('hidden')
  clearTimeout(toast._t)
  toast._t = setTimeout(() => t.classList.add('hidden'), 2200)
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  )
}

function syntaxHighlight(obj) {
  let json
  try {
    json = JSON.stringify(obj, null, 2)
  } catch {
    return escapeHtml(String(obj))
  }
  json = escapeHtml(json)
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'num'
      if (/^"/.test(match)) cls = /:$/.test(match) ? 'key' : 'str'
      else if (/true|false/.test(match)) cls = 'bool'
      else if (/null/.test(match)) cls = 'null'
      return '<span class="' + cls + '">' + match + '</span>'
    }
  )
}

// ---- endpoints ----
async function loadEndpoints() {
  try {
    const data = await api('/api/v1/endpoints?include_token=1')
    state.endpoints.clear()
    for (const ep of data.items) state.endpoints.set(ep.id, ep)
    renderEndpoints()
    pingHealth(true)
  } catch (e) {
    toast('加载端点失败：' + e.message)
    pingHealth(false)
  }
}

function renderEndpoints() {
  const grid = $('#endpoints-grid')
  grid.innerHTML = ''
  const eps = [...state.endpoints.values()]
  $('#endpoints-empty').classList.toggle('hidden', eps.length > 0)
  for (const ep of eps) {
    const card = document.createElement('div')
    card.className = 'ep-card'
    const on = ep.enabled
    card.innerHTML = `
      <h3>${escapeHtml(ep.name)}
        <span class="badge ${on ? 'on' : 'off'}">${on ? '启用' : '停用'}</span>
        <span class="badge">${escapeHtml(ep.auth_mode)}</span>
      </h3>
      <div class="ep-meta">
        <span>请求数：${ep.request_count}</span>
        <span>保留：${ep.retention_days} 天</span>
        <span>最近：${ep.last_received_at ? new Date(ep.last_received_at).toLocaleString() : '—'}</span>
      </div>
      <div class="ep-url">${escapeHtml(ep.webhook_url || '/hook/***')}</div>
      <div class="ep-actions">
        <button class="btn small" data-act="events">查看事件</button>
        <button class="btn small" data-act="test">发送测试</button>
        <button class="btn small" data-act="copy">复制 URL</button>
        <button class="btn small" data-act="rotate">轮换 Token</button>
        <button class="btn small danger" data-act="delete">删除</button>
      </div>`
    card.querySelector('[data-act="events"]').onclick = () => selectEndpoint(ep.id)
    card.querySelector('[data-act="test"]').onclick = () => sendTest(ep)
    card.querySelector('[data-act="copy"]').onclick = () => copy(ep.webhook_url)
    card.querySelector('[data-act="rotate"]').onclick = () => rotateToken(ep.id)
    card.querySelector('[data-act="delete"]').onclick = () => deleteEndpoint(ep.id)
    grid.appendChild(card)
  }
}

async function createEndpoint(e) {
  e.preventDefault()
  const fd = new FormData($('#create-form'))
  const payload = {
    name: fd.get('name'),
    description: fd.get('description') || undefined,
    auth_mode: fd.get('auth_mode'),
    retention_days: Number(fd.get('retention_days')) || 7,
    enabled: fd.get('enabled') === 'on',
  }
  try {
    const ep = await api('/api/v1/endpoints', { method: 'POST', body: JSON.stringify(payload) })
    state.endpoints.set(ep.id, ep)
    $('#create-form').reset()
    $('#create-form').classList.add('hidden')
    renderEndpoints()
    toast('已创建端点：' + ep.name)
    copy(ep.webhook_url)
  } catch (err) {
    toast('创建失败：' + err.message)
  }
}

async function deleteEndpoint(id) {
  if (!confirm('确认删除该端点及其全部事件？')) return
  try {
    await api('/api/v1/endpoints/' + id, { method: 'DELETE' })
    state.endpoints.delete(id)
    renderEndpoints()
    toast('已删除')
  } catch (err) {
    toast('删除失败：' + err.message)
  }
}

async function rotateToken(id) {
  try {
    const ep = await api('/api/v1/endpoints/' + id + '/rotate-token', { method: 'POST' })
    state.endpoints.set(ep.id, ep)
    renderEndpoints()
    toast('Token 已轮换')
    copy(ep.webhook_url)
  } catch (err) {
    toast('轮换失败：' + err.message)
  }
}

async function sendTest(ep) {
  const base = state.apiBase || location.origin
  const url = base + (ep.webhook_url || '/hook/' + ep.token)
  const sample = {
    event: 'order.created',
    id: 'ord_' + Math.random().toString(36).slice(2, 10),
    amount: 1999,
    currency: 'USD',
    paid: true,
    items: [{ sku: 'SKU-001', qty: 2 }],
    occurred_at: new Date().toISOString(),
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sample),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    toast('测试请求已发送 ✓')
    if (state.view === 'events' && state.selectedId === ep.id) {
      await loadEvents(true)
    }
    await loadEndpoints()
  } catch (err) {
    toast('发送失败：' + err.message)
  }
}

function copy(text) {
  if (!text) return
  navigator.clipboard.writeText(text).then(
    () => toast('已复制：' + text),
    () => toast('复制失败，请手动复制')
  )
}

// ---- events ----
function selectEndpoint(id) {
  state.selectedId = id
  state.eventPage = 1
  state.methodFilter = ''
  $('#filter-method').value = ''
  state.view = 'events'
  $('#view-endpoints').classList.add('hidden')
  $('#view-events').classList.remove('hidden')
  const ep = state.endpoints.get(id)
  $('#events-title').textContent = '事件 · ' + (ep ? ep.name : '')
  loadEvents(true)
}

function backToEndpoints() {
  state.view = 'endpoints'
  $('#view-events').classList.add('hidden')
  $('#view-endpoints').classList.remove('hidden')
}

async function loadEvents(reset) {
  if (reset) state.eventPage = 1
  const ep = state.endpoints.get(state.selectedId)
  if (!ep) return
  const params = new URLSearchParams({ endpoint_id: ep.id, page: state.eventPage, limit: 20 })
  if (state.methodFilter) params.set('method', state.methodFilter)
  try {
    const data = await api('/api/v1/events?' + params.toString())
    state.events = data.items
    state.eventTotal = data.total
    renderEvents()
  } catch (e) {
    toast('加载事件失败：' + e.message)
  }
}

function renderEvents() {
  const list = $('#events-list')
  list.innerHTML = ''
  $('#events-empty').classList.toggle('hidden', state.events.length > 0)
  $('#events-count').textContent = '共 ' + state.eventTotal + ' 条'
  for (const ev of state.events) {
    const row = document.createElement('div')
    row.className = 'ev-row'
    row.innerHTML = `
      <span class="method m-${escapeHtml(ev.method)}">${escapeHtml(ev.method)}</span>
      <span class="ev-path">${escapeHtml(ev.path || '/')}</span>
      <span class="ev-size">${ev.body_size} B</span>
      <span class="ev-time">${new Date(ev.received_at).toLocaleString()}</span>`
    row.onclick = () => openEvent(ev.id)
    list.appendChild(row)
  }
  renderPager()
}

function renderPager() {
  const pager = $('#events-pager')
  pager.innerHTML = ''
  const pages = Math.max(1, Math.ceil(state.eventTotal / 20))
  if (pages <= 1) return
  const prev = document.createElement('button')
  prev.className = 'btn small'
  prev.textContent = '上一页'
  prev.disabled = state.eventPage <= 1
  prev.onclick = () => {
    state.eventPage--
    loadEvents()
  }
  const next = document.createElement('button')
  next.className = 'btn small'
  next.textContent = '下一页'
  next.disabled = state.eventPage >= pages
  next.onclick = () => {
    state.eventPage++
    loadEvents()
  }
  const info = document.createElement('span')
  info.className = 'count'
  info.textContent = state.eventPage + ' / ' + pages
  pager.append(prev, info, next)
}

async function openEvent(id) {
  try {
    const ev = await api('/api/v1/events/' + id)
    const bodyText = ev.body_json ? ev.body_json : ev.body
    let bodyHtml
    if (ev.body_encoding === 'base64') {
      bodyHtml = '<div class="code-block">[base64] ' + escapeHtml(ev.body || '') + '</div>'
    } else if (bodyText) {
      try {
        bodyHtml = '<div class="code-block json">' + syntaxHighlight(JSON.parse(bodyText)) + '</div>'
      } catch {
        bodyHtml = '<div class="code-block">' + escapeHtml(bodyText) + '</div>'
      }
    } else {
      bodyHtml = '<div class="code-block">（无请求体）</div>'
    }
    const headersHtml = Object.entries(ev.headers || {})
      .map(([k, v]) => `<div class="kv"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>`)
      .join('')
    $('#modal-body').innerHTML = `
      <div class="kv">
        <span class="k">方法</span><span class="v">${escapeHtml(ev.method)}</span>
        <span class="k">路径</span><span class="v">${escapeHtml(ev.path || '/')}</span>
        <span class="k">查询</span><span class="v">${escapeHtml(ev.query_string || '—')}</span>
        <span class="k">Content-Type</span><span class="v">${escapeHtml(ev.content_type || '—')}</span>
        <span class="k">大小</span><span class="v">${ev.body_size} B</span>
        <span class="k">来源 IP</span><span class="v">${escapeHtml(ev.source_ip || '—')}</span>
        <span class="k">UA</span><span class="v">${escapeHtml(ev.user_agent || '—')}</span>
        <span class="k">时间</span><span class="v">${escapeHtml(ev.received_at)}</span>
      </div>
      <div class="section-title">请求头（已脱敏）</div>
      ${headersHtml || '<p class="hint">无</p>'}
      <div class="section-title">请求体</div>
      ${bodyHtml}
      <div style="margin-top:16px"><button class="btn danger small" id="btn-del-event">删除事件</button></div>`
    $('#btn-del-event').onclick = async () => {
      if (!confirm('确认删除该事件？')) return
      await api('/api/v1/events/' + id, { method: 'DELETE' })
      $('#modal').classList.add('hidden')
      loadEvents()
      toast('已删除事件')
    }
    $('#modal').classList.remove('hidden')
  } catch (e) {
    toast('加载详情失败：' + e.message)
  }
}

// ---- stats ----
async function showStats() {
  try {
    const s = await api('/api/v1/stats')
    $('#stats-body').innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="n">${s.total_endpoints}</div><div class="l">端点数</div></div>
        <div class="stat"><div class="n">${s.total_events}</div><div class="l">总事件</div></div>
        <div class="stat"><div class="n">${s.events_last_24h}</div><div class="l">近 24h</div></div>
      </div>
      <div class="section-title">最活跃端点</div>
      ${
        s.top_endpoints.length
          ? s.top_endpoints
              .map((t) => {
                const ep = state.endpoints.get(t.endpoint_id)
                return `<div class="kv"><span class="k">${escapeHtml(ep ? ep.name : t.endpoint_id)}</span><span class="v">${t.count} 次</span></div>`
              })
              .join('')
          : '<p class="hint">暂无数据</p>'
      }`
    $('#stats-modal').classList.remove('hidden')
  } catch (e) {
    toast('加载统计失败：' + e.message)
  }
}

// ---- health ----
function pingHealth(ok) {
  const h = $('#health')
  h.classList.toggle('ok', ok)
  h.classList.toggle('bad', !ok)
  h.title = ok ? '后端正常' : '后端异常'
}

// ---- settings ----
function openSettings() {
  $('#set-api-base').value = state.apiBase
  $('#set-admin-token').value = state.adminToken
  $('#settings-modal').classList.remove('hidden')
}
function saveSettings() {
  state.apiBase = $('#set-api-base').value.trim()
  state.adminToken = $('#set-admin-token').value.trim() || 'demo-admin-token'
  localStorage.setItem('wh_api_base', state.apiBase)
  localStorage.setItem('wh_admin_token', state.adminToken)
  $('#settings-modal').classList.add('hidden')
  loadEndpoints()
  toast('设置已保存')
}

// ---- wiring ----
function init() {
  $('#create-form').addEventListener('submit', createEndpoint)
  $('#btn-toggle-create').onclick = () => $('#create-form').classList.toggle('hidden')
  $('#btn-refresh').onclick = () => loadEndpoints()
  $('#btn-back').onclick = backToEndpoints
  $('#btn-events-refresh').onclick = () => loadEvents(true)
  $('#filter-method').onchange = (e) => {
    state.methodFilter = e.target.value
    loadEvents(true)
  }
  $('#btn-settings').onclick = openSettings
  $('#btn-settings-save').onclick = saveSettings
  $('#btn-settings-close').onclick = () => $('#settings-modal').classList.add('hidden')
  $('#btn-stats').onclick = showStats
  $('#btn-stats-close').onclick = () => $('#stats-modal').classList.add('hidden')
  $('#btn-modal-close').onclick = () => $('#modal').classList.add('hidden')
  ;[ '#modal', '#settings-modal', '#stats-modal' ].forEach((sel) => {
    $(sel).addEventListener('click', (e) => {
      if (e.target === $(sel)) $(sel).classList.add('hidden')
    })
  })
  loadEndpoints()
}

document.addEventListener('DOMContentLoaded', init)
