# Smart Office Bappeda & Litbang Terintegrasi

Sistem automasi birokrasi, layanan publik, dan persuratan berbasis Edge Computing (Cloudflare Workers), Serverless Database (Supabase PostgreSQL), serta Bot Telegram Interaktif.

## 🚀 Fitur Utama
1. **Portal Layanan Publik & Riset**: Pendaftaran mandiri permohonan riset, magang, dan konsultasi RKPD.
2. **Edge Backend (Hono + Cloudflare Workers)**: Routing cepat, aman, dan tanpa server cold-start yang tinggi.
3. **Notifikasi & Interaksi Telegram**: Pengelola dapat menyetujui (`✅ Setujui`) atau menolak (`❌ Tolak`) permohonan langsung dari grup/chat Telegram.
4. **Manajemen Surat Masuk & Disposisi**: Pencatatan surat dan tracking status disposisi pimpinan.

---

## 🛠️ Panduan Deployment & Konfigurasi

### 1. Konfigurasi Database Supabase
Jalankan skrip SQL yang ada pada `schema.sql` pada SQL Editor di Dashboard Supabase Anda untuk membuat tabel:
- `permohonan_layanan_publik`
- `surat_masuk`
- `disposisi_surat`
- `buku_tamu`
- `audit_logs`

### 2. Konfigurasi Environment Variables di Cloudflare
Atur *Secrets* berikut pada Cloudflare Workers dashboard atau melalui terminal Wrangler:
```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_ADMIN_CHAT_ID
```

### 3. Menjalankan & Deploy Worker
```bash
# Development lokal
npx wrangler dev

# Deploy ke Cloudflare Workers
npx wrangler deploy
```
