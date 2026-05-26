import { db as ormDb, getDb } from "../config/db.js";
import type { Context } from "hono";
import { waSessions } from "../config/schema.js";
import { and, eq } from "drizzle-orm";
import type { User } from "../utils/auth.js";
import {
  listWaSessionsAll,
  listWaSessionsForUser,
} from "../utils/auth.js";
import {
  sessions,
  getOrCreateSession,
} from "../session/session-manager.js";
import { removeSessionFromFile } from "../session/session-store.js";
import { invalidateWebhookCache } from "../webhook/webhook.js";
import { SESSION_STATUS } from "../utils/types.js";
import QRCode from "qrcode";

// ─── isSessionAllowedForUser (existing) ──────────────────────────────────────

export const isSessionAllowedForUser = async (user: User, sessionId: string) => {
  if (user.role === "admin") return true;
  const result = await ormDb
    .select()
    .from(waSessions)
    .where(and(eq(waSessions.userId, user.id), eq(waSessions.sessionId, sessionId)))
    .limit(1);
  return result.length > 0;
};

// ─── Delete Session ──────────────────────────────────────────────────────────

/**
 * Logout + destroy a WhatsApp session, remove from memory, session store file,
 * and database. Used by both admin UI and API routes.
 */
export async function deleteSession(user: User, sessionId: string): Promise<void> {
  const sessionData = sessions.get(sessionId);
  if (sessionData) {
    try {
      await sessionData.client.logout();
    } catch { /* best effort */ }
    try {
      await sessionData.client.destroy();
    } catch { /* best effort */ }
    sessions.delete(sessionId);
  } else {
    sessions.delete(sessionId);
  }

  removeSessionFromFile(sessionId);
  const db = getDb();
  if (user.role === "admin") {
    await db.query(`delete from wa_sessions where session_id = $1`, [sessionId]);
  } else {
    await db.query(`delete from wa_sessions where user_id = $2 and session_id = $1`, [
      sessionId,
      user.id,
    ]);
  }
}

// ─── Get Session Status ──────────────────────────────────────────────────────

export interface SessionStatusResult {
  sessionId: string;
  status: string;
  exists: boolean;
  readyAt?: string | null;
}

/**
 * Returns the runtime status of a session.
 */
export function getSessionStatus(sessionId: string): SessionStatusResult {
  const sessionData = sessions.get(sessionId);
  if (!sessionData) {
    return { sessionId, status: "not_found", exists: false };
  }
  return {
    sessionId,
    status: sessionData.status,
    exists: true,
    readyAt: sessionData.readyAt,
  };
}

// ─── List Sessions For User ──────────────────────────────────────────────────

export interface SessionListItem {
  sessionId: string;
  status: string;
  exists: boolean;
  readyAt: string | null;
}

/**
 * Returns all sessions the user is allowed to see, enriched with runtime status.
 */
export async function listSessionsForUser(user: User): Promise<{
  total: number;
  sessions: SessionListItem[];
}> {
  const allowedSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  const list = (allowedSessions as any[]).map((s) => {
    const sid = s.sessionId;
    const runtime = sessions.get(sid);
    return {
      sessionId: sid,
      status: runtime?.status ?? "disconnected",
      exists: Boolean(runtime),
      readyAt: runtime?.readyAt ?? null,
    };
  });
  return { total: list.length, sessions: list };
}

// ─── Save Webhook ────────────────────────────────────────────────────────────

export interface SaveWebhookResult {
  success: boolean;
  error?: string;
}

/**
 * Validates and saves a webhook URL for a session.
 * Returns { success: false, error } if validation fails.
 */
export async function saveWebhook(
  user: User,
  sessionId: string,
  rawWebhookUrl: string,
): Promise<SaveWebhookResult> {
  let webhookUrl: string | null = null;
  if (rawWebhookUrl) {
    const urls = rawWebhookUrl.split(/[\n,]/).map((u) => u.trim()).filter(Boolean);
    const validUrls: string[] = [];
    for (const urlStr of urls) {
      try {
        const u = new URL(urlStr);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          return { success: false, error: "Semua webhook harus http/https" };
        }
        validUrls.push(u.toString());
      } catch {
        return { success: false, error: `Format webhook URL tidak valid: ${urlStr}` };
      }
    }
    if (validUrls.length > 0) {
      webhookUrl = validUrls.join(",");
    }
  }

  const updated =
    user.role === "admin"
      ? await ormDb
        .update(waSessions)
        .set({ webhookUrl })
        .where(eq(waSessions.sessionId, sessionId))
        .returning({ id: waSessions.id })
      : await ormDb
        .update(waSessions)
        .set({ webhookUrl })
        .where(and(eq(waSessions.sessionId, sessionId), eq(waSessions.userId, user.id)))
        .returning({ id: waSessions.id });

  if (!updated.length) {
    return { success: false, error: "Gagal menyimpan webhook" };
  }

  invalidateWebhookCache(sessionId);
  return { success: true };
}

// ─── Get Session QR Data ─────────────────────────────────────────────────────

export interface SessionQrResult {
  status: "ready" | "pending" | "qr";
  sessionId: string;
  qrImageUrl?: string;
  message?: string;
}

/**
 * Gets the QR code data for a session, or reports its ready/pending status.
 * Used by the admin UI AJAX polling endpoint.
 */
export async function getSessionQrData(sessionId: string): Promise<SessionQrResult> {
  const sessionData = getOrCreateSession(sessionId);

  if (sessionData.status === SESSION_STATUS.READY) {
    return { status: "ready", sessionId };
  }

  const qrData = await new Promise<string | null>((resolve) => {
    const onQr = (qr: string) => {
      cleanup();
      resolve(qr);
    };
    const onReady = () => {
      cleanup();
      resolve(null);
    };
    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 25_000);

    const cleanup = () => {
      clearTimeout(timeout);
      sessionData.client.off("qr", onQr);
      sessionData.client.off("ready", onReady);
    };

    sessionData.client.once("qr", onQr);
    sessionData.client.once("ready", onReady);
  });

  if (!qrData && sessionData.status === SESSION_STATUS.READY) {
    return { status: "ready", sessionId };
  }

  if (!qrData) {
    return { status: "pending", sessionId, message: "QR belum siap, tunggu sebentar..." };
  }

  const qrImageUrl = await QRCode.toDataURL(qrData, {
    width: 320,
    margin: 2,
    color: { dark: "#111b21", light: "#ffffff" },
  });

  return { status: "qr", sessionId, qrImageUrl };
}

// ─── API Route Handlers ──────────────────────────────────────────────────────

export const handleDeleteSessionApi = async (c: Context) => {
  const user = c.get("authUser") as any;
  const sessionId = c.req.param("sessionId") as string;
  const allowed = await isSessionAllowedForUser(user, sessionId);
  if (!allowed) return c.json({ error: "forbidden_session" }, 403);

  try {
    const sessionData = sessions.get(sessionId);

    if (!sessionData) {
      return c.json({ error: `Sesi '${sessionId}' tidak ditemukan di memori` }, 404);
    }

    await deleteSession(user, sessionId);

    return c.json({
      success: true,
      message: `Sesi '${sessionId}' berhasil dihapus dan dilogout`,
    });
  } catch (error: any) {
    return c.json(
      {
        error: "Gagal logout dengan bersih, tetapi sesi telah dihapus dari memori",
        details: error.toString(),
      },
      500,
    );
  }
};

export const handleGetSessionsApi = async (c: Context) => {
  const user = c.get("authUser") as any;
  const result = await listSessionsForUser(user);
  return c.json(result);
};

export const handleGetSessionStatusApi = async (c: Context) => {
  const sessionId = c.req.param("sessionId") as string;
  const result = getSessionStatus(sessionId);
  if (!result.exists) {
    return c.json({ status: "not_found" }, 404);
  }
  return c.json(result);
};
