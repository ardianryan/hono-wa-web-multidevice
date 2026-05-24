import { getCookie, deleteCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import {
  getUserBySessionId,
  getMaintenanceMode,
  getUserByApiKey,
  type User,
} from "../utils/auth.js";

export const getAuthUser = async (c: any) => {
  const sid = getCookie(c, "sid");
  if (!sid) return null;
  return await getUserBySessionId(sid);
};

export const requireAuth: MiddlewareHandler<{ Variables: { authUser: User } }> = async (
  c,
  next,
) => {
  const user = await getAuthUser(c);
  if (!user) return c.redirect("/login");
  const maintenance = await getMaintenanceMode();
  if (maintenance && user.role !== "admin") {
    deleteCookie(c, "sid");
    return c.redirect("/login");
  }
  c.set("authUser", user);
  await next();
};

export const requireAdmin: MiddlewareHandler<{ Variables: { authUser: User } }> = async (
  c,
  next,
) => {
  const user = c.get("authUser");
  if (!user || user.role !== "admin") return c.text("Forbidden", 403);
  await next();
};

export const getApiKeyFromRequest = (c: any): string | null => {
  const x = c.req.header("x-api-key");
  if (x) return x.trim();
  const auth = c.req.header("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m?.[1]) return null;
  return m[1].trim();
};

export const requireApiKey: MiddlewareHandler<{ Variables: { authUser: User } }> = async (
  c,
  next,
) => {
  const apiKey = getApiKeyFromRequest(c);
  if (!apiKey) return c.json({ error: "missing_api_key" }, 401);
  const user = await getUserByApiKey(apiKey);
  if (!user) return c.json({ error: "invalid_api_key" }, 401);
  const maintenance = await getMaintenanceMode();
  if (maintenance && user.role !== "admin") {
    return c.json({ error: "maintenance_mode" }, 403);
  }
  c.set("authUser", user);
  await next();
};

export const requireAuthOrApiKey: MiddlewareHandler<{ Variables: { authUser: User } }> = async (
  c,
  next,
) => {
  let user = await getAuthUser(c);
  
  if (!user) {
    const apiKey = getApiKeyFromRequest(c);
    if (apiKey) {
      user = await getUserByApiKey(apiKey);
    }
  }

  if (!user) {
    // Jika tidak ada session maupun api key
    return c.json({ error: "unauthorized", message: "Missing or invalid authentication (Cookie / API Key)" }, 401);
  }

  const maintenance = await getMaintenanceMode();
  if (maintenance && user.role !== "admin") {
    return c.json({ error: "maintenance_mode" }, 403);
  }

  c.set("authUser", user);
  await next();
};

