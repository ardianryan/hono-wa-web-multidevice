import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { actionLogs, aiChats, appSettings, authSessions, users, waSessions } from "./schema.js";

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
export const appSchema = { appSettings, users, authSessions, waSessions, actionLogs, aiChats };

export const migrateDb = async () => {
  try {
    console.log("[db] checking migrations...");
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("[db] migrations applied.");
  } catch (err: any) {
    if (err.message?.includes("already exists")) {
      console.log("[db] tables already exist, skipping migration.");
    } else {
      console.error("[db] migration warning:", err.message);
    }
  }
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
