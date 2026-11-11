'use strict'

const CFG = window.SITE_CONFIG || {}
const EN = window.I18N_EN || {}
const $ = (s) => document.querySelector(s)
const $$ = (s) => document.querySelectorAll(s)

/* ---------- i18n ---------- */
const zhCache = new Map()
let lang = 'zh'

const DYN = {
  copied: ['已复制到剪贴板', 'Copied to clipboard'],
  copyFail: ['复制失败，请手动复制', 'Copy failed — please copy manually'],
  creating: ['生成中…', 'Creating…'],
  generated: ['重新生成地址', 'Regenerate URL'],
  sending: ['发送中…', 'Sending…'],
  sent: ['已发送，等待收件箱刷新', 'Sent — waiting for the inbox'],
  sendFail: ['发送失败，请检查网络', 'Send failed — check your connection'],
  demoErr: ['演示服务暂不可用，请用 Vercel 运行时启动', 'Demo service unavailable — run with the Vercel runtime'],
  expired: ['演示端点已过期，请重新生成', 'Demo endpoint expired — please regenerate'],
  created: ['临时端点已创建', 'Temporary endpoint created'],
  noEvents: ['还没有收到请求', 'No requests yet'],
  noEventsHint: ['生成地址并发送一条，结果会出现在这里', 'Generate a URL and send something to see it here'],
  body: ['请求体', 'Body'],
  headers: ['请求头（已脱敏）', 'Headers (redacted)'],
  query: ['查询参数', 'Query string'],
  meta: ['元信息', 'Meta'],
  emptyBody: ['（无请求体）', '(empty body)'],
}
const T = (k) => (DYN[k] || [k, k])[lang === 'en' ? 1 : 0]

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  )
}

function initialLang() {
  const saved = localStorage.getItem('wh_lang')
  if (saved === 'zh' || saved === 'en') return saved
  return 'zh'
}

function staticText(key) {
  if (lang === 'en' && EN[key] !== undefined) return EN[key]
  return zhCache.get(key) || ''
}

function initI18n() {
  $$('[data-i18n]').forEach((el) => {
    const k = el.dataset.i18n
    if (!zhCache.has(k)) zhCache.set(k, el.innerHTML.trim())
  })
}

function applyLang(next) {
  lang = next
  localStorage.setItem('wh_lang', lang)
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'
  const btn = $('#lang-toggle')
  btn.textContent = lang === 'en' ? '中' : 'EN'
  btn.setAttribute('aria-label', lang === 'en' ? '切换为中文' : 'Switch to English')

  $$('[data-i18n]').forEach((el) => {
    const k = el.dataset.i18n
    el.innerHTML = lang === 'en' && EN[k] !== undefined ? EN[k] : zhCache.get(k)
  })

  syncDemoButton()
  if (demo.token) renderDemoEvents(demo.events)
}

/* ---------- helpers ---------- */
let toastTimer = null
function toast(msg) {
  const t = $('#toast')
  t.textContent = msg
  t.classList.remove('hidden')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2400)
}

async function copyText(text) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast(T('copied'))
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      toast(T('copied'))
    } catch {
      toast(T('copyFail'))
    }
  }
}

function absUrl(u) {
  try {
    return new URL(u, location.href).href
  } catch {
    return u
  }
}

function highlightJson(text) {
  return esc(text).replace(
    /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m) => {
      let cls = 'c-num'
      if (/^"/.test(m)) cls = /:$/.test(m) ? 'c-key' : 'c-str'
      else if (/true|false/.test(m)) cls = 'c-bool'
      else if (/null/.test(m)) cls = 'c-num'
      return '<span class="' + cls + '">' + m + '</span>'
    }
  )
}

/* ---------- Live Demo ---------- */
const demo = { token: null, url: null, events: [], sig: '', timer: null, busy: false, failed: false }

function syncDemoButton() {
  const b = $('#demo-create')
  if (!b) return
  if (demo.busy) b.textContent = T('creating')
  else b.textContent = demo.token ? T('generated') : staticText('demo.create')
}

function prettyBody(ev) {
  if (ev.body_encoding === 'base64') return '[base64] ' + (ev.body || '')
  const raw = ev.body_json || ev.body
  if (!raw) return T('emptyBody')
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return String(raw)
  }
}

function renderDemoEvents(items) {
  const wrap = $('#demo-events')
  const openIds = new Set([...wrap.querySelectorAll('.de-row.open')].map((r) => r.dataset.id))
  wrap.innerHTML = ''
  $('#demo-count').textContent = String(items.length)

  if (!items.length) {
    const box = document.createElement('div')
    box.className = 'demo-empty'
    box.innerHTML =
      '<div class="demo-empty-icon" aria-hidden="true">◎</div>' +
      '<p>' + esc(T('noEvents')) + '</p><span>' + esc(T('noEventsHint')) + '</span>'
    wrap.appendChild(box)
    return
  }

  for (const ev of items) {
    const m = /^[A-Z]+$/.test(ev.method || '') ? ev.method : 'GET'
    const time = new Date(ev.received_at).toLocaleTimeString()
    const headers =
      Object.entries(ev.headers || {})
        .map(([k, v]) => k + ': ' + String(v))
        .join('\n') || '—'
    const meta = [
      'content-type: ' + (ev.content_type || '—'),
      'size: ' + ev.body_size + ' B',
      'source ip: ' + (ev.source_ip || '—'),
      'user-agent: ' + (ev.user_agent || '—'),
      'received: ' + (ev.received_at || '—'),
    ].join('\n')

    const row = document.createElement('div')
    row.className = 'de-row' + (openIds.has(ev.id) ? ' open' : '')
    row.dataset.id = ev.id
    row.innerHTML =
      '<div class="de-head">' +
      '<span class="method m-' + m + '">' + m + '</span>' +
      '<span class="de-path">' + esc(ev.path || '/') + '</span>' +
      '<span class="de-time">' + esc(time) + '</span>' +
      '</div>' +
      '<div class="de-detail">' +
      '<div class="de-sub">' + esc(T('body')) + '</div>' +
      '<pre class="de-code">' + highlightJson(prettyBody(ev)) + '</pre>' +
      '<div class="de-sub">' + esc(T('headers')) + '</div>' +
      '<pre class="de-code">' + esc(headers) + '</pre>' +
      '<div class="de-sub">' + esc(T('query')) + '</div>' +
      '<pre class="de-code">' + esc(ev.query_string || '—') + '</pre>' +
      '<div class="de-sub">' + esc(T('meta')) + '</div>' +
      '<pre class="de-code">' + esc(meta) + '</pre>' +
      '</div>'
    row.querySelector('.de-head').onclick = () => row.classList.toggle('open')
    wrap.appendChild(row)
  }
}

function stopPolling() {
  if (demo.timer) {
    clearInterval(demo.timer)
    demo.timer = null
  }
}
function startPolling() {
  stopPolling()
  demo.timer = setInterval(pollDemo, 2000)
}

function handleExpired() {
  stopPolling()
  demo.failed = true
  $('#live-badge').classList.add('idle')
  toast(T('expired'))
}

async function pollDemo() {
  if (!demo.token || demo.failed || document.hidden) return
  try {
    const res = await fetch('/api/demo/events?token=' + encodeURIComponent(demo.token))
    if (res.status === 404) return handleExpired()
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    if (!Array.isArray(data.items)) throw new Error('bad payload')
    const sig = data.items.map((i) => i.id).join(',')
    if (sig !== demo.sig) {
      demo.sig = sig
      demo.events = data.items
      renderDemoEvents(demo.events)
    }
  } catch {
    demo.failed = true
    stopPolling()
    toast(T('demoErr'))
  }
}

function buildCurl(url) {
  return (
    "curl -X POST '" + url + "'" +
    " -H 'Content-Type: application/json'" +
    " -d '{\"event\":\"order.created\",\"amount\":1999}'"
  )
}

async function createDemo() {
  if (demo.busy) return
  demo.busy = true
  const btn = $('#demo-create')
  btn.disabled = true
  syncDemoButton()
  try {
    const res = await fetch('/api/demo/endpoint', { method: 'POST' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    if (!(res.headers.get('content-type') || '').includes('json')) throw new Error('not json')
    const data = await res.json()
    if (!data.token) throw new Error('no token')

    demo.token = data.token
    demo.url = absUrl(data.webhook_url)
    demo.events = []
    demo.sig = ''
    demo.failed = false

    $('#demo-intro').classList.add('hidden')
    $('#demo-url-wrap').classList.remove('hidden')
    $('#demo-url').textContent = demo.url
    $('#demo-curl').textContent = buildCurl(demo.url)
    $('#live-badge').classList.remove('idle')
    renderDemoEvents([])
    startPolling()
    toast(T('created'))
  } catch {
    toast(T('demoErr'))
  } finally {
    demo.busy = false
    btn.disabled = false
    syncDemoButton()
  }
}

async function sendDemo() {
  if (!demo.url) return
  const btn = $('#demo-send')
  const prev = btn.textContent
  btn.disabled = true
  btn.textContent = T('sending')
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
    const res = await fetch(demo.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sample),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    toast(T('sent'))
    setTimeout(pollDemo, 350)
  } catch {
    toast(T('sendFail'))
  } finally {
    btn.disabled = false
    btn.textContent = prev
  }
}

/* ---------- chrome: nav, tabs, reveal ---------- */
function initChrome() {
  $$('[data-cfg-href]').forEach((el) => {
    const url = CFG[el.dataset.cfgHref]
    if (url) el.setAttribute('href', url)
  })

  const status = $('#footer-status')
  if (status) {
    if (CFG.statusNote) status.textContent = CFG.statusNote
    else status.classList.add('hidden')
  }
  const year = $('#year')
  if (year) year.textContent = String(new Date().getFullYear())

  const header = $('#site-header')
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 12)
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  const toggle = $('#nav-toggle')
  toggle.onclick = () => {
    const open = $('#nav-links').classList.toggle('open')
    toggle.setAttribute('aria-expanded', String(open))
  }
  $$('#nav-links a').forEach((a) => {
    a.onclick = () => {
      $('#nav-links').classList.remove('open')
      toggle.setAttribute('aria-expanded', 'false')
    }
  })

  $('#lang-toggle').onclick = () => applyLang(lang === 'zh' ? 'en' : 'zh')

  $$('.code-tab').forEach((tab) => {
    tab.onclick = () => {
      $$('.code-tab').forEach((t) => t.classList.remove('active'))
      $$('.code-panel').forEach((p) => p.classList.remove('active'))
      tab.classList.add('active')
      const panel = $('.code-panel[data-panel="' + tab.dataset.tab + '"]')
      if (panel) panel.classList.add('active')
    }
  })
  $('#code-copy').onclick = () => {
    const code = $('.code-panel.active code')
    if (code) copyText(code.textContent)
  }

  $('#demo-create').onclick = createDemo
  $('#demo-send').onclick = sendDemo
  $('#demo-copy-url').onclick = () => copyText(demo.url || '')
  $('#demo-copy-curl').onclick = () => copyText($('#demo-curl').textContent)
  $('#live-badge').classList.add('idle')

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && demo.token && !demo.failed) pollDemo()
  })

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.06 }
    )
    $$('.reveal').forEach((el) => io.observe(el))
  } else {
    $$('.reveal').forEach((el) => el.classList.add('in'))
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initI18n()
  lang = initialLang()
  applyLang(lang)
  initChrome()
})
