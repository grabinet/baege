/* Service worker BaegeeDownloader: syarat aplikasi bisa dipasang + halaman tetap terbuka saat offline.
   Permintaan /api/* tidak pernah disentuh (selalu langsung ke jaringan).
   Semua file jaringan-dulu: setelah update situs, HTML dan JS/CSS selalu pasangan versi yang sama. */
const CACHE = 'zeta-v14'
const SHELL = ['/', '/css/site.css', '/app.js', '/logos.js', '/favicon.ico', '/icons/icon-192.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return

  const navigate = req.mode === 'navigate'
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(navigate ? '/' : req, copy)) }
      return res
    }).catch(() => caches.match(navigate ? '/' : req).then(r => r || Response.error()))
  )
})
