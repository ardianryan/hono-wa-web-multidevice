<div align="center">
  <img src="public/assets/uploads/honowa.png" alt="HonoWA" width="180" />
  <h1>HonoWA — Advanced WhatsApp Management & AI Chat</h1>
  <p>REST API dan Admin Dashboard modern untuk mengelola multi-sesi WhatsApp dengan integrasi AI Reasoning.</p>

  [![License: CC BY-NC-ND 4.0](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-nd/4.0/)
  ![Node version](https://img.shields.io/badge/node-%3E%3D%2018.x-brightgreen.svg)
  ![Hono version](https://img.shields.io/badge/hono-v4.x-orange.svg)
</div>

---

## 🚀 Sekilas Tentang HonoWA

**HonoWA** adalah solusi API WhatsApp (unofficial) berbasis **Hono.js** yang dirancang untuk performa tinggi dan kemudahan integrasi. Mendukung multi-device, multi-session, dan kini dilengkapi dengan fitur **AI Chat Room** yang mendukung *Reasoning/Thinking Process*.

### 🛠️ Tech Stack Utama

| Komponen | Teknologi |
| :--- | :--- |
| **Backend** | Hono.js (Node.js runtime) |
| **Database** | PostgreSQL + Drizzle ORM |
| **WhatsApp Library** | whatsapp-web.js (Unofficial) |
| **Frontend UI** | React + Tailwind CSS + Vite (ESBuild) |
| **AI Integration** | TanStack AI (Gemini, OpenAI, Anthropic) |
| **Testing** | Jest + ts-jest (Industry Standard) |

---

## ✨ Fitur Unggulan

### 📱 WhatsApp Management
- **Multi-Session Management**: Kelola banyak akun WhatsApp dalam satu dashboard.
- **Interactive Scan QR**: Hubungkan perangkat langsung dari UI Admin.
- **Webhook System**: Default webhook per aplikasi atau kustom per session.
- **Message Handling**: Kirim Teks, Gambar, Video, Audio, dan Dokumen (via URL atau Upload).
- **Broadcast Engine**: Pengiriman massal dengan antrean dan delay dinamis (Proteksi Banned).
- **History Control**: Resend, Unsend (dalam batas 48 jam), dan Delete log.

### 🤖 AI Chat Room (Industrial Grade)
- **Multi-Model Support**: Integrasi dengan Google Gemini (Gemma), OpenAI (GPT-4), dan Anthropic (Claude).
- **Reasoning Process**: Pemisahan logis antara *Thinking Process* AI dengan konten pesan utama untuk tampilan yang profesional.
- **Image Generation**: Integrasi Imagen 4.0 untuk pembuatan gambar via chat.
- **History Management**: Hapus riwayat chat permanen per user.
- **Mobile Responsive**: Antarmuka chat yang adaptif untuk desktop maupun perangkat mobile.

### 🛡️ Keamanan & Monitoring
- **API Key Authentication**: Akses API aman dengan kunci per-user.
- **Role Based Access**: Pemisahan hak akses antara Admin dan User biasa.
- **Maintenance Mode**: Matikan akses user saat sistem sedang diperbarui.
- **Action Logs**: Pencatatan setiap aktivitas pengiriman pesan untuk audit.

---

## 📦 Instalasi & Setup

### 📋 Prasyarat
- Node.js versi 18.x atau lebih tinggi.
- PostgreSQL (Lokal atau Cloud).
- Chrome/Chromium (Untuk instance WhatsApp).

### 🛠️ Langkah Instalasi

1. **Clone & Install Dependensi**
   ```bash
   git clone https://github.com/elianhardyy/hono-wa-web-multidevice.git
   cd hono-wa
   npm install
   ```

2. **Konfigurasi Environment**
   Salin `.env.example` menjadi `.env` dan lengkapi datanya:
   ```env
   DATABASE_URL=postgresql://user:pass@localhost:5432/hono_wa
   GEMINI_API_KEY=your_key
   OPENAI_API_KEY=your_key
   ANTHROPIC_API_KEY=your_key
   ```

3. **Inisialisasi Database**
   ```bash
   npm run db:push
   ```

4. **Menjalankan Aplikasi**
   ```bash
   # Mode Development
   npm run dev

   # Build & Start Production
   npm run build
   npm start
   ```

Buka `http://localhost:3000/login` untuk masuk ke Dashboard.

---

## 🧪 Testing & Quality Assurance

HonoWA menerapkan standar industri dalam pengujian kode untuk memastikan stabilitas sistem.

| Metric | Target | Status Saat Ini |
| :--- | :--- | :--- |
| **Total Unit Tests** | - | **93 Tests PASS** |
| **Backend Coverage** | ≥ 80% | 🟢 High (Critical Services) |
| **Threshold Enforcement** | Aktif | 🛡️ Proteksi degradasi kode |

**Menjalankan Test:**
```bash
# Run all tests
npm test

# Run with coverage report
npm test -- --coverage
```

---

## 🐳 Docker Support

### Quick Start (Docker Run)
```bash
docker run -d \
  --name honowa-api \
  -p 3000:3000 \
  -e PGHOST=host.docker.internal \
  -e PGPORT=5432 \
  -e PGDATABASE=hono_wa \
  -e PGUSER=username \
  -e PGPASSWORD=your_password \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/.wwebjs_auth:/app/.wwebjs_auth \
  -v $(pwd)/.wwebjs_cache:/app/.wwebjs_cache \
  username/hono-wa-web-multidevice:v2
```

### Volume yang Digunakan
- `/app/data`: Menyimpan `session.json` (metadata sesi).
- `/app/.wwebjs_auth`: Menyimpan autentikasi WhatsApp (Penting: agar tidak perlu scan ulang).
- `/app/.wwebjs_cache`: Cache browser internal.

---

## 📖 Dokumentasi API

Base URL: `http://localhost:3000`
Auth Header: `X-API-Key: <KEY>` atau `Authorization: Bearer <KEY>`

| Method | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| `GET` | `/sessions` | List semua sesi milik user. |
| `POST` | `/send/:sessionId` | Kirim pesan teks/media ke nomor tertentu. |
| `POST` | `/broadcast/:sessionId` | Kirim pesan ke banyak nomor sekaligus. |
| `POST` | `/status/:sessionId` | Perbarui status WhatsApp (Teks/Media). |
| `DELETE` | `/session/:sessionId` | Logout dan hapus sesi dari sistem. |

**Contoh Request (cURL):**
```bash
curl -X POST "http://localhost:3000/send/sesi1" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <API_KEY_ANDA>" \
  -d '{"phone":"081234567890","message":"Halo! Ini pesan otomatis."}'
```

---

## ⚠️ Catatan Penting
- **Format Nomor**: Gunakan format internasional tanpa tanda `+` (contoh: `628123456789`). Sistem akan otomatis mengonversi awalan `0` ke `62`.
- **Limit Media**: Default 10MB, dapat diatur melalui menu Pengaturan di Dashboard.
- **Proteksi Banned**: Selalu gunakan `delayMs` minimal 5000ms saat melakukan broadcast untuk menjaga keamanan akun Anda.

---

## 📜 Lisensi

Project ini menggunakan lisensi **CC BY-NC-ND 4.0**:
- **Attribution**: Wajib mencantumkan kredit/attribution.
- **Non-Commercial**: Tidak boleh diperjualbelikan.
- **No-Derivatives**: Tidak boleh dimodifikasi lalu dibagikan ulang tanpa izin.

---

## ❤️ Dukung Pengembangan HonoWA

Jika project ini membantu Anda, pertimbangkan untuk memberikan dukungan agar pengembangan fitur HonoWA Multi-Device tetap berjalan lancar.

### **Buy Me a Coffee** ☕
Dukungan Anda sangat berarti untuk biaya riset API dan maintenance server pengujian.

**Donate via QRIS (E-Wallet: Dana, OVO, GoPay / All Bank):**
Silakan klik link di bawah ini untuk melakukan donasi secara aman melalui QRIS atau transfer bank:

👉 **[KLIK DI SINI UNTUK DONASI (DONATE.PPTI.ME)](https://donate.ppti.me/)**

---
<div align="center">
  Terinspirasi oleh GOWA & Dikembangkan dengan ❤️ oleh <br/>
  [Elian Hardiawan](https://github.com/elianhardyy/) & [Ryan Ardian](https://github.com/ardianryan/)
</div>
