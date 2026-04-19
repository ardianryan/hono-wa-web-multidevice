/** @jsxImportSource hono/jsx */
// ─────────────────────────────────────────────────────────────────────────────
// routes.tsx — Semua endpoint HTTP (Hono router)
// ─────────────────────────────────────────────────────────────────────────────

import { createRequire } from "module";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
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
import { sessions, getOrCreateSession, formatPhone } from "./session-manager.js";
import { removeSessionFromFile } from "./session-store.js";
import { SESSION_STATUS, type BroadcastResult } from "./types.js";
import {
  createAuthSession,
  createUser,
  createWaSessionForUser,
  deleteAuthSession,
  deleteUser,
  ensureDefaultAdmin,
  getAppDescription,
  getAppLogoUrl,
  getAppName,
  getMaintenanceMode,
  getUserById,
  getUserByApiKey,
  getUserBySessionId,
  getUserByUsername,
  listUsers,
  listWaSessionsAll,
  listWaSessionsForUser,
  rotateApiKeyForUser,
  setAppDescription,
  setAppLogoUrl,
  setAppName,
  setMaintenanceMode,
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

const getUiSettings = async () => {
  const [appName, appDescription, appLogoUrl] = await Promise.all([
    getAppName(),
    getAppDescription(),
    getAppLogoUrl(),
  ]);
  return {
    appName,
    appDescription,
    appLogoUrl: appLogoUrl ?? undefined,
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
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const maintenance = await getMaintenanceMode();
  return c.html(
    <SettingsPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      maintenance={maintenance}
    />,
  );
});

router.post("/admin/settings", requireAuth, requireAdmin, async (c) => {
  const user = c.get("authUser");
  const body = await c.req.parseBody();
  const appName = String(body.appName ?? "HonoWA").trim() || "HonoWA";
  const maintenance = String(body.maintenance ?? "") === "on" || String(body.maintenance) === "true";
  const appDescription = String(body.appDescription ?? "").trim();
  const logoFile = (body as any).logo;

  const logoUrl = await saveUploadedFile(logoFile, "app-logo");
  if (logoFile && !logoUrl) {
    const ui = await getUiSettings();
    return c.html(
      <SettingsPage
        appName={ui.appName}
        username={user.username}
        appDescription={ui.appDescription}
        logoUrl={ui.appLogoUrl}
        avatarUrl={getAvatarUrl(user)}
        maintenance={await getMaintenanceMode()}
        alert="Gagal upload logo (format tidak didukung atau ukuran terlalu besar)."
      />,
      400,
    );
  }
  await setAppName(appName);
  await setAppDescription(appDescription);
  await setMaintenanceMode(maintenance);
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
  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  const selectedSessionId = c.req.query("sessionId") ?? undefined;
  return c.html(
    <MessagePage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      waSessions={waSessions as any}
      selectedSessionId={selectedSessionId}
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
  const message = String(body.message ?? "");

  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);

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
        alert="Session tidak valid untuk user ini"
      />,
      403,
    );
  }

  try {
    const sessionData = sessions.get(sessionId) ?? getOrCreateSession(sessionId);
    if (sessionData.status !== SESSION_STATUS.READY) {
      return c.html(
        <MessagePage
          appName={appName}
          username={user.username}
          appDescription={appDescription}
          logoUrl={appLogoUrl}
          avatarUrl={avatarUrl}
          waSessions={waSessions as any}
          selectedSessionId={sessionId}
          alert={`Sesi belum siap. Status: ${sessionData.status}`}
        />,
        400,
      );
    }
    const chatId = `${formatPhone(phone)}@c.us`;
    await sessionData.client.sendMessage(chatId, message);
    return c.redirect(
      withToast(
        `/admin/message?sessionId=${encodeURIComponent(sessionId)}`,
        "Pesan berhasil dikirim",
        "success",
      ),
    );
  } catch (err: any) {
    return c.html(
      <MessagePage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
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
  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  const selectedSessionId = c.req.query("sessionId") ?? undefined;
  return c.html(
    <BroadcastPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      waSessions={waSessions as any}
      selectedSessionId={selectedSessionId}
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
  const message = String(body.message ?? "");
  const delayMs = Math.max(0, Number(body.delayMs ?? 2000));

  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);

  const allowed =
    user.role === "admin" || (waSessions as any).some((s: any) => s.sessionId === sessionId);
  if (!allowed) {
    return c.html(
      <BroadcastPage
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

  const phones = phonesRaw
    .split(/[\n,]/g)
    .map((p) => p.trim())
    .filter(Boolean);

  try {
    const sessionData = sessions.get(sessionId) ?? getOrCreateSession(sessionId);
    if (sessionData.status !== SESSION_STATUS.READY) {
      return c.html(
        <BroadcastPage
          appName={appName}
          username={user.username}
          appDescription={appDescription}
          logoUrl={appLogoUrl}
          avatarUrl={avatarUrl}
          waSessions={waSessions as any}
          selectedSessionId={sessionId}
          alert={`Sesi belum siap. Status: ${sessionData.status}`}
        />,
        400,
      );
    }

    for (let i = 0; i < phones.length; i++) {
      const raw = phones[i];
      const formatted = formatPhone(raw);
      const chatId = `${formatted}@c.us`;
      await sessionData.client.sendMessage(chatId, message);
      if (i < phones.length - 1 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return c.redirect(
      withToast(
        `/admin/broadcast?sessionId=${encodeURIComponent(sessionId)}`,
        "Broadcast berhasil dikirim",
        "success",
      ),
    );
  } catch (err: any) {
    return c.html(
      <BroadcastPage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        alert={err?.message ?? "Gagal broadcast"}
      />,
      500,
    );
  }
});

router.get("/admin/status", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);
  const waSessions =
    user.role === "admin" ? await listWaSessionsAll() : await listWaSessionsForUser(user.id);
  const selectedSessionId = c.req.query("sessionId") ?? undefined;
  return c.html(
    <StatusPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      waSessions={waSessions as any}
      selectedSessionId={selectedSessionId}
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
      return c.html(
        <StatusPage
          appName={appName}
          username={user.username}
          appDescription={appDescription}
          logoUrl={appLogoUrl}
          avatarUrl={avatarUrl}
          waSessions={waSessions as any}
          selectedSessionId={sessionId}
          alert={`Sesi belum siap. Status: ${sessionData.status}`}
        />,
        400,
      );
    }

    if (mediaUrl) {
      const media = await MessageMedia.fromUrl(mediaUrl);
      await sessionData.client.sendMessage("status@broadcast", media, {
        caption: text || "",
      });
    } else {
      if (!text) {
        return c.html(
          <StatusPage
            appName={appName}
            username={user.username}
            appDescription={appDescription}
            logoUrl={appLogoUrl}
            avatarUrl={avatarUrl}
            waSessions={waSessions as any}
            selectedSessionId={sessionId}
            alert='Field "text" wajib diisi jika tanpa media'
          />,
          400,
        );
      }
      await sessionData.client.sendMessage("status@broadcast", text);
    }

    return c.redirect(
      withToast(
        `/admin/status?sessionId=${encodeURIComponent(sessionId)}`,
        "Status berhasil dibuat",
        "success",
      ),
    );
  } catch (err: any) {
    return c.html(
      <StatusPage
        appName={appName}
        username={user.username}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        avatarUrl={avatarUrl}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        alert={err?.message ?? "Gagal buat status"}
      />,
      500,
    );
  }
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
      return c.json(
        { error: `Sesi belum siap. Status: ${sessionData.status}` },
        400,
      );
    }

    const body = await c.req.json();
    const { groupId, message } = body;

    if (!groupId || !message) {
      return c.json({ error: 'Field "groupId" dan "message" wajib diisi' }, 400);
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
        return c.json({ error: 'Field "text" wajib diisi jika tanpa media' }, 400);
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
  const delayMs: number = typeof body.delayMs === "number" ? body.delayMs : 2000;

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
