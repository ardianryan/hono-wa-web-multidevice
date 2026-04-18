// ─────────────────────────────────────────────────────────────────────────────
// session-manager.ts — Manajemen sesi WhatsApp (buat, restore, hapus)
// ─────────────────────────────────────────────────────────────────────────────

import { createRequire } from "module";
import { SESSION_STATUS, type SessionData } from "./types.js";
import {
  persistSession,
  removeSessionFromFile,
  readSessionFile,
} from "./session-store.js";
import {
  webhookMessageReceived,
  webhookSessionReady,
  webhookSessionQR,
  webhookSessionDisconnected,
} from "./webhook.js";

const require = createRequire(import.meta.url);
const { Client, LocalAuth } = require("whatsapp-web.js") as {
  Client: typeof import("whatsapp-web.js").Client;
  LocalAuth: typeof import("whatsapp-web.js").LocalAuth;
};

// ─── Penyimpanan sesi runtime (in-memory) ────────────────────────────────────
export const sessions = new Map<string, SessionData>();

// ─── Helper: Format nomor HP ke format internasional ─────────────────────────
export const formatPhone = (phone: string): string => {
  let num = phone.replace(/\D/g, "");
  if (num.startsWith("0")) num = "62" + num.substring(1);
  return num;
};

// ─── Core: Buat atau ambil sesi yang sudah ada ────────────────────────────────
export const getOrCreateSession = (sessionId: string): SessionData => {
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
    webhookSessionQR(sessionId, qr);
  });

  // ── Event: Ready ───────────────────────────────────────────────────────────
  client.on("ready", () => {
    sessionData.status = SESSION_STATUS.READY;
    sessionData.readyAt = new Date().toISOString();
    sessionData.qr = undefined;
    persistSession(sessionId, sessionData);
    console.log(`[${sessionId}] SIAP digunakan`);
    webhookSessionReady(sessionId);
  });

  // ── Event: Message ─────────────────────────────────────────────────────────
  client.on("message", async (msg: any) => {
    const isGroup = msg.from.endsWith("@g.us");
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
    webhookSessionDisconnected(sessionId, reason);

    setTimeout(() => {
      if (sessions.get(sessionId)?.status === SESSION_STATUS.DISCONNECTED) {
        sessions.delete(sessionId);
        removeSessionFromFile(sessionId);
        console.log(`[${sessionId}] Dihapus dari memori`);
      }
    }, 30_000);
  });

  // ── Event: Auth Failure ────────────────────────────────────────────────────
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

// ─── Restore sesi dari file saat startup ─────────────────────────────────────
export const restoreSessionsFromFile = () => {
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
