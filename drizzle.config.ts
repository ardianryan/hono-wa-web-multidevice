import dotenv from "dotenv";
import path from "path";
import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

const buildPgUrl = () => {
  const host = process.env.PGHOST ?? "localhost";
  const port = process.env.PGPORT ?? "5432";
  const database = process.env.PGDATABASE ?? "hono_wa";
  const user = process.env.PGUSER ?? "postgres";
  const password = process.env.PGPASSWORD ?? "";
  const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
  return `postgresql://${auth}@${host}:${port}/${database}`;
};

const databaseUrl = process.env.DATABASE_URL ?? buildPgUrl();

export default defineConfig({
  schema: "./src/backend/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  out: "./drizzle",
});
