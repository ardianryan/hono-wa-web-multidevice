import type { FC } from "hono/jsx";
import { AdminLayout, PageHeader } from "./ui.js";

type LayoutBase = {
  appName: string;
  username: string;
  appDescription?: string;
  logoUrl?: string;
  avatarUrl?: string;
};

type UserRow = {
  id: string;
  username: string;
  role: "admin" | "user";
  maxDevices: number;
  createdAt: string;
};

export const UserFormPage: FC<
  LayoutBase & {
    mode: "new" | "edit";
    user?: UserRow;
    alert?: string;
  }
> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
    role="admin"
    active="users"
  >
    <PageHeader
      title={props.mode === "new" ? "Tambah User" : "Edit User"}
      subtitle="Atur kredensial login dan pembatasan device"
      actions={
        <a class="btn" href="/admin/users">
          Kembali
        </a>
      }
    />
    {props.alert ? <div class="alert">{props.alert}</div> : null}
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <form
          method="post"
          action={
            props.mode === "new"
              ? "/admin/users/new"
              : `/admin/users/${props.user?.id}/edit`
          }
        >
          <div class="formRow">
            <div class="label">Username</div>
            <input
              class="input"
              name="username"
              type="text"
              value={props.user?.username ?? ""}
              required
            />
          </div>
          <div class="formRow">
            <div class="label">Role</div>
            <select class="select" name="role" required>
              <option
                value="user"
                selected={(props.user?.role ?? "user") === "user"}
              >
                user
              </option>
              <option value="admin" selected={props.user?.role === "admin"}>
                admin
              </option>
            </select>
          </div>
          <div class="formRow">
            <div class="label">Max Device</div>
            <input
              class="input"
              name="maxDevices"
              type="number"
              min="1"
              value={String(props.user?.maxDevices ?? 1)}
              required
            />
          </div>
          <div class="formRow">
            <div class="label">
              Password{" "}
              {props.mode === "edit" ? "(kosongkan jika tidak ganti)" : ""}
            </div>
            <input class="input" name="password" type="password" />
          </div>
          <div style="margin-top: 14px;" class="btnRow">
            <button class="btn primary" type="submit">
              Simpan
            </button>
            <a class="btn" href="/admin/users">
              Batal
            </a>
          </div>
        </form>
      </div>
    </div>
  </AdminLayout>
);
