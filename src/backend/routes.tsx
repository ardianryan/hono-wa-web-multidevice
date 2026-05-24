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
  AiPage,
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
  requestSessionPairingCode,
} from "./session/session-manager.js";
import { SESSION_STATUS, type BroadcastResult } from "./utils/types.js";
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
} from "./utils/auth.js";
import { ensureDefaultSettings, getDb } from "./config/db.js";

export const router = new Hono<{ Variables: { authUser: User } }>();

import {
  getAuthUser,
  requireAuth,
  requireAdmin,
  getApiKeyFromRequest,
  requireApiKey,
  requireAuthOrApiKey,
} from "./middleware/auth.middleware.js";

import { transport } from "./mcp/index.js";


import {
  md5Hex,
  getGravatarUrl,
  getAvatarUrl,
  DEFAULT_APP_LOGO_URL,
  getUiSettings,
  withToast,
} from "./service/ui.service.js";

import {
  saveUploadedFile,
  type LoadedMedia,
  isHttpUrl,
  filenameFromUrl,
  loadMediaFromUrl,
  loadMediaFromUpload,
  resolveMediaInput,
} from "./service/media.service.js";
import { handleSendApi, handleSendGroupApi, handleBroadcastApi } from "./service/message.service.js";
import { handleDeleteSessionApi, handleGetSessionsApi, handleGetSessionStatusApi } from "./service/session.service.js";
import { handleStatusApi } from "./service/status.service.js";
import { processLogin, processLogout } from "./service/auth.service.js";

import {
  UNSEND_WINDOW_MS,
  HISTORY_ACTION_TYPES,
  toHistoryActionType,
  historyBasePath,
  historyPathWithSession,
  collectMessageIds,
  isWithinUnsendWindow,
  unsendByMessageIds,
  jsonToCsv,
  sendMessage,
  sendGroupMessage,
  executeBroadcast,
  resendMessage,
  resendBroadcast,
} from "./service/message.service.js";

import {
  isSessionAllowedForUser,
  deleteSession,
  getSessionStatus,
  listSessionsForUser,
  saveWebhook,
  getSessionQrData,
} from "./service/session.service.js";

import { createWhatsAppStatus, resendStatus } from "./service/status.service.js";

import { handleAiChat, handleAiImage, getAiChatHistory, deleteAllAiChatHistory } from "./service/ai.service.js";
// import { MessageMedia } from "whatsapp-web.js";
import { removeSessionFromFile } from "./session/session-store.js";


router.get("/login", async (c) => {
  try {
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

  const result = await processLogin(username, password);

  if (!result.success) {
    return c.html(
      <LoginPage
        appName={appName}
        appDescription={appDescription}
        logoUrl={appLogoUrl}
        maintenance={maintenance}
        error={result.error}
      />,
      result.statusCode as any,
    );
  }

  setCookie(c, "sid", result.sid!, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
  });
  return c.redirect(withToast("/admin", "Login berhasil", "success"));
});

router.post("/logout", async (c) => {
  const sid = getCookie(c, "sid");
  if (sid) await processLogout(sid);
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
      role={user.role}
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
      role={user.role}
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
    secure: process.env.COOKIE_SECURE === "true",
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
      role={user.role}
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

  const hasPhotoUpload =
    photoFile &&
    typeof photoFile.arrayBuffer === "function" &&
    Number((photoFile as any).size ?? 0) > 0;

  const photoUrl = hasPhotoUpload
    ? await saveUploadedFile(photoFile, `user-${user.id}`)
    : null;

  if (hasPhotoUpload && !photoUrl) {
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

  const result = await saveWebhook(user, sessionId, rawWebhookUrl);
  if (!result.success) {
    return c.redirect(withToast("/admin/sessions", result.error!, "error"));
  }
  return c.redirect(withToast("/admin/sessions", "Webhook tersimpan", "success"));
});

router.post("/admin/session-pairing-code/:sessionId", requireAuth, async (c) => {
  const user = c.get("authUser");
  const sessionId = c.req.param("sessionId");
  const body = await c.req.json().catch(() => ({}));
  const phoneNumber = String(body.phoneNumber ?? "").trim();

  if (!phoneNumber) {
    return c.json({ status: "error", message: "Nomor telepon wajib diisi" }, 400);
  }

  const allowed = await isSessionAllowedForUser(user, sessionId);
  if (!allowed) {
    return c.json({ status: "error", message: "Session tidak valid untuk user ini" }, 403);
  }

  try {
    const code = await requestSessionPairingCode(sessionId, phoneNumber);
    return c.json({ status: "success", code });
  } catch (err: any) {
    return c.json({ status: "error", message: err.message }, 500);
  }
});

router.post("/admin/sessions/:sessionId/delete", requireAuth, async (c) => {
  const user = c.get("authUser");
  const sessionId = c.req.param("sessionId");
  const allowed = await isSessionAllowedForUser(user, sessionId);
  if (!allowed) {
    return c.redirect(withToast("/admin/sessions", "Session tidak valid untuk user ini", "error"));
  }

  try {
    await deleteSession(user, sessionId);
    return c.redirect(withToast("/admin/sessions", "Session berhasil dihapus", "success"));
  } catch {
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

  const result = await getSessionQrData(sessionId);
  if (result.status === "pending") {
    return c.json(result, 202);
  }
  return c.json(result);
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
      role={user.role}
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
        role={user.role}
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
        role={user.role}
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
        role={user.role}
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
    await sendMessage({
      userId: user.id,
      sessionId,
      phone,
      message,
      loadedMedia,
    });

    return c.redirect(
      withToast(
        `/admin/message?sessionId=${encodeURIComponent(sessionId)}`,
        "Pesan berhasil dikirim",
        "success",
      ),
    );
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
        role={user.role}
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
      role={user.role}
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
        role={user.role}
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
        role={user.role}
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
        role={user.role}
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
        role={user.role}
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
      role={user.role}
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
        role={user.role}
        waSessions={waSessions as any}
        selectedSessionId={sessionId}
        alert="Session tidak valid untuk user ini"
      />,
      403,
    );
  }

  try {
    await createWhatsAppStatus({
      userId: user.id,
      sessionId,
      text,
      mediaUrl,
    });
    return c.redirect(
      withToast(
        `/admin/status?sessionId=${encodeURIComponent(sessionId)}`,
        "Status berhasil dibuat",
        "success",
      ),
    );
  } catch (err: any) {
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
        role={user.role}
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
      await resendMessage(user.id, sessionId, row);
      return c.redirect(withToast(redirectTo, "Resend berhasil", "success"));
    }

    if (row.actionType === "broadcast") {
      await resendBroadcast(user.id, sessionId, row);
      return c.redirect(withToast(redirectTo, "Resend broadcast dijadwalkan", "success"));
    }

    if (row.actionType === "status") {
      await resendStatus(user.id, sessionId, row);
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
      }, 35_000);

      const cleanup = () => {
        clearTimeout(timeout);
        sessionData.client.off("qr", onQr);
        sessionData.client.off("ready", onReady);
      };

      sessionData.client.once("qr", onQr);
      sessionData.client.once("ready", onReady);
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

router.get("/session/status/:sessionId", requireApiKey, handleGetSessionStatusApi);

router.get("/sessions", requireApiKey, handleGetSessionsApi);

router.post("/send/:sessionId", requireApiKey, handleSendApi);

router.post("/send-group/:sessionId", requireApiKey, handleSendGroupApi);

router.post("/status/:sessionId", requireApiKey, handleStatusApi);

router.delete("/session/:sessionId", requireApiKey, handleDeleteSessionApi);

router.post("/broadcast/:sessionId", requireApiKey, handleBroadcastApi);

router.post("/api/ai/chat", requireApiKey, async (c) => {
  return handleAiChat(c);
});

router.post("/api/ai/image", requireApiKey, async (c) => {
  return handleAiImage(c);
});

router.delete("/api/ai/history", requireApiKey, async (c) => {
  const user = c.get("authUser");
  await deleteAllAiChatHistory(user.id);
  return c.json({ success: true, message: "History deleted" });
});

router.all("/api/mcp", requireApiKey, async (c) => {
  return transport.handleRequest(c);
});


router.get("/admin/ai", requireAuth, async (c) => {
  const user = c.get("authUser");
  const { appName, appDescription, appLogoUrl } = await getUiSettings();
  const avatarUrl = getAvatarUrl(user);

  // Ambil history terbaru
  const history = await getAiChatHistory(user.id);

  return c.html(
    <AiPage
      appName={appName}
      username={user.username}
      appDescription={appDescription}
      logoUrl={appLogoUrl}
      avatarUrl={avatarUrl}
      role={user.role}
      history={history as any}
    />,
  );
});
