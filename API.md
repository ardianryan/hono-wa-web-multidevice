# HonoWA — Connectivity API Reference

Dokumentasi API untuk menghubungkan aplikasi luar (n8n, Zapier, Backend) dengan WhatsApp melalui HonoWA.

---

## 📋 Daftar Isi

1. [Authentication](#authentication)
2. [Session Management](#session-management)
3. [Messaging](#messaging)
4. [Broadcast](#broadcast)
5. [Status Update](#status-update)
6. [Webhook (Events)](#webhook-events)
7. [Error Handling](#error-handling)

---

## Authentication

Semua request ke API Connectivity membutuhkan **API Key**. Anda dapat menemukannya di dashboard admin pada menu **API Docs**.

### Header Options

Sertakan API Key di dalam header request:

```
X-API-Key: <YOUR_API_KEY>
```
atau
```
Authorization: Bearer <YOUR_API_KEY>
```

---

## Session Management

### List All Sessions
Melihat semua session yang terdaftar di akun Anda.

**Endpoint:** `GET /sessions`

**Response:**
```json
{
  "total": 1,
  "sessions": [
    {
      "sessionId": "device-01",
      "status": "ready",
      "exists": true,
      "readyAt": "2024-05-10T21:00:00Z"
    }
  ]
}
```

### Get Session Status
Mengecek apakah session tertentu aktif dan siap mengirim pesan.

**Endpoint:** `GET /session/status/:sessionId`

**Response:**
```json
{
  "sessionId": "device-01",
  "status": "ready",
  "exists": true,
  "readyAt": "2024-05-10T21:00:00Z"
}
```

### Delete/Logout Session
Menghentikan session dan menghapus data autentikasi dari server.

**Endpoint:** `DELETE /session/:sessionId`

**Response:**
```json
{
  "success": true,
  "message": "Sesi 'device-01' berhasil dihapus"
}
```

---

## Messaging

### Send Message (Text & Media)
Mengirim pesan ke nomor WhatsApp. Support teks, gambar, video, dan dokumen.

**Endpoint:** `POST /send/:sessionId`

**Body (JSON):**
```json
{
  "phone": "628123456789",
  "message": "Halo dari API!",
  "mediaUrl": "https://example.com/image.jpg" 
}
```

**Keterangan:**
- `phone`: Nomor tujuan (format internasional tanpa + atau 0 di depan).
- `message`: Teks pesan (caption jika ada media).
- `mediaUrl`: (Optional) URL file media yang akan dikirim.

**Response:**
```json
{
  "success": true,
  "message": "Pesan berhasil dikirim",
  "data": {
    "id": "true_628123456789@c.us_3EB0...",
    "timestamp": 1715345000
  }
}
```

### Send Group Message
Mengirim pesan ke grup WhatsApp.

**Endpoint:** `POST /send-group/:sessionId`

**Body (JSON):**
```json
{
  "groupId": "120363123456789@g.us",
  "message": "Halo Grup!"
}
```

---

## Broadcast
Mengirim pesan ke banyak nomor sekaligus dengan jeda (delay) otomatis.

**Endpoint:** `POST /broadcast/:sessionId`

**Body (JSON):**
```json
{
  "phones": ["628123456789", "628987654321"],
  "message": "Pesan broadcast massal",
  "delayMs": 5000
}
```

**Keterangan:**
- `phones`: Array nomor telepon tujuan.
- `delayMs`: Jeda antar pengiriman dalam milidetik (minimal 5000ms / 5 detik).

---

## Status Update
Membuat status (story) WhatsApp melalui API.

**Endpoint:** `POST /status/:sessionId`

**Body (JSON):**
```json
{
  "text": "Update status dari API!",
  "mediaUrl": "https://example.com/story.jpg"
}
```

---

## Webhook (Events)

HonoWA akan mengirimkan data (POST JSON) ke URL Webhook yang Anda konfigurasi di Dashboard per-session. Format yang digunakan adalah **GOWA-style**.

### Payload Structure

```json
{
  "device_id": "6285155030300@c.us",
  "event": "message",
  "payload": {
    "id": "3BCB9C0058E0859C4ADD",
    "from": "62819641172@c.us",
    "from_name": "CaptArdian",
    "chat_id": "62819641172@c.us",
    "body": "Halo, apa kabar?",
    "timestamp": 1715345000
  }
}
```

### Event Types:
- `message`: Ketika ada pesan masuk (termasuk deteksi LID ke JID otomatis).
- `session.ready`: Ketika koneksi WhatsApp berhasil terhubung.
- `session.qr`: Ketika muncul QR Code baru (jika terputus).
- `session.disconnected`: Ketika session logout atau terputus.

---

## Error Handling

HonoWA menggunakan HTTP Status Code standar untuk indikasi error.

- `401 Unauthorized`: API Key salah atau tidak disertakan.
- `403 Forbidden`: Session bukan milik Anda.
- `404 Not Found`: Session tidak ditemukan.
- `400 Bad Request`: Parameter kurang atau format salah.
- `500 Internal Server Error`: Masalah pada server atau WhatsApp.

**Contoh Response Error:**
```json
{
  "error": "Sesi belum siap. Status: initializing"
}
```
