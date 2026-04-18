// ─────────────────────────────────────────────────────────────────────────────
// routes.ts — Semua endpoint HTTP (Hono router)
// ─────────────────────────────────────────────────────────────────────────────

import { createRequire } from "module";
import { Hono } from "hono";
import QRCode from "qrcode";
import { SESSION_STATUS, type BroadcastResult } from "./types.js";
import {
  sessions,
  getOrCreateSession,
  formatPhone,
} from "./session-manager.js";
import { removeSessionFromFile } from "./session-store.js";
import { htmlPage, htmlQRPage } from "./views.js";

const require = createRequire(import.meta.url);
const { MessageMedia } = require("whatsapp-web.js") as {
  MessageMedia: typeof import("whatsapp-web.js").MessageMedia;
};

export const router = new Hono();

// ─────────────────────────────────────────────────────────────────────────────
// GET /session/qr/:sessionId — Tampilkan halaman QR atau status sesi
// ─────────────────────────────────────────────────────────────────────────────
router.get("/session/qr/:sessionId", async (c) => {
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
      const timeout = setTimeout(() => resolve(null), 35_000);
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

  return c.html(htmlQRPage(sessionId, qrImageUrl));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /session/pair/:sessionId — Pairing Code
// ─────────────────────────────────────────────────────────────────────────────
router.post("/session/pair/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const body = await c.req.json();
    const phone = body.phone;

    if (!phone) return c.json({ error: 'Field "phone" wajib diisi' }, 400);

    const sessionData = getOrCreateSession(sessionId);
    const formattedPhone = formatPhone(phone);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const pairingCode =
      await sessionData.client.requestPairingCode(formattedPhone);
    sessionData.status = SESSION_STATUS.PENDING_PAIRING;

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
// GET /session/status/:sessionId — Cek status sesi
// ─────────────────────────────────────────────────────────────────────────────
router.get("/session/status/:sessionId", (c) => {
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
// GET /sessions — List semua sesi aktif
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions", (c) => {
  const list = Array.from(sessions.entries()).map(([id, data]) => ({
    sessionId: id,
    status: data.status,
    readyAt: data.readyAt,
  }));
  return c.json({ total: list.length, sessions: list });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /send/:sessionId — Kirim pesan teks ke nomor
// ─────────────────────────────────────────────────────────────────────────────
router.post("/send/:sessionId", async (c) => {
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
    const { phone, message } = body;

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
// POST /send-group/:sessionId — Kirim pesan ke grup
// ─────────────────────────────────────────────────────────────────────────────
router.post("/send-group/:sessionId", async (c) => {
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
    const { groupId, message } = body;

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
// POST /status/:sessionId — Buat status WhatsApp
// ─────────────────────────────────────────────────────────────────────────────
router.post("/status/:sessionId", async (c) => {
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
    const { text, mediaUrl } = body;

    if (mediaUrl) {
      const media = await MessageMedia.fromUrl(mediaUrl);
      await sessionData.client.sendMessage("status@broadcast", media, {
        caption: text || "",
      });
    } else {
      if (!text) {
        return c.json(
          { error: 'Field "text" wajib diisi jika tanpa media' },
          400,
        );
      }
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
// DELETE /session/:sessionId — Logout & hapus sesi
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/session/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");

  try {
    const sessionData = sessions.get(sessionId);

    if (!sessionData) {
      return c.json(
        { error: `Sesi '${sessionId}' tidak ditemukan di memori` },
        404,
      );
    }

    await sessionData.client.logout();
    await sessionData.client.destroy();
    sessions.delete(sessionId);
    removeSessionFromFile(sessionId);

    return c.json({
      success: true,
      message: `Sesi '${sessionId}' berhasil dihapus dan dilogout`,
    });
  } catch (error: any) {
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
// POST /broadcast/:sessionId — Broadcast pesan ke banyak nomor
// ─────────────────────────────────────────────────────────────────────────────
router.post("/broadcast/:sessionId", async (c) => {
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
