import {
  getUserByUsername,
  verifyPassword,
  createAuthSession,
  deleteAuthSession,
  getMaintenanceMode
} from "../utils/auth.js";

export async function processLogin(username: string, password: string) {
  const user = await getUserByUsername(username);
  if (!user) {
    return { success: false, error: "Login gagal", statusCode: 401 };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return { success: false, error: "Login gagal", statusCode: 401 };
  }

  const maintenance = await getMaintenanceMode();
  if (maintenance && user.role !== "admin") {
    return { success: false, error: "Maintenance aktif. Hanya admin yang bisa login.", statusCode: 403 };
  }

  const sid = await createAuthSession(user.id);
  return { success: true, sid };
}

export async function processLogout(sid: string) {
  if (sid) {
    await deleteAuthSession(sid);
  }
}
