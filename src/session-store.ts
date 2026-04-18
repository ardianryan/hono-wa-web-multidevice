// ─────────────────────────────────────────────────────────────────────────────
// session-store.ts — Persistensi sesi ke disk (data/session.json)
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import type { SessionData, SessionRecord } from "./types.js";

const DATA_DIR = path.resolve("data");
const SESSION_FILE = path.join(DATA_DIR, "session.json");

// ─── Baca data/session.json ───────────────────────────────────────────────────
export const readSessionFile = (): Record<string, SessionRecord> => {
  try {
    if (!fs.existsSync(SESSION_FILE)) return {};
    const raw = fs.readFileSync(SESSION_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, SessionRecord>;
  } catch {
    console.warn("[session.json] Gagal membaca, menggunakan data kosong.");
    return {};
  }
};

// ─── Tulis data/session.json ──────────────────────────────────────────────────
export const writeSessionFile = (data: Record<string, SessionRecord>) => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[session.json] Gagal menulis:", err);
  }
};

// ─── Simpan satu sesi ke file ─────────────────────────────────────────────────
export const persistSession = (sessionId: string, data: SessionData) => {
  const all = readSessionFile();
  all[sessionId] = { sessionId, status: data.status, readyAt: data.readyAt };
  writeSessionFile(all);
};

// ─── Hapus satu sesi dari file ────────────────────────────────────────────────
export const removeSessionFromFile = (sessionId: string) => {
  const all = readSessionFile();
  delete all[sessionId];
  writeSessionFile(all);
};
