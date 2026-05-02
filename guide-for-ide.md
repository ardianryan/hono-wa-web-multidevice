# Guide for IDE / AI (HonoWA)

Dokumen ini berisi panduan singkat untuk melanjutkan pengembangan HonoWA memakai IDE (VS Code/Trae/Antigravity) dan/atau AI assistant.

## Cara Menjalankan

```bash
npm install
npm run dev
```

- UI: `http://localhost:3000/login`
- Admin: `http://localhost:3000/admin`

## Struktur Penting

- Backend (Hono + Node):
  - `src/server.ts` — entrypoint server (mount frontend+backend, serve static)
  - `src/backend/routes.tsx` — routing utama (auth, admin pages, actions, QR modal API)
  - `src/backend/auth.ts` — auth, user CRUD, settings helpers (Postgres via Drizzle) + action logs
  - `src/backend/db.ts` — koneksi PG + Drizzle instance + schema bootstrap (`ensureSchema`)
  - `src/backend/schema.ts` — definisi schema Drizzle (users, auth_sessions, wa_sessions, app_settings, action_logs)
  - `drizzle.config.ts` — konfigurasi drizzle-kit (schema path + koneksi DB)
  - `src/backend/session-manager.ts` — runtime WA sessions (Map), QR/ready status, broadcast queue
  - `src/backend/service/` — Service Layer (Pusat Logika Bisnis):
    - `ai.service.ts` — Logika AI (Gemma/Imagen), adapter, dan history DB.
    - `message.service.ts` — Logika pengiriman pesan, unsend window, dan CSV export.
    - `media.service.ts` — Penanganan media (URL fetcher, file upload, mime-type).
    - `ui.service.ts` — Helper untuk UI (Gravatar, App Settings).
    - `session.service.ts` — Manajemen database session.
  - `src/backend/webhook.ts` — pengiriman webhook (resolve URL per-session dari DB, fallback `WEBHOOK_URL`)
- Frontend (Hono/JSX):
  - `src/frontend/pages/auth/login.tsx` — halaman login (meta + favicon)
  - `src/frontend/pages/admin/ui.tsx` — layout admin + CSS + navbar dropdown account
  - `src/frontend/pages/admin/pages.tsx` — semua halaman admin (settings/profile/sessions/actions)
  - `src/frontend/client/csr.tsx` — CSR entry (dibundle ke `public/assets/csr.js`)
- Static & uploads:
  - `public/assets/*` — file static
  - `public/assets/uploads/*` — hasil upload (logo app / foto profil)

## Konvensi Implementasi

- UI dibangun dengan Hono/JSX (tanpa React runtime).
- CSS mayoritas inline di layout (`AdminLayout`, `LoginPage`) agar self-contained.
- Hindari menambah file baru kecuali benar-benar dibutuhkan.
- Jangan menambahkan komentar di code kecuali diminta.

- AI Chat Room (Advanced):
  - Mendukung `reasoning` (Thinking Process) yang disimpan di kolom terpisah.
  - Multi-model: Gemini (Gemma), GPT, Claude, Imagen 4.0.
  - UI Responsif: Header adaptif untuk mobile & desktop.
- Testing Suite:
  - 93+ unit tests (Jest) dengan coverage threshold di `jest.config.js`.

## Pola Pengembangan (Disarankan)

### 1) Menambah halaman Admin baru

1. Tambah page component di `src/frontend/pages/admin/pages.tsx`.
2. Pastikan page memakai `<AdminLayout ... active="...">`.
3. Tambah route di `src/backend/routes.tsx` (GET untuk render, POST untuk submit).
4. Update `AdminNavKey` dan sidebar nav di `src/frontend/pages/admin/ui.tsx` bila perlu.

### 2) Menambah setting baru (app_settings)

1. Tambah default setting di `ensureDefaultSettings()` (`src/backend/db.ts`).
2. Buat getter/setter di `src/backend/auth.ts` (pakai `getSetting`/`setSetting`).
3. Render & submit form di `SettingsPage` (`src/frontend/pages/admin/pages.tsx`).
4. Update route `/admin/settings` di `src/backend/routes.tsx` untuk persist.

Contoh setting yang sudah ada:

- `media_max_mb` (batas ukuran media untuk upload & download via URL)

### 3) Perubahan schema users

- Schema dikelola via `ensureSchema()` (`src/backend/db.ts`).
- Untuk perubahan incremental, gunakan `alter table ... add column if not exists ...;`
- Saat menambah field baru, jangan lupa:
  - update type `User` dan mapping `toUser()` di `src/backend/auth.ts`
  - update query SELECT yang sebelumnya tidak mengambil kolom baru

### 4) Webhook per device/session

- Webhook default tetap bisa dikonfigurasi dari env: `WEBHOOK_URL` (+ opsional `WEBHOOK_SECRET`).
- Setiap session/device bisa punya webhook sendiri di DB: kolom `wa_sessions.webhook_url` (ditambahkan via `ensureSchema()` dengan `alter table ... add column if not exists ...`).
- UI pengaturan webhook ada di `GET /admin/sessions` (tombol **Webhook** per session).
- Persist webhook via endpoint `POST /admin/sessions/webhook` (validasi session milik user, validasi URL http/https, simpan ke DB).

### 5) AI Chat Room & Reasoning Logic

- Database: Tabel `ai_chats` memiliki kolom `reasoning` (TEXT, nullable).
- Pola Simpan: Gunakan `saveAiChatMessage` di `ai.service.ts`. Simpan proses berpikir AI ke kolom `reasoning`.
- UI: Komponen `AiChatRoom` mem-parsing data `reasoning` untuk ditampilkan dalam blok terpisah (Thinking Process).
- Model: `gemma-4-31b-it` (Teks), `imagen-4.0-fast-generate-001` (Gambar).

### 6) Testing Suite (Industrial Standard)

- Semua logika bisnis WAJIB ditest di `src/backend/test/`.
- Perintah: `npm test` (run) atau `npm test -- --coverage` (report).
- File test utama: `ai.service.test.ts`, `message.service.test.ts`, `media.service.test.ts`, `auth.test.ts`.

### 7) Drizzle ORM (Database)
  - Fallback: `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD`

Catatan Docker:

- Image runtime biasanya install dependency dengan `--omit=dev`, jadi `drizzle-kit` tidak tersedia di container.
- Jalankan `npm run db:push` dari mesin host/CI, atau build image khusus yang menyertakan `drizzle-kit` jika ingin menjalankannya di container.

## Upload File (Logo / Foto Profil)

- Parsing form memakai `c.req.parseBody()` di Hono (menerima file).
- Upload disimpan ke `public/assets/uploads`.
- URL yang disimpan ke DB berbentuk `/assets/uploads/<filename>`.
- Static route: `src/server.ts` sudah serve `public` di path `/assets/*`.

Catatan media Message/Broadcast:

- Jika media memakai URL, server akan fetch file lalu mengirim ke WhatsApp.
- Jika media upload dari UI/API, file dibaca ke memory (dibatasi `media_max_mb`) lalu dikirim ke WhatsApp.

## Account / Avatar (Gravatar + Upload)

- Avatar diprioritaskan dari `users.profile_photo_url`.
- Jika kosong, fallback ke Gravatar berdasarkan email (atau username jika email kosong).

## Troubleshooting Cepat

- DB error: pastikan `.env` benar (`PGHOST/PGDATABASE/PGUSER/PGPASSWORD`) dan Postgres running.
- Port bentrok: cek proses lain di 3000.
- QR tidak muncul: cek status session di halaman Sessions dan cek log server.
- Upload tidak muncul: pastikan file ada di `public/assets/uploads` dan URL diawali `/assets/uploads/`.
- Unsend tidak aktif: cek `sentMessageIds` pada history (log lama tidak punya) atau sudah lewat window waktu WhatsApp.
