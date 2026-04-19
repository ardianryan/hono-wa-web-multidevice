// ─────────────────────────────────────────────────────────────────────────────
// webhook.ts — Service untuk mengirim event WhatsApp ke URL webhook eksternal
// URL webhook dikonfigurasi via environment variable WEBHOOK_URL
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from "./db.js";

export type WebhookEvent =
  | "message.received"
  | "message.sent"
  | "session.ready"
  | "session.qr"
  | "session.disconnected";

export type WebhookPayload = {
  event: WebhookEvent;
  sessionId: string;
  timestamp: string;
  data: Record<string, any>;
};

const normalizeWebhookUrl = (value: string | null | undefined): string | null => {
  const v = String(value ?? "").trim();
  return v ? v : null;
};

type WebhookCacheEntry = { url: string | null; expiresAt: number };
const webhookUrlCache = new Map<string, WebhookCacheEntry>();

export const invalidateWebhookCache = (sessionId: string) => {
  webhookUrlCache.delete(sessionId);
};

const getWebhookUrlForSession = async (sessionId: string): Promise<string | null> => {
  const now = Date.now();
  const cached = webhookUrlCache.get(sessionId);
  if (cached && cached.expiresAt > now) return cached.url;

  const fallback = normalizeWebhookUrl(process.env.WEBHOOK_URL);

  try {
    const db = getDb();
    const res = await db.query<{ webhook_url: string | null }>(
      `select webhook_url from wa_sessions where session_id = $1 limit 1`,
      [sessionId],
    );
    const url = normalizeWebhookUrl(res.rows[0]?.webhook_url) ?? fallback;
    webhookUrlCache.set(sessionId, { url, expiresAt: now + 30_000 });
    return url;
  } catch {
    webhookUrlCache.set(sessionId, { url: fallback, expiresAt: now + 10_000 });
    return fallback;
  }
};

export const sendWebhook = async (payload: WebhookPayload): Promise<void> => {
  const url = await getWebhookUrlForSession(payload.sessionId);
  if (!url) return;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.WEBHOOK_SECRET
          ? { "X-Webhook-Secret": process.env.WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(
        `[webhook] Pengiriman gagal — event: ${payload.event}, ` +
          `session: ${payload.sessionId}, HTTP ${res.status}`,
      );
    } else {
      console.log(
        `[webhook] ✓ Terkirim — event: ${payload.event}, session: ${payload.sessionId}`,
      );
    }
  } catch (err: any) {
    console.error(
      `[webhook] Error saat kirim — event: ${payload.event}:`,
      err?.message ?? err,
    );
  }
};

export const webhookMessageReceived = (
  sessionId: string,
  msg: {
    from: string;
    to: string;
    body: string;
    type: string;
    isGroup: boolean;
    groupId?: string;
    timestamp: number;
    messageId: string;
  },
) =>
  sendWebhook({
    event: "message.received",
    sessionId,
    timestamp: new Date().toISOString(),
    data: msg,
  });

export const webhookSessionReady = (sessionId: string) =>
  sendWebhook({
    event: "session.ready",
    sessionId,
    timestamp: new Date().toISOString(),
    data: { status: "ready" },
  });

export const webhookSessionQR = (sessionId: string, qr: string) =>
  sendWebhook({
    event: "session.qr",
    sessionId,
    timestamp: new Date().toISOString(),
    data: { qr },
  });

export const webhookSessionDisconnected = (sessionId: string, reason: string) =>
  sendWebhook({
    event: "session.disconnected",
    sessionId,
    timestamp: new Date().toISOString(),
    data: { reason },
  });
