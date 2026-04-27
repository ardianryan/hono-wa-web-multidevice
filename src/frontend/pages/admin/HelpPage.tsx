import type { FC } from "hono/jsx";
import { AdminLayout, PageHeader } from "./ui.js";

type LayoutBase = {
  appName: string;
  username: string;
  appDescription?: string;
  logoUrl?: string;
  avatarUrl?: string;
  role?: "admin" | "user";
};


export const HelpPage: FC<LayoutBase> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
    role={props.role}
    active="dashboard"
  >
    <PageHeader title="Help" subtitle="Panduan cepat penggunaan dashboard" />
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <div class="statLabel">Login</div>
        <div
          class="muted"
          style="margin-top: 10px; font-size: 14px; line-height: 1.7;"
        >
          Admin default dibuat otomatis. Masuk lewat /login. Jika mode
          maintenance aktif, hanya admin yang bisa login.
        </div>
      </div>
      <div class="card" style="grid-column: span 12;">
        <div class="statLabel">Session Pengguna WA</div>
        <div
          class="muted"
          style="margin-top: 10px; font-size: 14px; line-height: 1.7;"
        >
          Buat sessionId, lalu scan QR pada menu Session. Setelah READY, gunakan
          menu Message/Broadcast/Status.
        </div>
      </div>
    </div>
  </AdminLayout>
);
