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

## UI Admin

- Login: `GET /login`
- Dashboard: `GET /admin`
- Sessions: `GET /admin/sessions` (scan QR via modal, atur webhook per session)
- API Docs + Generate API Key: `GET /admin/api-docs`

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

### `POST /status/:sessionId`

Body JSON:

```json
{ "text": "Halo!" }
```

Atau status media:

```json
{ "mediaUrl": "https://example.com/image.jpg", "text": "Caption" }
```

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
