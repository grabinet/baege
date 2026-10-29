# BaegeeDownloader

Website downloader (video, musik, foto, file) yang memakai Neoxr API — logika & endpoint diambil dari kategori `download` bot Vestia.
Tanpa dependensi npm, cukup Node >= 18.

## Jalankan
```bash
cp .env.example .env     # isi API_KEY dan SIGN_SECRET
node src/zeta.js           # http://localhost:3000
node test/run.js         # tes (pakai API tiruan, tidak memakai kuota)
```
pm2: `pm2 start src/zeta.js --name baeegedownloader`

> **`test/run.js` mencakup:** auto-detect platform, resolve semua service, fallback 480p YouTube, mode proxy & redirect, validasi token HMAC (termasuk token kedaluwarsa/dipalsukan), rate limit 429, path traversal diblok, serta seluruh logika statistik (zona waktu, garis kumulatif, Redis REST, file store, error tidak merusak app).


## Deploy ke Vercel
1. Push folder ini ke GitHub → Vercel → *Add New Project* → import (Framework: Other, tanpa build command).
2. *Settings → Environment Variables*: `API_KEY`, `SIGN_SECRET`, `NEOXR_BASE` (opsional).
3. Deploy. `public/` jadi file statis, `api/[...path].js` jadi serverless function (maxDuration 60 dtk di `vercel.json`).
CLI: `npx vercel --prod`.

Perbedaan di Vercel: unduhan memakai mode `redirect` (302 langsung ke server sumber) karena function tidak cocok untuk stream file besar. Akibatnya nama file bergantung sumber, dan sumber yang butuh Referer (YouTube/tomp3) bisa menolak — di VPS mode `proxy` menangani itu. Rate limit tersimpan di memori per instance, jadi hanya perlindungan kasar di serverless.

## Cara kerja
- Browser → `GET /api/resolve?url=…` → server memanggil `NEOXR_BASE/<endpoint>?…&apikey=…` → hasil dinormalisasi.
- API key hanya ada di server. Link sumber tidak dikirim ke browser; browser menerima link `/api/file?t=…` (bertanda tangan HMAC, berlaku 30 menit) yang di-stream lewat server (mendukung Range untuk preview).
- Rate limit per IP (`RATE_LIMIT`/menit). Di belakang nginx/Cloudflare isi `TRUST_PROXY=1`.

## Endpoint
| Route | Fungsi |
|---|---|
| `/api/services` | daftar platform & tipe pencarian |
| `/api/resolve?url=` | auto-detect platform dari link |
| `/api/resolve?service=play&q=` | cari judul → MP3 (`video` → MP4) |
| `/api/search?type=spotify\|soundcloud\|applemusic\|apk&q=` | daftar hasil; pilih → `/api/resolve?service=…` |
| `/api/file?t=` | stream/unduh file |
| `/api/stats` | total pengguna & download sukses + 2 garis (total kumulatif 30 hari terakhir) |

## Menambah platform
Tambah entri di `SERVICES` pada `src/core.js` (`detect`, `call`, `map`).
Untuk logonya, tambah satu baris di `LOGOS` pada `public/logos.js` (`match` = nama service tadi; `path` SVG 24×24 + warna brand, atau `icon: favicon('domain.com')`). Tanpa baris itu, platform baru tetap muncul di dinding logo sebagai monogram huruf pertama.

## Fitur UI
- **Riwayat download** — link yang berhasil diproses disimpan di `localStorage` (maks 20 item) dan otomatis dihapus setelah 24 jam. Awalnya 3 item tampil; tombol **Lihat semua** menampilkan seluruhnya, lalu berubah menjadi **Hapus semua**. Klik entri untuk membuka proses/hasilnya lagi.
- **Salin deskripsi** — hasil video punya tombol Salin untuk menyalin deskripsi (caption) video.
- **Tanpa watermark** — hanya versi tanpa watermark yang ditampilkan (versi WM TikTok/Douyin dibuang).
- **Tombol Paste** — tombol di bawah kolom input membaca clipboard lalu mengisi kolom otomatis.
- **Drag & drop** — seret URL dari browser langsung ke halaman; unduhan dimulai otomatis.
- **Salin link download** — setiap baris hasil punya tombol 🔗 untuk menyalin link `/api/file?t=…`.
- **Toast notifikasi** — pesan ringkas muncul di sudut kanan bawah, menggantikan alert merah untuk aksi kecil.
- **Banner install PWA** — muncul 3 detik setelah halaman dibuka (hanya jika browser mendukung `beforeinstallprompt` dan belum pernah ditutup).
- **Transisi tab** — fade singkat saat beralih antara mode "Tempel link" dan "Cari judul".

## Catatan
- Bot memakai base `https://api.neoxr.my.id/api`; default di sini `https://api.neoxr.eu/api`. Ubah lewat `NEOXR_BASE` bila path-nya beda.
- Field respons mengikuti yang dipakai plugin bot; belum diuji ke API asli (sandbox tidak bisa akses neoxr).

## Troubleshooting
- **"Respon API bukan JSON (HTTP 200)"** — API membalas halaman HTML, bukan JSON. Penyebab umum: `NEOXR_BASE` salah, IP server (Vercel) diblokir/ditantang Cloudflare, atau `API_KEY` salah. Cek **Vercel → Deployments → Functions/Logs**, baris `[neoxr] bukan JSON | HTTP … | content-type | host/path | cuplikan isi` menunjukkan isi balasan sebenarnya (apikey tidak ikut dicatat). Server otomatis mencoba `NEOXR_FALLBACK` (default `api.neoxr.my.id`) bila base utama gagal.
- **"API_KEY belum diisi"** — isi `API_KEY` di *Settings → Environment Variables* lalu **redeploy** (perubahan env tidak berlaku ke deployment lama).

## Statistik
Ditampilkan di paling bawah halaman, tepat di atas footer (muncul otomatis bila `/api/stats` berhasil, tidak ada tombol di menu). Isinya: 2 angka total (**Pengguna** dan **Download sukses**), baris **Hari ini** (pengguna & download sukses hari ini), baris **Platform terpopuler** (3 platform dengan proses berhasil terbanyak), dan 2 garis pertumbuhan. Arahkan kursor / sentuh garis untuk melihat angka per tanggal. Tidak ada rincian mingguan/bulanan.
- **Pengguna** = link/judul yang berhasil diproses (`/api/resolve` sukses; yang gagal tidak dihitung).
- **Download sukses** = tombol *Download* ditekan **dan** file terkirim sampai habis. Preview/Putar, `HEAD`, lanjutan `Range`, sumber yang menolak, koneksi putus di tengah, dan unduhan yang dibatalkan pengguna tidak dihitung. Di mode `redirect` (Vercel) file diunduh langsung dari server sumber sehingga selesai-tidaknya tidak bisa dipantau; di sana dihitung saat unduhan diteruskan ke sumber.
- **Hari ini** = counter harian untuk tanggal sekarang (zona waktu `STATS_TZ`), reset otomatis saat ganti hari.
- **Platform terpopuler** = jumlah link/judul yang berhasil diproses per platform (resolve sukses; pencarian judul YouTube dihitung sebagai YouTube). Dihitung **mulai dari update ini**: proses sebelumnya tidak punya data platform, sehingga baris ini kosong sampai ada link baru yang diproses.
- Garis = total kumulatif per hari (zona waktu `STATS_TZ`, default `Asia/Jakarta`), titik terakhir sama dengan angka total.
- Yang disimpan hanya angka (counter per hari dan per platform). Tidak ada IP, link, atau data pengguna.

**Penyimpanan** (otomatis dipilih):
1. **Upstash Redis** bila `UPSTASH_REDIS_REST_URL`+`_TOKEN` (atau `KV_REST_API_URL`+`_TOKEN`) terisi — **wajib di Vercel** agar angka permanen.
2. **File JSON** `data/stats.json` (VPS/pm2; folder `data/` sudah di `.gitignore`).
3. **Memori** — dipakai di Vercel tanpa Redis. Angka terpecah per instance dan hilang saat cold start/redeploy, jadi halaman menampilkan peringatan.

Mencatat statistik tidak boleh merusak aplikasi: bila Redis bermasalah, download dan proses link tetap jalan, hanya penghitungannya yang dilewati (dicatat di log `[stats]`).
