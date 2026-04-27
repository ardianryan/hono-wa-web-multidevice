import type { FC } from "hono/jsx";
import { AdminLayout, PageHeader, StatCard } from "./ui.js";

type LayoutBase = {
  appName: string;
  username: string;
  appDescription?: string;
  logoUrl?: string;
  avatarUrl?: string;
};

export const DashboardPage: FC<
  LayoutBase & {
    role: "admin" | "user";
    totalUsers: number;
    totalWaSessions: number;
    runtimeSessions: number;
    isLoading?: boolean;
  }
> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
    role={props.role}
    active="dashboard"
  >
    <PageHeader
      title="Dashboard Overview"
      subtitle="Monitoring fitur WhatsApp Action dan session pengguna"
      actions={
        <>
          <a class="btn" href="/admin/sessions">
            Manage Sessions
          </a>
          {props.role === "admin" ? (
            <a class="btn primary" href="/admin/users">
              Manajemen User
            </a>
          ) : null}
        </>
      }
    />
    <div class="grid">
      <StatCard
        label="Total Users"
        value={String(props.totalUsers)}
        colSpan={4}
        isLoading={props.isLoading}
      />
      <StatCard
        label="Total WA Sessions"
        value={String(props.totalWaSessions)}
        colSpan={4}
        isLoading={props.isLoading}
      />
      <StatCard
        label="Runtime Sessions"
        value={String(props.runtimeSessions)}
        colSpan={4}
        isLoading={props.isLoading}
      />
      <div class="card" style="grid-column: span 12;">
        <div class="statLabel">Quick Links</div>
        <div style="margin-top: 12px; display:flex; gap: 10px; flex-wrap: wrap;">
          <a class="btn" href="/admin/message">
            Message
          </a>
          <a class="btn" href="/admin/broadcast">
            Broadcast
          </a>
          <a class="btn" href="/admin/status">
            Status
          </a>
          <a class="btn" href="/admin/settings">
            Pengaturan
          </a>
        </div>
      </div>
    </div>
  </AdminLayout>
);
