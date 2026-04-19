import crypto from "crypto";
import { db, getSetting, setSetting } from "./db.js";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { actionLogs, authSessions, users, waSessions } from "./schema.js";

export type Role = "admin" | "user";

export type User = {
  id: string;
  username: string;
  role: Role;
  maxDevices: number;
  createdAt: string;
  email?: string | null;
  profilePhotoUrl?: string | null;
  apiKeyLast4?: string | null;
  apiKeyCreatedAt?: string | null;
};

type DbUserRow = typeof users.$inferSelect;

const toUser = (row: DbUserRow): User => ({
  id: row.id,
  username: row.username,
  role: (row.role === "admin" ? "admin" : "user") as Role,
  maxDevices: row.maxDevices,
  createdAt: row.createdAt.toISOString(),
  email: row.email ?? null,
  profilePhotoUrl: row.profilePhotoUrl ?? null,
  apiKeyLast4: row.apiKeyLast4 ?? null,
  apiKeyCreatedAt: row.apiKeyCreatedAt?.toISOString() ?? null,
});

const scryptParams = {
  N: 16384,
  r: 8,
  p: 1,
  keyLen: 32,
} as const;

const encode = (buf: Buffer) => buf.toString("base64url");
const decode = (s: string) => Buffer.from(s, "base64url");
const sha256Hex = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const generateApiKey = () => encode(crypto.randomBytes(32));
export const hashApiKey = (apiKey: string) => sha256Hex(apiKey);

export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      scryptParams.keyLen,
      { N: scryptParams.N, r: scryptParams.r, p: scryptParams.p },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey as Buffer);
      },
    );
  });

  return [
    "scrypt",
    String(scryptParams.N),
    String(scryptParams.r),
    String(scryptParams.p),
    encode(salt),
    encode(key),
  ].join("$");
};

export const verifyPassword = async (
  password: string,
  passwordHash: string,
): Promise<boolean> => {
  const [algo, n, r, p, saltB64, keyB64] = passwordHash.split("$");
  if (algo !== "scrypt") return false;
  if (!n || !r || !p || !saltB64 || !keyB64) return false;

  const salt = decode(saltB64);
  const key = decode(keyB64);

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      key.length,
      { N: Number(n), r: Number(r), p: Number(p) },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey as Buffer);
      },
    );
  });

  return crypto.timingSafeEqual(derived, key);
};

export const ensureDefaultAdmin = async (): Promise<void> => {
  const adminCount = await db.select().from(users).where(eq(users.role, "admin"));
  if (adminCount.length > 0) return;

  const username = process.env.DEFAULT_ADMIN_USERNAME ?? "admin";
  const password = process.env.DEFAULT_ADMIN_PASSWORD ?? "admin123";
  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();

  await db.insert(users).values({
    id,
    username,
    passwordHash,
    role: "admin",
    maxDevices: 999,
  });
};

export const getMaintenanceMode = async (): Promise<boolean> => {
  const v = await getSetting("maintenance_mode");
  return v === "true";
};

export const setMaintenanceMode = async (enabled: boolean): Promise<void> => {
  await setSetting("maintenance_mode", enabled ? "true" : "false");
};

export const getAppName = async (): Promise<string> => {
  return (await getSetting("app_name")) ?? "HonoWA";
};

export const setAppName = async (name: string): Promise<void> => {
  await setSetting("app_name", name);
};

export const getAppDescription = async (): Promise<string> => {
  return (
    (await getSetting("app_description")) ??
    "Kelola sesi WhatsApp, broadcast, dan status dengan kontrol akses pengguna."
  );
};

export const setAppDescription = async (value: string): Promise<void> => {
  await setSetting("app_description", value);
};

export const getAppLogoUrl = async (): Promise<string | null> => {
  const v = await getSetting("app_logo_url");
  if (!v) return null;
  return v;
};

export const setAppLogoUrl = async (url: string | null): Promise<void> => {
  await setSetting("app_logo_url", url ?? "");
};

export const getMediaMaxMb = async (): Promise<number> => {
  const v = await getSetting("media_max_mb");
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.min(100, Math.max(1, n));
};

export const setMediaMaxMb = async (mb: number): Promise<void> => {
  const n = Number(mb);
  const normalized = Number.isFinite(n) ? Math.min(100, Math.max(1, Math.floor(n))) : 10;
  await setSetting("media_max_mb", String(normalized));
};

export const getUserByUsername = async (
  username: string,
): Promise<(User & { passwordHash: string }) | null> => {
  const result = await db.select().from(users).where(eq(users.username, username));
  const row = result[0];
  if (!row) return null;
  const user = toUser(row);
  return { ...user, passwordHash: row.passwordHash };
};

export const getUserById = async (id: string): Promise<User | null> => {
  const result = await db.select().from(users).where(eq(users.id, id));
  const row = result[0];
  if (!row) return null;
  return toUser(row);
};

export const listUsers = async (): Promise<User[]> => {
  const result = await db.select().from(users).orderBy(desc(users.createdAt));
  return result.map((row) => toUser(row));
};

export const createUser = async (input: {
  username: string;
  password: string;
  role: Role;
  maxDevices: number;
}): Promise<User> => {
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  await db.insert(users).values({
    id,
    username: input.username,
    passwordHash,
    role: input.role,
    maxDevices: input.maxDevices,
  });
  const user = await getUserById(id);
  if (!user) throw new Error("user_create_failed");
  return user;
};

export const updateUser = async (
  id: string,
  input: {
    username: string;
    role: Role;
    maxDevices: number;
    password?: string;
  },
): Promise<void> => {
  if (input.password && input.password.length > 0) {
    const passwordHash = await hashPassword(input.password);
    await db
      .update(users)
      .set({
        username: input.username,
        passwordHash,
        role: input.role,
        maxDevices: input.maxDevices,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
    return;
  }
  await db
    .update(users)
    .set({
      username: input.username,
      role: input.role,
      maxDevices: input.maxDevices,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));
};

export const deleteUser = async (id: string): Promise<void> => {
  await db.delete(users).where(eq(users.id, id));
};

export const createAuthSession = async (userId: string): Promise<string> => {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(authSessions).values({
    id,
    userId,
    expiresAt,
  });
  return id;
};

export const deleteAuthSession = async (sessionId: string): Promise<void> => {
  await db.delete(authSessions).where(eq(authSessions.id, sessionId));
};

export const getUserBySessionId = async (
  sessionId: string,
): Promise<User | null> => {
  const result = await db
    .select()
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(eq(authSessions.id, sessionId), gt(authSessions.expiresAt, new Date())));
  const row = result[0];
  if (!row) return null;
  return toUser(row.users);
};

export const getUserByApiKey = async (apiKey: string): Promise<User | null> => {
  const hash = hashApiKey(apiKey);
  const result = await db.select().from(users).where(eq(users.apiKeyHash, hash));
  const row = result[0];
  if (!row) return null;
  return toUser(row);
};

export const rotateApiKeyForUser = async (userId: string): Promise<string> => {
  const apiKey = generateApiKey();
  const hash = hashApiKey(apiKey);
  const last4 = apiKey.slice(-4);
  await db
    .update(users)
    .set({
      apiKeyHash: hash,
      apiKeyLast4: last4,
      apiKeyCreatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  return apiKey;
};

export const updateUserEmail = async (userId: string, email: string | null) => {
  await db.update(users).set({ email, updatedAt: new Date() }).where(eq(users.id, userId));
};

export const updateUserProfilePhotoUrl = async (
  userId: string,
  profilePhotoUrl: string | null,
) => {
  await db
    .update(users)
    .set({ profilePhotoUrl, updatedAt: new Date() })
    .where(eq(users.id, userId));
};

export const updateUserPassword = async (userId: string, password: string) => {
  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
};

export const listWaSessionsForUser = async (userId: string) => {
  const result = await db
    .select()
    .from(waSessions)
    .where(eq(waSessions.userId, userId))
    .orderBy(desc(waSessions.createdAt));
  return result.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    createdAt: r.createdAt.toISOString(),
    webhookUrl: r.webhookUrl ?? null,
  }));
};

export const listWaSessionsAll = async () => {
  const result = await db.select().from(waSessions).orderBy(desc(waSessions.createdAt));
  return result.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    createdAt: r.createdAt.toISOString(),
    userId: r.userId,
    webhookUrl: r.webhookUrl ?? null,
  }));
};

export const createWaSessionForUser = async (
  userId: string,
  sessionId: string,
): Promise<void> => {
  const id = crypto.randomUUID();
  await db.insert(waSessions).values({
    id,
    userId,
    sessionId,
  });
};

export type ActionType = "message" | "broadcast" | "status";

export type ActionLog = {
  id: string;
  userId: string;
  sessionId: string;
  actionType: ActionType;
  payload: any;
  success: boolean;
  error?: string | null;
  createdAt: string;
};

export const createActionLog = async (input: {
  userId: string;
  sessionId: string;
  actionType: ActionType;
  payload: Record<string, any>;
  success: boolean;
  error?: string | null;
}) => {
  const id = crypto.randomUUID();
  await db.insert(actionLogs).values({
    id,
    userId: input.userId,
    sessionId: input.sessionId,
    actionType: input.actionType,
    payload: input.payload,
    success: input.success ? 1 : 0,
    error: input.error ?? null,
  });
};

export const listActionLogs = async (input: {
  authUser: User;
  actionType: ActionType;
  sessionId?: string;
  limit?: number;
}): Promise<ActionLog[]> => {
  const limit = input.limit ?? 20;
  const clauses: any[] = [eq(actionLogs.actionType, input.actionType)];
  if (input.sessionId) clauses.push(eq(actionLogs.sessionId, input.sessionId));
  if (input.authUser.role !== "admin") clauses.push(eq(actionLogs.userId, input.authUser.id));
  const where = and(...clauses);

  const rows = await db
    .select()
    .from(actionLogs)
    .where(where)
    .orderBy(desc(actionLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    sessionId: r.sessionId,
    actionType: (r.actionType as ActionType) ?? input.actionType,
    payload: r.payload,
    success: Boolean(r.success),
    error: r.error ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
};

export const getActionLogById = async (
  authUser: User,
  id: string,
): Promise<ActionLog | null> => {
  const clauses: any[] = [eq(actionLogs.id, id)];
  if (authUser.role !== "admin") clauses.push(eq(actionLogs.userId, authUser.id));
  const where = and(...clauses);
  const rows = await db.select().from(actionLogs).where(where).limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    userId: r.userId,
    sessionId: r.sessionId,
    actionType: (r.actionType as ActionType) ?? "message",
    payload: r.payload,
    success: Boolean(r.success),
    error: r.error ?? null,
    createdAt: r.createdAt.toISOString(),
  };
};

export const deleteActionLogsByIds = async (input: {
  authUser: User;
  actionType: ActionType;
  ids: string[];
  sessionId?: string;
}): Promise<number> => {
  const ids = Array.from(new Set(input.ids.map((v) => String(v).trim()).filter(Boolean)));
  if (!ids.length) return 0;
  const clauses: any[] = [
    eq(actionLogs.actionType, input.actionType),
    inArray(actionLogs.id, ids),
  ];
  if (input.sessionId) clauses.push(eq(actionLogs.sessionId, input.sessionId));
  if (input.authUser.role !== "admin") clauses.push(eq(actionLogs.userId, input.authUser.id));
  const where = and(...clauses);
  const deleted = await db.delete(actionLogs).where(where).returning({ id: actionLogs.id });
  return deleted.length;
};

export const deleteAllActionLogs = async (input: {
  authUser: User;
  actionType: ActionType;
  sessionId?: string;
}): Promise<number> => {
  const clauses: any[] = [eq(actionLogs.actionType, input.actionType)];
  if (input.sessionId) clauses.push(eq(actionLogs.sessionId, input.sessionId));
  if (input.authUser.role !== "admin") clauses.push(eq(actionLogs.userId, input.authUser.id));
  const where = and(...clauses);
  const deleted = await db.delete(actionLogs).where(where).returning({ id: actionLogs.id });
  return deleted.length;
};
