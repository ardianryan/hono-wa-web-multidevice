# HonoWA — Hono.js + Unofficial WhatsApp API

REST API + Admin Dashboard untuk mengelola sesi WhatsApp (multi-session) menggunakan **Hono.js**, **PostgreSQL**, dan **whatsapp-web.js** (unofficial).

---

## 🐳 Quick Start

```bash
docker run -d \
  --name whatsapp-api \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://username:your_password@host.docker.internal:5432/hono_wa \
  -e PGHOST=host.docker.internal \
  -e PGPORT=5432 \
  -e PGDATABASE=hono_wa \
  -e PGUSER=username \
  -e PGPASSWORD=your_password \
  -e DEFAULT_ADMIN_USERNAME=admin \
  -e DEFAULT_ADMIN_PASSWORD=admin123 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/.wwebjs_auth:/app/.wwebjs_auth \
  -v $(pwd)/.wwebjs_cache:/app/.wwebjs_cache \
  username/hono-wa-web-multidevice:v2
```

UI siap diakses di:

`http://localhost:3000/login`

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
      DATABASE_URL: postgresql://username:your_password@host.docker.internal:5432/hono_wa
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

---

## 📡 Base URL

```
http://localhost:3000
```

---

## 🧱 Database (Drizzle ORM)

Schema Drizzle ada di `src/backend/schema.ts` dan konfigurasi drizzle-kit ada di `drizzle.config.ts`.

Untuk setup database baru, jalankan dari host/CI (bukan dari container runtime):

```bash
npm install
npm run db:push
```

Catatan:

- Container runtime umumnya install dependency dengan `--omit=dev`, jadi `drizzle-kit` tidak tersedia jika dieksekusi langsung di container.
- Aplikasi tetap menjalankan bootstrap schema saat startup (`ensureSchema()`), tapi `db:push` disarankan agar schema sesuai definisi Drizzle.

---

## UI Admin

- Login: `GET /login`
- Dashboard: `GET /admin`
- Sessions: `GET /admin/sessions` (scan QR via modal)
- API Docs + Generate API Key: `GET /admin/api-docs`

## API Auth (Integrasi)

Semua endpoint API integrasi membutuhkan API Key per-user.

Header yang didukung:

- `X-API-Key: <API_KEY>`
- `Authorization: Bearer <API_KEY>`

API Key digenerate di `/admin/api-docs` dan hanya ditampilkan sekali saat generate/reset.

## 🔗 Daftar Endpoint (Integrasi)

### `GET /sessions`

List session untuk user (berdasarkan DB) + status runtime jika sedang aktif.

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
  "phones": ["0812...","0898..."],
  "message": "Halo",
  "delayMs": 2000
  ]
}
```
### `POST /status/:sessionId`
---
Body JSON:
### `POST /send/:sessionId`
```json
{ "text": "Halo!" }
```
Kirim pesan teks ke nomor WhatsApp.
Atau status media:
| `message` | `string` | ✅ | Isi pesan |

```json
  "mediaUrl": "https://example.com/image.jpg",
  "text": "Caption"
  "message": "Halo! Ini pesan otomatis."
}
```
### `DELETE /session/:sessionId`
### `POST /send-group/:sessionId`
Logout + stop runtime + hapus record session (sesuai scope user/admin).
Kirim pesan ke grup WhatsApp.
## Contoh cURL
| `message` | `string` | ✅ | Isi pesan |
```bash
curl -X POST "http://localhost:3000/send/sesi1" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <API_KEY_ANDA>" \
  -d '{"phone":"081234567890","message":"Halo!"}'
```
```

---

## ⚠️ Catatan Penting
- Scan QR dilakukan dari UI `/admin/sessions` (QR endpoint tidak public).
- Aksi API membutuhkan session runtime berstatus **READY**.
- Semua endpoint (kecuali `/session/qr` dan `/session/pair`) memerlukan sesi berstatus **`ready`**.
- Sesi terputus akan dihapus otomatis dari memori setelah **30 detik**.
- Broadcast dibatasi maksimal **200 nomor** per request.
