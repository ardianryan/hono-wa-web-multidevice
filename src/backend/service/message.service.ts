import { createRequire } from "module";
import type { Context } from "hono";
import { sessions, getOrCreateSession, formatPhone, enqueueBroadcastJob } from "../session/session-manager.js";
import { SESSION_STATUS, type BroadcastResult } from "../utils/types.js";
import { createActionLog, getMediaMaxMb } from "../utils/auth.js";
import { resolveMediaInput, type LoadedMedia } from "./media.service.js";
import { isSessionAllowedForUser } from "./session.service.js";
const require = createRequire(import.meta.url);
const { MessageMedia } = require("whatsapp-web.js") as {
  MessageMedia: typeof import("whatsapp-web.js").MessageMedia;
};

// ─── Helpers (existing) ──────────────────────────────────────────────────────

export const UNSEND_WINDOW_MS = 48 * 60 * 60 * 1000;
export const HISTORY_ACTION_TYPES = new Set(["message", "broadcast", "status"]);
export type HistoryActionType = "message" | "broadcast" | "status";

export const toHistoryActionType = (value: string): HistoryActionType => {
  if (!HISTORY_ACTION_TYPES.has(value)) return "message";
  return value as HistoryActionType;
};

export const historyBasePath = (actionType: HistoryActionType) => {
  if (actionType === "broadcast") return "/admin/broadcast";
  if (actionType === "status") return "/admin/status";
  return "/admin/message";
};

export const historyPathWithSession = (actionType: HistoryActionType, sessionId?: string) => {
  const base = historyBasePath(actionType);
  const sid = String(sessionId ?? "").trim();
  if (!sid) return base;
  return `${base}?sessionId=${encodeURIComponent(sid)}`;
};

export const collectMessageIds = (payload: any): string[] => {
  const direct = Array.isArray(payload?.sentMessageIds) ? payload.sentMessageIds : [];
  const nested = Array.isArray(payload?.sentItems)
    ? payload.sentItems.flatMap((item: any) =>
        Array.isArray(item?.messageIds) ? item.messageIds : [],
      )
    : [];
  return Array.from(
    new Set(
      [...direct, ...nested]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean),
    ),
  );
};

export const isWithinUnsendWindow = (createdAtIso?: string | null) => {
  const ts = Date.parse(String(createdAtIso ?? ""));
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= UNSEND_WINDOW_MS;
};

export const unsendByMessageIds = async (sessionId: string, messageIds: string[]) => {
  const sessionData = sessions.get(sessionId) ?? getOrCreateSession(sessionId);
  if (sessionData.status !== SESSION_STATUS.READY) {
    throw new Error(`not_ready:${sessionData.status}`);
  }
  let revoked = 0;
  for (const id of messageIds) {
    const msg = await sessionData.client.getMessageById(id);
    if (!msg) continue;
    await msg.delete(true);
    revoked++;
  }
  return revoked;
};

export const jsonToCsv = (rows: Record<string, any>[]) => {
  if (!rows.length) return "id,createdAt,sessionId,target,message,status,error\r\n";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = String(v ?? "");
    if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => esc(row[h])).join(",")),
  ];
  return lines.join("\r\n") + "\r\n";
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SendMessageParams {
  userId: string;
  sessionId: string;
  phone: string;
  message: string;
  loadedMedia: LoadedMedia | null;
}

export interface SendMessageResult {
  success: true;
  sentMessageIds: string[];
}

export interface SendGroupMessageParams {
  userId: string;
  sessionId: string;
  groupId: string;
  message: string;
}

export interface ExecuteBroadcastParams {
  userId: string;
  sessionId: string;
  phones: string[];
  message: string;
  loadedMedia: LoadedMedia | null;
  delayMs: number;
}

export interface ExecuteBroadcastResult {
  success: true;
  sessionId: string;
  summary: { total: number; sent: number; failed: number };
  results: BroadcastResult[];
}

// ─── Send Message ────────────────────────────────────────────────────────────

/**
 * Core logic for sending a single WhatsApp message (text, media, or both).
 * Used by both admin UI and API routes.
 * Throws on session-not-ready or WA client errors.
 */
export async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const { userId, sessionId, phone, message, loadedMedia } = params;

  const sessionData = sessions.get(sessionId) ?? getOrCreateSession(sessionId);
  if (sessionData.status !== SESSION_STATUS.READY) {
    try {
      await createActionLog({
        userId,
        sessionId,
        actionType: "message",
        payload: {
          phone,
          message: message || null,
          media: loadedMedia
            ? { source: loadedMedia.source, filename: loadedMedia.filename, mimetype: loadedMedia.mimetype, size: loadedMedia.size }
            : null,
        },
        success: false,
        error: `not_ready:${sessionData.status}`,
      });
    } catch { /* best effort */ }
    throw new Error(`not_ready:${sessionData.status}`);
  }

  const chatId = `${formatPhone(phone)}@c.us`;
  const sentMessageIds: string[] = [];

  if (loadedMedia) {
    const media = new MessageMedia(loadedMedia.mimetype, loadedMedia.dataB64, loadedMedia.filename);
    if (loadedMedia.isAudio) {
      const sentMedia: any = await sessionData.client.sendMessage(chatId, media);
      const idMedia = String(sentMedia?.id?._serialized ?? "").trim();
      if (idMedia) sentMessageIds.push(idMedia);
      if (message) {
        const sentText: any = await sessionData.client.sendMessage(chatId, message);
        const idText = String(sentText?.id?._serialized ?? "").trim();
        if (idText) sentMessageIds.push(idText);
      }
    } else {
      const sent: any = await sessionData.client.sendMessage(chatId, media, {
        caption: message || "",
      });
      const id = String(sent?.id?._serialized ?? "").trim();
      if (id) sentMessageIds.push(id);
    }
  } else {
    const sent: any = await sessionData.client.sendMessage(chatId, message);
    const id = String(sent?.id?._serialized ?? "").trim();
    if (id) sentMessageIds.push(id);
  }

  try {
    await createActionLog({
      userId,
      sessionId,
      actionType: "message",
      payload: {
        phone,
        message: message || null,
        media: loadedMedia
          ? { source: loadedMedia.source, filename: loadedMedia.filename, mimetype: loadedMedia.mimetype, size: loadedMedia.size }
          : null,
        sentMessageIds,
      },
      success: true,
    });
  } catch { /* best effort */ }

  return { success: true, sentMessageIds };
}

// ─── Send Group Message ──────────────────────────────────────────────────────

/**
 * Sends a message to a WhatsApp group.
 * Throws on session-not-ready or WA client errors.
 */
export async function sendGroupMessage(params: SendGroupMessageParams): Promise<SendMessageResult> {
  const { userId, sessionId, groupId, message } = params;

  const sessionData = sessions.get(sessionId) ?? getOrCreateSession(sessionId);
  if (sessionData.status !== SESSION_STATUS.READY) {
    try {
      await createActionLog({
        userId, sessionId, actionType: "message",
        payload: { groupId: null, message: null },
        success: false, error: `not_ready:${sessionData.status}`,
      });
    } catch { /* best effort */ }
    throw new Error(`not_ready:${sessionData.status}`);
  }

  if (!groupId || !message) {
    try {
      await createActionLog({
        userId, sessionId, actionType: "message",
        payload: { groupId: groupId ?? null, message: message ?? null },
        success: false, error: "missing_fields",
      });
    } catch { /* best effort */ }
    throw new Error("missing_fields");
  }

  const sent: any = await sessionData.client.sendMessage(groupId, message);
  const sentMessageIds = [String(sent?.id?._serialized ?? "")].filter(Boolean);

  try {
    await createActionLog({
      userId, sessionId, actionType: "message",
      payload: { groupId, message, sentMessageIds },
      success: true,
    });
  } catch { /* best effort */ }

  return { success: true, sentMessageIds };
}

// ─── Execute Broadcast (API) ─────────────────────────────────────────────────

/**
 * Executes a broadcast: loops over phones, sends messages, collects results.
 * Used by the API broadcast route.
 * Throws on session-not-ready.
 */
export async function executeBroadcast(params: ExecuteBroadcastParams): Promise<ExecuteBroadcastResult> {
  const { userId, sessionId, phones, message, loadedMedia, delayMs } = params;

  const sessionData = sessions.get(sessionId);
  if (!sessionData) {
    throw new Error(`session_not_found:${sessionId}`);
  }

  if (sessionData.status !== SESSION_STATUS.READY) {
    try {
      await createActionLog({
        userId, sessionId, actionType: "broadcast",
        payload: { phones: [], message: null, delayMs: null },
        success: false, error: `not_ready:${sessionData.status}`,
      });
    } catch { /* best effort */ }
    throw new Error(`not_ready:${sessionData.status}`);
  }

  const results: BroadcastResult[] = [];
  const sentItems: Array<{ phone: string; messageIds: string[] }> = [];
  let successCount = 0;
  let failCount = 0;
  const media = loadedMedia
    ? new MessageMedia(loadedMedia.mimetype, loadedMedia.dataB64, loadedMedia.filename)
    : null;

  for (let i = 0; i < phones.length; i++) {
    const raw = phones[i];
    const formatted = formatPhone(raw);
    const chatId = `${formatted}@c.us`;

    try {
      const sentMessageIds: string[] = [];
      if (media) {
        if (loadedMedia?.isAudio) {
          const sentMedia: any = await sessionData.client.sendMessage(chatId, media);
          const idMedia = String(sentMedia?.id?._serialized ?? "").trim();
          if (idMedia) sentMessageIds.push(idMedia);
          if (message) {
            const sentText: any = await sessionData.client.sendMessage(chatId, message);
            const idText = String(sentText?.id?._serialized ?? "").trim();
            if (idText) sentMessageIds.push(idText);
          }
        } else {
          const sent: any = await sessionData.client.sendMessage(chatId, media, { caption: message || "" });
          const id = String(sent?.id?._serialized ?? "").trim();
          if (id) sentMessageIds.push(id);
        }
      } else {
        const sent: any = await sessionData.client.sendMessage(chatId, message);
        const id = String(sent?.id?._serialized ?? "").trim();
        if (id) sentMessageIds.push(id);
      }
      if (sentMessageIds.length > 0) sentItems.push({ phone: raw, messageIds: sentMessageIds });
      results.push({ phone: raw, status: "sent" });
      successCount++;
      console.log(`[${sessionId}] Broadcast [${i + 1}/${phones.length}] → ${formatted} ✓`);
    } catch (err: any) {
      results.push({ phone: raw, status: "failed", error: err?.message ?? String(err) });
      failCount++;
      console.warn(`[${sessionId}] Broadcast [${i + 1}/${phones.length}] → ${formatted} ✗ ${err?.message}`);
    }

    if (i < phones.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const summary = { total: phones.length, sent: successCount, failed: failCount };

  try {
    await createActionLog({
      userId, sessionId, actionType: "broadcast",
      payload: {
        phones,
        message: message || null,
        media: loadedMedia
          ? { source: loadedMedia.source, filename: loadedMedia.filename, mimetype: loadedMedia.mimetype, size: loadedMedia.size }
          : null,
        delayMs,
        summary,
        sentItems,
      },
      success: true,
    });
  } catch { /* best effort */ }

  return { success: true, sessionId, summary, results };
}

// ─── Resend Message from History ─────────────────────────────────────────────

/**
 * Resends a previously-sent message from action log history.
 * Throws on error.
 */
export async function resendMessage(
  userId: string,
  sessionId: string,
  row: { id: string; payload: any },
): Promise<void> {
  const phone = String(row.payload?.phone ?? "").trim();
  const groupId = String(row.payload?.groupId ?? "").trim();
  const message = String(row.payload?.message ?? "");
  const mediaMeta = row.payload?.media ?? null;
  const mediaUrl =
    mediaMeta?.source?.kind === "url" ? String(mediaMeta?.source?.url ?? "") : "";

  if (!phone && !groupId) throw new Error("missing_target");
  if (mediaMeta?.source?.kind === "upload") throw new Error("resend_upload_not_supported");

  let media: LoadedMedia | null = null;
  if (mediaUrl) {
    const mediaMaxMb = await getMediaMaxMb();
    media = await resolveMediaInput({
      mediaUrl,
      maxBytes: Math.floor(mediaMaxMb * 1024 * 1024),
    });
  }
  if (!message && !media) throw new Error("missing_message_or_media");

  const sessionData = sessions.get(sessionId) ?? getOrCreateSession(sessionId);
  if (sessionData.status !== SESSION_STATUS.READY) {
    throw new Error(`not_ready:${sessionData.status}`);
  }

  const chatId = groupId || `${formatPhone(phone)}@c.us`;
  const sentMessageIds: string[] = [];

  if (media) {
    const waMedia = new MessageMedia(media.mimetype, media.dataB64, media.filename);
    if (media.isAudio) {
      const sentMedia: any = await sessionData.client.sendMessage(chatId, waMedia);
      const idMedia = String(sentMedia?.id?._serialized ?? "").trim();
      if (idMedia) sentMessageIds.push(idMedia);
      if (message) {
        const sentText: any = await sessionData.client.sendMessage(chatId, message);
        const idText = String(sentText?.id?._serialized ?? "").trim();
        if (idText) sentMessageIds.push(idText);
      }
    } else {
      const sent: any = await sessionData.client.sendMessage(chatId, waMedia, {
        caption: message || "",
      });
      const id = String(sent?.id?._serialized ?? "").trim();
      if (id) sentMessageIds.push(id);
    }
  } else {
    const sent: any = await sessionData.client.sendMessage(chatId, message);
    const id = String(sent?.id?._serialized ?? "").trim();
    if (id) sentMessageIds.push(id);
  }

  await createActionLog({
    userId,
    sessionId,
    actionType: "message",
    payload: {
      phone: phone || null,
      groupId: groupId || null,
      message: message || null,
      media: mediaMeta ?? null,
      resentFrom: row.id,
      sentMessageIds,
    },
    success: true,
  });
}

// ─── Resend Broadcast from History ───────────────────────────────────────────

/**
 * Re-enqueues a previously-sent broadcast from action log history.
 * Throws on error.
 */
export async function resendBroadcast(
  userId: string,
  sessionId: string,
  row: { id: string; payload: any },
): Promise<void> {
  const phones = Array.isArray(row.payload?.phones)
    ? row.payload.phones.map((v: any) => String(v).trim()).filter(Boolean)
    : [];
  const message = String(row.payload?.message ?? "");
  const mediaMeta = row.payload?.media ?? null;
  const mediaUrl =
    mediaMeta?.source?.kind === "url" ? String(mediaMeta?.source?.url ?? "") : "";

  if (!phones.length) throw new Error("missing_phones");
  if (mediaMeta?.source?.kind === "upload") throw new Error("resend_upload_not_supported");

  let media: LoadedMedia | null = null;
  if (mediaUrl) {
    const mediaMaxMb = await getMediaMaxMb();
    media = await resolveMediaInput({
      mediaUrl,
      maxBytes: Math.floor(mediaMaxMb * 1024 * 1024),
    });
  }
  if (!message && !media) throw new Error("missing_message_or_media");

  const delayMs = Math.max(5000, Number(row.payload?.delayMs ?? 5000));
  getOrCreateSession(sessionId);
  await enqueueBroadcastJob({
    userId,
    sessionId,
    phones,
    message,
    media,
    delayMs,
  });
}

// ─── API Route Handlers ──────────────────────────────────────────────────────

export const handleSendApi = async (c: Context) => {
  try {
    const user = c.get("authUser") as any;
    const sessionId = c.req.param("sessionId") as string;
    const allowed = await isSessionAllowedForUser(user, sessionId);
    if (!allowed) return c.json({ error: "forbidden_session" }, 403);

    const contentType = String(c.req.header("content-type") ?? "").toLowerCase();
    const isJson = contentType.includes("application/json");
    const body = isJson ? await c.req.json() : await c.req.parseBody();
    const phone = String((body as any).phone ?? "").trim();
    const message = String((body as any).message ?? "").trim();
    const mediaUrl = String((body as any).mediaUrl ?? "").trim();
    const mediaFile = (body as any).media;
    const mediaMaxMb = await getMediaMaxMb();
    const maxBytes = Math.floor(mediaMaxMb * 1024 * 1024);
    
    let loadedMedia: LoadedMedia | null = null;
    try {
      loadedMedia = await resolveMediaInput({ mediaUrl, mediaFile, maxBytes });
    } catch (err: any) {
      return c.json({ error: err?.message === "media_too_large" ? `Media terlalu besar. Maksimal ${mediaMaxMb}MB.` : "Gagal memuat media. Pastikan URL/file valid." }, 400);
    }

    if (!phone || (!message && !loadedMedia)) {
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "message",
          payload: { phone: phone || null, message: message || null },
          success: false,
          error: "missing_fields",
        });
      } catch { }
      return c.json(
        { error: 'Field "phone" wajib diisi, dan isi "message" atau kirim media (mediaUrl/media)' },
        400,
      );
    }

    await sendMessage({
      userId: user.id,
      sessionId,
      phone,
      message,
      loadedMedia,
    });

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
};

export const handleSendGroupApi = async (c: Context) => {
  try {
    const user = c.get("authUser") as any;
    const sessionId = c.req.param("sessionId") as string;
    const allowed = await isSessionAllowedForUser(user, sessionId);
    if (!allowed) return c.json({ error: "forbidden_session" }, 403);

    const body = await c.req.json();
    const { groupId, message } = body;

    if (!groupId || !message) {
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "message",
          payload: { groupId: groupId ?? null, message: message ?? null },
          success: false,
          error: "missing_fields",
        });
      } catch { }
      return c.json({ error: 'Field "groupId" dan "message" wajib diisi' }, 400);
    }

    await sendGroupMessage({
      userId: user.id,
      sessionId,
      groupId,
      message,
    });

    return c.json({ success: true, message: "Pesan ke grup berhasil dikirim" });
  } catch (error: any) {
    return c.json(
      { error: "Gagal kirim ke grup", details: error.toString() },
      500,
    );
  }
};

export const handleBroadcastApi = async (c: Context) => {
  try {
    const user = c.get("authUser") as any;
    const sessionId = c.req.param("sessionId") as string;
    const allowed = await isSessionAllowedForUser(user, sessionId);
    if (!allowed) return c.json({ error: "forbidden_session" }, 403);

    const contentType = String(c.req.header("content-type") ?? "").toLowerCase();
    const isJson = contentType.includes("application/json");
    const body = isJson ? await c.req.json() : await c.req.parseBody();
    const delayMsRaw = (body as any).delayMs ?? (body as any).delayMs;
    const delayMs: number = Math.max(
      5000,
      typeof delayMsRaw === "number" ? delayMsRaw : Number(String(delayMsRaw ?? "5000")),
    );
    const message: string = String((body as any).message ?? "").trim();
    const mediaUrl = String((body as any).mediaUrl ?? "").trim();
    const mediaFile = (body as any).media;
    const mediaMaxMb = await getMediaMaxMb();
    const maxBytes = Math.floor(mediaMaxMb * 1024 * 1024);
    
    let loadedMedia: LoadedMedia | null = null;
    try {
      loadedMedia = await resolveMediaInput({ mediaUrl, mediaFile, maxBytes });
    } catch (err: any) {
      return c.json({ error: err?.message === "media_too_large" ? `Media terlalu besar. Maksimal ${mediaMaxMb}MB.` : "Gagal memuat media. Pastikan URL/file valid." }, 400);
    }

    const phones: string[] = Array.isArray((body as any).phones)
      ? (body as any).phones
      : String((body as any).phones ?? "")
        .split(/[\n,]/g)
        .map((p) => p.trim())
        .filter(Boolean);

    if (!Array.isArray(phones) || phones.length === 0) {
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "broadcast",
          payload: {
            phones: Array.isArray(phones) ? phones : [],
            message: message || null,
            mediaUrl: mediaUrl || null,
            delayMs,
          },
          success: false,
          error: "missing_phones",
        });
      } catch { }
      return c.json(
        { error: 'Field "phones" wajib berupa array dan tidak boleh kosong' },
        400,
      );
    }
    
    if (!message && !loadedMedia) {
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "broadcast",
          payload: {
            phones,
            message: message || null,
            mediaUrl: mediaUrl || null,
            delayMs,
          },
          success: false,
          error: "missing_message_or_media",
        });
      } catch { }
      return c.json(
        { error: 'Isi "message" atau kirim media (mediaUrl/media)' },
        400,
      );
    }

    if (phones.length > 200) {
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "broadcast",
          payload: {
            phones,
            message: message || null,
            mediaUrl: mediaUrl || null,
            delayMs,
          },
          success: false,
          error: "too_many_phones",
        });
      } catch { }
      return c.json({ error: "Maksimal 200 nomor per request broadcast" }, 400);
    }

    const response = await executeBroadcast({
      userId: user.id,
      sessionId,
      phones,
      message,
      loadedMedia,
      delayMs,
    });

    return c.json(response);
  } catch (error: any) {
    return c.json(
      { error: "Gagal memproses broadcast", details: error.toString() },
      500,
    );
  }
};
