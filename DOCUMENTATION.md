# HonoWA — Dokumentasi Lengkap

Selamat datang di dokumentasi resmi HonoWA! Panduan ini akan membantu Anda memahami cara menginstal, mengkonfigurasi, dan menggunakan seluruh fitur HonoWA secara maksimal.

---

## 📋 Daftar Isi
1. [Pengenalan HonoWA](#pengenalan-honowa)
2. [Instalasi & Persiapan](#instalasi--persiapan)
3. [Manajemen Sesi WhatsApp](#manajemen-sesi-whatsapp)
4. [Pengaturan Webhook](#pengaturan-webhook)
5. [Konfigurasi AI (ChatGPT, Claude, Gemini)](#konfigurasi-ai)
6. [Penyimpanan Media (Cloudflare R2)](#penyimpanan-media-cloudflare-r2)
7. [Keamanan & API Key](#keamanan--api-key)
8. [Troubleshooting Umum](#troubleshooting-umum)

---

## 1. Pengenalan HonoWA

**HonoWA** adalah ekosistem manajemen API WhatsApp berbasis **Hono.js** yang dirancang untuk performa tinggi dan multi-device. Berbeda dengan API wrapper biasa, HonoWA dilengkapi dengan:
- **Admin Dashboard** modern untuk mengelola device dan melihat riwayat pesan.
- **AI Chat Room** terintegrasi dengan berbagai model LLM.
- **Webhook GOWA-style** yang siap dihubungkan ke platform automasi seperti n8n, Make, atau Zapier.
- **Cloudflare R2 Support** untuk penyimpanan media yang dikirim/diterima via WhatsApp.

Untuk dokumentasi API teknis (endpoint REST API), silakan merujuk ke file **[API.md](API.md)**.

---

## 2. Instalasi & Persiapan

HonoWA sangat direkomendasikan untuk di-deploy menggunakan Docker. 

### A. Easy Install (Docker)
Cukup jalankan satu perintah ini di terminal server VPS/Linux Anda:
```bash
curl -sSL https://raw.githubusercontent.com/ardianryan/hono-wa-web-multidevice/main/setup.sh | bash
```
Script di atas akan secara otomatis mengatur direktori, membuat file `.env` default, menarik image Docker terbaru, dan menjalankan HonoWA di Port `4000`.

### B. Manual Docker Compose
Jika Anda lebih suka mengatur semuanya sendiri:
1. Buat folder `honowa` dan masuk ke dalamnya.
2. Buat file `docker-compose.yml` (salin dari repository ini).
3. Buat file `.env` dan isi variabel yang diperlukan.
4. Jalankan:
   ```bash
   docker compose pull
   docker compose up -d
   ```

Setelah berjalan, buka `http://<IP_SERVER>:4000/login` (Default username: `admin`, password: `admin123`).

---

## 3. Manajemen Sesi WhatsApp

HonoWA mendukung **Multi-Device / Multi-Session**. Artinya Anda bisa menghubungkan lebih dari satu nomor WhatsApp sekaligus di dalam satu sistem.

1. Login ke Dashboard, buka menu **Sessions**.
2. Masukkan ID Sesi (contoh: `device-marketing`).
3. Setelah sesi dibuat, klik tombol **Scan QR**.
4. Buka aplikasi WhatsApp di HP Anda > Perangkat Tertaut > Tautkan Perangkat.
5. Scan QR Code yang muncul di layar.
6. Tunggu hingga status berubah menjadi **Ready**.

*(Catatan: Anda juga dapat menggunakan opsi **Pair with Phone** jika tersedia di menu).*

---

## 4. Pengaturan Webhook

Webhook digunakan untuk mengirimkan data (seperti pesan masuk) dari HonoWA ke aplikasi lain secara real-time.

1. Buka menu **Sessions**.
2. Klik tombol **Webhook** pada sesi yang diinginkan.
3. Masukkan URL webhook (contoh: URL dari webhook n8n). Anda bisa memasukkan lebih dari 1 URL dengan memisahkannya menggunakan koma.

### Integrasi n8n (Tanpa Kode)
Untuk pengguna n8n, Anda tidak perlu repot mengatur webhook secara manual. Anda bisa menggunakan node komunitas resmi:
1. Di n8n, cari dan instal node: `n8n-nodes-honowa`.
2. Gunakan node **HonoWA** untuk mengirim pesan, mengelola grup, atau mendengarkan pesan masuk secara otomatis.
3. Dokumentasi node bisa dilihat di: [npmjs.com/package/n8n-nodes-honowa](https://www.npmjs.com/package/n8n-nodes-honowa)

---

## 5. Konfigurasi AI

HonoWA memiliki fitur AI terintegrasi di Dashboard yang mendukung **Thinking Process / Reasoning**.

1. Buka menu **Settings** > **AI Provider**.
2. Masukkan API Key dari provider pilihan Anda:
   - **Google Gemini** (Gemini 1.5 Pro/Flash)
   - **OpenAI** (GPT-4o, GPT-3.5)
   - **Anthropic** (Claude 3 Opus/Sonnet)
3. Anda juga dapat menggunakan provider custom/OpenRouter dengan mengatur `OPENAI_BASE_URL` di file `.env`.

---

## 6. Penyimpanan Media (Cloudflare R2)

Secara default, jika ada pesan WhatsApp masuk berisi gambar/video, file tersebut tidak bisa langsung dikirim via Webhook karena keterbatasan ukuran. HonoWA mendukung auto-upload ke Cloudflare R2 (S3 compatible storage).

Tambahkan variabel berikut di file `.env` Anda:
```env
R2_ACCESS_KEY_ID="your-access-key"
R2_SECRET_ACCESS_KEY="your-secret-key"
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
R2_BUCKET_NAME="nama-bucket-anda"
R2_PUBLIC_URL="https://pub-xxxx.r2.dev"
```

Jika terkonfigurasi, webhook `message` akan otomatis memiliki parameter `url` di dalam objek media-nya.

---

## 7. Keamanan & API Key

Untuk mengirim pesan dari luar (melalui API), Anda membutuhkan **API Key**.
1. Buka menu **API Docs** di Dashboard.
2. Anda akan melihat API Key aktif milik Anda.
3. Jangan bagikan API Key ini kepada siapa pun. Jika bocor, klik tombol **Rotate API Key** untuk membuat kunci baru (kunci lama akan hangus seketika).

---

## 8. Troubleshooting Umum

**Q: Session Error "Browser Profile in use" / Error Code 21**
A: Terjadi karena container restart mendadak dan meninggalkan file kunci. HonoWA versi Docker terbaru sudah memiliki auto-cleanup. Jika masih terjadi:
```bash
sudo rm -rf .wwebjs_auth/*/SingletonLock
```

**Q: Database Error "Relation does not exist"**
A: Migration database belum berjalan. Jalankan manual di server:
```bash
docker exec -it wa-api-service-honojs npm run db:push
```

**Q: Tidak bisa login (Cookie terblokir)**
A: Jika Anda mengakses HonoWA tanpa HTTPS (hanya HTTP / localhost / IP), pastikan variabel environment `COOKIE_SECURE=false` ada di file `.env` Anda.

---
*Dokumentasi ini dikelola secara aktif seiring dengan pengembangan HonoWA.*
