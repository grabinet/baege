import { LOGOS, tile, armFallback, isKnown, byId } from '/logos.js'
const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const safeStore = { get: k => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch {} }, remove: k => { try { localStorage.removeItem(k) } catch {} } }

/* ---------- History download (localStorage, maks 20 item, otomatis dihapus setelah 24 jam) ---------- */
const HISTORY_KEY = 'baegee_history'
const MAX_HISTORY = 20
const HISTORY_TTL = 24 * 60 * 60 * 1000 // 24 jam
const HISTORY_PREVIEW = 3               // jumlah item yang tampil sebelum "Lihat semua" ditekan
let historyExpanded = false
let historyShown = -1

// Alamat permintaan yang dipakai untuk memproses ulang item riwayat (entri lama hanya punya url)
const histPath = h => h.path || `/api/resolve?url=${encodeURIComponent(h.url || '')}`

function getHistory() {
  let list
  try { list = JSON.parse(safeStore.get(HISTORY_KEY) || '[]') } catch { list = [] }
  if (!Array.isArray(list)) list = []
  const now = Date.now()
  const fresh = list.filter(h => h && typeof h.ts === 'number' && now - h.ts < HISTORY_TTL)
  if (fresh.length !== list.length) safeStore.set(HISTORY_KEY, JSON.stringify(fresh)) // buang yang sudah lewat 24 jam
  return fresh
}
function addHistory(item) {
  const list = getHistory().filter(h => histPath(h) !== item.path)
  list.unshift({ ...item, ts: Date.now() })
  safeStore.set(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)))
  renderHistory()
}
function removeHistory(key) {
  safeStore.set(HISTORY_KEY, JSON.stringify(getHistory().filter(h => histPath(h) !== key)))
  renderHistory()
}
function clearHistory() {
  safeStore.remove(HISTORY_KEY)
  historyExpanded = false
  renderHistory()
}

const ICON_KIND = { video: 'bi-film', audio: 'bi-music-note-beamed', image: 'bi-image', file: 'bi-file-earmark-arrow-down' }
const categoryIcon = cat => ({ video: 'bi-film', music: 'bi-music-note-beamed', file: 'bi-file-earmark-arrow-down' }[cat] || 'bi-cloud-arrow-down-fill')

function renderHistory() {
  const list = getHistory()
  historyShown = list.length
  let section = $('#history-section')
  if (!list.length) { historyExpanded = false; if (section) section.remove(); return }

  // Awalnya hanya beberapa item; setelah semuanya terlihat, tombol berubah jadi "Hapus semua"
  const allVisible = historyExpanded || list.length <= HISTORY_PREVIEW
  const shown = allVisible ? list : list.slice(0, HISTORY_PREVIEW)

  const html = shown.map(h => {
    const link = h.url || ''
    const label = h.title || link || h.service || 'Riwayat'
    return `
    <div class="history-item" data-key="${esc(histPath(h))}" role="button" tabindex="0" aria-label="Buka hasil ${esc(label)}">
      <i class="bi ${categoryIcon(h.category)} hi-icon" aria-hidden="true"></i>
      <div class="hi-text">
        <div class="hi-title">${esc(label)}</div>
        <div class="hi-sub">${esc(h.service || '')}${h.service && link ? ' · ' : ''}${esc(link.length > 50 ? link.slice(0, 50) + '…' : link)}</div>
      </div>
      <button class="hi-del" data-del="${esc(histPath(h))}" aria-label="Hapus dari riwayat" title="Hapus" type="button"><i class="bi bi-x" aria-hidden="true"></i></button>
    </div>`
  }).join('')
  if (!section) {
    section = document.createElement('div')
    section.id = 'history-section'
    section.className = 'history-section'
    const results = $('#results')
    results?.parentElement?.insertBefore(section, results.nextSibling)
  }
  section.innerHTML = `
    <div class="history-head">
      <h3>Riwayat download</h3>
      <button class="history-clear" id="historyActionBtn" data-act="${allVisible ? 'clear' : 'more'}" type="button">${allVisible ? 'Hapus semua' : 'Lihat semua'}</button>
    </div>
    <p class="history-note">Otomatis dihapus setelah 24 jam</p>
    <div class="history-list">${html}</div>`

  section.querySelectorAll('.history-item').forEach(el => {
    const trigger = () => {
      const h = getHistory().find(x => histPath(x) === el.dataset.key)
      if (!h) return renderHistory() // sudah kedaluwarsa
      // pindah ke mode link secara langsung (tanpa transisi yang menghapus status proses)
      if (mode !== 'link') setMode('link')
      if (/^https?:\/\//i.test(h.url || '')) input.value = h.url
      hint.textContent = ''; syncClear(); input.blur()
      runResolve(histPath(h))
      // riwayat ada di bawah halaman: bawa pengguna ke area proses/hasil di atas
      statusEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    el.addEventListener('click', e => { if (!e.target.closest('.hi-del')) trigger() })
    el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.hi-del')) { e.preventDefault(); trigger() } })
  })
  section.querySelectorAll('.hi-del').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); removeHistory(btn.dataset.del) })
  })
  $('#historyActionBtn')?.addEventListener('click', e => {
    if (e.currentTarget.dataset.act === 'more') { historyExpanded = true; renderHistory(); return }
    if (confirm('Hapus semua riwayat download?')) clearHistory()
  })
}

// riwayat yang melewati 24 jam hilang otomatis meski halaman dibiarkan terbuka
setInterval(() => { if (getHistory().length !== historyShown) renderHistory() }, 60000)
document.addEventListener('visibilitychange', () => { if (!document.hidden && getHistory().length !== historyShown) renderHistory() })

/* ---------- logo platform: header + dinding "Platform yang Didukung" ---------- */
{
  const wall = $('#platformWall'), strip = $('#heroLogos'), orbit = $('#heroOrbit')
  $('#count').textContent = LOGOS.length
  if (wall) { wall.innerHTML = LOGOS.map((l, i) => tile(l, i)).join(''); armFallback(wall) }

  // header (HP/tablet): deretan logo populer + penghitung sisanya
  const stripIds = ['tiktok', 'youtube', 'instagram', 'facebook', 'spotify', 'x']
  if (strip) {
    strip.innerHTML = byId(stripIds).map((l, i) => tile(l, i)).join('')
      + `<a class="logo-more" href="#features" data-anchor="features" aria-label="Lihat semua platform">+${LOGOS.length - stripIds.length}</a>`
  }

  // header (desktop): kluster logo melayang mengelilingi ikon unduh
  const orbitIds = ['tiktok', 'youtube', 'instagram', 'spotify', 'facebook', 'x', 'soundcloud', 'pinterest']
  if (orbit) {
    orbit.insertAdjacentHTML('beforeend', byId(orbitIds).map((l, i, a) => {
      const ang = (i / a.length) * 2 * Math.PI - Math.PI / 2, R = 38
      return `<div class="orbit-item" style="left:${(50 + R * Math.cos(ang)).toFixed(2)}%;top:${(50 + R * Math.sin(ang)).toFixed(2)}%;--d:${(-i * 0.4).toFixed(1)}s">${tile(l, i)}</div>`
    }).join(''))
  }
}

/* ---------- preloader ---------- */
{
  let p = 0
  const bar = $('#preBar'), pre = $('#preloader')
  document.body.style.overflow = 'hidden'
  const t = setInterval(() => {
    p = Math.min(p + Math.floor(Math.random() * 12) + 4, 100); bar.style.width = p + '%'
    if (p >= 100) { clearInterval(t); setTimeout(() => { pre.classList.add('hide'); document.body.style.overflow = ''; setTimeout(() => pre.remove(), 550) }, 200) }
  }, 50)
}

/* ---------- tema (dark/light seperti aslinya: body.light-mode) ---------- */
const themeSw = $('#themeSwitch'), themeLabel = $('#themeLabel')
const themeSwDesktop = $('#themeSwitchDesktop'), themeLabelDesktop = $('#themeLabelDesktop')
const applyTheme = t => {
  document.body.classList.toggle('light-mode', t === 'light')
  ;[themeSw, themeSwDesktop].forEach(sw => { if(sw) sw.checked = t === 'dark' })
  ;[themeLabel, themeLabelDesktop].forEach(label => { if(label) label.textContent = t === 'dark' ? 'Dark' : 'Light' })
}
applyTheme(safeStore.get('theme') || 'dark')
const changeTheme = sw => { const t = sw.checked ? 'dark' : 'light'; safeStore.set('theme', t); applyTheme(t) }
themeSw?.addEventListener('change', () => changeTheme(themeSw))
themeSwDesktop?.addEventListener('change', () => changeTheme(themeSwDesktop))

/* ---------- navbar & sidebar ---------- */
const nav = $('#mainNavbar')
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 10)
addEventListener('scroll', onScroll, { passive: true }); onScroll()

const menuBtn = $('#menuBtn'), sidebar = $('#mobileSidebar')
const menuDropdown = menuBtn && window.bootstrap ? bootstrap.Dropdown.getOrCreateInstance(menuBtn) : null
const setMenu = open => { if(!menuDropdown) return; open ? menuDropdown.show() : menuDropdown.hide() }

$('[data-anchor]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault(); setMenu(false)
  document.getElementById(a.dataset.anchor)?.scrollIntoView({ behavior: 'smooth' })
}))
const ids = ['download', 'features']
const spy = () => {
  let cur = ids[0]; for (const id of ids) { const el = document.getElementById(id); if (el && !el.hidden && el.getBoundingClientRect().top < 140) cur = id }
  $$('[data-anchor]').forEach(a => a.classList.toggle('router-link-exact-active', a.dataset.anchor === cur))
}
addEventListener('scroll', spy, { passive: true }); spy()

/* ---------- Keunggulan (konten frontend; alur downloader tidak diubah) ---------- */
const BENEFIT_DATA = [
  ['fa-solid fa-bolt', 'Proses Cepat', 'Proses download praktis langsung dari browser tanpa langkah yang berbelit.'],
  ['fa-solid fa-link', 'Cukup Tempel Link', 'Tidak perlu mencari judul. Tempel tautan dan platform akan dikenali otomatis.'],
  ['fa-solid fa-layer-group', 'Multi Platform', 'Mendukung berbagai platform video, musik, foto, dan layanan file hosting.'],
  ['fa-solid fa-mobile-screen-button', 'Responsif', 'Tampilan nyaman digunakan melalui ponsel, tablet, maupun komputer.']
]
const benefitGrid = $('#benefitGrid')
if (benefitGrid) benefitGrid.innerHTML = BENEFIT_DATA.map(([icon, title, body]) => `
  <article class="benefit-card">
    <span class="benefit-icon"><i class="${icon}" aria-hidden="true"></i></span>
    <div class="benefit-copy"><h3>${title}</h3><p>${body}</p></div>
  </article>`).join('')
$('#year')?.textContent = new Date().getFullYear()

/* ---------- downloader ---------- */
const form = $('#form'), input = $('#input'), typeSel = $('#type'), go = $('#go'), statusEl = $('#status'), results = $('#results'), hint = $('#hint')
let mode = 'link'

// fade helper untuk transisi tab
const fadeArea = el => { el.classList.add('fading'); return new Promise(r => setTimeout(() => { el.classList.remove('fading'); r() }, 180)) }

const setStatus = (html, cls) => { statusEl.innerHTML = html ? (cls ? `<div class="alert alert-${cls} mt-3">${html}</div>` : html) : '' }
const loading = () => { go.disabled = true; results.innerHTML = ''; setStatus('<div class="content-card rounded-3 p-4 text-center mt-3"><div class="line-loader-wrapper"><div class="line-loader"></div></div><p class="mb-0 text-secondary">Mengambil data… (bisa 10–30 detik)</p></div>') }
const done = () => { go.disabled = false }

async function call(path) {
  const r = await fetch(path)
  const j = await r.json().catch(() => ({ status: false, msg: 'Respon server tidak valid' }))
  if (!j.status) throw new Error(j.msg || 'Gagal')
  return j
}

fetch('/api/services').then(r => r.json()).then(j => {
  const wall = $('#platformWall')
  // platform baru di backend yang belum punya logo tetap tampil (monogram), tidak hilang diam-diam
  if (wall) j.services.filter(s => !isKnown(s.name)).forEach((s, i) => wall.insertAdjacentHTML('beforeend', tile({ id: s.id, name: s.name }, LOGOS.length + i)))
  $('#count').textContent = wall ? wall.children.length : j.services.length
}).catch(() => {})

const setMode = () => {
  mode = 'link'
  input.placeholder = 'Tempel link di sini'
  input.inputMode = 'url'
  $('#inputIcon').className = 'bi bi-link search-icon'
}
setMode()

input.addEventListener('input', () => {
  if (mode !== 'link') return
  const v = input.value.trim()
  hint.textContent = v && !/^https?:\/\//i.test(v) ? 'Link harus diawali https://' : ''
})

/* tombol di dalam kolom: kosong = PASTE (ikon clipboard), ada isi = HAPUS (ikon silang) */
const clearBtn = $('#clear')
const syncClear = () => {
  const has = input.value.length > 0
  clearBtn.classList.toggle('is-clear', has)
  clearBtn.title = has ? 'Hapus' : 'Paste dari clipboard'
  clearBtn.setAttribute('aria-label', has ? 'Hapus isi kolom' : 'Paste link dari clipboard')
  form.classList.toggle('has-text', has)
}
input.addEventListener('input', syncClear)
clearBtn.addEventListener('click', async () => {
  if (input.value.length > 0) { input.value = ''; hint.textContent = ''; syncClear(); input.focus(); return }
  try {
    const text = (await navigator.clipboard.readText()).trim()
    if (!text) { hint.textContent = 'Clipboard kosong'; return }
    input.value = text; hint.textContent = ''; syncClear(); input.focus()
  } catch {
    hint.textContent = 'Tidak bisa membaca clipboard — tahan lama di kolom lalu pilih Tempel'
    input.focus()
  }
})
syncClear()

/* ---------- Drag & drop link ---------- */
{
  const dropOverlay = $('#drop-overlay')
  let dragTimer
  document.addEventListener('dragenter', e => {
    if (!e.dataTransfer?.types.includes('text/uri-list') && !e.dataTransfer?.types.includes('text/plain')) return
    clearTimeout(dragTimer)
    dropOverlay?.classList.add('active')
  })
  document.addEventListener('dragleave', e => {
    if (e.relatedTarget) return
    dragTimer = setTimeout(() => dropOverlay?.classList.remove('active'), 80)
  })
  document.addEventListener('dragover', e => e.preventDefault())
  document.addEventListener('drop', e => {
    e.preventDefault()
    dropOverlay?.classList.remove('active')
    const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || ''
    const url = text.trim().split(/\s+/)[0]
    if (!url) return
    input.value = url; syncClear()
    if (mode !== 'link') $$('.dl-tab').find(b => b.dataset.mode === 'link')?.click()
    input.focus()
    setTimeout(() => form.requestSubmit?.() || form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })), 300)
  })
}

// Penanda permintaan terbaru: hasil permintaan lama (mis. klik riwayat beruntun) diabaikan
let reqId = 0
const showError = err => { results.innerHTML = ''; setStatus(`<i class="bi bi-exclamation-triangle-fill me-2"></i>${esc(err.message)}`, 'danger') }

// Proses satu permintaan resolve: tampilkan loading → hasil (dipakai form, daftar pencarian, dan riwayat)
async function runResolve(path) {
  const my = ++reqId
  loading()
  try {
    const j = await call(path)
    if (my !== reqId) return
    showResult(j, path)
  } catch (err) { if (my === reqId) showError(err) } finally { if (my === reqId) done() }
}

form.addEventListener('submit', async e => {
  e.preventDefault()
  const v = input.value.trim(); if (!v) return
  input.blur() // tutup keyboard HP supaya layout tidak loncat
  if (mode === 'link') return runResolve(`/api/resolve?url=${encodeURIComponent(v)}`)
  const my = ++reqId
  loading()
  try {
    const s = await call(`/api/search?type=${encodeURIComponent(typeSel.value)}&q=${encodeURIComponent(v)}`)
    if (my !== reqId) return
    if (s.direct) return runResolve(`/api/resolve?service=${encodeURIComponent(s.direct.service)}&q=${encodeURIComponent(s.direct.q)}`)
    showList(s.results)
  } catch (err) { if (my === reqId) showError(err) } finally { if (my === reqId) done() }
})

function showList(list) {
  if (!list.length) return setStatus('Tidak ada hasil.', 'warning')
  setStatus('')
  results.innerHTML = `<div class="content-card rounded-3 p-3 mt-3"><div class="d-flex flex-column gap-2">${list.map((r, i) => `
    <div class="song-card" data-i="${i}">
      <div class="thumbnail-wrapper">${r.thumbnail ? `<img class="song-thumbnail" src="${esc(r.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '<i class="bi bi-music-note-beamed"></i>'}</div>
      <div class="song-info"><p class="song-title">${esc(r.title)}</p><div class="song-meta"><span>${esc(r.subtitle)}</span></div></div>
      <button class="btn btn-custom-accent btn-sm" type="button">Ambil</button>
    </div>`).join('')}</div></div>`
  $$('.song-card').forEach(c => c.onclick = () => {
    const p = list[c.dataset.i].resolve
    runResolve('/api/resolve?' + new URLSearchParams(Object.entries(p).filter(([, x]) => x != null)))
  })
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch {}
  try { // cadangan untuk browser/webview yang menolak Clipboard API
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy'); ta.remove(); return ok
  } catch { return false }
}

/* ---------- statistik: 2 garis (pengguna & download sukses) + angka total ---------- */
const nf = new Intl.NumberFormat('id-ID')
const dfShort = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dfLong = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const utc = d => new Date(d + 'T00:00:00Z')
const compact = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 })
let statData = null

function drawChart(s) {
  const box = $('#statChart'), readout = $('#statReadout')
  const W = Math.max(box.clientWidth, 240), H = W < 420 ? 180 : 220
  const m = { l: 40, r: 14, t: 12, b: 24 }
  const pw = W - m.l - m.r, ph = H - m.t - m.b
  const ser = s.series, n = ser.length
  const maxV = Math.max(1, ...ser.map(d => Math.max(d.users, d.downloads)))
  const raw = maxV / 4, pow = 10 ** Math.floor(Math.log10(raw)), f = raw / pow
  const step = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow), top = step * 4
  const x = i => m.l + (n === 1 ? pw / 2 : (i / (n - 1)) * pw)
  const y = v => m.t + ph - (v / top) * ph
  const line = key => ser.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join('')
  const grid = [0, 1, 2, 3, 4].map(k => `<line class="sgrid" x1="${m.l}" x2="${W - m.r}" y1="${y(k * step)}" y2="${y(k * step)}"/><text class="stick" x="${m.l - 6}" y="${y(k * step) + 3.5}" text-anchor="end">${compact.format(k * step)}</text>`).join('')
  const xi = [0, Math.round((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i)
  const xl = xi.map(i => `<text class="stick" x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${dfShort.format(utc(ser[i].date))}</text>`).join('')
  const last = ser[n - 1]
  box.innerHTML = `<svg class="schart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik pengguna dan download sukses ${n} hari terakhir">
    ${grid}${xl}
    <path class="sline d" d="${line('downloads')}"/><path class="sline u" d="${line('users')}"/>
    <circle class="sdot d" cx="${x(n - 1)}" cy="${y(last.downloads)}" r="4"/><circle class="sdot u" cx="${x(n - 1)}" cy="${y(last.users)}" r="4"/>
    <g id="sHover" visibility="hidden"><line class="sguide" y1="${m.t}" y2="${m.t + ph}"/><circle class="sdot d" r="4"/><circle class="sdot u" r="4"/></g>
    <rect id="sHit" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="transparent"/>
  </svg>`
  const hov = $('#sHover'), [dotD, dotU] = hov.querySelectorAll('circle'), guide = hov.querySelector('line')
  const idle = () => { hov.setAttribute('visibility', 'hidden'); readout.innerHTML = `${esc(dfShort.format(utc(last.date)))} (hari ini): <b>${nf.format(last.users)}</b> pengguna · <b>${nf.format(last.downloads)}</b> download sukses` }
  const point = e => {
    const r = $('#sHit').getBoundingClientRect()
    const i = Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (n - 1))))
    const d = ser[i]
    hov.setAttribute('visibility', 'visible'); guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i))
    dotU.setAttribute('cx', x(i)); dotU.setAttribute('cy', y(d.users)); dotD.setAttribute('cx', x(i)); dotD.setAttribute('cy', y(d.downloads))
    readout.innerHTML = `${esc(dfShort.format(utc(d.date)))}: <b>${nf.format(d.users)}</b> pengguna · <b>${nf.format(d.downloads)}</b> download sukses`
  }
  const hit = $('#sHit')
  hit.addEventListener('pointermove', point); hit.addEventListener('pointerdown', point)
  hit.addEventListener('pointerleave', idle); hit.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') setTimeout(idle, 1800) })
  idle()
}

function renderStats(s) {
  statData = s
  $('#statUsers').textContent = nf.format(s.users)
  $('#statDl').textContent = nf.format(s.downloads)
  $('#statNote').innerHTML = `${s.since ? `Dihitung sejak ${esc(dfLong.format(utc(s.since)))} · ` : ''}Garis menunjukkan total ${s.series.length} hari terakhir.`
    + (s.persistent ? '' : '<span class="stat-warn">Data masih disimpan di memori server dan akan hilang saat server restart. Hubungkan Upstash Redis agar statistik permanen.</span>')
  $('#stats').hidden = false
  drawChart(s)
}
async function loadStats() {
  try { const j = await (await fetch('/api/stats')).json(); if (j.status) renderStats(j) } catch {}
}
loadStats()
{ let w = 0; addEventListener('resize', () => { const el = $('#statChart'); if (statData && el.clientWidth !== w) { w = el.clientWidth; drawChart(statData) } }, { passive: true }) }

const ICON = { video: 'bi-film', audio: 'bi-music-note-beamed', image: 'bi-image', file: 'bi-file-earmark-arrow-down' }

function showResult({ data: d }, path) {
  setStatus('')
  const meta = Object.entries(d.meta || {}).map(([k, v]) => `<span>${esc(k)}: ${esc(v)}</span>`).join('')
  const firstVideo = d.items.findIndex(it => it.kind === 'video')
  const hasVideo = firstVideo >= 0
  const pf = d.profile
  const canCopy = !!d.title && (hasVideo || d.category === 'video') // deskripsi/caption video yang bisa disalin

  // profil pemilik link (foto, nama, @username)
  const avSrc = pf && (pf.avatar || pf.avatarFallback)
  const profileHtml = pf ? (() => {
    const inner = `${avSrc ? `<img class="profile-av" src="${esc(avSrc)}" data-fb="${esc(pf.avatar ? pf.avatarFallback : '')}" data-ini="${esc((pf.name || pf.username || '?').trim().charAt(0).toUpperCase())}" alt="" referrerpolicy="no-referrer">` : `<span class="profile-av profile-ini">${esc((pf.name || pf.username || '?').trim().charAt(0).toUpperCase())}</span>`}
      <div class="profile-info"><div class="profile-name">${esc(pf.name || pf.username)}</div>${pf.username ? `<div class="profile-user">@${esc(pf.username)}</div>` : ''}</div>`
    return pf.url ? `<a class="profile" href="${esc(pf.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<div class="profile">${inner}</div>`
  })() : ''

  const rows = d.items.map((it, i) => {
    const isVideo = it.kind === 'video'
    return `<div class="res-item">
      ${isVideo ? `<video class="player vplayer" controls playsinline preload="metadata"${i === firstVideo ? ' data-auto' : ''} src="${esc(it.preview)}"></video>` : ''}
      <div class="file-row"><i class="bi ${ICON[it.kind] || ICON.file}"></i>
        <div class="lbl">${esc(it.label)}${it.size ? `<small>${esc(it.size)}</small>` : ''}</div>
        ${['audio', 'image'].includes(it.kind) ? `<button class="btn btn-ghost btn-sm-custom" type="button" data-p="${i}">${it.kind === 'image' ? 'Lihat' : 'Putar'}</button>` : ''}
        <a class="btn btn-custom-accent btn-sm-custom" href="${esc(it.download)}" download="${esc(it.filename)}"><i class="bi bi-download me-1"></i>Download</a>
      </div>${isVideo ? '' : `<div data-slot="${i}"></div>`}</div>`
  }).join('')

  results.innerHTML = `<div class="content-card result-card rounded-3 p-4 mt-3"><div class="row g-3">
    ${d.thumbnail && !hasVideo ? `<div class="col-5 col-sm-4 col-md-3 mx-auto"><img class="cover" src="${esc(d.thumbnail)}" alt="" referrerpolicy="no-referrer" onerror="this.closest('.col-5').remove()"></div>` : ''}
    <div class="col">
      <span class="hero-tagline badge rounded-pill mb-2">${esc(d.serviceName)}</span>
      ${profileHtml}
      <div class="result-head">
        <div class="result-title">${esc(d.title || 'Hasil download')}</div>
        ${canCopy ? '<button class="btn btn-ghost btn-sm-custom copy-desc" id="copyDescBtn" type="button" aria-label="Salin deskripsi video"><i class="bi bi-clipboard me-1" aria-hidden="true"></i><span>Salin</span></button>' : ''}
      </div>
      ${!pf && d.author ? `<div class="text-secondary mb-2">${esc(d.author)}</div>` : ''}
      ${meta ? `<div class="result-meta">${meta}</div>` : ''}
      <div class="d-flex flex-column gap-3">${rows}</div>
    </div></div></div>`

  // foto profil: coba cadangan, lalu huruf awal bila semuanya gagal
  $$('#results img.profile-av').forEach(img => img.addEventListener('error', () => {
    const fb = img.dataset.fb
    if (fb && img.getAttribute('src') !== fb) { img.dataset.fb = ''; img.src = fb; return }
    const s = document.createElement('span'); s.className = 'profile-av profile-ini'; s.textContent = img.dataset.ini || '?'; img.replaceWith(s)
  }))

  // video langsung tampil; video pertama otomatis diputar (bisu bila browser melarang suara otomatis)
  const vids = $$('#results video.vplayer')
  vids.forEach(v => v.addEventListener('play', () => vids.forEach(o => { if (o !== v) o.pause() })))
  const auto = results.querySelector('video[data-auto]')
  if (auto) { const p = auto.play(); if (p && p.catch) p.catch(() => { auto.muted = true; auto.play().catch(() => {}) }) }

  // Tombol Putar/Lihat (audio & foto)
  $$('button[data-p]').forEach(b => b.onclick = () => {
    const it = d.items[b.dataset.p], slot = results.querySelector(`[data-slot="${b.dataset.p}"]`)
    if (slot.firstChild) { slot.innerHTML = ''; return }
    slot.innerHTML = it.kind === 'audio' ? `<audio class="player" controls autoplay src="${esc(it.preview)}"></audio>`
      : `<img class="player" style="object-fit:contain" src="${esc(it.preview)}" alt="">`
  })

  // Statistik update setelah klik download (hanya satu kali, delay 6 detik)
  $$('#results a[download]').forEach(x => x.addEventListener('click', () => setTimeout(loadStats, 6000), { once: true }))

  // Tombol Salin deskripsi video
  const copyBtn = $('#copyDescBtn')
  copyBtn?.addEventListener('click', async () => {
    const ok = await copyText(d.title)
    const ic = copyBtn.querySelector('i'), tx = copyBtn.querySelector('span')
    ic.className = `bi ${ok ? 'bi-check2' : 'bi-x-lg'} me-1`; tx.textContent = ok ? 'Tersalin' : 'Gagal'
    clearTimeout(copyBtn._t)
    copyBtn._t = setTimeout(() => { ic.className = 'bi bi-clipboard me-1'; tx.textContent = 'Salin' }, 1800)
  })

  // Simpan ke riwayat (menyimpan alamat permintaan asli supaya bisa diproses ulang dari mode apa pun)
  let src = ''
  try { src = new URL(path, location.origin).searchParams.get('url') || '' } catch {}
  addHistory({ path, url: src, title: d.title || d.serviceName, service: d.serviceName, category: d.category })

  results.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/* ---------- pasang aplikasi (PWA) ---------- */
try {
  const btn = $('#installBtn'), note = $('#installHint')
  const banner = $('#install-banner'), bannerBtn = $('#bannerInstallBtn'), bannerClose = $('#bannerCloseBtn'), bannerSub = $('#bannerSub')
  const BANNER_SUB = bannerSub ? bannerSub.textContent : ''
  const ua = navigator.userAgent
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  // browser bawaan aplikasi (Instagram, TikTok, Facebook, WhatsApp, dll) tidak bisa memasang aplikasi
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Bytedance|Snapchat|; wv\)/i.test(ua) || (isIOS && !/safari/i.test(ua))
  // Firefox desktop belum mendukung pasang aplikasi, banner tidak ditampilkan di sana
  const cannotInstall = /firefox/i.test(ua) && !/android|mobile|tablet/i.test(ua)
  const say = t => { if (note) { note.textContent = t; note.hidden = !t } if (bannerSub) bannerSub.textContent = t || BANNER_SUB }
  const manual = () => inApp
    ? 'Buka link ini di Chrome atau Safari dulu, lalu pasang aplikasinya.'
    : isIOS ? 'Ketuk tombol Bagikan di Safari, lalu pilih Tambah ke Layar Utama.'
    : 'Buka menu ⋮ di browser, lalu pilih Pasang aplikasi atau Tambahkan ke layar utama.'

  // sudah terpasang di perangkat ini? (diingat supaya banner tidak muncul lagi di browser)
  const markInstalled = () => safeStore.set('baegee_installed', '1')
  if (standalone()) markInstalled()
  const wasInstalled = () => safeStore.get('baegee_installed') === '1'

  // banner di paling atas: baru muncul setelah user pernah menekan Download (sudah merasakan manfaatnya); ditutup = sembunyi 3 hari
  const dismissedRecently = () => Date.now() - Number(safeStore.get('banner_dismissed_at') || 0) < 3 * 864e5
  const setBannerH = () => document.documentElement.style.setProperty('--ib-h', (!banner || banner.hidden ? 0 : banner.offsetHeight) + 'px')
  const toggleBanner = show => { if (!banner) return; banner.hidden = !show; document.body.classList.toggle('has-banner', show); setBannerH() }
  if (banner && window.ResizeObserver) new ResizeObserver(setBannerH).observe(banner)
  const DL_KEY = 'baegee_dl_clicked'
  const canShowBanner = () => !standalone() && !wasInstalled() && !dismissedRecently() && !cannotInstall
  toggleBanner(canShowBanner() && safeStore.get(DL_KEY) === '1')
  document.addEventListener('click', e => {
    if (!e.target.closest('a[download]')) return
    safeStore.set(DL_KEY, '1')
    setTimeout(() => { if (canShowBanner()) toggleBanner(true) }, 1500)
  })

  if (standalone() && btn) btn.hidden = true

  // Chrome Android bisa mendeteksi aplikasi yang sudah terpasang
  navigator.getInstalledRelatedApps?.().then(apps => { if (apps && apps.length) { markInstalled(); toggleBanner(false) } }).catch(() => {})

  bannerClose?.addEventListener('click', () => { toggleBanner(false); safeStore.set('banner_dismissed_at', String(Date.now())) })

  const doInstall = async () => {
    const ev = window.__bip
    if (!ev) return say(manual())
    window.__bip = null
    say('')
    try {
      ev.prompt()
      const { outcome } = await ev.userChoice
      if (outcome === 'accepted') { say('Memasang aplikasi…'); setTimeout(() => setMenu(false), 900); toggleBanner(false) }
      else say(manual())
    } catch { say(manual()) }
  }

  btn?.addEventListener('click', doInstall)
  bannerBtn?.addEventListener('click', doInstall)

  addEventListener('appinstalled', () => {
    window.__bip = null; markInstalled(); if (btn) btn.hidden = true
    toggleBanner(false)
    say('Aplikasi terpasang. Cek layar utama kamu.'); setTimeout(() => say(''), 4000)
  })
  matchMedia('(display-mode: standalone)').addEventListener?.('change', () => { if (standalone()) { markInstalled(); if (btn) btn.hidden = true; toggleBanner(false) } })

  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
} catch (err) { console.warn('[install]', err) }

/* ---------- navigator.share fallback (share ke aplikasi lain) ---------- */
// Dipakai di showResult jika browser mendukung Web Share API
window.shareResult = async (title, url) => {
  if (navigator.share) {
    try { await navigator.share({ title, url }); return } catch (e) { if (e.name === 'AbortError') return }
  }
  // fallback: salin ke clipboard
  await copyText(url)
}

/* ---------- Muat riwayat dari localStorage saat awal ---------- */
renderHistory()
