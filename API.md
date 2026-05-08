# HonoWA — Complete API Reference

Dokumentasi lengkap semua endpoint API HonoWA untuk integrasi dan automation.

---

## 📋 Daftar Isi

1. [Authentication](#authentication)
2. [Session Management](#session-management)
3. [Messaging](#messaging)
4. [Broadcast](#broadcast)
5. [Status](#status)
6. [History & Logs](#history--logs)
7. [AI Features](#ai-features)
8. [Settings & Admin](#settings--admin)
9. [Error Handling](#error-handling)
10. [Rate Limiting](#rate-limiting)

---

## Authentication

Semua endpoint API membutuhkan API Key. Generate di `/admin/api-docs`.

### Header Options

```
X-API-Key: <API_KEY>
```

atau

```
Authorization: Bearer <API_KEY>
```

### Response Errors

```json
{
  "error": "missing_api_key"
}
```

---

## Session Management

### List All Sessions

**Endpoint:** `GET /sessions`

**Auth:** API Key required

**Response:**

```json
{
  "total": 2,
  "sessions": [
    {
      "sessionId": "sesi1",
      "status": "ready",
      "exists": true,
      "readyAt": "2024-01-15T10:30:00Z"
    },
    {
      "sessionId": "sesi2",
      "status": "disconnected",
      "exists": false,
      "readyAt": null
    }
  ]
}
```

**Status Values:**
- `ready` — Siap digunakan
- `initializing` — Sedang inisialisasi
- `qr_waiting` — Menunggu scan QR
- `disconnected` — Terputus

---

### Get Session Status

**Endpoint:** `GET /session/status/:sessionId`

**Auth:** API Key required

**Parameters:**
- `sessionId` (path) — ID sesi

**Response:**

```json
{
  "sessionId": "sesi1",
  "status": "ready",
  "exists": true,
  "readyAt": "2024-01-15T10:30:00Z"
}
```

**Error Response:**

```json
{
  "error": "forbidden_session"
}
```

---

### Delete Session

**Endpoint:** `DELETE /session/:sessionId`

**Auth:** API Key required

**Parameters:**
- `sessionId` (path) — ID sesi

**Response:**

```json
{
  "success": true,
  "message": "Sesi 'sesi1' berhasil dihapus"
}
```

---

## Messaging

### Send Text Message

**Endpoint:** `POST /send/:sessionId`

**Auth:** API Key required

**Content-Type:** `application/json`

**Parameters:**
- `sessionId` (path) — ID sesi

**Body:**

```json
{
  "phone": "081234567890",
  "message": "Halo, ini pesan teks!"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Pesan berhasil dikirim",
  "data": {
    "id": "true_628123456789@c.us_3EB0...",
    "timestamp": 1625000000
  }
}
```

---

### Send Media Message

**Endpoint:** `POST /send/:sessionId`

**Auth:** API Key required

**Content-Type:** `application/json` atau `multipart/form-data`

**Parameters:**
- `sessionId` (path) — ID sesi

**Body (JSON):**

```json
{
  "phone": "081234567890",
  "message": "Ini caption untuk media",
  "mediaUrl": "https://example.com/image.jpg"
}
```

**Body (Multipart):**

```
phone: 081234567890
message: Ini caption untuk media
media: <binary file>
```

**Supported Media Types:**
- Images: `jpg`, `jpeg`, `png`, `gif`, `webp`
- Videos: `mp4`, `mov`, `avi`, `mkv`
- Audio: `mp3`, `wav`, `ogg`, `m4a`
- Documents: `pdf`, `doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`, `txt`

**Response:**

```json
{
  "success": true,
  "message": "Pesan dengan media berhasil dikirim",
  "data": {
    "id": "true_628123456789@c.us_3EB0...",
    "timestamp": 1625000000
  }
}
```

**Error Response:**

```json
{
  "error": "Nomor '081234567890' tidak terdaftar di WhatsApp"
}
```

atau

```json
{
  "error": "Media terlalu besar. Maksimal 10MB."
}
```

---

### Send Group Message

**Endpoint:** `POST /send-group/:sessionId`

**Auth:** API Key required

**Content-Type:** `application/json`

**Parameters:**
- `sessionId` (path) — ID sesi

**Body:**

```json
{
  "groupId": "120363xxxx@g.us",
  "message": "Halo grup!"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Pesan ke grup berhasil dikirim"
}
```

**Note:** Dapatkan `groupId` dari WhatsApp Web atau dari webhook event.

---

## Broadcast

### Send Broadcast

**Endpoint:** `POST /broadcast/:sessionId`

**Auth:** API Key required

**Content-Type:** `application/json` atau `multipart/form-data`

**Parameters:**
- `sessionId` (path) — ID sesi

**Body (JSON):**

```json
{
  "phones": ["081234567890", "082345678901", "083456789012"],
  "message": "Halo semua!",
  "delayMs": 5000
}
```

**Body (Multipart):**

```
phones: 081234567890,082345678901,083456789012
message: Halo semua!
media: <binary file>
delayMs: 5000
```

**Parameters:**
- `phones` (required) — Array nomor atau string (newline/koma separated)
- `message` (optional) — Teks pesan
- `mediaUrl` (optional) — URL media
- `media` (optional) — File media (multipart)
- `delayMs` (optional) — Delay antar pesan dalam ms (minimal 5000, default 5000)

**Response:**

```json
{
  "success": true,
  "message": "Broadcast berhasil dikirim ke 3 nomor",
  "data": {
    "totalPhones": 3,
    "successCount": 3,
    "failedCount": 0,
    "delayMs": 5000
  }
}
```

**Constraints:**
- Maksimal 200 nomor per request
- Minimal delay 5000ms (5 detik) per nomor
- Jika ada nomor tidak valid, tetap dikirim ke nomor valid lainnya

---

## Status

### Create WhatsApp Status

**Endpoint:** `POST /status/:sessionId`

**Auth:** API Key required

**Content-Type:** `application/json`

**Parameters:**
- `sessionId` (path) — ID sesi

**Body (Text):**

```json
{
  "text": "Status teks saya!"
}
```

**Body (Media):**

```json
{
  "mediaUrl": "https://example.com/image.jpg",
  "text": "Caption untuk status"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Status dibuat via sesi 'sesi1'"
}
```

**Error Response:**

```json
{
  "error": "Field \"text\" wajib diisi jika tanpa media"
}
```

---

## History & Logs

### Get Action History

**Endpoint:** `GET /admin/history` (UI only)

**Auth:** Session cookie required

**Query Parameters:**
- `sessionId` (optional) — Filter by session
- `actionType` (optional) — `message`, `broadcast`, `status`
- `limit` (optional) — Jumlah record (default 25)

**Note:** Endpoint ini hanya tersedia di UI. Untuk API, gunakan webhook untuk tracking.

---

### Resend Message from History

**Endpoint:** `POST /admin/history/resend`

**Auth:** Session cookie required

**Body:**

```json
{
  "actionLogId": "log-id-123",
  "actionType": "message",
  "sessionId": "sesi1"
}
```

**Response:** Redirect ke halaman history dengan toast notification.

---

### Unsend Message

**Endpoint:** `POST /admin/history/unsend`

**Auth:** Session cookie required

**Body:**

```json
{
  "actionLogId": "log-id-123",
  "sessionId": "sesi1"
}
```

**Constraints:**
- Hanya bisa unsend dalam 48 jam setelah pengiriman
- Membutuhkan akses ke session

**Response:** Redirect dengan toast notification.

---

### Delete History

**Endpoint:** `POST /admin/history/delete`

**Auth:** Session cookie required

**Body:**

```json
{
  "actionLogId": "log-id-123"
}
```

---

### Delete All History

**Endpoint:** `POST /admin/history/delete-all`

**Auth:** Session cookie required

**Body:**

```json
{
  "sessionId": "sesi1"
}
```

---

### Download History as CSV

**Endpoint:** `GET /admin/history/download.csv`

**Auth:** Session cookie required

**Query Parameters:**
- `sessionId` (optional) — Filter by session
- `actionType` (optional) — Filter by action type

**Response:** CSV file download

---

## AI Features

### AI Chat

**Endpoint:** `POST /api/ai/chat`

**Auth:** Session cookie required

**Body:**

```json
{
  "message": "Apa itu WhatsApp?",
  "provider": "openai"
}
```

**Providers:**
- `openai` — OpenAI GPT
- `gemini` — Google Gemini
- `anthropic` — Anthropic Claude

**Response:**

```json
{
  "success": true,
  "message": "Jawaban dari AI...",
  "provider": "openai"
}
```

---

### AI Image Generation

**Endpoint:** `POST /api/ai/image`

**Auth:** Session cookie required

**Body:**

```json
{
  "prompt": "Gambar kucing lucu",
  "provider": "openai"
}
```

**Response:**

```json
{
  "success": true,
  "imageUrl": "https://...",
  "provider": "openai"
}
```

---

### Get AI Chat History

**Endpoint:** `GET /admin/ai` (UI only)

**Auth:** Session cookie required

**Response:** HTML page dengan chat history.

---

### Delete AI Chat History

**Endpoint:** `DELETE /api/ai/history`

**Auth:** Session cookie required

**Response:**

```json
{
  "success": true,
  "message": "Chat history berhasil dihapus"
}
```

---

## Settings & Admin

### Get App Settings

**Endpoint:** `GET /admin/settings` (UI only)

**Auth:** Session cookie + Admin role required

**Response:** HTML page dengan form settings.

---

### Update App Settings

**Endpoint:** `POST /admin/settings`

**Auth:** Session cookie + Admin role required

**Body:**

```json
{
  "appName": "HonoWA Pro",
  "appDescription": "WhatsApp API Management",
  "appLogoUrl": "https://example.com/logo.png",
  "mediaMaxMb": "20",
  "maintenanceMode": "off"
}
```

**Response:** Redirect dengan toast notification.

---

### Get User Profile

**Endpoint:** `GET /admin/profile`

**Auth:** Session cookie required

**Response:** HTML page dengan profile form.

---

### Update User Profile

**Endpoint:** `POST /admin/profile`

**Auth:** Session cookie required

**Body:**

```json
{
  "email": "user@example.com",
  "currentPassword": "old_password",
  "newPassword": "new_password",
  "profilePhotoUrl": "https://example.com/photo.jpg"
}
```

**Response:** Redirect dengan toast notification.

---

### Rotate API Key

**Endpoint:** `POST /admin/api-docs/api-key/rotate`

**Auth:** Session cookie required

**Response:** Redirect ke `/admin/api-docs` dengan API key baru di cookie.

---

### List Users (Admin)

**Endpoint:** `GET /admin/users`

**Auth:** Session cookie + Admin role required

**Response:** HTML page dengan daftar user.

---

### Create User (Admin)

**Endpoint:** `POST /admin/users/new`

**Auth:** Session cookie + Admin role required

**Body:**

```json
{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "password123",
  "role": "user",
  "maxDevices": "5"
}
```

**Response:** Redirect dengan toast notification.

---

### Update User (Admin)

**Endpoint:** `POST /admin/users/:id/edit`

**Auth:** Session cookie + Admin role required

**Body:**

```json
{
  "email": "updated@example.com",
  "role": "admin",
  "maxDevices": "10"
}
```

---

### Delete User (Admin)

**Endpoint:** `POST /admin/users/:id/delete`

**Auth:** Session cookie + Admin role required

**Response:** Redirect dengan toast notification.

---

## Error Handling

### Common Error Responses

**Missing API Key:**

```json
{
  "error": "missing_api_key"
}
```

**Invalid API Key:**

```json
{
  "error": "invalid_api_key"
}
```

**Session Not Ready:**

```json
{
  "error": "Sesi belum siap. Status: initializing"
}
```

**Forbidden Session:**

```json
{
  "error": "forbidden_session"
}
```

**Invalid Phone Number:**

```json
{
  "error": "Nomor '081234567890' tidak terdaftar di WhatsApp"
}
```

**Media Too Large:**

```json
{
  "error": "Media terlalu besar. Maksimal 10MB."
}
```

**Maintenance Mode:**

```json
{
  "error": "maintenance_mode"
}
```

---

## Rate Limiting

Tidak ada rate limiting global, namun:

- **Broadcast:** Minimal 5 detik delay per nomor (untuk menghindari ban WhatsApp)
- **Message:** Tidak ada limit, tapi WhatsApp bisa block jika terlalu cepat
- **Status:** Maksimal 1 status per 24 jam (WhatsApp limitation)

---

## Webhook Events

Jika `WEBHOOK_URL` dikonfigurasi, aplikasi akan mengirim event ke URL tersebut.

### Event Types

**message.received**

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

**message.sent**

```json
{
  "event": "message.sent",
  "sessionId": "sesi1",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "messageId": "true_628123456789@c.us_3EB0...",
    "to": "628123456789@c.us",
    "body": "Halo!",
    "timestamp": 1625000000
  }
}
```

**session.ready**

```json
{
  "event": "session.ready",
  "sessionId": "sesi1",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "status": "ready"
  }
}
```

**session.qr**

```json
{
  "event": "session.qr",
  "sessionId": "sesi1",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "qr": "data:image/png;base64,..."
  }
}
```

**session.disconnected**

```json
{
  "event": "session.disconnected",
  "sessionId": "sesi1",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "reason": "LOGOUT"
  }
}
```

---

## Examples

### cURL — Send Text Message

```bash
curl -X POST "http://localhost:4000/send/sesi1" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "phone": "081234567890",
    "message": "Halo dari cURL!"
  }'
```

### cURL — Send Media

```bash
curl -X POST "http://localhost:4000/send/sesi1" \
  -H "X-API-Key: your_api_key_here" \
  -F "phone=081234567890" \
  -F "message=Ini gambar" \
  -F "media=@/path/to/image.jpg"
```

### cURL — Broadcast

```bash
curl -X POST "http://localhost:4000/broadcast/sesi1" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "phones": ["081234567890", "082345678901"],
    "message": "Halo semua!",
    "delayMs": 5000
  }'
```

### JavaScript/Node.js

```javascript
const apiKey = "your_api_key_here";
const baseUrl = "http://localhost:4000";

async function sendMessage(sessionId, phone, message) {
  const response = await fetch(`${baseUrl}/send/${sessionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ phone, message }),
  });
  return response.json();
}

sendMessage("sesi1", "081234567890", "Halo!").then(console.log);
```

### Python

```python
import requests

api_key = "your_api_key_here"
base_url = "http://localhost:4000"

def send_message(session_id, phone, message):
    response = requests.post(
        f"{base_url}/send/{session_id}",
        headers={
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        },
        json={"phone": phone, "message": message}
    )
    return response.json()

print(send_message("sesi1", "081234567890", "Halo!"))
```

---

## Changelog

### v2.0.0

- Tambah endpoint `/api/ai/chat` dan `/api/ai/image`
- Tambah endpoint `/api/ai/history`
- Tambah support multipart/form-data untuk `/send` dan `/broadcast`
- Tambah `delayMs` parameter untuk broadcast
- Tambah webhook events
- Tambah health check endpoint

---

## Support

Untuk pertanyaan atau issue, silakan buka issue di repository atau hubungi support.
