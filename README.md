<div align="center">
  <img src="public/assets/uploads/honowa.png" alt="HonoWA" width="180" />
</div>

# HonoWA — Hono.js + Unofficial WhatsApp API

REST API dan Admin Dashboard untuk mengelola sesi WhatsApp (multi-session) menggunakan **Hono.js** dan **whatsapp-web.js** (unofficial).

Terinspirasi dari GOWA: https://github.com/aldinokemal/go-whatsapp-web-multidevice

```bash
npm install
npm run dev
```

Buka:

```
http://localhost:3000/login
```

## Preview

**Login**

![Login Page](public/img/1.jpg)

**Dashboard**

![Dashboard](public/img/2.jpg)

**Scan QR WhatsApp**

![Scan QR](public/img/3.jpg)

---

## Konfigurasi (.env)

Minimal:

```env
DATABASE_URL=postgresql://your_username:your_password@localhost:5432/hono_wa

PGHOST=localhost
PGPORT=5432
PGDATABASE=hono_wa
PGUSER=your_username
PGPASSWORD=your_password

DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin123
```

Opsional:

```env
PORT=3000
WEBHOOK_URL=http://localhost:3040/webhook
WEBHOOK_SECRET=your_secret_value
```

Catatan webhook:

- `WEBHOOK_URL` adalah **default fallback** (dipakai jika session/device tidak punya webhook khusus).
- Webhook **per device/session** bisa diatur dari UI: `GET /admin/sessions` → tombol **Webhook** pada masing-masing session.
- Saat `WEBHOOK_SECRET` diisi, server akan menambahkan header `X-Webhook-Secret: <value>` pada setiap request webhook.

## Database (Drizzle ORM)

Project memakai **Drizzle ORM** untuk query ke PostgreSQL, dengan schema di:

- `src/backend/schema.ts`
- `drizzle.config.ts`

Setup database (disarankan untuk environment baru):

```bash
npm install
npm run db:push
npm run dev
```

Catatan:

- `npm run db:push` membutuhkan `DATABASE_URL` (atau fallback dari `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` via `drizzle.config.ts`).
- Aplikasi juga tetap menjalankan bootstrap schema saat startup (`ensureSchema()`), namun `db:push` tetap disarankan untuk memastikan schema sesuai definisi Drizzle.

## UI Admin

- Login: `GET /login`
- Dashboard: `GET /admin`
- Sessions: `GET /admin/sessions` (scan QR via modal, atur webhook per session)
- Message: `GET /admin/message` (kirim teks atau media)
- Broadcast: `GET /admin/broadcast` (queue + delay minimal 5 detik/nomor)
- Status: `GET /admin/status` (text atau mediaUrl)
- Pengaturan: `GET /admin/settings` (termasuk batas ukuran media)
- API Docs + Generate API Key: `GET /admin/api-docs`

## Fitur Utama

- Multi-session WhatsApp (runtime map) + QR connect dari dashboard
- Webhook default via env + webhook per device/session (bisa diatur user dari UI)
- Message:
  - teks
  - media (gambar/video/audio/document) via URL (diutamakan) atau upload
- Broadcast:
  - queue/delay per nomor (minimal 5 detik wajib)
  - dukung media via URL (diutamakan) atau upload (dari UI)
- History (Message/Broadcast/Status):
  - Resend, Unsend (batas waktu WhatsApp), Delete
  - Bulk action: Delete Selected, Delete All, Download CSV
- Database PostgreSQL + Drizzle ORM + drizzle-kit

## API Auth (Integrasi)

Endpoint API integrasi membutuhkan API Key per-user (generate di `/admin/api-docs`).

Header yang didukung:

- `X-API-Key: <API_KEY>`
- `Authorization: Bearer <API_KEY>`

Catatan:

- User biasa hanya bisa akses session miliknya; admin bisa akses semua.
- Saat maintenance aktif, hanya admin yang bisa akses.

## REST API (Integrasi Aplikasi Lain)

Base URL:

```
http://localhost:3000
```

### `GET /sessions`

List session milik user (berdasarkan DB) + status runtime jika sedang aktif.

### `GET /session/status/:sessionId`

Cek status runtime 1 session.

### `POST /send/:sessionId`

Body JSON:

```json
{ "phone": "081234567890", "message": "Halo!" }
```

Kirim media via URL (opsional):

```json
{ "phone": "081234567890", "message": "Caption", "mediaUrl": "https://example.com/file.jpg" }
```

Atau upload file (multipart/form-data):

- field: `phone` (wajib)
- field: `message` (opsional jika ada media)
- field: `mediaUrl` (opsional, diutamakan)
- field file: `media` (opsional)

### `POST /send-group/:sessionId`

Body JSON:

```json
{ "groupId": "120363xxxx@g.us", "message": "Halo grup!" }
```

### `POST /broadcast/:sessionId`

Body JSON:

```json
{ "phones": ["0812...","0898..."], "message": "Halo", "delayMs": 2000 }
```

Kirim broadcast media via URL (message boleh kosong jika ada media):

```json
{ "phones": ["0812...","0898..."], "message": "Caption", "mediaUrl": "https://example.com/file.pdf", "delayMs": 5000 }
```

Atau upload file (multipart/form-data):

- field: `phones` (boleh array JSON atau string newline/koma)
- field: `message` (opsional jika ada media)
- field: `mediaUrl` (opsional, diutamakan)
- field file: `media` (opsional)
- field: `delayMs` (optional, minimal 5000)

### `POST /status/:sessionId`

Body JSON:

```json
{ "text": "Halo!" }
```

Atau status media:

```json
{ "mediaUrl": "https://example.com/image.jpg", "text": "Caption" }
```

## Catatan Media & Limit Ukuran

- Default batas ukuran media: **10MB**.
- Bisa diubah dari UI Admin: `GET /admin/settings` → `Batas ukuran media (MB)`.
- Limit ini dipakai untuk:
  - upload media dari UI/API (multipart)
  - download media via URL (server akan fetch file lalu kirim via WhatsApp)

## Catatan History (Resend/Unsend)

- Tombol `Unsend` hanya aktif jika:
  - history punya `sentMessageIds` (tersimpan saat kirim sukses), dan
  - belum lewat batas waktu WhatsApp (dibatasi 48 jam di UI).
- Log lama (sebelum update ini) mungkin belum punya `sentMessageIds`, jadi `Unsend` tidak tersedia.

### `DELETE /session/:sessionId`

Logout + stop runtime + hapus record session (sesuai scope user/admin).

### Contoh cURL

```bash
curl -X POST "http://localhost:3000/send/sesi1" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <API_KEY_ANDA>" \
  -d '{"phone":"081234567890","message":"Halo! Ini pesan otomatis."}'
```

## Catatan Keamanan & QR

- Endpoint `GET /session/qr/:sessionId` dan `POST /session/pair/:sessionId` sekarang hanya bisa diakses setelah login (bukan public).
- Scan QR untuk menghubungkan WhatsApp dilakukan dari UI `/admin/sessions`.

---

## 🐳 Quick Start (Docker)

```bash
docker run -d \
  --name whatsapp-api \
  -p 3000:3000 \
  -e PGHOST=host.docker.internal \
  -e PGPORT=5432 \
  -e PGDATABASE=hono_wa \
  -e PGUSER=username \
  -e PGPASSWORD=your_password \
  -e DEFAULT_ADMIN_USERNAME=admin \
  -e DEFAULT_ADMIN_PASSWORD=admin123 \
  -e WEBHOOK_URL=http://host.docker.internal:3040/webhook \
  -e WEBHOOK_SECRET=your_secret_value \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/.wwebjs_auth:/app/.wwebjs_auth \
  -v $(pwd)/.wwebjs_cache:/app/.wwebjs_cache \
  username/hono-wa-web-multidevice:v2
```

UI siap diakses di `http://localhost:3000/login`

---

## 📦 Docker Compose

```yaml
version: "3.8"
services:
  whatsapp-api:
    image: username/hono-wa-web-multidevice:v2
    container_name: whatsapp-api
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      PGHOST: host.docker.internal
      PGPORT: "5432"
      PGDATABASE: hono_wa
      PGUSER: username
      PGPASSWORD: your_password
      DEFAULT_ADMIN_USERNAME: admin
      DEFAULT_ADMIN_PASSWORD: admin123
    volumes:
      - ./data:/app/data
      - ./.wwebjs_auth:/app/.wwebjs_auth
      - ./.wwebjs_cache:/app/.wwebjs_cache
```

```bash
docker compose up -d
```

---

## 💾 Volume yang Digunakan

| Volume              | Keterangan                                                   |
| ------------------- | ------------------------------------------------------------ |
| `/app/data`         | Menyimpan `session.json` (metadata sesi)                     |
| `/app/.wwebjs_auth` | Menyimpan autentikasi WhatsApp (agar tidak perlu scan ulang) |
| `/app/.wwebjs_cache` | Cache whatsapp-web.js                                      |

> **Penting:** Mount kedua volume ini agar sesi tidak hilang saat container restart.

## ⚠️ Catatan Penting

- Aksi API membutuhkan session runtime berstatus **READY**.
- Format nomor HP: `08xx` atau `62xx` — awalan `0` otomatis dikonversi ke `62`.
- Broadcast dibatasi maksimal **200 nomor** per request.
- Mount volume `/app/.wwebjs_auth` agar sesi tidak perlu scan ulang setelah container restart.

## Lisensi

Project ini menggunakan lisensi **CC BY-NC-ND 4.0**:

- Wajib mencantumkan kredit/attribution
- Non-komersial (tidak boleh dijual / dipakai untuk tujuan komersial)
- No-derivatives (tidak boleh dimodifikasi lalu dibagikan ulang)

Catatan dependency:

- `whatsapp-web.js` berlisensi **Apache License 2.0** dan tidak tercakup oleh lisensi project ini. Saat mendistribusikan aplikasi, tetap wajib mematuhi lisensi dependency tersebut. [wwebjs docs](https://docs.wwebjs.dev/#license)
