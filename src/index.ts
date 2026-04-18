// ─────────────────────────────────────────────────────────────────────────────
// index.ts — Entry point: inisialisasi server & restore sesi
// ─────────────────────────────────────────────────────────────────────────────

import path from "path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "dotenv";
import { router } from "./routes.js";
import { restoreSessionsFromFile } from "./session-manager.js";

config({ path: path.resolve(".env") });

const app = new Hono();
app.route("/", router);

restoreSessionsFromFile();

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  const webhookUrl = process.env.WEBHOOK_URL ?? "(tidak dikonfigurasi)";
  console.log(`
╔════════════════════════════════════════════╗
║   WhatsApp Multi-Session API               ║
║   http://localhost:${info.port}            ║
╠════════════════════════════════════════════╣
║  GET    /session/qr/:id     → QR HTML      ║
║  POST   /session/pair/:id   → Pairing      ║
║  GET    /session/status/:id → Cek status   ║
║  GET    /sessions           → List semua   ║
║  POST   /send/:id           → Kirim pesan  ║
║  POST   /send-group/:id     → Kirim grup   ║
║  POST   /status/:id         → Buat status  ║
║  DELETE /session/:id        → Logout       ║
║  POST   /broadcast/:id      → Broadcast    ║
╠════════════════════════════════════════════╣
║  🔔 WEBHOOK                                ║
║  URL: ${webhookUrl.padEnd(36)}║
╚════════════════════════════════════════════╝`);
});
