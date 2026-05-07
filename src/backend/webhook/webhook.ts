// ─────────────────────────────────────────────────────────────────────────────
// webhook.ts — Service untuk mengirim event WhatsApp ke URL webhook eksternal
// URL webhook dikonfigurasi via environment variable WEBHOOK_URL
// ─────────────────────────────────────────────────────────────────────────────

import { db as ormDb } from "../config/db.js";
import { eq } from "drizzle-orm";
import { waSessions } from "../config/schema.js";

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

const normalizeWebhookUrl = (value: string | null | undefined): string[] => {
  const v = String(value ?? "").trim();
  if (!v) return [];
  return v.split(/[\n,]/).map((u) => u.trim()).filter(Boolean);
};

type WebhookCacheEntry = { urls: string[]; expiresAt: number };
const webhookUrlCache = new Map<string, WebhookCacheEntry>();

export const invalidateWebhookCache = (sessionId: string) => {
  webhookUrlCache.delete(sessionId);
};

const getWebhookUrlForSession = async (sessionId: string): Promise<string[]> => {
  const now = Date.now();
  const cached = webhookUrlCache.get(sessionId);
  if (cached && cached.expiresAt > now) return cached.urls;

  try {
    const result = await ormDb
      .select({ webhookUrl: waSessions.webhookUrl })
      .from(waSessions)
      .where(eq(waSessions.sessionId, sessionId))
      .limit(1);
    
    let urls: string[] = [];
    if (result.length > 0 && result[0].webhookUrl) {
      urls = normalizeWebhookUrl(result[0].webhookUrl);
    }

    webhookUrlCache.set(sessionId, { urls, expiresAt: now + 30_000 });
    return urls;
  } catch {
    webhookUrlCache.set(sessionId, { urls: [], expiresAt: now + 10_000 });
    return [];
  }
};

export const sendWebhook = async (payload: WebhookPayload): Promise<void> => {
  const urls = await getWebhookUrlForSession(payload.sessionId);
  if (urls.length === 0) return;

  const promises = urls.map(async (url) => {
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
          `[webhook] Pengiriman gagal ke ${url} — event: ${payload.event}, ` +
            `session: ${payload.sessionId}, HTTP ${res.status}`,
        );
      } else {
        console.log(
          `[webhook] ✓ Terkirim ke ${url} — event: ${payload.event}, session: ${payload.sessionId}`,
        );
      }
    } catch (err: any) {
      console.error(
        `[webhook] Error saat kirim ke ${url} — event: ${payload.event}:`,
        err?.message ?? err,
      );
    }
  });

  await Promise.allSettled(promises);
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
