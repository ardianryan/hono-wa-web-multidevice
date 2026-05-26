import { createRequire } from "module";
import type { Context } from "hono";
import { sessions, getOrCreateSession } from "../session/session-manager.js";
import { isSessionAllowedForUser } from "./session.service.js";
import { SESSION_STATUS } from "../utils/types.js";
import { createActionLog } from "../utils/auth.js";

const require = createRequire(import.meta.url);
const { MessageMedia } = require("whatsapp-web.js") as {
  MessageMedia: typeof import("whatsapp-web.js").MessageMedia;
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateStatusParams {
  userId: string;
  sessionId: string;
  text: string;
  mediaUrl?: string | null;
}

export interface CreateStatusResult {
  success: true;
  sentMessageIds: string[];
}

// ─── Create WhatsApp Status ──────────────────────────────────────────────────

/**
 * Core business logic for posting a WhatsApp status (text or media).
 * Throws on session-not-ready, missing text/media, or WA client errors.
 */
export async function createWhatsAppStatus(params: CreateStatusParams): Promise<CreateStatusResult> {
  const { userId, sessionId, text, mediaUrl } = params;

  const sessionData = sessions.get(sessionId) ?? getOrCreateSession(sessionId);
  if (sessionData.status !== SESSION_STATUS.READY) {
    try {
      await createActionLog({
        userId,
        sessionId,
        actionType: "status",
        payload: { text, mediaUrl: mediaUrl || null },
        success: false,
        error: `not_ready:${sessionData.status}`,
      });
    } catch { /* best effort logging */ }
    throw new Error(`not_ready:${sessionData.status}`);
  }

  if (mediaUrl) {
    const media = await MessageMedia.fromUrl(mediaUrl);
    const sent: any = await sessionData.client.sendMessage("status@broadcast", media, {
      caption: text || "",
    });
    const sentMessageIds = [String(sent?.id?._serialized ?? "")].filter(Boolean);
    await createActionLog({
      userId,
      sessionId,
      actionType: "status",
      payload: { text, mediaUrl, sentMessageIds },
      success: true,
    });
    return { success: true, sentMessageIds };
  }

  // Text-only status
  if (!text) {
    try {
      await createActionLog({
        userId,
        sessionId,
        actionType: "status",
        payload: { text, mediaUrl: null },
        success: false,
        error: "missing_text",
      });
    } catch { /* best effort logging */ }
    throw new Error("missing_text");
  }

  const sent: any = await sessionData.client.sendMessage("status@broadcast", text);
  const sentMessageIds = [String(sent?.id?._serialized ?? "")].filter(Boolean);
  await createActionLog({
    userId,
    sessionId,
    actionType: "status",
    payload: { text, mediaUrl: null, sentMessageIds },
    success: true,
  });
  return { success: true, sentMessageIds };
}

// ─── Resend Status from History ──────────────────────────────────────────────

/**
 * Resends a previously-sent WhatsApp status from action log history.
 * Throws if session not ready, or missing text + mediaUrl.
 */
export async function resendStatus(
  userId: string,
  sessionId: string,
  row: { id: string; payload: any },
): Promise<void> {
  const text = String(row.payload?.text ?? "");
  const mediaUrl = String(row.payload?.mediaUrl ?? "").trim();

  if (!text && !mediaUrl) {
    throw new Error("missing_text_or_media");
  }

  const sessionData = sessions.get(sessionId) ?? getOrCreateSession(sessionId);
  if (sessionData.status !== SESSION_STATUS.READY) {
    throw new Error(`not_ready:${sessionData.status}`);
  }

  if (mediaUrl) {
    const media = await MessageMedia.fromUrl(mediaUrl);
    const sent: any = await sessionData.client.sendMessage("status@broadcast", media, {
      caption: text || "",
    });
    await createActionLog({
      userId,
      sessionId,
      actionType: "status",
      payload: {
        text: text || null,
        mediaUrl,
        resentFrom: row.id,
        sentMessageIds: [String(sent?.id?._serialized ?? "")].filter(Boolean),
      },
      success: true,
    });
  } else {
    const sent: any = await sessionData.client.sendMessage("status@broadcast", text);
    await createActionLog({
      userId,
      sessionId,
      actionType: "status",
      payload: {
        text,
        mediaUrl: null,
        resentFrom: row.id,
        sentMessageIds: [String(sent?.id?._serialized ?? "")].filter(Boolean),
      },
      success: true,
    });
  }
}

// ─── API Route Handlers ──────────────────────────────────────────────────────

export const handleStatusApi = async (c: Context) => {
  try {
    const user = c.get("authUser") as any;
    const sessionId = c.req.param("sessionId") as string;
    const allowed = await isSessionAllowedForUser(user, sessionId);
    if (!allowed) return c.json({ error: "forbidden_session" }, 403);

    const body = await c.req.json();
    const { text, mediaUrl } = body;

    await createWhatsAppStatus({
      userId: user.id,
      sessionId,
      text,
      mediaUrl,
    });

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
};
