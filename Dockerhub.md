# HonoWA — Hono.js + Unofficial WhatsApp API

REST API + Admin Dashboard untuk mengelola sesi WhatsApp (multi-session) menggunakan **Hono.js**, **PostgreSQL**, dan **whatsapp-web.js** (unofficial).

---

## 🐳 Quick Start (Docker Compose — Recommended)

Cara paling mudah: **satu perintah**, sudah termasuk PostgreSQL.

```bash
# 1. Buat file docker-compose.yml
curl -O https://raw.githubusercontent.com/ardianryan/hono-wa-web-multidevice/main/docker-compose.yml

# 2. (Opsional) Buat file .env untuk API keys
cat <<EOF > .env
WEBHOOK_URL=http://host.docker.internal:3040/webhook
WEBHOOK_SECRET=your_secret_value
GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
EOF

# 3. Jalankan
docker compose up -d
```

UI siap diakses di: **http://localhost:4000/login**

> Default login: `admin` / `admin123`

---

## 📦 Docker Compose (Full)

```yaml
services:
  wa-api:
    image: username/hono-wa-web-multidevice:v2
    container_name: wa-api-service-honojs
    restart: unless-stopped
    ports:
      - "4000:4000"
    volumes:
      - ./.wwebjs_auth:/app/.wwebjs_auth
      - ./.wwebjs_cache:/app/.wwebjs_cache
    environment:
      - TZ=Asia/Jakarta
      - PORT=4000
      - NODE_ENV=production
      - DATABASE_URL=postgresql://honowa:honowa_secret@postgres:5432/honowa
      - PGHOST=postgres
      - PGPORT=5432
      - PGDATABASE=honowa
      - PGUSER=honowa
      - PGPASSWORD=honowa_secret
      - PGPOOL_MAX=10
      - DEFAULT_ADMIN_USERNAME=admin
      - DEFAULT_ADMIN_PASSWORD=admin123
      - WEBHOOK_URL=${WEBHOOK_URL:-}
      - WEBHOOK_SECRET=${WEBHOOK_SECRET:-}
      - GEMINI_API_KEY=${GEMINI_API_KEY:-}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/login"]
      interval: 30s
      timeout: 10s
      start_period: 40s
      retries: 3

  postgres:
    image: postgres:16-alpine
    container_name: wa-api-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_DB=honowa
      - POSTGRES_USER=honowa
      - POSTGRES_PASSWORD=honowa_secret
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U honowa -d honowa"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

```bash
docker compose up -d
```

---

## 🚀 Docker Run (Standalone)

Jika sudah punya PostgreSQL sendiri:

```bash
docker run -d \
  --name whatsapp-api \
  -p 4000:4000 \
  -e DATABASE_URL=postgresql://username:your_password@host.docker.internal:5432/hono_wa \
  -e PGHOST=host.docker.internal \
  -e PGPORT=5432 \
  -e PGDATABASE=hono_wa \
  -e PGUSER=username \
  -e PGPASSWORD=your_password \
  -e DEFAULT_ADMIN_USERNAME=admin \
  -e DEFAULT_ADMIN_PASSWORD=admin123 \
  -e WEBHOOK_URL=http://host.docker.internal:3040/webhook \
  -e WEBHOOK_SECRET=your_secret_value \
  -v $(pwd)/.wwebjs_auth:/app/.wwebjs_auth \
  -v $(pwd)/.wwebjs_cache:/app/.wwebjs_cache \
  username/hono-wa-web-multidevice:v2
```

---

## ⚙️ Environment Variables

| Variable | Wajib | Default | Keterangan |
|----------|-------|---------|------------|
| `DATABASE_URL` | ✅ | — | Connection string PostgreSQL |
| `PGHOST` | ✅ | — | Host database |
| `PGPORT` | — | `5432` | Port database |
| `PGDATABASE` | ✅ | — | Nama database |
| `PGUSER` | ✅ | — | Username database |
| `PGPASSWORD` | ✅ | — | Password database |
| `PGPOOL_MAX` | — | `10` | Maks koneksi pool |
| `PORT` | — | `4000` | Port aplikasi |
| `DEFAULT_ADMIN_USERNAME` | — | `admin` | Username admin awal |
| `DEFAULT_ADMIN_PASSWORD` | — | `admin123` | Password admin awal |
| `WEBHOOK_URL` | — | — | URL tujuan webhook |
| `WEBHOOK_SECRET` | — | — | Secret untuk header `X-Webhook-Secret` |
| `GEMINI_API_KEY` | — | — | API key Google Gemini (fitur AI) |
| `OPENAI_API_KEY` | — | — | API key OpenAI (fitur AI) |
| `ANTHROPIC_API_KEY` | — | — | API key Anthropic (fitur AI) |
| `TZ` | — | `UTC` | Timezone (contoh: `Asia/Jakarta`) |

---

## 💾 Volumes

| Path Container | Keterangan |
|----------------|------------|
| `/app/.wwebjs_auth` | Menyimpan autentikasi WhatsApp (agar tidak perlu scan ulang) |
| `/app/.wwebjs_cache` | Cache whatsapp-web.js |

> **Penting:** Mount kedua volume ini agar sesi tidak hilang saat container restart.

---

## 🏥 Health Check

Container memiliki built-in health check:

```
GET http://localhost:4000/login
Interval: 30s | Timeout: 10s | Start period: 40s | Retries: 3
```

Cek status:

```bash
docker inspect --format='{{.State.Health.Status}}' wa-api-service-honojs
```

---

## 🔒 Security

- Container berjalan sebagai **non-root user** (`honowa`)
- Signal handling yang benar via `dumb-init`
- Tidak ada secret yang di-hardcode dalam image

---

## 📡 Base URL

```
http://localhost:4000
```

---

## 🧱 Database

Aplikasi menggunakan **PostgreSQL** dengan Drizzle ORM. Schema otomatis dibuat saat startup (`ensureSchema()`).

Jika menggunakan Docker Compose di atas, database sudah otomatis tersedia — tidak perlu setup manual.

---

## UI Admin

| Route | Fungsi |
|-------|--------|
| `GET /login` | Login |
| `GET /admin` | Dashboard |
| `GET /admin/sessions` | Kelola sesi (scan QR, atur webhook) |
| `GET /admin/message` | Kirim pesan (teks/media) |
| `GET /admin/broadcast` | Broadcast (queue + delay) |
| `GET /admin/status` | Posting WA Status |
| `GET /admin/settings` | Pengaturan aplikasi |
| `GET /admin/api-docs` | Dokumentasi API + Generate API Key |

---

## 🔑 API Auth (Integrasi)

Semua endpoint API integrasi membutuhkan API Key per-user.

Header yang didukung:

```
X-API-Key: <API_KEY>
Authorization: Bearer <API_KEY>
```

API Key digenerate di `/admin/api-docs` dan hanya ditampilkan sekali saat generate/reset.

---

## 🔗 Daftar Endpoint (Integrasi API)

Semua endpoint API membutuhkan header autentikasi:

```
X-API-Key: <API_KEY>
```

atau

```
Authorization: Bearer <API_KEY>
```

---

### Session

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/sessions` | List semua session + status runtime |
| `GET` | `/session/status/:sessionId` | Cek status 1 session |
| `DELETE` | `/session/:sessionId` | Logout + hapus session |

**Response `GET /sessions`:**

```json
{
  "total": 2,
  "sessions": [
    { "sessionId": "sesi1", "status": "ready", "exists": true, "readyAt": "..." }
  ]
}
```

---

### Message

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/send/:sessionId` | Kirim pesan (teks/media) |
| `POST` | `/send-group/:sessionId` | Kirim pesan ke grup |

**Send Text:**

```json
{ "phone": "081234567890", "message": "Halo!" }
```

**Send Media (JSON):**

```json
{ "phone": "081234567890", "message": "Caption", "mediaUrl": "https://example.com/file.jpg" }
```

**Send Media (multipart/form-data):** field `phone`, `message`, `mediaUrl`, file `media`.

**Send Group:**

```json
{ "groupId": "120363xxxx@g.us", "message": "Halo grup!" }
```

---

### Broadcast

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/broadcast/:sessionId` | Kirim broadcast ke banyak nomor |

**Body (JSON):**

```json
{
  "phones": ["081234567890", "082345678901"],
  "message": "Halo semua!",
  "mediaUrl": "https://example.com/file.pdf",
  "delayMs": 5000
}
```

**Body (multipart/form-data):** field `phones` (newline/koma separated), `message`, `mediaUrl`, file `media`, `delayMs`.

- Maksimal **200 nomor** per request
- Minimal delay **5000ms** (5 detik)

---

### Status (WhatsApp Story)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/status/:sessionId` | Buat WhatsApp Status |

**Status Text:**

```json
{ "text": "Status teks saya!" }
```

**Status Media:**

```json
{ "mediaUrl": "https://example.com/image.jpg", "text": "Caption" }
```

**Response:**

```json
{ "success": true, "message": "Status dibuat via sesi 'sesi1'" }
```

---

### AI

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/ai/chat` | Chat dengan AI |
| `POST` | `/api/ai/image` | Generate gambar dengan AI |
| `DELETE` | `/api/ai/history` | Hapus chat history AI |

**AI Chat:**

```json
{ "message": "Apa itu WhatsApp?", "provider": "openai" }
```

**AI Image:**

```json
{ "prompt": "Gambar kucing lucu", "provider": "openai" }
```

**Provider:** `openai`, `gemini`, `anthropic`

---

### Webhook Events

Jika `WEBHOOK_URL` dikonfigurasi, event berikut dikirim otomatis:

| Event | Deskripsi |
|-------|-----------|
| `message.received` | Pesan masuk diterima |
| `session.ready` | Session siap digunakan |
| `session.qr` | QR code tersedia |
| `session.disconnected` | Session terputus |

**Contoh payload webhook:**

```json
{
  "event": "message.received",
  "sessionId": "sesi1",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "messageId": "true_628123456789@c.us_3EB0...",
    "from": "628123456789@c.us",
    "to": "628987654321@c.us",
    "body": "Halo!",
    "type": "chat",
    "isGroup": false,
    "timestamp": 1625000000
  }
}
```

---

## Contoh cURL

**Kirim Pesan Teks:**

```bash
curl -X POST "http://localhost:4000/send/sesi1" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <API_KEY_ANDA>" \
  -d '{"phone":"081234567890","message":"Halo!"}'
```

**Kirim Media (Upload):**

```bash
curl -X POST "http://localhost:4000/send/sesi1" \
  -H "X-API-Key: <API_KEY_ANDA>" \
  -F "phone=081234567890" \
  -F "message=Ini gambar" \
  -F "media=@/path/to/image.jpg"
```

**Broadcast:**

```bash
curl -X POST "http://localhost:4000/broadcast/sesi1" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <API_KEY_ANDA>" \
  -d '{"phones":["081234567890","082345678901"],"message":"Halo!","delayMs":5000}'
```

**Buat Status:**

```bash
curl -X POST "http://localhost:4000/status/sesi1" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <API_KEY_ANDA>" \
  -d '{"text":"Status dari API!"}'
```

**AI Chat:**

```bash
curl -X POST "http://localhost:4000/api/ai/chat" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <API_KEY_ANDA>" \
  -d '{"message":"Apa itu WhatsApp?","provider":"openai"}'
```

**Hapus Session:**

```bash
curl -X DELETE "http://localhost:4000/session/sesi1" \
  -H "X-API-Key: <API_KEY_ANDA>"
```

---

## ⚠️ Catatan Penting

- Scan QR dilakukan dari UI `/admin/sessions` (QR endpoint tidak public).
- Aksi API membutuhkan session runtime berstatus **READY**.
- Sesi terputus akan dihapus otomatis dari memori setelah **30 detik**.
- Broadcast dibatasi maksimal **200 nomor** per request.
- Default batas ukuran media: **10MB** (bisa diubah dari admin settings).
- Ganti `DEFAULT_ADMIN_PASSWORD` di production!
- Dokumentasi API lengkap tersedia di file `API.md`.
