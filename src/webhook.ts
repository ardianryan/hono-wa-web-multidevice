// ─────────────────────────────────────────────────────────────────────────────
// webhook.ts — Service untuk mengirim event WhatsApp ke URL webhook eksternal
// URL webhook dikonfigurasi via environment variable WEBHOOK_URL
// ─────────────────────────────────────────────────────────────────────────────

// ─── TIPE PAYLOAD WEBHOOK ─────────────────────────────────────────────────────
export type WebhookEvent =
  | "message.received" // Pesan masuk dari kontak/grup
  | "message.sent" // Pesan berhasil dikirim via API
  | "session.ready" // Sesi WhatsApp siap digunakan
  | "session.qr" // QR code baru tersedia
  | "session.disconnected"; // Sesi terputus

export type WebhookPayload = {
  event: WebhookEvent;
  sessionId: string;
  timestamp: string;
  data: Record<string, any>;
};

// ─── HELPER: Ambil URL webhook dari env ──────────────────────────────────────
const getWebhookUrl = (): string | null => process.env.WEBHOOK_URL ?? null;

// ─── CORE: Kirim payload ke URL webhook ──────────────────────────────────────
export const sendWebhook = async (payload: WebhookPayload): Promise<void> => {
  const url = getWebhookUrl();
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

// ─── SHORTCUT: Helper per jenis event ────────────────────────────────────────

/** Pesan masuk dari WhatsApp */
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

/** Sesi WhatsApp siap */
export const webhookSessionReady = (sessionId: string) =>
  sendWebhook({
    event: "session.ready",
    sessionId,
    timestamp: new Date().toISOString(),
    data: { status: "ready" },
  });

/** QR code baru tersedia */
export const webhookSessionQR = (sessionId: string, qr: string) =>
  sendWebhook({
    event: "session.qr",
    sessionId,
    timestamp: new Date().toISOString(),
    data: { qr },
  });

/** Sesi terputus */
export const webhookSessionDisconnected = (sessionId: string, reason: string) =>
  sendWebhook({
    event: "session.disconnected",
    sessionId,
    timestamp: new Date().toISOString(),
    data: { reason },
  });
