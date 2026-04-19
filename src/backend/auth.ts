import crypto from "crypto";
import { getDb, getSetting, setSetting } from "./db.js";

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

type DbUserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  max_devices: number;
  created_at: string;
  email?: string | null;
  profile_photo_url?: string | null;
  api_key_hash?: string | null;
  api_key_last4?: string | null;
  api_key_created_at?: string | null;
};

const toUser = (row: DbUserRow): User => ({
  id: row.id,
  username: row.username,
  role: (row.role === "admin" ? "admin" : "user") as Role,
  maxDevices: row.max_devices,
  createdAt: row.created_at,
  email: row.email ?? null,
  profilePhotoUrl: row.profile_photo_url ?? null,
  apiKeyLast4: row.api_key_last4 ?? null,
  apiKeyCreatedAt: row.api_key_created_at ?? null,
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
  const db = getDb();
  const res = await db.query<{ count: string }>(
    `select count(*)::text as count from users where role = 'admin'`,
  );
  const count = Number(res.rows[0]?.count ?? "0");
  if (count > 0) return;

  const username = process.env.DEFAULT_ADMIN_USERNAME ?? "admin";
  const password = process.env.DEFAULT_ADMIN_PASSWORD ?? "admin";
  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();

  await db.query(
    `insert into users(id, username, password_hash, role, max_devices) values ($1, $2, $3, 'admin', $4)`,
    [id, username, passwordHash, 999],
  );
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

export const getUserByUsername = async (
  username: string,
): Promise<(User & { passwordHash: string }) | null> => {
  const db = getDb();
  const res = await db.query<DbUserRow>(
    `select id, username, password_hash, role, max_devices, created_at, email, profile_photo_url, api_key_last4, api_key_created_at from users where username = $1`,
    [username],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { ...toUser(row), passwordHash: row.password_hash };
};

export const getUserById = async (id: string): Promise<User | null> => {
  const db = getDb();
  const res = await db.query<DbUserRow>(
    `select id, username, password_hash, role, max_devices, created_at, email, profile_photo_url, api_key_last4, api_key_created_at from users where id = $1`,
    [id],
  );
  const row = res.rows[0];
  if (!row) return null;
  return toUser(row);
};

export const listUsers = async (): Promise<User[]> => {
  const db = getDb();
  const res = await db.query<DbUserRow>(
    `select id, username, password_hash, role, max_devices, created_at, email, profile_photo_url, api_key_last4, api_key_created_at from users order by created_at desc`,
  );
  return res.rows.map(toUser);
};

export const createUser = async (input: {
  username: string;
  password: string;
  role: Role;
  maxDevices: number;
}): Promise<User> => {
  const db = getDb();
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  await db.query(
    `insert into users(id, username, password_hash, role, max_devices) values ($1, $2, $3, $4, $5)`,
    [id, input.username, passwordHash, input.role, input.maxDevices],
  );
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
  const db = getDb();
  if (input.password && input.password.length > 0) {
    const passwordHash = await hashPassword(input.password);
    await db.query(
      `update users set username = $2, password_hash = $3, role = $4, max_devices = $5, updated_at = now() where id = $1`,
      [id, input.username, passwordHash, input.role, input.maxDevices],
    );
    return;
  }
  await db.query(
    `update users set username = $2, role = $3, max_devices = $4, updated_at = now() where id = $1`,
    [id, input.username, input.role, input.maxDevices],
  );
};

export const deleteUser = async (id: string): Promise<void> => {
  const db = getDb();
  await db.query(`delete from users where id = $1`, [id]);
};

export const createAuthSession = async (userId: string): Promise<string> => {
  const db = getDb();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.query(
    `insert into auth_sessions(id, user_id, expires_at) values ($1, $2, $3)`,
    [id, userId, expiresAt],
  );
  return id;
};

export const deleteAuthSession = async (sessionId: string): Promise<void> => {
  const db = getDb();
  await db.query(`delete from auth_sessions where id = $1`, [sessionId]);
};

export const getUserBySessionId = async (
  sessionId: string,
): Promise<User | null> => {
  const db = getDb();
  const res = await db.query<DbUserRow>(
    `
      select u.id, u.username, u.password_hash, u.role, u.max_devices, u.created_at, u.email, u.profile_photo_url, u.api_key_last4, u.api_key_created_at
      from auth_sessions s
      join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now()
    `,
    [sessionId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return toUser(row);
};

export const getUserByApiKey = async (apiKey: string): Promise<User | null> => {
  const db = getDb();
  const hash = hashApiKey(apiKey);
  const res = await db.query<DbUserRow>(
    `select id, username, password_hash, role, max_devices, created_at, email, profile_photo_url, api_key_last4, api_key_created_at
     from users where api_key_hash = $1`,
    [hash],
  );
  const row = res.rows[0];
  if (!row) return null;
  return toUser(row);
};

export const rotateApiKeyForUser = async (userId: string): Promise<string> => {
  const db = getDb();
  const apiKey = generateApiKey();
  const hash = hashApiKey(apiKey);
  const last4 = apiKey.slice(-4);
  await db.query(
    `update users set api_key_hash = $2, api_key_last4 = $3, api_key_created_at = now(), updated_at = now() where id = $1`,
    [userId, hash, last4],
  );
  return apiKey;
};

export const updateUserEmail = async (userId: string, email: string | null) => {
  const db = getDb();
  await db.query(`update users set email = $2, updated_at = now() where id = $1`, [
    userId,
    email,
  ]);
};

export const updateUserProfilePhotoUrl = async (
  userId: string,
  profilePhotoUrl: string | null,
) => {
  const db = getDb();
  await db.query(
    `update users set profile_photo_url = $2, updated_at = now() where id = $1`,
    [userId, profilePhotoUrl],
  );
};

export const updateUserPassword = async (userId: string, password: string) => {
  const db = getDb();
  const passwordHash = await hashPassword(password);
  await db.query(
    `update users set password_hash = $2, updated_at = now() where id = $1`,
    [userId, passwordHash],
  );
};

export const listWaSessionsForUser = async (userId: string) => {
  const db = getDb();
  const res = await db.query<{
    id: string;
    session_id: string;
    created_at: string;
    webhook_url: string | null;
  }>(
    `select id, session_id, created_at, webhook_url from wa_sessions where user_id = $1 order by created_at desc`,
    [userId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    createdAt: r.created_at,
    webhookUrl: r.webhook_url,
  }));
};

export const listWaSessionsAll = async () => {
  const db = getDb();
  const res = await db.query<{
    id: string;
    session_id: string;
    created_at: string;
    user_id: string;
    webhook_url: string | null;
  }>(`select id, session_id, created_at, user_id, webhook_url from wa_sessions order by created_at desc`);
  return res.rows.map(
    (r) => ({
    id: r.id,
    sessionId: r.session_id,
    createdAt: r.created_at,
    userId: r.user_id,
    webhookUrl: r.webhook_url,
    }),
  );
};

export const createWaSessionForUser = async (
  userId: string,
  sessionId: string,
): Promise<void> => {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.query(
    `insert into wa_sessions(id, user_id, session_id) values ($1, $2, $3)`,
    [id, userId, sessionId],
  );
};
