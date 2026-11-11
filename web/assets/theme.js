/* Shared theme controller for both the landing page and the /app dashboard.
 * Loaded synchronously in <head> so the chosen theme is applied before first
 * paint (no flash). One button cycles: system -> light -> dark -> system. */
;(function () {
  'use strict'

  var KEY = 'wh_theme'
  var MODES = ['system', 'light', 'dark']

  var ICONS = {
    // Desktop / monitor = follow system
    system:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M9 20h6M12 16.5V20"/></svg>',
    // Sun = light
    light:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    // Moon = dark
    dark:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.8 6.8 0 0 0 9.7 9.7z"/></svg>',
  }

  var LABEL = {
    zh: { system: '跟随系统', light: '日间', dark: '夜间', to: '点击切换为' },
    en: { system: 'System', light: 'Light', dark: 'Dark', to: 'Switch to ' },
  }

  var root = document.documentElement
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null
  var current = readMode()

  function readMode() {
    try {
      var v = window.localStorage.getItem(KEY)
      if (MODES.indexOf(v) !== -1) return v
    } catch (e) {}
    return 'system'
  }

  function nextMode(m) {
    return MODES[(MODES.indexOf(m) + 1) % MODES.length]
  }

  function resolveMode(m, prefersLight) {
    if (m !== 'system') return m
    return prefersLight ? 'light' : 'dark'
  }

  function prefersLight() {
    return !!(mq && mq.matches)
  }

  function lang() {
    return (root.lang || '').toLowerCase().indexOf('en') === 0 ? 'en' : 'zh'
  }

  function paint() {
    var btn = document.getElementById('theme-toggle')
    if (!btn) return
    btn.innerHTML = ICONS[current]
    var l = LABEL[lang()]
    var text = l[current] + ' · ' + l.to + l[nextMode(current)]
    btn.setAttribute('title', text)
    btn.setAttribute('aria-label', text)
    btn.setAttribute('data-mode', current)
  }

  function apply() {
    var effective = resolveMode(current, prefersLight())
    root.setAttribute('data-theme', effective)
    root.style.colorScheme = effective
    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', effective === 'light' ? '#f7f8fc' : '#070910')
    paint()
  }

  function setMode(m) {
    if (MODES.indexOf(m) === -1) return
    current = m
    try {
      window.localStorage.setItem(KEY, m)
    } catch (e) {}
    apply()
  }

  function toggle() {
    setMode(nextMode(current))
  }

  function bind() {
    var btn = document.getElementById('theme-toggle')
    if (btn && !btn.getAttribute('data-bound')) {
      btn.setAttribute('data-bound', '1')
      btn.addEventListener('click', toggle)
    }
    paint()
  }

  // Apply immediately (before paint), then wire up the button once DOM is ready.
  apply()
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind)
  } else {
    bind()
  }

  // Only "system" needs to react to OS theme changes.
  if (mq) {
    var onChange = function () {
      if (current === 'system') apply()
    }
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else if (mq.addListener) mq.addListener(onChange)
  }

  window.WhTheme = {
    MODES: MODES,
    getMode: function () {
      return current
    },
    nextMode: nextMode,
    resolveMode: resolveMode,
    setMode: setMode,
    toggle: toggle,
    refresh: paint,
    apply: apply,
  }
})()
