import path from "path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { config } from "dotenv";
import backendApp from "./backend/app.js";
import frontendApp from "./frontend/app.js";
import { restoreSessionsFromFile } from "./backend/session-manager.js";
import { ensureDefaultAdmin } from "./backend/auth.js";
import { ensureDefaultSettings, ensureSchema } from "./backend/db.js";

config({ path: path.resolve(".env") });

const app = new Hono();

app.use("/assets/*", serveStatic({ root: "./public" }));
app.route("/", frontendApp);
app.route("/", backendApp);

try {
  await ensureSchema();
  await ensureDefaultSettings();
  await ensureDefaultAdmin();
} catch (err) {
  console.error("[db] init gagal:", err);
}

restoreSessionsFromFile();

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

serve({ fetch: app.fetch, port }, (info) => {
  const webhookUrl = process.env.WEBHOOK_URL ?? "(tidak dikonfigurasi)";
  console.log(`
╔════════════════════════════════════════════╗
║   HonoWA — Admin + API Key                 ║
║   http://localhost:${info.port}            ║
╠════════════════════════════════════════════╣
║  UI                                         ║
║  GET    /login            → Login          ║
║  GET    /admin            → Dashboard      ║
║  GET    /admin/api-docs   → API Docs       ║
║                                            ║
║  API (butuh X-API-Key / Bearer)             ║
║  GET    /sessions         → List session   ║
║  GET    /session/status/:id → Status       ║
║  POST   /send/:id         → Send message   ║
║  POST   /broadcast/:id    → Broadcast      ║
║  POST   /status/:id       → WA Status      ║
╠════════════════════════════════════════════╣
║  🔔 WEBHOOK                                ║
║  URL: ${webhookUrl.padEnd(36)}║
╚════════════════════════════════════════════╝`);
});
