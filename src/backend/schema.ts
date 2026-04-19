import {
  index,
  jsonb,
  pgTable,
  text,
  integer,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("user"),
    maxDevices: integer("max_devices").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    email: text("email"),
    profilePhotoUrl: text("profile_photo_url"),
    apiKeyHash: text("api_key_hash"),
    apiKeyLast4: text("api_key_last4"),
    apiKeyCreatedAt: timestamp("api_key_created_at", { withTimezone: true }),
  },
  (table) => ({
    apiKeyHashIndex: uniqueIndex("users_api_key_hash_uq").on(table.apiKeyHash),
  }),
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    userIdIndex: index("auth_sessions_user_id_idx").on(table.userId),
  }),
);

export const waSessions = pgTable("wa_sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().unique(),
  webhookUrl: text("webhook_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const actionLogs = pgTable(
  "action_logs",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    actionType: text("action_type").notNull(),
    payload: jsonb("payload").notNull(),
    success: integer("success").notNull().default(1),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIndex: index("action_logs_user_id_idx").on(table.userId),
    sessionIdIndex: index("action_logs_session_id_idx").on(table.sessionId),
    actionTypeIndex: index("action_logs_action_type_idx").on(table.actionType),
    createdAtIndex: index("action_logs_created_at_idx").on(table.createdAt),
  }),
);
