// ─────────────────────────────────────────────────────────────────────────────
// session-manager.ts — Manajemen sesi WhatsApp (buat, restore, hapus)
// ─────────────────────────────────────────────────────────────────────────────

import { createRequire } from "module";
import crypto from "crypto";
import { SESSION_STATUS, type SessionData } from "../utils/types.js";
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
} from "../webhook/webhook.js";
import { createActionLog } from "../utils/auth.js";
import { uploadToR2 } from "../service/r2.service.js";

const require = createRequire(import.meta.url);
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js") as {
  Client: typeof import("whatsapp-web.js").Client;
  LocalAuth: typeof import("whatsapp-web.js").LocalAuth;
  MessageMedia: typeof import("whatsapp-web.js").MessageMedia;
};

export const sessions = new Map<string, SessionData>();

export const formatPhone = (phone: string): string => {
  let num = phone.replace(/\D/g, "");
  if (num.startsWith("0")) num = "62" + num.substring(1);
  return num;
};

export const getOrCreateSession = (sessionId: string): SessionData => {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionId }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      bypassCSP: true,
      executablePath:
        process.platform === "linux"
          ? [
              "/usr/bin/google-chrome",
              "/usr/bin/google-chrome-stable",
              "/usr/bin/chromium-browser",
              "/usr/bin/chromium",
            ].find((p) => require("fs").existsSync(p))
          : undefined,
    },
    authTimeoutMs: 60000,
  });

  // Mencegah MaxListenersExceededWarning saat banyak request QR/pairing simultan
  client.setMaxListeners(20);

  const sessionData: SessionData = {
    client,
    status: SESSION_STATUS.INITIALIZING,
    readyAt: new Date().toISOString(),
  };
  sessions.set(sessionId, sessionData);
  persistSession(sessionId, sessionData);

  client.on("qr", (qr: string) => {
    sessionData.status = SESSION_STATUS.PENDING_PAIRING;
    sessionData.qr = qr;
    persistSession(sessionId, sessionData);
    console.log(`[${sessionId}] QR/Pairing code diminta`);
    webhookSessionQR(sessionId, qr);
  });

  client.on("ready", () => {
    sessionData.status = SESSION_STATUS.READY;
    sessionData.readyAt = new Date().toISOString();
    sessionData.qr = undefined;
    persistSession(sessionId, sessionData);
    console.log(`[${sessionId}] SIAP digunakan`);
    const deviceId = client.info?.wid?._serialized ?? sessionId;
    webhookSessionReady(sessionId, deviceId);
  });

  client.on("message", async (msg: any) => {
    const isGroup = msg.from.endsWith("@g.us");
    const deviceId = client.info?.wid?._serialized ?? sessionId;
    const contact = await msg.getContact();
    const fromName = contact.pushname || contact.name || msg._data?.notifyName || "Unknown";

    // Resolve LID to traditional phone JID (@c.us)
    const senderJid = contact.id._serialized.includes("@c.us")
      ? contact.id._serialized
      : contact.number
        ? `${contact.number}@c.us`
        : msg.from;

    let mediaPayload: any = undefined;

    if (msg.hasMedia) {
      mediaPayload = { caption: msg.body };
      try {
        const media = await msg.downloadMedia();
        if (media && media.data) {
          const buffer = Buffer.from(media.data, "base64");
          const ext = media.mimetype ? media.mimetype.split("/")[1]?.split(";")[0] : "bin";
          const uploadedUrl = await uploadToR2(buffer, media.mimetype, ext);
          if (uploadedUrl) {
            mediaPayload.url = uploadedUrl;
            mediaPayload.mimetype = media.mimetype;
            mediaPayload.filename = media.filename;
          }
        }
      } catch (err: any) {
        console.error(`[${sessionId}] Failed to process media:`, err.message ?? err);
      }
    }

    webhookMessageReceived(sessionId, deviceId, {
      messageId: msg.id._serialized,
      from: senderJid,
      from_name: fromName,
      to: msg.to,
      body: msg.body,
      type: msg.type,
      isGroup,
      groupId: isGroup ? msg.from : undefined,
      timestamp: msg.timestamp,
      ...(mediaPayload ? { media: mediaPayload } : {}),
    });
  });

  client.on("disconnected", (reason: string) => {
    const deviceId = client.info?.wid?._serialized ?? sessionId;
    sessionData.status = SESSION_STATUS.DISCONNECTED;
    persistSession(sessionId, sessionData);
    console.log(`[${sessionId}] Terputus: ${reason}`);
    webhookSessionDisconnected(sessionId, deviceId, reason);

    setTimeout(async () => {
      if (sessions.get(sessionId)?.status === SESSION_STATUS.DISCONNECTED) {
        try {
          await client.destroy();
        } catch {}
        sessions.delete(sessionId);
        removeSessionFromFile(sessionId);
        console.log(`[${sessionId}] Dihapus dari memori & browser dimatikan`);
      }
    }, 30_000);
  });

  client.on("auth_failure", async (msg: string) => {
    console.error(`[${sessionId}] Auth gagal:`, msg);
    try {
      await client.destroy();
    } catch {}
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

export const restoreSessionsFromFile = () => {
  const saved = readSessionFile();
  const ids = Object.keys(saved);
  if (ids.length === 0) return;

  console.log(`[startup] Memulihkan ${ids.length} sesi dari data/session.json...`);

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

type BroadcastJobStatus = "queued" | "running" | "done" | "failed";
type BroadcastJobMedia = {
  mimetype: string;
  dataB64: string;
  filename: string;
  size: number;
  source: { kind: "url"; url: string } | { kind: "upload"; name: string | null };
  isAudio: boolean;
};
export type BroadcastJob = {
  id: string;
  userId: string;
  sessionId: string;
  phones: string[];
  message: string;
  media?: BroadcastJobMedia | null;
  delayMs: number;
  status: BroadcastJobStatus;
  summary?: { total: number; sent: number; failed: number };
  error?: string | null;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
};

const broadcastJobs = new Map<string, BroadcastJob>();
const broadcastQueues = new Map<string, string[]>();
const broadcastProcessing = new Set<string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const waitUntilReady = async (sessionId: string, timeoutMs = 120_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = sessions.get(sessionId) ?? getOrCreateSession(sessionId);
    if (s.status === SESSION_STATUS.READY) return true;
    if (s.status === SESSION_STATUS.DISCONNECTED) return false;
    await sleep(2000);
  }
  return false;
};

const processBroadcastQueue = async (sessionId: string) => {
  if (broadcastProcessing.has(sessionId)) return;
  broadcastProcessing.add(sessionId);
  try {
    while (true) {
      const q = broadcastQueues.get(sessionId) ?? [];
      const jobId = q.shift();
      broadcastQueues.set(sessionId, q);
      if (!jobId) break;

      const job = broadcastJobs.get(jobId);
      if (!job) continue;
      if (job.status !== "queued") continue;

      job.status = "running";
      job.startedAt = new Date().toISOString();
      job.error = null;
      broadcastJobs.set(jobId, job);

      const readyOk = await waitUntilReady(sessionId, 120_000);
      const sessionData = sessions.get(sessionId) ?? getOrCreateSession(sessionId);
      if (!readyOk || sessionData.status !== SESSION_STATUS.READY) {
        job.status = "failed";
        job.finishedAt = new Date().toISOString();
        job.error = `not_ready:${sessionData.status}`;
        job.summary = { total: job.phones.length, sent: 0, failed: job.phones.length };
        broadcastJobs.set(jobId, job);
        try {
          await createActionLog({
            userId: job.userId,
            sessionId: job.sessionId,
            actionType: "broadcast",
            payload: {
              jobId: job.id,
              queued: true,
              status: "failed",
              phones: job.phones,
              message: job.message,
              delayMs: job.delayMs,
              summary: job.summary,
            },
            success: false,
            error: job.error,
          });
        } catch { }
        continue;
      }

      let sent = 0;
      let failed = 0;
      const sentItems: Array<{ phone: string; messageIds: string[] }> = [];
      let lastError: string | null = null;
      const media = job.media
        ? new MessageMedia(job.media.mimetype, job.media.dataB64, job.media.filename)
        : null;
      for (let i = 0; i < job.phones.length; i++) {
        const raw = job.phones[i];
        const formatted = formatPhone(raw);
        const chatId = `${formatted}@c.us`;
        try {
          const sentMessageIds: string[] = [];
          if (media) {
            if (job.media?.isAudio) {
              const sentMedia: any = await sessionData.client.sendMessage(chatId, media);
              const idMedia = String(sentMedia?.id?._serialized ?? "").trim();
              if (idMedia) sentMessageIds.push(idMedia);
              if (job.message) {
                const sentText: any = await sessionData.client.sendMessage(chatId, job.message);
                const idText = String(sentText?.id?._serialized ?? "").trim();
                if (idText) sentMessageIds.push(idText);
              }
            } else {
              const sent: any = await sessionData.client.sendMessage(chatId, media, {
                caption: job.message || "",
              });
              const id = String(sent?.id?._serialized ?? "").trim();
              if (id) sentMessageIds.push(id);
            }
          } else {
            const sent: any = await sessionData.client.sendMessage(chatId, job.message);
            const id = String(sent?.id?._serialized ?? "").trim();
            if (id) sentMessageIds.push(id);
          }
          if (sentMessageIds.length > 0) {
            sentItems.push({ phone: raw, messageIds: sentMessageIds });
          }
          sent++;
        } catch (err: any) {
          failed++;
          lastError = err?.message ?? String(err);
        }
        if (i < job.phones.length - 1) await sleep(job.delayMs);
      }

      job.finishedAt = new Date().toISOString();
      job.summary = { total: job.phones.length, sent, failed };
      if (failed > 0) {
        job.status = "failed";
        job.error = lastError ?? "partial_failed";
      } else {
        job.status = "done";
        job.error = null;
      }
      broadcastJobs.set(jobId, job);

      try {
        await createActionLog({
          userId: job.userId,
          sessionId: job.sessionId,
          actionType: "broadcast",
          payload: {
            jobId: job.id,
            queued: true,
            status: job.status,
            phones: job.phones,
            message: job.message,
            media: job.media
              ? {
                source: job.media.source,
                filename: job.media.filename,
                mimetype: job.media.mimetype,
                size: job.media.size,
              }
              : null,
            delayMs: job.delayMs,
            summary: job.summary,
            sentItems,
          },
          success: job.status === "done",
          error: job.error ?? null,
        });
      } catch { }
    }
  } finally {
    broadcastProcessing.delete(sessionId);
  }
};

export const enqueueBroadcastJob = async (input: {
  userId: string;
  sessionId: string;
  phones: string[];
  message: string;
  media?: BroadcastJobMedia | null;
  delayMs: number;
}): Promise<BroadcastJob> => {
  const delayMs = Math.max(5000, Math.floor(input.delayMs));
  const job: BroadcastJob = {
    id: crypto.randomUUID(),
    userId: input.userId,
    sessionId: input.sessionId,
    phones: input.phones,
    message: input.message,
    media: input.media ?? null,
    delayMs,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  broadcastJobs.set(job.id, job);
  const q = broadcastQueues.get(input.sessionId) ?? [];
  q.push(job.id);
  broadcastQueues.set(input.sessionId, q);

  try {
    await createActionLog({
      userId: job.userId,
      sessionId: job.sessionId,
      actionType: "broadcast",
      payload: {
        jobId: job.id,
        queued: true,
        status: "queued",
        phones: job.phones,
        message: job.message,
        media: job.media
          ? {
            source: job.media.source,
            filename: job.media.filename,
            mimetype: job.media.mimetype,
            size: job.media.size,
          }
          : null,
        delayMs: job.delayMs,
      },
      success: true,
      error: null,
    });
  } catch { }

  void processBroadcastQueue(input.sessionId);
  return job;
};

export const getBroadcastJob = (jobId: string): BroadcastJob | null =>
  broadcastJobs.get(jobId) ?? null;

export const requestSessionPairingCode = async (sessionId: string, phoneNumber: string): Promise<string> => {
  let session = sessions.get(sessionId);
  if (!session) {
    session = getOrCreateSession(sessionId);
  }

  if (session.status === SESSION_STATUS.READY) {
    throw new Error(`Session ${sessionId} is already ready`);
  }

  if (session.status === SESSION_STATUS.INITIALIZING) {
    let attempts = 0;
    while (session.status === SESSION_STATUS.INITIALIZING && attempts < 15) {
      await new Promise((r) => setTimeout(r, 2000));
      attempts++;
    }
    if (session.status === SESSION_STATUS.INITIALIZING) {
      throw new Error("Session masih dalam proses inisialisasi. Silakan coba lagi dalam beberapa detik.");
    }
  }

  if (session.status === SESSION_STATUS.READY) {
    throw new Error(`Session ${sessionId} is already ready`);
  }

  const formattedPhone = formatPhone(phoneNumber);
  
  // Try exposing the function to the page if it wasn't exposed yet
  try {
    // exposeFunction is needed because pairWithPhoneNumber might not have been set in the options
    await session.client.pupPage?.exposeFunction('onCodeReceivedEvent', (code: string) => {
      // The event handles code emitting, but we'll also just return it from requestPairingCode
      return code;
    });
  } catch (err: any) {
    // If it throws "Function onCodeReceivedEvent already evaluated", it's fine
    if (!err.message?.includes("already evaluated")) {
      console.warn(`[${sessionId}] Expose function warning:`, err.message);
    }
  }

  try {
    const code = await session.client.requestPairingCode(formattedPhone);
    return code;
  } catch (err: any) {
    console.error(`[${sessionId}] Failed to request pairing code:`, err);
    throw new Error("Gagal meminta pairing code. Pastikan nomor benar dan session sedang meminta QR.");
  }
};
