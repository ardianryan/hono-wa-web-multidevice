import { createRequire } from "module";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import {
  webhookMessageReceived,
  webhookSessionReady,
  webhookSessionQR,
  webhookSessionDisconnected,
} from "./webhook.js";
import { config } from "dotenv";

const require = createRequire(import.meta.url);
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js") as {
  Client: typeof import("whatsapp-web.js").Client;
  LocalAuth: typeof import("whatsapp-web.js").LocalAuth;
  MessageMedia: typeof import("whatsapp-web.js").MessageMedia;
};

config({ path: path.resolve(".env") });

const app = new Hono();

// ─── KONSTANTA STATUS SESI ────────────────────────────────────────────────────
const SESSION_STATUS = {
  INITIALIZING: "initializing",
  PENDING_PAIRING: "pending_pairing",
  READY: "ready",
  DISCONNECTED: "disconnected",
};

// ─── TIPE SESI ────────────────────────────────────────────────────────────────
type SessionData = {
  client: InstanceType<typeof import("whatsapp-web.js").Client>;
  status: string;
  readyAt: string;
  qr?: string;
};

// ─── TIPE DATA PERSISTENSI ────────────────────────────────────────────────────
type SessionRecord = {
  sessionId: string;
  status: string;
  readyAt: string;
};

// ─── PATH FILE PERSISTENSI ────────────────────────────────────────────────────
const DATA_DIR = path.resolve("data");
const SESSION_FILE = path.join(DATA_DIR, "session.json");

// ─── HELPER: Baca data/session.json ──────────────────────────────────────────
const readSessionFile = (): Record<string, SessionRecord> => {
  try {
    if (!fs.existsSync(SESSION_FILE)) return {};
    const raw = fs.readFileSync(SESSION_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, SessionRecord>;
  } catch {
    console.warn("[session.json] Gagal membaca, menggunakan data kosong.");
    return {};
  }
};

// ─── HELPER: Tulis data/session.json ─────────────────────────────────────────
const writeSessionFile = (data: Record<string, SessionRecord>) => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[session.json] Gagal menulis:", err);
  }
};

// ─── HELPER: Simpan satu sesi ke file ────────────────────────────────────────
const persistSession = (sessionId: string, data: SessionData) => {
  const all = readSessionFile();
  all[sessionId] = { sessionId, status: data.status, readyAt: data.readyAt };
  writeSessionFile(all);
};

// ─── HELPER: Hapus satu sesi dari file ───────────────────────────────────────
const removeSessionFromFile = (sessionId: string) => {
  const all = readSessionFile();
  delete all[sessionId];
  writeSessionFile(all);
};

// ─── PENYIMPANAN SESI (runtime) ───────────────────────────────────────────────
const sessions = new Map<string, SessionData>();

// ─── HELPER: Format Nomor HP ──────────────────────────────────────────────────
const formatPhone = (phone: string) => {
  let num = phone.replace(/\D/g, "");
  if (num.startsWith("0")) num = "62" + num.substring(1);
  return num;
};

// ─── CORE: Buat atau Ambil Sesi ───────────────────────────────────────────────
const getOrCreateSession = (sessionId: string): SessionData => {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionId }),
    puppeteer: {
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-dev-shm-usage",
        "--no-zygote",
      ],
      headless: true,
    },
  });

  const sessionData: SessionData = {
    client,
    status: SESSION_STATUS.INITIALIZING,
    readyAt: new Date().toISOString(),
  };
  sessions.set(sessionId, sessionData);
  persistSession(sessionId, sessionData);

  // ── Event: QR ──────────────────────────────────────────────────────────────
  client.on("qr", (qr: string) => {
    sessionData.status = SESSION_STATUS.PENDING_PAIRING;
    sessionData.qr = qr;
    persistSession(sessionId, sessionData);
    console.log(`[${sessionId}] QR/Pairing code diminta`);
    qrcode.generate(qr, { small: true });

    // 🔔 Kirim webhook event QR
    webhookSessionQR(sessionId, qr);
  });

  // ── Event: Ready ───────────────────────────────────────────────────────────
  client.on("ready", () => {
    sessionData.status = SESSION_STATUS.READY;
    sessionData.readyAt = new Date().toISOString();
    sessionData.qr = undefined;
    persistSession(sessionId, sessionData);
    console.log(`[${sessionId}] SIAP digunakan`);

    // 🔔 Kirim webhook event session ready
    webhookSessionReady(sessionId);
  });

  // ── Event: Message ─────────────────────────────────────────────────────────
  client.on("message", async (msg: any) => {
    const isGroup = msg.from.endsWith("@g.us");

    // 🔔 Kirim webhook event pesan masuk
    webhookMessageReceived(sessionId, {
      messageId: msg.id._serialized,
      from: msg.from,
      to: msg.to,
      body: msg.body,
      type: msg.type,
      isGroup,
      groupId: isGroup ? msg.from : undefined,
      timestamp: msg.timestamp,
    });
  });

  // ── Event: Disconnected ────────────────────────────────────────────────────
  client.on("disconnected", (reason: string) => {
    sessionData.status = SESSION_STATUS.DISCONNECTED;
    persistSession(sessionId, sessionData);
    console.log(`[${sessionId}] Terputus: ${reason}`);

    // 🔔 Kirim webhook event disconnected
    webhookSessionDisconnected(sessionId, reason);

    setTimeout(() => {
      if (sessions.get(sessionId)?.status === SESSION_STATUS.DISCONNECTED) {
        sessions.delete(sessionId);
        removeSessionFromFile(sessionId);
        console.log(`[${sessionId}] Dihapus dari memori`);
      }
    }, 30000);
  });

  client.on("auth_failure", (msg: string) => {
    console.error(`[${sessionId}] Auth gagal:`, msg);
    sessions.delete(sessionId);
    removeSessionFromFile(sessionId);
  });

  client.initialize().catch((err: Error) => {
    console.error(`[${sessionId}] Gagal inisialisasi:`, err);
    sessionData.status = SESSION_STATUS.DISCONNECTED;
    persistSession(sessionId, sessionData);
  });

  return sessionData;
};

// ─── STARTUP: Restore sesi dari file ─────────────────────────────────────────
const restoreSessionsFromFile = () => {
  const saved = readSessionFile();
  const ids = Object.keys(saved);
  if (ids.length === 0) return;

  console.log(
    `[startup] Memulihkan ${ids.length} sesi dari data/session.json...`,
  );
  for (const sessionId of ids) {
    const record = saved[sessionId];
    if (record.status === SESSION_STATUS.READY) {
      console.log(`[startup] Memulihkan sesi: ${sessionId}`);
      getOrCreateSession(sessionId);
    } else {
      console.log(
        `[startup] Sesi '${sessionId}' diabaikan (status: ${record.status})`,
      );
    }
  }
};

// ─── HELPER: HTML Template ────────────────────────────────────────────────────
const htmlPage = (body: string) => `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #ece5dd;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh;
    }
    .card {
      background: white; border-radius: 1.5rem;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      padding: 2.5rem 3rem; text-align: center;
      max-width: 440px; width: 90%;
    }
    .icon { font-size: 3rem; margin-bottom: 0.5rem; }
    h1 { font-size: 1.4rem; color: #111b21; margin-bottom: 0.5rem; }
    p { color: #667781; font-size: 0.9rem; line-height: 1.6; margin-top: 0.5rem; }
    .badge {
      display: inline-block; background: #25d366; color: white;
      font-size: 0.75rem; padding: 3px 12px; border-radius: 999px;
      margin-bottom: 1.5rem; font-weight: 600;
    }
    .qr-wrapper {
      border: 3px solid #25d366; border-radius: 1rem;
      padding: 1rem; display: inline-block; margin-bottom: 1.5rem;
    }
    .qr-wrapper img { display: block; width: 260px; height: 260px; }
    .steps {
      text-align: left; font-size: 0.85rem; color: #555;
      line-height: 1.9; padding-left: 1.2rem;
    }
    .note { margin-top: 1rem; font-size: 0.75rem; color: #aaa; }
    .btn {
      display: inline-block; margin-top: 1.5rem; padding: 0.6rem 1.8rem;
      background: #25d366; color: white; border-radius: 999px;
      text-decoration: none; font-size: 0.9rem; font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: Tampilkan QR Code sebagai halaman HTML
// GET /session/qr/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
app.get("/session/qr/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const sessionData = getOrCreateSession(sessionId);

  if (sessionData.status === SESSION_STATUS.READY) {
    return c.html(
      htmlPage(`
        <div class="icon">✅</div>
        <h1>Sesi Sudah Aktif</h1>
        <span class="badge">Sesi: ${sessionId}</span>
        <p>WhatsApp sudah terhubung dan siap digunakan.</p>
        <p>Tidak perlu scan QR lagi.</p>
      `),
    );
  }

  let qrData = sessionData.qr ?? null;

  if (!qrData) {
    qrData = await new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 35000);
      sessionData.client.once("qr", (qr: string) => {
        clearTimeout(timeout);
        resolve(qr);
      });
      sessionData.client.once("ready", () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
  }

  if (!qrData && sessionData.status === SESSION_STATUS.READY) {
    return c.html(
      htmlPage(`
        <div class="icon">✅</div>
        <h1>Sesi Berhasil Terhubung!</h1>
        <span class="badge">Sesi: ${sessionId}</span>
        <p>WhatsApp berhasil terhubung. Sesi siap digunakan.</p>
      `),
    );
  }

  if (!qrData) {
    return c.html(
      htmlPage(`
        <div class="icon">⏱️</div>
        <h1>QR Belum Siap</h1>
        <span class="badge">Sesi: ${sessionId}</span>
        <p>WhatsApp belum mengirimkan QR code. Mungkin sedang dalam proses inisialisasi.</p>
        <a class="btn" href="/session/qr/${sessionId}">🔄 Coba Lagi</a>
      `),
      408,
    );
  }

  const qrImageUrl = await QRCode.toDataURL(qrData, {
    width: 300,
    margin: 2,
    color: { dark: "#111b21", light: "#ffffff" },
  });

  return c.html(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Scan QR – ${sessionId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #ece5dd;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh;
    }
    .card {
      background: white; border-radius: 1.5rem;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      padding: 2.5rem 3rem; text-align: center;
      max-width: 440px; width: 90%;
    }
    .logo { font-size: 2.5rem; margin-bottom: 0.5rem; }
    h1 { font-size: 1.4rem; color: #111b21; margin-bottom: 0.3rem; }
    .badge {
      display: inline-block; background: #25d366; color: white;
      font-size: 0.75rem; padding: 3px 12px; border-radius: 999px;
      margin-bottom: 1.5rem; font-weight: 600;
    }
    .qr-wrapper {
      border: 3px solid #25d366; border-radius: 1rem;
      padding: 1rem; display: inline-block; margin-bottom: 1.5rem;
    }
    .qr-wrapper img { display: block; width: 260px; height: 260px; }
    .steps {
      text-align: left; font-size: 0.85rem; color: #555;
      line-height: 1.9; padding-left: 1.2rem; margin-bottom: 0.5rem;
    }
    .note { font-size: 0.75rem; color: #aaa; margin-top: 1rem; }
    .timer { font-size: 0.85rem; color: #e53e3e; margin-top: 0.5rem; font-weight: 600; }
    .btn {
      display: inline-block; margin-top: 1rem; padding: 0.5rem 1.5rem;
      background: #25d366; color: white; border-radius: 999px;
      text-decoration: none; font-size: 0.85rem; font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">📱</div>
    <h1>Hubungkan WhatsApp</h1>
    <div class="badge">Sesi: ${sessionId}</div>
    <div class="qr-wrapper">
      <img src="${qrImageUrl}" alt="QR Code WhatsApp" />
    </div>
    <ol class="steps">
      <li>Buka WhatsApp di ponsel Anda</li>
      <li>Ketuk <strong>⋮ Menu</strong> → <strong>Perangkat Tertaut</strong></li>
      <li>Ketuk <strong>Tautkan Perangkat</strong></li>
      <li>Arahkan kamera ke QR di atas</li>
    </ol>
    <p class="timer">⏳ QR kadaluarsa dalam <span id="countdown">60</span> detik</p>
    <a class="btn" href="/session/qr/${sessionId}">🔄 Refresh QR</a>
    <p class="note">Halaman akan otomatis refresh saat QR kadaluarsa</p>
  </div>
  <script>
    let seconds = 60;
    const el = document.getElementById('countdown');
    const timer = setInterval(() => {
      seconds--;
      el.textContent = seconds;
      if (seconds <= 0) { clearInterval(timer); window.location.reload(); }
    }, 1000);
    const pollStatus = setInterval(async () => {
      try {
        const res = await fetch('/session/status/${sessionId}');
        const data = await res.json();
        if (data.status === 'ready') {
          clearInterval(pollStatus);
          clearInterval(timer);
          document.querySelector('.card').innerHTML = \`
            <div style="font-size:3rem">✅</div>
            <h1 style="color:#16a34a;margin-top:0.5rem">Berhasil Terhubung!</h1>
            <p style="color:#555;margin-top:0.5rem">WhatsApp sesi <strong>${sessionId}</strong> sudah aktif.</p>
          \`;
        }
      } catch (_) {}
    }, 3000);
  </script>
</body>
</html>`);
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 1: Pairing Code
// POST /session/pair/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
app.post("/session/pair/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const body = await c.req.json();
    const phone = body.phone;

    if (!phone) return c.json({ error: 'Field "phone" wajib diisi' }, 400);

    const sessionData = getOrCreateSession(sessionId);
    const { client } = sessionData;
    const formattedPhone = formatPhone(phone);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const pairingCode = await client.requestPairingCode(formattedPhone);
    sessionData.status = SESSION_STATUS.PENDING_PAIRING;
    persistSession(sessionId, sessionData);

    return c.json({
      success: true,
      sessionId,
      pairingCode,
      message:
        "Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat, lalu masukkan kode ini.",
    });
  } catch (error: any) {
    console.error(error);
    return c.json(
      { error: "Gagal membuat pairing code", details: error.toString() },
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 2: Status Sesi
// GET /session/status/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
app.get("/session/status/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const sessionData = sessions.get(sessionId);

  if (!sessionData) {
    return c.json({ sessionId, status: "not_found", exists: false });
  }

  return c.json({
    sessionId,
    status: sessionData.status,
    exists: true,
    readyAt: sessionData.readyAt,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 3: List Semua Sesi
// GET /sessions
// ─────────────────────────────────────────────────────────────────────────────
app.get("/sessions", (c) => {
  const list = [];
  for (const [id, data] of sessions.entries()) {
    list.push({ sessionId: id, status: data.status, readyAt: data.readyAt });
  }
  return c.json({ total: list.length, sessions: list });
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 4: Kirim Pesan Teks
// POST /send/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
app.post("/send/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    let sessionData = sessions.get(sessionId);

    if (!sessionData) {
      sessionData = getOrCreateSession(sessionId);
      return c.json(
        {
          error: `Sesi '${sessionId}' sedang diinisialisasi ulang. Tunggu 10-15 detik.`,
        },
        400,
      );
    }

    if (sessionData.status !== SESSION_STATUS.READY) {
      return c.json(
        { error: `Sesi belum siap. Status: ${sessionData.status}` },
        400,
      );
    }

    const body = await c.req.json();
    const phone = body.phone;
    const message = body.message;

    if (!phone || !message) {
      return c.json({ error: 'Field "phone" dan "message" wajib diisi' }, 400);
    }

    const chatId = `${formatPhone(phone)}@c.us`;
    await sessionData.client.sendMessage(chatId, message);

    return c.json({
      success: true,
      message: `Pesan terkirim via sesi '${sessionId}'`,
    });
  } catch (error: any) {
    return c.json(
      { error: "Gagal mengirim pesan", details: error.toString() },
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 5: Kirim Pesan ke Grup
// POST /send-group/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
app.post("/send-group/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    let sessionData = sessions.get(sessionId);

    if (!sessionData) {
      sessionData = getOrCreateSession(sessionId);
      return c.json(
        {
          error: `Sesi '${sessionId}' sedang diinisialisasi ulang. Tunggu sebentar.`,
        },
        400,
      );
    }

    if (sessionData.status !== SESSION_STATUS.READY) {
      return c.json(
        { error: `Sesi belum siap. Status: ${sessionData.status}` },
        400,
      );
    }

    const body = await c.req.json();
    const groupId = body.groupId;
    const message = body.message;

    if (!groupId || !message) {
      return c.json(
        { error: 'Field "groupId" dan "message" wajib diisi' },
        400,
      );
    }

    await sessionData.client.sendMessage(groupId, message);
    return c.json({ success: true, message: "Pesan ke grup berhasil dikirim" });
  } catch (error: any) {
    return c.json(
      { error: "Gagal kirim ke grup", details: error.toString() },
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 6: Buat Status WA
// POST /status/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
app.post("/status/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    let sessionData = sessions.get(sessionId);

    if (!sessionData) {
      sessionData = getOrCreateSession(sessionId);
      return c.json(
        {
          error: `Sesi '${sessionId}' sedang diinisialisasi ulang. Tunggu sebentar.`,
        },
        400,
      );
    }

    if (sessionData.status !== SESSION_STATUS.READY) {
      return c.json(
        { error: `Sesi belum siap. Status: ${sessionData.status}` },
        400,
      );
    }

    const body = await c.req.json();
    const text = body.text;
    const mediaUrl = body.mediaUrl;

    if (mediaUrl) {
      const media = await MessageMedia.fromUrl(mediaUrl);
      await sessionData.client.sendMessage("status@broadcast", media, {
        caption: text || "",
      });
    } else {
      if (!text)
        return c.json(
          { error: 'Field "text" wajib diisi jika tanpa media' },
          400,
        );
      await sessionData.client.sendMessage("status@broadcast", text);
    }

    return c.json({
      success: true,
      message: `Status dibuat via sesi '${sessionId}'`,
    });
  } catch (error: any) {
    return c.json(
      { error: "Gagal buat status", details: error.toString() },
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 7: Logout & Hapus Sesi
// DELETE /session/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
app.delete("/session/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const sessionData = sessions.get(sessionId);

    if (!sessionData)
      return c.json(
        { error: `Sesi '${sessionId}' tidak ditemukan di memori` },
        404,
      );

    await sessionData.client.logout();
    await sessionData.client.destroy();
    sessions.delete(sessionId);
    removeSessionFromFile(sessionId);

    return c.json({
      success: true,
      message: `Sesi '${sessionId}' berhasil dihapus dan dilogout`,
    });
  } catch (error: any) {
    const sessionId = c.req.param("sessionId");
    sessions.delete(sessionId);
    removeSessionFromFile(sessionId);
    return c.json(
      {
        error:
          "Gagal logout dengan bersih, tetapi sesi telah dihapus dari memori",
        details: error.toString(),
      },
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 8: Broadcast Pesan ke Banyak Nomor
// POST /broadcast/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
app.post("/broadcast/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const sessionData = sessions.get(sessionId);

  if (!sessionData) {
    return c.json(
      {
        error: `Sesi '${sessionId}' tidak ditemukan. Silakan inisialisasi sesi terlebih dahulu.`,
      },
      404,
    );
  }

  if (sessionData.status !== SESSION_STATUS.READY) {
    return c.json(
      { error: `Sesi belum siap. Status saat ini: ${sessionData.status}` },
      400,
    );
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body request tidak valid (harus JSON)" }, 400);
  }

  const phones: string[] = body.phones;
  const message: string = body.message;
  const delayMs: number =
    typeof body.delayMs === "number" ? body.delayMs : 2000;

  if (!Array.isArray(phones) || phones.length === 0) {
    return c.json(
      { error: 'Field "phones" wajib berupa array dan tidak boleh kosong' },
      400,
    );
  }
  if (!message) {
    return c.json({ error: 'Field "message" wajib diisi' }, 400);
  }
  if (phones.length > 200) {
    return c.json({ error: "Maksimal 200 nomor per request broadcast" }, 400);
  }

  type BroadcastResult = {
    phone: string;
    status: "sent" | "failed";
    error?: string;
  };
  const results: BroadcastResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < phones.length; i++) {
    const raw = phones[i];
    const formatted = formatPhone(raw);
    const chatId = `${formatted}@c.us`;

    try {
      await sessionData.client.sendMessage(chatId, message);
      results.push({ phone: raw, status: "sent" });
      successCount++;
      console.log(
        `[${sessionId}] Broadcast [${i + 1}/${phones.length}] → ${formatted} ✓`,
      );
    } catch (err: any) {
      results.push({
        phone: raw,
        status: "failed",
        error: err?.message ?? String(err),
      });
      failCount++;
      console.warn(
        `[${sessionId}] Broadcast [${i + 1}/${phones.length}] → ${formatted} ✗ ${err?.message}`,
      );
    }

    if (i < phones.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return c.json({
    success: true,
    sessionId,
    summary: { total: phones.length, sent: successCount, failed: failCount },
    results,
  });
});

// ─── SERVER START ─────────────────────────────────────────────────────────────
restoreSessionsFromFile();

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  const webhookUrl = process.env.WEBHOOK_URL ?? "(tidak dikonfigurasi)";
  console.log(`
╔════════════════════════════════════════════╗
║   WhatsApp Multi-Session API               ║
║   http://localhost:${info.port}            ║
╠════════════════════════════════════════════╣
║  GET    /session/qr/:id     → QR HTML      ║
║  POST   /session/pair/:id   → Pairing      ║
║  GET    /session/status/:id → Cek status   ║
║  GET    /sessions           → List semua   ║
║  POST   /send/:id           → Kirim pesan  ║
║  POST   /send-group/:id     → Kirim grup   ║
║  POST   /status/:id         → Buat status  ║
║  DELETE /session/:id        → Logout       ║
║  POST   /broadcast/:id      → Broadcast    ║
╠════════════════════════════════════════════╣
║  🔔 WEBHOOK                                ║
║  URL: ${webhookUrl.padEnd(36)}║
╚════════════════════════════════════════════╝`);
});
