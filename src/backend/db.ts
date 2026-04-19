import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { actionLogs, appSettings, authSessions, users, waSessions } from "./schema.js";

const pool = new Pool({
  ...(process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST ?? "localhost",
        port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
        user: process.env.PGUSER ?? "postgres",
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE ?? "hono_wa",
      }),
  max: process.env.PGPOOL_MAX ? Number(process.env.PGPOOL_MAX) : 10,
});

export const getDb = () => pool;
export const db = drizzle(pool);
export const appSchema = { appSettings, users, authSessions, waSessions, actionLogs };

export const ensureSchema = async () => {
  const db = getDb();
  await db.query(`
    create table if not exists app_settings (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    );
  `);

  await db.query(`
    create table if not exists users (
      id uuid primary key,
      username text not null unique,
      password_hash text not null,
      role text not null default 'user',
      max_devices integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.query(`alter table users add column if not exists email text;`);
  await db.query(`alter table users add column if not exists profile_photo_url text;`);
  await db.query(`alter table users add column if not exists api_key_hash text;`);
  await db.query(`alter table users add column if not exists api_key_last4 text;`);
  await db.query(
    `alter table users add column if not exists api_key_created_at timestamptz;`,
  );
  await db.query(
    `create unique index if not exists users_api_key_hash_uq on users(api_key_hash);`,
  );

  await db.query(`
    create table if not exists auth_sessions (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    );
  `);

  await db.query(`
    create index if not exists auth_sessions_user_id_idx on auth_sessions(user_id);
  `);

  await db.query(`
    create table if not exists wa_sessions (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      session_id text not null unique,
      created_at timestamptz not null default now()
    );
  `);

  await db.query(`alter table wa_sessions add column if not exists webhook_url text;`);

  await db.query(`
    create table if not exists action_logs (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      session_id text not null,
      action_type text not null,
      payload jsonb not null,
      success integer not null default 1,
      error text,
      created_at timestamptz not null default now()
    );
  `);

  await db.query(
    `create index if not exists action_logs_user_id_idx on action_logs(user_id);`,
  );
  await db.query(
    `create index if not exists action_logs_session_id_idx on action_logs(session_id);`,
  );
  await db.query(
    `create index if not exists action_logs_action_type_idx on action_logs(action_type);`,
  );
  await db.query(
    `create index if not exists action_logs_created_at_idx on action_logs(created_at);`,
  );
};

export const getSetting = async (key: string): Promise<string | null> => {
  const result = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key));
  return result[0]?.value ?? null;
};

export const setSetting = async (key: string, value: string): Promise<void> => {
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key));

  if (existing.length > 0) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(appSettings.key, key));
    return;
  }

  await db.insert(appSettings).values({ key, value });
};

export const ensureDefaultSettings = async () => {
  const appName = await getSetting("app_name");
  if (appName === null) await setSetting("app_name", "HonoWA");

  const maintenance = await getSetting("maintenance_mode");
  if (maintenance === null) await setSetting("maintenance_mode", "false");

  const description = await getSetting("app_description");
  if (description === null) {
    await setSetting(
      "app_description",
      "Kelola sesi WhatsApp, broadcast, dan status dengan kontrol akses pengguna.",
    );
  }

  const logoUrl = await getSetting("app_logo_url");
  if (logoUrl === null) await setSetting("app_logo_url", "");

  const mediaMaxMb = await getSetting("media_max_mb");
  if (mediaMaxMb === null) await setSetting("media_max_mb", "10");
};
