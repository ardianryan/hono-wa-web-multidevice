/** @jsxImportSource hono/jsx */
// ─────────────────────────────────────────────────────────────────────────────
// routes.tsx — Semua endpoint HTTP (Hono router)
// ─────────────────────────────────────────────────────────────────────────────

import { createRequire } from "module";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import QRCode from "qrcode";
import { LoginPage } from "../frontend/pages/auth/login.js";
import {
  BroadcastPage,
  ApiDocsPage,
  DashboardPage,
  HelpPage,
  MessagePage,
  ProfilePage,
  SessionsPage,
  SettingsPage,
  StatusPage,
  UserFormPage,
  UsersListPage,
} from "../frontend/pages/admin/pages.js";
import {
  sessions,
  enqueueBroadcastJob,
  getOrCreateSession,
  formatPhone,
} from "./session-manager.js";
import { removeSessionFromFile } from "./session-store.js";
import { SESSION_STATUS, type BroadcastResult } from "./types.js";
import {
  createAuthSession,
  createActionLog,
  createUser,
  createWaSessionForUser,
  deleteActionLogsByIds,
  deleteAllActionLogs,
  deleteAuthSession,
  deleteUser,
  ensureDefaultAdmin,
  getActionLogById,
  getAppDescription,
  getAppLogoUrl,
  getAppName,
  getMaintenanceMode,
  getMediaMaxMb,
  getUserById,
  getUserByApiKey,
  getUserBySessionId,
  getUserByUsername,
  listActionLogs,
  listUsers,
  listWaSessionsAll,
  listWaSessionsForUser,
  rotateApiKeyForUser,
  setAppDescription,
  setAppLogoUrl,
  setAppName,
  setMaintenanceMode,
  setMediaMaxMb,
  type User,
  updateUser,
  updateUserEmail,
  updateUserPassword,
  updateUserProfilePhotoUrl,
  verifyPassword,
} from "./auth.js";
import { db as ormDb, ensureDefaultSettings, ensureSchema, getDb } from "./db.js";
import { invalidateWebhookCache } from "./webhook.js";
import { and, eq } from "drizzle-orm";
import { waSessions } from "./schema.js";

const require = createRequire(import.meta.url);
const { MessageMedia } = require("whatsapp-web.js") as {
  MessageMedia: typeof import("whatsapp-web.js").MessageMedia;
};

export const router = new Hono<{ Variables: { authUser: User } }>();

const getAuthUser = async (c: any) => {
  const sid = getCookie(c, "sid");
  if (!sid) return null;
  return await getUserBySessionId(sid);
};

const requireAuth: MiddlewareHandler<{ Variables: { authUser: User } }> = async (
  c,
  next,
) => {
  const user = await getAuthUser(c);
  if (!user) return c.redirect("/login");
  const maintenance = await getMaintenanceMode();
  if (maintenance && user.role !== "admin") {
    deleteCookie(c, "sid");
    return c.redirect("/login");
  }
  c.set("authUser", user);
  await next();
};

const requireAdmin: MiddlewareHandler<{ Variables: { authUser: User } }> = async (
  c,
  next,
) => {
  const user = c.get("authUser");
  if (!user || user.role !== "admin") return c.text("Forbidden", 403);
  await next();
};

const getApiKeyFromRequest = (c: any): string | null => {
  const x = c.req.header("x-api-key");
  if (x) return x.trim();
  const auth = c.req.header("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m?.[1]) return null;
  return m[1].trim();
};

const requireApiKey: MiddlewareHandler<{ Variables: { authUser: User } }> = async (
  c,
  next,
) => {
  const apiKey = getApiKeyFromRequest(c);
  if (!apiKey) return c.json({ error: "missing_api_key" }, 401);
  const user = await getUserByApiKey(apiKey);
  if (!user) return c.json({ error: "invalid_api_key" }, 401);
  const maintenance = await getMaintenanceMode();
  if (maintenance && user.role !== "admin") {
    return c.json({ error: "maintenance_mode" }, 403);
  }
  c.set("authUser", user);
  await next();
};

const isSessionAllowedForUser = async (user: User, sessionId: string) => {
  if (user.role === "admin") return true;
  const result = await ormDb
    .select()
    .from(waSessions)
    .where(and(eq(waSessions.userId, user.id), eq(waSessions.sessionId, sessionId)))
    .limit(1);
  return result.length > 0;
};

const md5Hex = (value: string) =>
  crypto.createHash("md5").update(value.trim().toLowerCase()).digest("hex");

const getGravatarUrl = (key: string, size = 96) =>
  `https://www.gravatar.com/avatar/${md5Hex(key)}?s=${size}&d=identicon&r=g`;

const getAvatarUrl = (user: User) => {
  if (user.profilePhotoUrl) return user.profilePhotoUrl;
  const key = user.email?.trim() ? user.email : user.username;
  return getGravatarUrl(key ?? user.username);
};

const DEFAULT_APP_LOGO_URL = "/assets/uploads/honowa.png";

const getUiSettings = async () => {
  const [appName, appDescription, appLogoUrl] = await Promise.all([
    getAppName(),
    getAppDescription(),
    getAppLogoUrl(),
  ]);
  const customLogoUrl = appLogoUrl?.trim() ? appLogoUrl : null;
  return {
    appName,
    appDescription,
    appLogoUrl: customLogoUrl ?? DEFAULT_APP_LOGO_URL,
    appLogoIsDefault: !customLogoUrl,
  };
};

const saveUploadedFile = async (
  file: any,
  prefix: string,
): Promise<string | null> => {
  if (!file) return null;
  if (typeof file.arrayBuffer !== "function") return null;
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return null;
  if (buf.length > 2_500_000) return null;

  const contentType = String(file.type ?? "");
  const ext = (() => {
    if (contentType === "image/png") return "png";
    if (contentType === "image/jpeg") return "jpg";
    if (contentType === "image/webp") return "webp";
    if (contentType === "image/svg+xml") return "svg";
    if (contentType === "image/x-icon" || contentType === "image/vnd.microsoft.icon")
      return "ico";
    const name = String(file.name ?? "");
    const m = name.match(/\.([a-zA-Z0-9]+)$/);
    if (m?.[1]) return m[1].toLowerCase();
    return "png";
  })();

  const dir = path.resolve("public/assets/uploads");
  await fs.mkdir(dir, { recursive: true });
  const filename = `${prefix}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const abs = path.join(dir, filename);
  await fs.writeFile(abs, buf);
  return `/assets/uploads/${filename}`;
};

type LoadedMedia = {
  mimetype: string;
  dataB64: string;
  filename: string;
  size: number;
  source: { kind: "url"; url: string } | { kind: "upload"; name: string | null };
  isAudio: boolean;
};

const isHttpUrl = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const filenameFromUrl = (value: string) => {
  try {
    const u = new URL(value);
    const last = u.pathname.split("/").filter(Boolean).pop();
    const raw = last ? decodeURIComponent(last) : "file";
    const safe = raw.replace(/[\u0000-\u001f<>:"/\\|?*\u007f]/g, "_").trim();
    return safe.length > 0 ? safe.slice(0, 120) : "file";
  } catch {
    return "file";
  }
};

const loadMediaFromUrl = async (url: string, maxBytes: number): Promise<LoadedMedia> => {
  if (!isHttpUrl(url)) throw new Error("invalid_media_url");
  const res = await fetch(url, { redirect: "follow" as any });
  if (!res.ok) throw new Error(`media_fetch_failed:${res.status}`);
  const len = Number(res.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > 0 && len > maxBytes) throw new Error("media_too_large");
  const contentType = String(res.headers.get("content-type") ?? "application/octet-stream")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const filename = filenameFromUrl(url);

  let buf: Buffer;
  if ((Readable as any).fromWeb && res.body) {
    const chunks: Buffer[] = [];
    let total = 0;
    const stream = Readable.fromWeb(res.body as any);
    for await (const chunk of stream) {
      const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += b.length;
      if (total > maxBytes) throw new Error("media_too_large");
      chunks.push(b);
    }
    buf = Buffer.concat(chunks);
  } else {
    buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error("media_too_large");
  }

  return {
    mimetype: contentType || "application/octet-stream",
    dataB64: buf.toString("base64"),
    filename,
    size: buf.length,
    source: { kind: "url", url },
    isAudio: (contentType || "").startsWith("audio/"),
  };
};

const loadMediaFromUpload = async (file: any, maxBytes: number): Promise<LoadedMedia> => {
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("missing_media_file");
  const size = Number(file.size ?? 0);
  if (Number.isFinite(size) && size > maxBytes) throw new Error("media_too_large");
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) throw new Error("empty_media_file");
  if (buf.length > maxBytes) throw new Error("media_too_large");

  const contentType = String(file.type ?? "application/octet-stream")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const name = String(file.name ?? "").trim();
  const filename = name.length > 0 ? name.slice(0, 120) : "file";

  return {
    mimetype: contentType || "application/octet-stream",
    dataB64: buf.toString("base64"),
    filename,
    size: buf.length,
    source: { kind: "upload", name: name || null },
    isAudio: (contentType || "").startsWith("audio/"),
  };
};

const resolveMediaInput = async (input: {
  mediaUrl?: string;
  mediaFile?: any;
  maxBytes: number;
}): Promise<LoadedMedia | null> => {
  const url = String(input.mediaUrl ?? "").trim();
  if (url) return await loadMediaFromUrl(url, input.maxBytes);
  const file = input.mediaFile;
  const hasFile =
    file &&
    typeof file.arrayBuffer === "function" &&
    Number((file as any).size ?? 0) > 0;
  if (hasFile) return await loadMediaFromUpload(file, input.maxBytes);
  return null;
};

const withToast = (url: string, message: string, type: "success" | "error" | "info" = "info") => {
  const sep = url.includes("?") ? "&" : "?";
  return (
    url +
    sep +
    "toast=" +
    encodeURIComponent(message) +
    "&toastType=" +
    encodeURIComponent(type)
  );
};

const UNSEND_WINDOW_MS = 48 * 60 * 60 * 1000;
const HISTORY_ACTION_TYPES = new Set(["message", "broadcast", "status"]);
type HistoryActionType = "message" | "broadcast" | "status";

const toHistoryActionType = (value: string): HistoryActionType => {
  if (!HISTORY_ACTION_TYPES.has(value)) return "message";
  return value as HistoryActionType;
};

const historyBasePath = (actionType: HistoryActionType) => {
  if (actionType === "broadcast") return "/admin/broadcast";
  if (actionType === "status") return "/admin/status";
  return "/admin/message";
};

const historyPathWithSession = (actionType: HistoryActionType, sessionId?: string) => {
  const base = historyBasePath(actionType);
  const sid = String(sessionId ?? "").trim();
  if (!sid) return base;
  return `${base}?sessionId=${encodeURIComponent(sid)}`;
};

const collectMessageIds = (payload: any): string[] => {
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

const isWithinUnsendWindow = (createdAtIso?: string | null) => {
  const ts = Date.parse(String(createdAtIso ?? ""));
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= UNSEND_WINDOW_MS;
};

const unsendByMessageIds = async (sessionId: string, messageIds: string[]) => {
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

const jsonToCsv = (rows: Record<string, any>[]) => {
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

router.get("/login", async (c) => {
  try {
    await ensureSchema();
    await ensureDefaultSettings();
    await ensureDefaultAdmin();
  } catch (err) {
    return c.html(
      <LoginPage
        appName="HonoWA"
        appDescription="Kelola sesi WhatsApp, broadcast, dan status dengan kontrol akses pengguna."
        maintenance={false}
          error="Database belum tersambung. Pastikan DATABASE_URL atau PGHOST/PGDATABASE/PGUSER/PGPASSWORD benar, dan Postgres sedang berjalan."
      />,
      500,
    );
  }

  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const maintenance = await getMaintenanceMode();
  const user = await getAuthUser(c);
  if (user) return c.redirect("/admin");
  return c.html(
    <LoginPage
      appName={appName}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      maintenance={maintenance}
    />,
  );
});

router.post("/login", async (c) => {
  try {
    await ensureSchema();
    await ensureDefaultSettings();
    await ensureDefaultAdmin();
  } catch (err) {
    return c.html(
      <LoginPage
        appName="HonoWA"
        appDescription="Kelola sesi WhatsApp, broadcast, dan status dengan kontrol akses pengguna."
        maintenance={false}
        error="Database belum tersambung. Pastikan DATABASE_URL atau PGHOST/PGDATABASE/PGUSER/PGPASSWORD benar, dan Postgres sedang berjalan."
      />,
      500,
    );
  }

  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const maintenance = await getMaintenanceMode();
  const body = await c.req.parseBody();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  const user = await getUserByUsername(username);
  if (!user) {
    return c.html(
      <LoginPage
        appName={appName}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        maintenance={maintenance}
        error="Login gagal"
      />,
      401,
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return c.html(
      <LoginPage
        appName={appName}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        maintenance={maintenance}
        error="Login gagal"
      />,
      401,
    );
  }

  if (maintenance && user.role !== "admin") {
    return c.html(
      <LoginPage
        appName={appName}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        maintenance={maintenance}
        error="Maintenance aktif. Hanya admin yang bisa login."
      />,
      403,
    );
  }

  const sid = await createAuthSession(user.id);
  setCookie(c, "sid", sid, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return c.redirect(withToast("/admin", "Login berhasil", "success"));
});

router.post("/logout", async (c) => {
  const sid = getCookie(c, "sid");
  if (sid) await deleteAuthSession(sid);
  deleteCookie(c, "sid");
  return c.redirect(withToast("/login", "Logout berhasil", "info"));
});

router.get("/ui/scanqr/:sessionId", (c) =>
  c.redirect(`/session/qr/${c.req.param("sessionId")}`),
);

router.get("/admin", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const users = user.role === "admin" ? await listUsers() : [];
  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  // Runtime count should only include sessions that exist in app DB list
  // so dashboard does not show stale in-memory/restored sessions.
  const allowedSessionIds = new Set((waSessions as any[]).map((s) => s.sessionId));
  const runtimeCount = Array.from(sessions.keys()).filter((sid) =>
    allowedSessionIds.has(sid),
  ).length;
  return c.html(
    <DashboardPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      role={user.role}
      totalUsers={user.role === "admin" ? users.length : 1}
      totalWaSessions={waSessions.length}
      runtimeSessions={runtimeCount}
    />,
  );
});

router.get("/admin/help", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  return c.html(
    <HelpPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
    />,
  );
});

router.get("/admin/api-docs", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const flashApiKey = getCookie(c, "flash_api_key");
  if (flashApiKey) deleteCookie(c, "flash_api_key", { path: "/admin/api-docs" });
  return c.html(
    <ApiDocsPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      apiKeyLast4={user.apiKeyLast4 ?? null}
      apiKeyCreatedAt={user.apiKeyCreatedAt ?? null}
      newApiKey={flashApiKey ?? null}
    />,
  );
});

router.post("/admin/api-docs/api-key/rotate", requireAuth, async (c) => {
  const user = c.get("authUser");
  const newApiKey = await rotateApiKeyForUser(user.id);
  setCookie(c, "flash_api_key", newApiKey, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin/api-docs",
    maxAge: 60,
  });
  return c.redirect(withToast("/admin/api-docs", "API Key berhasil digenerate ulang", "success"));
});

router.get("/admin/users", requireAuth, requireAdmin, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const users = await listUsers();
  return c.html(
    <UsersListPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      users={users}
    />,
  );
});

router.get("/admin/users/new", requireAuth, requireAdmin, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  return c.html(
    <UserFormPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      mode="new"
    />,
  );
});

router.post("/admin/users/new", requireAuth, requireAdmin, async (c) => {
  const admin = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(admin);
  const body = await c.req.parseBody();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const role = (String(body.role ?? "user") === "admin" ? "admin" : "user") as
    | "admin"
    | "user";
  const maxDevices = Math.max(1, Number(body.maxDevices ?? 1));

  if (!username || !password) {
    return c.html(
      <UserFormPage
        appName={appName}
        username={admin.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        mode="new"
        alert="Username dan password wajib diisi"
      />,
      400,
    );
  }

  try {
    await createUser({ username, password, role, maxDevices });
    return c.redirect(withToast("/admin/users", "User berhasil dibuat", "success"));
  } catch {
    return c.html(
      <UserFormPage
        appName={appName}
        username={admin.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        mode="new"
        alert="Gagal membuat user (username mungkin sudah dipakai)"
      />,
      400,
    );
  }
});

router.get("/admin/users/:id/edit", requireAuth, requireAdmin, async (c) => {
  const admin = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(admin);
  const id = c.req.param("id");
  const user = await getUserById(id);
  if (!user) return c.notFound();
  return c.html(
    <UserFormPage
      appName={appName}
      username={admin.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      mode="edit"
      user={user}
    />,
  );
});

router.post("/admin/users/:id/edit", requireAuth, requireAdmin, async (c) => {
  const admin = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(admin);
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const role = (String(body.role ?? "user") === "admin" ? "admin" : "user") as
    | "admin"
    | "user";
  const maxDevices = Math.max(1, Number(body.maxDevices ?? 1));

  if (!username) {
    return c.html(
      <UserFormPage
        appName={appName}
        username={admin.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        mode="edit"
        user={{ id, username, role, maxDevices, createdAt: new Date().toISOString() }}
        alert="Username wajib diisi"
      />,
      400,
    );
  }

  await updateUser(id, { username, role, maxDevices, password: password || undefined });
  return c.redirect(withToast("/admin/users", "User berhasil diperbarui", "success"));
});

router.post("/admin/users/:id/delete", requireAuth, requireAdmin, async (c) => {
  const id = c.req.param("id");
  await deleteUser(id);
  return c.redirect(withToast("/admin/users", "User berhasil dihapus", "success"));
});

router.get("/admin/settings", requireAuth, requireAdmin, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl, appLogoIsDefault } =
    await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const maintenance = await getMaintenanceMode();
  const mediaMaxMb = await getMediaMaxMb();
  return c.html(
    <SettingsPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      logoIsDefault={appLogoIsDefault}
      avatarUrl={avatarUrl}
      maintenance={maintenance}
      mediaMaxMb={mediaMaxMb}
    />,
  );
});

router.post("/admin/settings", requireAuth, requireAdmin, async (c) => {
  const user = c.get("authUser");
  const body = await c.req.parseBody();
  const appName = String(body.appName ?? "HonoWA").trim() || "HonoWA";
  const maintenance = String(body.maintenance ?? "") === "on" || String(body.maintenance) === "true";
  const appDescription = String(body.appDescription ?? "").trim();
  const mediaMaxMbRaw = String((body as any).mediaMaxMb ?? "").trim();
  const mediaMaxMb = mediaMaxMbRaw ? Number(mediaMaxMbRaw) : 10;
  const logoFile = (body as any).logo;

  const hasLogoUpload =
    logoFile &&
    typeof logoFile.arrayBuffer === "function" &&
    Number((logoFile as any).size ?? 0) > 0;

  const logoUrl = hasLogoUpload
    ? await saveUploadedFile(logoFile, "app-logo")
    : null;

  if (hasLogoUpload && !logoUrl) {
    const ui = await getUiSettings();
    return c.html(
      <SettingsPage
        appName={ui.appName}
        username={user.username}
        appDescription={ui.appDescription}
        logoUrl={ui.appLogoUrl}
        logoIsDefault={ui.appLogoIsDefault}
        avatarUrl={getAvatarUrl(user)}
        maintenance={await getMaintenanceMode()}
        mediaMaxMb={Number.isFinite(mediaMaxMb) ? mediaMaxMb : 10}
        alert="Gagal upload logo (format tidak didukung atau ukuran terlalu besar)."
      />,
      400,
    );
  }
  await setAppName(appName);
  await setAppDescription(appDescription);
  await setMaintenanceMode(maintenance);
  await setMediaMaxMb(mediaMaxMb);
  if (logoUrl) await setAppLogoUrl(logoUrl);
  return c.redirect(withToast("/admin/settings", "Pengaturan disimpan", "success"));
});

router.get("/admin/profile", requireAuth, async (c) => {
  const user = c.get("authUser");
  const ui = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const gravatarUrl = getGravatarUrl(user.email?.trim() ? user.email : user.username, 96);
  return c.html(
    <ProfilePage
      appName={ui.appName}
      username={user.username}
      appDescription={ui.appDescription}
      logoUrl={ui.appLogoUrl}
      avatarUrl={avatarUrl}
      gravatarUrl={gravatarUrl}
      profilePhotoUrl={user.profilePhotoUrl ?? null}
      email={user.email ?? ""}
    />,
  );
});

router.post("/admin/profile", requireAuth, async (c) => {
  const user = c.get("authUser");
  const ui = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const gravatarUrl = getGravatarUrl(user.email?.trim() ? user.email : user.username, 96);

  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim();
  const currentPassword = String((body as any).currentPassword ?? "");
  const newPassword = String((body as any).newPassword ?? "");
  const newPassword2 = String((body as any).newPassword2 ?? "");
  const photoFile = (body as any).photo;

  const photoUrl = await saveUploadedFile(photoFile, `user-${user.id}`);
  if (photoFile && !photoUrl) {
    return c.html(
      <ProfilePage
        appName={ui.appName}
        username={user.username}
        appDescription={ui.appDescription}
        logoUrl={ui.appLogoUrl}
        avatarUrl={avatarUrl}
        gravatarUrl={gravatarUrl}
        profilePhotoUrl={user.profilePhotoUrl ?? null}
        email={user.email ?? ""}
        alert="Gagal upload foto (format tidak didukung atau ukuran terlalu besar)."
      />,
      400,
    );
  }

  if (email !== (user.email ?? "")) {
    await updateUserEmail(user.id, email || null);
  }

  if (photoUrl) {
    await updateUserProfilePhotoUrl(user.id, photoUrl);
  }

  const wantsPasswordChange = Boolean(currentPassword || newPassword || newPassword2);
  if (wantsPasswordChange) {
    if (!currentPassword || !newPassword || !newPassword2) {
      return c.html(
        <ProfilePage
          appName={ui.appName}
          username={user.username}
          appDescription={ui.appDescription}
          logoUrl={ui.appLogoUrl}
          avatarUrl={photoUrl ?? avatarUrl}
          gravatarUrl={gravatarUrl}
          profilePhotoUrl={photoUrl ?? (user.profilePhotoUrl ?? null)}
          email={email || user.email || ""}
          alert="Isi password saat ini dan password baru (2x)."
        />,
        400,
      );
    }
    if (newPassword.length < 6) {
      return c.html(
        <ProfilePage
          appName={ui.appName}
          username={user.username}
          appDescription={ui.appDescription}
          logoUrl={ui.appLogoUrl}
          avatarUrl={photoUrl ?? avatarUrl}
          gravatarUrl={gravatarUrl}
          profilePhotoUrl={photoUrl ?? (user.profilePhotoUrl ?? null)}
          email={email || user.email || ""}
          alert="Password baru minimal 6 karakter."
        />,
        400,
      );
    }
    if (newPassword !== newPassword2) {
      return c.html(
        <ProfilePage
          appName={ui.appName}
          username={user.username}
          appDescription={ui.appDescription}
          logoUrl={ui.appLogoUrl}
          avatarUrl={photoUrl ?? avatarUrl}
          gravatarUrl={gravatarUrl}
          profilePhotoUrl={photoUrl ?? (user.profilePhotoUrl ?? null)}
          email={email || user.email || ""}
          alert="Konfirmasi password baru tidak sama."
        />,
        400,
      );
    }
    const full = await getUserByUsername(user.username);
    if (!full) return c.redirect("/logout");
    const ok = await verifyPassword(currentPassword, full.passwordHash);
    if (!ok) {
      return c.html(
        <ProfilePage
          appName={ui.appName}
          username={user.username}
          appDescription={ui.appDescription}
          logoUrl={ui.appLogoUrl}
          avatarUrl={photoUrl ?? avatarUrl}
          gravatarUrl={gravatarUrl}
          profilePhotoUrl={photoUrl ?? (user.profilePhotoUrl ?? null)}
          email={email || user.email || ""}
          alert="Password saat ini salah."
        />,
        400,
      );
    }
    await updateUserPassword(user.id, newPassword);
  }

  return c.redirect(withToast("/admin/profile", "Profil diperbarui", "success"));
});

router.get("/admin/sessions", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  const runtimeIds = Array.from(sessions.keys());
  const openQrSessionId = c.req.query("openQr") ?? undefined;
  return c.html(
    <SessionsPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      role={user.role}
      userId={user.id}
      maxDevices={user.maxDevices}
      waSessions={waSessions as any}
      runtimeSessionIds={runtimeIds}
      openQrSessionId={openQrSessionId}
    />,
  );
});

router.post("/admin/sessions/new", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const body = await c.req.parseBody();
  const sessionId = String(body.sessionId ?? "").trim();

  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  const runtimeIds = Array.from(sessions.keys());

  if (!sessionId) {
    return c.html(
      <SessionsPage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        role={user.role}
        userId={user.id}
        maxDevices={user.maxDevices}
        waSessions={waSessions as any}
        runtimeSessionIds={runtimeIds}
        alert="Session ID wajib diisi"
      />,
      400,
    );
  }

  if (user.role !== "admin" && waSessions.length >= user.maxDevices) {
    return c.html(
      <SessionsPage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        role={user.role}
        userId={user.id}
        maxDevices={user.maxDevices}
        waSessions={waSessions as any}
        runtimeSessionIds={runtimeIds}
        alert="Limit device sudah tercapai"
      />,
      403,
    );
  }

  try {
    await createWaSessionForUser(user.id, sessionId);
  } catch {
    return c.html(
      <SessionsPage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        role={user.role}
        userId={user.id}
        maxDevices={user.maxDevices}
        waSessions={waSessions as any}
        runtimeSessionIds={runtimeIds}
        alert="Gagal membuat session (sessionId mungkin sudah ada)"
      />,
      400,
    );
  }

  getOrCreateSession(sessionId);
  return c.redirect(
    withToast(
      `/admin/sessions?openQr=${encodeURIComponent(sessionId)}`,
      "Session berhasil dibuat. Silakan scan QR.",
      "success",
    ),
  );
});

router.post("/admin/sessions/webhook", requireAuth, async (c) => {
  const user = c.get("authUser");
  const body = await c.req.parseBody();
  const sessionId = String(body.sessionId ?? "").trim();
  const clear = String(body.clear ?? "").trim();
  const rawWebhookUrl =
    clear === "1" ? "" : String(body.webhookUrl ?? "").trim();

  if (!sessionId) {
    return c.redirect(withToast("/admin/sessions", "Session ID tidak valid", "error"));
  }

  const allowed = await isSessionAllowedForUser(user, sessionId);
  if (!allowed) {
    return c.redirect(withToast("/admin/sessions", "Session tidak valid untuk user ini", "error"));
  }

  let webhookUrl: string | null = null;
  if (rawWebhookUrl) {
    try {
      const u = new URL(rawWebhookUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return c.redirect(withToast("/admin/sessions", "Webhook harus http/https", "error"));
      }
      webhookUrl = u.toString();
    } catch {
      return c.redirect(withToast("/admin/sessions", "Format webhook URL tidak valid", "error"));
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
    return c.redirect(withToast("/admin/sessions", "Gagal menyimpan webhook", "error"));
  }

  invalidateWebhookCache(sessionId);
  return c.redirect(withToast("/admin/sessions", "Webhook tersimpan", "success"));
});

router.post("/admin/sessions/:sessionId/delete", requireAuth, async (c) => {
  const user = c.get("authUser");
  const sessionId = c.req.param("sessionId");
  const allowed = await isSessionAllowedForUser(user, sessionId);
  if (!allowed) {
    return c.redirect(withToast("/admin/sessions", "Session tidak valid untuk user ini", "error"));
  }

  try {
    const sessionData = sessions.get(sessionId);
    if (sessionData) {
      try {
        await sessionData.client.logout();
      } catch {}
      try {
        await sessionData.client.destroy();
      } catch {}
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

    return c.redirect(withToast("/admin/sessions", "Session berhasil dihapus", "success"));
  } catch {
    try {
      sessions.delete(sessionId);
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
    } catch {}
    return c.redirect(withToast("/admin/sessions", "Gagal menghapus session", "error"));
  }
});

router.get("/admin/session-qr/:sessionId", requireAuth, async (c) => {
  const user = c.get("authUser");
  const sessionId = c.req.param("sessionId");
  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  const allowed =
    user.role === "admin" || (waSessions as any).some((s: any) => s.sessionId === sessionId);

  if (!allowed) {
    return c.json({ error: "Session tidak valid untuk user ini" }, 403);
  }

  const sessionData = getOrCreateSession(sessionId);
  if (sessionData.status === SESSION_STATUS.READY) {
    return c.json({ status: "ready", sessionId });
  }

  let qrData = sessionData.qr ?? null;
  if (!qrData) {
    qrData = await new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 25_000);
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
    return c.json({ status: "ready", sessionId });
  }

  if (!qrData) {
    return c.json(
      { status: "pending", sessionId, message: "QR belum siap, tunggu sebentar..." },
      202,
    );
  }

  const qrImageUrl = await QRCode.toDataURL(qrData, {
    width: 320,
    margin: 2,
    color: { dark: "#111b21", light: "#ffffff" },
  });

  return c.json({ status: "qr", sessionId, qrImageUrl });
});

router.get("/admin/message", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const mediaMaxMb = await getMediaMaxMb();
  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  const selectedSessionId = c.req.query("sessionId") ?? undefined;
  const history = await listActionLogs({
    authUser: user,
    actionType: "message",
    sessionId: selectedSessionId,
    limit: 25,
  });
  return c.html(
    <MessagePage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      waSessions={waSessions as any}
      selectedSessionId={selectedSessionId}
      mediaMaxMb={mediaMaxMb}
      history={history as any}
    />,
  );
});

router.post("/admin/message/send", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const body = await c.req.parseBody();
  const sessionId = String(body.sessionId ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const message = String(body.message ?? "").trim();
  const mediaUrl = String((body as any).mediaUrl ?? "").trim();
  const mediaFile = (body as any).media;
  const mediaMaxMb = await getMediaMaxMb();
  const maxBytes = Math.floor(mediaMaxMb * 1024 * 1024);
  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  let loadedMedia: LoadedMedia | null = null;
  try {
    loadedMedia = await resolveMediaInput({ mediaUrl, mediaFile, maxBytes });
  } catch (err: any) {
    const history = await listActionLogs({
      authUser: user,
      actionType: "message",
      sessionId,
      limit: 25,
    });
    return c.html(
      <MessagePage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        mediaMaxMb={mediaMaxMb}
        history={history as any}
        alert={
          err?.message === "media_too_large"
            ? `Media terlalu besar. Maksimal ${mediaMaxMb}MB.`
            : "Gagal memuat media. Pastikan URL/file valid."
        }
      />,
      400,
    );
  }

  const allowed =
    user.role === "admin" || (waSessions as any).some((s: any) => s.sessionId === sessionId);
  if (!allowed) {
    return c.html(
      <MessagePage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        mediaMaxMb={mediaMaxMb}
        alert="Session tidak valid untuk user ini"
      />,
      403,
    );
  }

  if (!message && !loadedMedia) {
    const history = await listActionLogs({
      authUser: user,
      actionType: "message",
      sessionId,
      limit: 25,
    });
    return c.html(
      <MessagePage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        mediaMaxMb={mediaMaxMb}
        history={history as any}
        alert='Isi "message" atau kirim media (URL/upload).'
      />,
      400,
    );
  }

  try {
    const sessionData = sessions.get(sessionId) ?? getOrCreateSession(sessionId);
    if (sessionData.status !== SESSION_STATUS.READY) {
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "message",
          payload: {
            phone,
            message: message || null,
            media:
              loadedMedia
                ? {
                    source: loadedMedia.source,
                    filename: loadedMedia.filename,
                    mimetype: loadedMedia.mimetype,
                    size: loadedMedia.size,
                  }
                : null,
          },
          success: false,
          error: `not_ready:${sessionData.status}`,
        });
      } catch {}
      const history = await listActionLogs({
        authUser: user,
        actionType: "message",
        sessionId,
        limit: 25,
      });
      return c.html(
        <MessagePage
          appName={appName}
          username={user.username}
          appDescription={appDescription}
          logoUrl={appLogoUrl}
          avatarUrl={avatarUrl}
          waSessions={waSessions as any}
          selectedSessionId={sessionId}
          mediaMaxMb={mediaMaxMb}
          history={history as any}
          alert={`Sesi belum siap. Status: ${sessionData.status}`}
        />,
        400,
      );
    }
    const chatId = `${formatPhone(phone)}@c.us`;
    const sentMessageIds: string[] = [];
    if (loadedMedia) {
      const media = new MessageMedia(
        loadedMedia.mimetype,
        loadedMedia.dataB64,
        loadedMedia.filename,
      );
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
        userId: user.id,
        sessionId,
        actionType: "message",
        payload: {
          phone,
          message: message || null,
          media:
            loadedMedia
              ? {
                  source: loadedMedia.source,
                  filename: loadedMedia.filename,
                  mimetype: loadedMedia.mimetype,
                  size: loadedMedia.size,
                }
              : null,
          sentMessageIds,
        },
        success: true,
      });
    } catch {}
    return c.redirect(
      withToast(
        `/admin/message?sessionId=${encodeURIComponent(sessionId)}`,
        "Pesan berhasil dikirim",
        "success",
      ),
    );
  } catch (err: any) {
    try {
      await createActionLog({
        userId: user.id,
        sessionId,
        actionType: "message",
        payload: {
          phone,
          message: message || null,
          media:
            loadedMedia
              ? {
                  source: loadedMedia.source,
                  filename: loadedMedia.filename,
                  mimetype: loadedMedia.mimetype,
                  size: loadedMedia.size,
                }
              : null,
        },
        success: false,
        error: err?.message ?? String(err),
      });
    } catch {}
    const history = await listActionLogs({
      authUser: user,
      actionType: "message",
      sessionId,
      limit: 25,
    });
    return c.html(
      <MessagePage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        mediaMaxMb={mediaMaxMb}
        history={history as any}
        alert={err?.message ?? "Gagal mengirim pesan"}
      />,
      500,
    );
  }
});

router.get("/admin/broadcast", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const mediaMaxMb = await getMediaMaxMb();
  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  const selectedSessionId = c.req.query("sessionId") ?? undefined;
  const history = await listActionLogs({
    authUser: user,
    actionType: "broadcast",
    sessionId: selectedSessionId,
    limit: 25,
  });
  return c.html(
    <BroadcastPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      waSessions={waSessions as any}
      selectedSessionId={selectedSessionId}
      mediaMaxMb={mediaMaxMb}
      history={history as any}
    />,
  );
});

router.post("/admin/broadcast/send", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const body = await c.req.parseBody();
  const sessionId = String(body.sessionId ?? "").trim();
  const phonesRaw = String(body.phones ?? "");
  const message = String(body.message ?? "").trim();
  const mediaUrl = String((body as any).mediaUrl ?? "").trim();
  const mediaFile = (body as any).media;
  const delaySecRaw = String(body.delaySec ?? "5").trim();
  const delaySec = Math.max(5, Number(delaySecRaw || "5"));
  const delayMs = Math.floor(delaySec * 1000);
  const mediaMaxMb = await getMediaMaxMb();
  const maxBytes = Math.floor(mediaMaxMb * 1024 * 1024);

  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  let loadedMedia: LoadedMedia | null = null;
  try {
    loadedMedia = await resolveMediaInput({ mediaUrl, mediaFile, maxBytes });
  } catch (err: any) {
    const history = await listActionLogs({
      authUser: user,
      actionType: "broadcast",
      sessionId,
      limit: 25,
    });
    return c.html(
      <BroadcastPage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        mediaMaxMb={mediaMaxMb}
        history={history as any}
        alert={
          err?.message === "media_too_large"
            ? `Media terlalu besar. Maksimal ${mediaMaxMb}MB.`
            : "Gagal memuat media. Pastikan URL/file valid."
        }
      />,
      400,
    );
  }

  const allowed =
    user.role === "admin" || (waSessions as any).some((s: any) => s.sessionId === sessionId);
  if (!allowed) {
    const history = await listActionLogs({
      authUser: user,
      actionType: "broadcast",
      sessionId,
      limit: 25,
    });
    return c.html(
      <BroadcastPage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        mediaMaxMb={mediaMaxMb}
        history={history as any}
        alert="Session tidak valid untuk user ini"
      />,
      403,
    );
  }

  const phones = phonesRaw
    .split(/[\n,]/g)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!phones.length) {
    const history = await listActionLogs({
      authUser: user,
      actionType: "broadcast",
      sessionId,
      limit: 25,
    });
    return c.html(
      <BroadcastPage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        mediaMaxMb={mediaMaxMb}
        history={history as any}
        alert="Field phones wajib diisi"
      />,
      400,
    );
  }
  if (!message && !loadedMedia) {
    const history = await listActionLogs({
      authUser: user,
      actionType: "broadcast",
      sessionId,
      limit: 25,
    });
    return c.html(
      <BroadcastPage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        mediaMaxMb={mediaMaxMb}
        history={history as any}
        alert='Isi "message" atau kirim media (URL/upload).'
      />,
      400,
    );
  }

  getOrCreateSession(sessionId);
  await enqueueBroadcastJob({
    userId: user.id,
    sessionId,
    phones,
    message,
    media: loadedMedia,
    delayMs,
  });
  return c.redirect(
    withToast(
      `/admin/broadcast?sessionId=${encodeURIComponent(sessionId)}`,
      `Broadcast dijadwalkan (delay ${delaySec} detik/nomor)`,
      "success",
    ),
  );
});

router.get("/admin/status", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  const selectedSessionId = c.req.query("sessionId") ?? undefined;
  const history = await listActionLogs({
    authUser: user,
    actionType: "status",
    sessionId: selectedSessionId,
    limit: 25,
  });
  return c.html(
    <StatusPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      waSessions={waSessions as any}
      selectedSessionId={selectedSessionId}
      history={history as any}
    />,
  );
});

router.post("/admin/status/create", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const body = await c.req.parseBody();
  const sessionId = String(body.sessionId ?? "").trim();
  const text = String(body.text ?? "");
  const mediaUrl = String(body.mediaUrl ?? "").trim();

  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);

  const allowed =
    user.role === "admin" || (waSessions as any).some((s: any) => s.sessionId === sessionId);
  if (!allowed) {
    return c.html(
      <StatusPage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        alert="Session tidak valid untuk user ini"
      />,
      403,
    );
  }

  try {
    const sessionData = sessions.get(sessionId) ?? getOrCreateSession(sessionId);
    if (sessionData.status !== SESSION_STATUS.READY) {
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "status",
          payload: { text, mediaUrl: mediaUrl || null },
          success: false,
          error: `not_ready:${sessionData.status}`,
        });
      } catch {}
      const history = await listActionLogs({
        authUser: user,
        actionType: "status",
        sessionId,
        limit: 25,
      });
      return c.html(
        <StatusPage
          appName={appName}
          username={user.username}
          appDescription={appDescription}
          logoUrl={appLogoUrl}
          avatarUrl={avatarUrl}
          waSessions={waSessions as any}
          selectedSessionId={sessionId}
          history={history as any}
          alert={`Sesi belum siap. Status: ${sessionData.status}`}
        />,
        400,
      );
    }

    if (mediaUrl) {
      const media = await MessageMedia.fromUrl(mediaUrl);
      const sent: any = await sessionData.client.sendMessage("status@broadcast", media, {
        caption: text || "",
      });
      const sentMessageIds = [String(sent?.id?._serialized ?? "")].filter(Boolean);
      await createActionLog({
        userId: user.id,
        sessionId,
        actionType: "status",
        payload: { text, mediaUrl: mediaUrl || null, sentMessageIds },
        success: true,
      });
    } else {
      if (!text) {
        try {
          await createActionLog({
            userId: user.id,
            sessionId,
            actionType: "status",
            payload: { text, mediaUrl: null },
            success: false,
            error: "missing_text",
          });
        } catch {}
        const history = await listActionLogs({
          authUser: user,
          actionType: "status",
          sessionId,
          limit: 25,
        });
        return c.html(
          <StatusPage
            appName={appName}
            username={user.username}
            appDescription={appDescription}
            logoUrl={appLogoUrl}
            avatarUrl={avatarUrl}
            waSessions={waSessions as any}
            selectedSessionId={sessionId}
            history={history as any}
            alert='Field "text" wajib diisi jika tanpa media'
          />,
          400,
        );
      }
      const sent: any = await sessionData.client.sendMessage("status@broadcast", text);
      const sentMessageIds = [String(sent?.id?._serialized ?? "")].filter(Boolean);
      await createActionLog({
        userId: user.id,
        sessionId,
        actionType: "status",
        payload: { text, mediaUrl: null, sentMessageIds },
        success: true,
      });
    }
    return c.redirect(
      withToast(
        `/admin/status?sessionId=${encodeURIComponent(sessionId)}`,
        "Status berhasil dibuat",
        "success",
      ),
    );
  } catch (err: any) {
    try {
      await createActionLog({
        userId: user.id,
        sessionId,
        actionType: "status",
        payload: { text, mediaUrl: mediaUrl || null },
        success: false,
        error: err?.message ?? String(err),
      });
    } catch {}
    const history = await listActionLogs({
      authUser: user,
      actionType: "status",
      sessionId,
      limit: 25,
    });
    return c.html(
      <StatusPage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        history={history as any}
        alert={err?.message ?? "Gagal buat status"}
      />,
      500,
    );
  }
});

router.post("/admin/history/resend", requireAuth, async (c) => {
  const user = c.get("authUser");
  const body = await c.req.parseBody();
  const actionType = toHistoryActionType(String(body.actionType ?? "message"));
  const actionLogId = String(body.actionLogId ?? "").trim();
  const redirectTo = historyPathWithSession(actionType, String(body.sessionId ?? ""));
  if (!actionLogId) {
    return c.redirect(withToast(redirectTo, "Data history tidak valid", "error"));
  }
  const row = await getActionLogById(user, actionLogId);
  if (!row || row.actionType !== actionType) {
    return c.redirect(withToast(redirectTo, "History tidak ditemukan", "error"));
  }

  const sessionId = row.sessionId;
  const allowed = await isSessionAllowedForUser(user, sessionId);
  if (!allowed) return c.redirect(withToast(redirectTo, "Akses session ditolak", "error"));

  try {
    if (row.actionType === "message") {
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
        userId: user.id,
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
      return c.redirect(withToast(redirectTo, "Resend berhasil", "success"));
    }

    if (row.actionType === "broadcast") {
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
        userId: user.id,
        sessionId,
        phones,
        message,
        media,
        delayMs,
      });
      return c.redirect(withToast(redirectTo, "Resend broadcast dijadwalkan", "success"));
    }

    if (row.actionType === "status") {
      const text = String(row.payload?.text ?? "");
      const mediaUrl = String(row.payload?.mediaUrl ?? "").trim();
      if (!text && !mediaUrl) throw new Error("missing_text_or_media");
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
          userId: user.id,
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
          userId: user.id,
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
      return c.redirect(withToast(redirectTo, "Resend status berhasil", "success"));
    }
  } catch (err: any) {
    return c.redirect(withToast(redirectTo, err?.message ?? "Resend gagal", "error"));
  }
  return c.redirect(withToast(redirectTo, "Aksi tidak didukung", "error"));
});

router.post("/admin/history/unsend", requireAuth, async (c) => {
  const user = c.get("authUser");
  const body = await c.req.parseBody();
  const actionType = toHistoryActionType(String(body.actionType ?? "message"));
  const actionLogId = String(body.actionLogId ?? "").trim();
  const redirectTo = historyPathWithSession(actionType, String(body.sessionId ?? ""));
  if (!actionLogId) {
    return c.redirect(withToast(redirectTo, "Data history tidak valid", "error"));
  }
  const row = await getActionLogById(user, actionLogId);
  if (!row || row.actionType !== actionType) {
    return c.redirect(withToast(redirectTo, "History tidak ditemukan", "error"));
  }
  if (!isWithinUnsendWindow(row.createdAt)) {
    return c.redirect(withToast(redirectTo, "Batas waktu unsend sudah lewat", "error"));
  }
  const messageIds = collectMessageIds(row.payload);
  if (!messageIds.length) {
    return c.redirect(withToast(redirectTo, "Data messageId tidak tersedia", "error"));
  }
  try {
    const revoked = await unsendByMessageIds(row.sessionId, messageIds);
    await createActionLog({
      userId: user.id,
      sessionId: row.sessionId,
      actionType: row.actionType,
      payload: {
        unsendFrom: row.id,
        unsentCount: revoked,
        sourceMessageIds: messageIds,
      },
      success: true,
    });
    return c.redirect(withToast(redirectTo, `Unsend berhasil (${revoked})`, "success"));
  } catch (err: any) {
    return c.redirect(withToast(redirectTo, err?.message ?? "Unsend gagal", "error"));
  }
});

router.post("/admin/history/delete", requireAuth, async (c) => {
  const user = c.get("authUser");
  const body = await c.req.parseBody();
  const actionType = toHistoryActionType(String(body.actionType ?? "message"));
  const actionLogId = String(body.actionLogId ?? "").trim();
  const sessionId = String(body.sessionId ?? "").trim();
  const redirectTo = historyPathWithSession(actionType, sessionId);
  if (!actionLogId) {
    return c.redirect(withToast(redirectTo, "Data history tidak valid", "error"));
  }
  const count = await deleteActionLogsByIds({
    authUser: user,
    actionType,
    ids: [actionLogId],
    sessionId: sessionId || undefined,
  });
  return c.redirect(
    withToast(
      redirectTo,
      count > 0 ? "Riwayat berhasil dihapus" : "Riwayat tidak ditemukan",
      count > 0 ? "success" : "error",
    ),
  );
});

router.post("/admin/history/delete-selected", requireAuth, async (c) => {
  const user = c.get("authUser");
  const body = await c.req.parseBody();
  const actionType = toHistoryActionType(String(body.actionType ?? "message"));
  const sessionId = String(body.sessionId ?? "").trim();
  const redirectTo = historyPathWithSession(actionType, sessionId);
  const raw = body.selectedIds;
  const ids = Array.isArray(raw)
    ? raw.map((v) => String(v).trim()).filter(Boolean)
    : [String(raw ?? "").trim()].filter(Boolean);
  if (!ids.length) {
    return c.redirect(withToast(redirectTo, "Pilih minimal satu riwayat", "error"));
  }
  const count = await deleteActionLogsByIds({
    authUser: user,
    actionType,
    ids,
    sessionId: sessionId || undefined,
  });
  return c.redirect(
    withToast(redirectTo, `Berhasil hapus ${count} riwayat`, "success"),
  );
});

router.post("/admin/history/delete-all", requireAuth, async (c) => {
  const user = c.get("authUser");
  const body = await c.req.parseBody();
  const actionType = toHistoryActionType(String(body.actionType ?? "message"));
  const sessionId = String(body.sessionId ?? "").trim();
  const redirectTo = historyPathWithSession(actionType, sessionId);
  const count = await deleteAllActionLogs({
    authUser: user,
    actionType,
    sessionId: sessionId || undefined,
  });
  return c.redirect(
    withToast(redirectTo, `Berhasil hapus semua (${count})`, "success"),
  );
});

router.get("/admin/history/download.csv", requireAuth, async (c) => {
  const user = c.get("authUser");
  const actionType = toHistoryActionType(String(c.req.query("actionType") ?? "message"));
  const sessionId = String(c.req.query("sessionId") ?? "").trim();
  const logs = await listActionLogs({
    authUser: user,
    actionType,
    sessionId: sessionId || undefined,
    limit: 2000,
  });
  const rows = logs.map((h) => ({
    id: h.id,
    createdAt: h.createdAt,
    sessionId: h.sessionId,
    target: h.payload?.phone ?? h.payload?.groupId ?? (h.payload?.phones ?? []).join("|"),
    message: h.payload?.message ?? h.payload?.text ?? "",
    status: h.success ? "sent" : "failed",
    error: h.error ?? "",
  }));
  const csv = jsonToCsv(rows);
  const filename = `history-${actionType}-${sessionId || "all"}.csv`;
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  return c.body(csv);
});

router.get("/session/qr/:sessionId", requireAuth, async (c) => {
  const sessionId = c.req.param("sessionId");
  const sessionData = getOrCreateSession(sessionId);

  if (sessionData.status === SESSION_STATUS.READY) {
    return c.redirect(`/admin/sessions?sessionId=${encodeURIComponent(sessionId)}`);
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
    return c.redirect(`/admin/sessions?sessionId=${encodeURIComponent(sessionId)}`);
  }

  if (!qrData) {
    const ui = await getUiSettings();
    return c.html(
      <LoginPage
        appName={ui.appName}
        appDescription={ui.appDescription}
        logoUrl={ui.appLogoUrl}
        maintenance={await getMaintenanceMode()}
        error="QR belum siap. Coba refresh."
      />,
      408,
    );
  }

  const qrImageUrl = await QRCode.toDataURL(qrData, {
    width: 300,
    margin: 2,
    color: { dark: "#111b21", light: "#ffffff" },
  });

  return c.html(
    <html lang="id">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Scan QR</title>
      </head>
      <body>
        <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f9f9ff;padding:18px;">
          <div style="background:#fff;border:1px solid rgba(199,196,216,0.35);border-radius:18px;padding:18px;max-width:560px;width:100%;text-align:center;box-shadow:0 14px 36px rgba(17,24,39,0.06);">
            <div style="font-weight:900;font-size:18px;margin-bottom:10px;">Scan QR</div>
            <div style="border:3px solid #25d366;border-radius:16px;padding:14px;display:inline-block;">
              <img src={qrImageUrl} alt="QR" width="260" height="260" />
            </div>
            <div style="margin-top:14px;">
              <a href={`/session/qr/${encodeURIComponent(sessionId)}`}>Refresh</a>
            </div>
          </div>
        </div>
      </body>
    </html>,
  );
});

router.post("/session/pair/:sessionId", requireAuth, async (c) => {
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

router.get("/session/status/:sessionId", requireApiKey, async (c) => {
  const user = c.get("authUser");
  const sessionId = c.req.param("sessionId");
  const allowed = await isSessionAllowedForUser(user, sessionId);
  if (!allowed) return c.json({ error: "forbidden_session" }, 403);
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

router.get("/sessions", requireApiKey, async (c) => {
  const user = c.get("authUser");
  const allowedSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  const list = (allowedSessions as any[]).map((s) => {
    const sessionId = s.sessionId;
    const runtime = sessions.get(sessionId);
    return {
      sessionId,
      status: runtime?.status ?? "disconnected",
      exists: Boolean(runtime),
      readyAt: runtime?.readyAt ?? null,
    };
  });
  return c.json({ total: list.length, sessions: list });
});

router.post("/send/:sessionId", requireApiKey, async (c) => {
  try {
    const user = c.get("authUser");
    const sessionId = c.req.param("sessionId");
    const allowed = await isSessionAllowedForUser(user, sessionId);
    if (!allowed) return c.json({ error: "forbidden_session" }, 403);
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
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "message",
          payload: { phone: null, message: null },
          success: false,
          error: `not_ready:${sessionData.status}`,
        });
      } catch {}
      return c.json(
        { error: `Sesi belum siap. Status: ${sessionData.status}` },
        400,
      );
    }

    const contentType = String(c.req.header("content-type") ?? "").toLowerCase();
    const isJson = contentType.includes("application/json");
    const body = isJson ? await c.req.json() : await c.req.parseBody();
    const phone = String((body as any).phone ?? "").trim();
    const message = String((body as any).message ?? "").trim();
    const mediaUrl = String((body as any).mediaUrl ?? "").trim();
    const mediaFile = (body as any).media;
    const mediaMaxMb = await getMediaMaxMb();
    const maxBytes = Math.floor(mediaMaxMb * 1024 * 1024);
    const loadedMedia = await resolveMediaInput({ mediaUrl, mediaFile, maxBytes });

    if (!phone || (!message && !loadedMedia)) {
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "message",
          payload: {
            phone: phone || null,
            message: message || null,
            media:
              loadedMedia
                ? {
                    source: loadedMedia.source,
                    filename: loadedMedia.filename,
                    mimetype: loadedMedia.mimetype,
                    size: loadedMedia.size,
                  }
                : null,
          },
          success: false,
          error: "missing_fields",
        });
      } catch {}
      return c.json(
        { error: 'Field "phone" wajib diisi, dan isi "message" atau kirim media (mediaUrl/media)' },
        400,
      );
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
        const sent: any = await sessionData.client.sendMessage(chatId, media, { caption: message || "" });
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
        userId: user.id,
        sessionId,
        actionType: "message",
        payload: {
          phone,
          message: message || null,
          media:
            loadedMedia
              ? {
                  source: loadedMedia.source,
                  filename: loadedMedia.filename,
                  mimetype: loadedMedia.mimetype,
                  size: loadedMedia.size,
                }
              : null,
          sentMessageIds,
        },
        success: true,
      });
    } catch {}

    return c.json({
      success: true,
      message: `Pesan terkirim via sesi '${sessionId}'`,
    });
  } catch (error: any) {
    try {
      const sessionId = c.req.param("sessionId");
      const contentType = String(c.req.header("content-type") ?? "").toLowerCase();
      const isJson = contentType.includes("application/json");
      const body = isJson ? await c.req.json().catch(() => ({})) : await c.req.parseBody().catch(() => ({} as any));
      const user = c.get("authUser");
      const phone = String((body as any).phone ?? "").trim();
      const message = String((body as any).message ?? "").trim();
      const mediaUrl = String((body as any).mediaUrl ?? "").trim();
      await createActionLog({
        userId: user.id,
        sessionId,
        actionType: "message",
        payload: { phone: phone || null, message: message || null, mediaUrl: mediaUrl || null },
        success: false,
        error: error?.message ?? String(error),
      });
    } catch {}
    return c.json(
      { error: "Gagal mengirim pesan", details: error.toString() },
      500,
    );
  }
});

router.post("/send-group/:sessionId", requireApiKey, async (c) => {
  try {
    const user = c.get("authUser");
    const sessionId = c.req.param("sessionId");
    const allowed = await isSessionAllowedForUser(user, sessionId);
    if (!allowed) return c.json({ error: "forbidden_session" }, 403);
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
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "message",
          payload: { groupId: null, message: null },
          success: false,
          error: `not_ready:${sessionData.status}`,
        });
      } catch {}
      return c.json(
        { error: `Sesi belum siap. Status: ${sessionData.status}` },
        400,
      );
    }

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
      } catch {}
      return c.json({ error: 'Field "groupId" dan "message" wajib diisi' }, 400);
    }

    const sent: any = await sessionData.client.sendMessage(groupId, message);
    const sentMessageIds = [String(sent?.id?._serialized ?? "")].filter(Boolean);
    try {
      await createActionLog({
        userId: user.id,
        sessionId,
        actionType: "message",
        payload: { groupId, message, sentMessageIds },
        success: true,
      });
    } catch {}
    return c.json({ success: true, message: "Pesan ke grup berhasil dikirim" });
  } catch (error: any) {
    try {
      const sessionId = c.req.param("sessionId");
      const body = await c.req.json().catch(() => ({}));
      const user = c.get("authUser");
      await createActionLog({
        userId: user.id,
        sessionId,
        actionType: "message",
        payload: { groupId: (body as any).groupId ?? null, message: (body as any).message ?? null },
        success: false,
        error: error?.message ?? String(error),
      });
    } catch {}
    return c.json(
      { error: "Gagal kirim ke grup", details: error.toString() },
      500,
    );
  }
});

router.post("/status/:sessionId", requireApiKey, async (c) => {
  try {
    const user = c.get("authUser");
    const sessionId = c.req.param("sessionId");
    const allowed = await isSessionAllowedForUser(user, sessionId);
    if (!allowed) return c.json({ error: "forbidden_session" }, 403);
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
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "status",
          payload: { text: null, mediaUrl: null },
          success: false,
          error: `not_ready:${sessionData.status}`,
        });
      } catch {}
      return c.json(
        { error: `Sesi belum siap. Status: ${sessionData.status}` },
        400,
      );
    }

    const body = await c.req.json();
    const { text, mediaUrl } = body;

    if (mediaUrl) {
      const media = await MessageMedia.fromUrl(mediaUrl);
      const sent: any = await sessionData.client.sendMessage("status@broadcast", media, {
        caption: text || "",
      });
      const sentMessageIds = [String(sent?.id?._serialized ?? "")].filter(Boolean);
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "status",
          payload: { text: text ?? null, mediaUrl: mediaUrl ?? null, sentMessageIds },
          success: true,
        });
      } catch {}
    } else {
      if (!text) {
        try {
          await createActionLog({
            userId: user.id,
            sessionId,
            actionType: "status",
            payload: { text: null, mediaUrl: null },
            success: false,
            error: "missing_text",
          });
        } catch {}
        return c.json({ error: 'Field "text" wajib diisi jika tanpa media' }, 400);
      }
      const sent: any = await sessionData.client.sendMessage("status@broadcast", text);
      const sentMessageIds = [String(sent?.id?._serialized ?? "")].filter(Boolean);
      try {
        await createActionLog({
          userId: user.id,
          sessionId,
          actionType: "status",
          payload: { text: text ?? null, mediaUrl: null, sentMessageIds },
          success: true,
        });
      } catch {}
    }
    return c.json({
      success: true,
      message: `Status dibuat via sesi '${sessionId}'`,
    });
  } catch (error: any) {
    try {
      const sessionId = c.req.param("sessionId");
      const body = await c.req.json().catch(() => ({}));
      const user = c.get("authUser");
      await createActionLog({
        userId: user.id,
        sessionId,
        actionType: "status",
        payload: { text: (body as any).text ?? null, mediaUrl: (body as any).mediaUrl ?? null },
        success: false,
        error: error?.message ?? String(error),
      });
    } catch {}
    return c.json(
      { error: "Gagal buat status", details: error.toString() },
      500,
    );
  }
});

router.delete("/session/:sessionId", requireApiKey, async (c) => {
  const user = c.get("authUser");
  const sessionId = c.req.param("sessionId");
  const allowed = await isSessionAllowedForUser(user, sessionId);
  if (!allowed) return c.json({ error: "forbidden_session" }, 403);

  try {
    const sessionData = sessions.get(sessionId);

    if (!sessionData) {
      return c.json({ error: `Sesi '${sessionId}' tidak ditemukan di memori` }, 404);
    }

    await sessionData.client.logout();
    await sessionData.client.destroy();
    sessions.delete(sessionId);
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

    return c.json({
      success: true,
      message: `Sesi '${sessionId}' berhasil dihapus dan dilogout`,
    });
  } catch (error: any) {
    sessions.delete(sessionId);
    removeSessionFromFile(sessionId);
    return c.json(
      {
        error: "Gagal logout dengan bersih, tetapi sesi telah dihapus dari memori",
        details: error.toString(),
      },
      500,
    );
  }
});

router.post("/broadcast/:sessionId", requireApiKey, async (c) => {
  const user = c.get("authUser");
  const sessionId = c.req.param("sessionId");
  const allowed = await isSessionAllowedForUser(user, sessionId);
  if (!allowed) return c.json({ error: "forbidden_session" }, 403);
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
    try {
      await createActionLog({
        userId: user.id,
        sessionId,
        actionType: "broadcast",
        payload: { phones: [], message: null, delayMs: null },
        success: false,
        error: `not_ready:${sessionData.status}`,
      });
    } catch {}
    return c.json(
      { error: `Sesi belum siap. Status saat ini: ${sessionData.status}` },
      400,
    );
  }

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
    return c.json(
      {
        error:
          err?.message === "media_too_large"
            ? `Media terlalu besar. Maksimal ${mediaMaxMb}MB.`
            : "Gagal memuat media. Pastikan URL/file valid.",
      },
      400,
    );
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
    } catch {}
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
    } catch {}
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
    } catch {}
    return c.json({ error: "Maksimal 200 nomor per request broadcast" }, 400);
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

  const response = {
    success: true,
    sessionId,
    summary: { total: phones.length, sent: successCount, failed: failCount },
    results,
  };

  try {
    await createActionLog({
      userId: user.id,
      sessionId,
      actionType: "broadcast",
      payload: {
        phones,
        message: message || null,
        media:
          loadedMedia
            ? {
                source: loadedMedia.source,
                filename: loadedMedia.filename,
                mimetype: loadedMedia.mimetype,
                size: loadedMedia.size,
              }
            : null,
        delayMs,
        summary: response.summary,
        sentItems,
      },
      success: true,
    });
  } catch {}

  return c.json(response);
});
