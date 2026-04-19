// ─────────────────────────────────────────────────────────────────────────────
// types.ts — Definisi tipe untuk seluruh aplikasi
// ─────────────────────────────────────────────────────────────────────────────

export const SESSION_STATUS = {
  INITIALIZING: "initializing",
  PENDING_PAIRING: "pending_pairing",
  READY: "ready",
  DISCONNECTED: "disconnected",
} as const;

export type SessionStatus =
  (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

export type SessionData = {
  client: InstanceType<typeof import("whatsapp-web.js").Client>;
  status: string;
  readyAt: string;
  qr?: string;
};

export type SessionRecord = {
  sessionId: string;
  status: string;
  readyAt: string;
};

export type BroadcastResult = {
  phone: string;
  status: "sent" | "failed";
  error?: string;
};
