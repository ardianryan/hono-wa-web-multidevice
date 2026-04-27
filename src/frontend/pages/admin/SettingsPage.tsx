import type { FC } from "hono/jsx";
import { AdminLayout, PageHeader } from "./ui.js";

type LayoutBase = {
  appName: string;
  username: string;
  appDescription?: string;
  logoUrl?: string;
  avatarUrl?: string;
};

export const SettingsPage: FC<
  LayoutBase & {
    maintenance: boolean;
    mediaMaxMb: number;
    logoIsDefault?: boolean;
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
    active="settings"
  >
    <PageHeader
      title="Pengaturan Aplikasi"
      subtitle="Nama aplikasi dan mode maintenance"
    />
    {props.alert ? <div class="alert">{props.alert}</div> : null}
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <form
          method="post"
          action="/admin/settings"
          encType="multipart/form-data"
        >
          <div class="formRow">
            <div class="label">Nama Aplikasi</div>
            <input
              class="input"
              name="appName"
              type="text"
              value={props.appName}
            />
          </div>
          <div class="formRow">
            <div class="label">Logo Aplikasi</div>
            {props.logoUrl ? (
              <div style="margin-top: 8px; display:flex; gap: 12px; align-items: center;">
                <img
                  src={props.logoUrl}
                  alt={props.appName}
                  style="width:48px;height:48px;border-radius:14px;object-fit:cover;border:1px solid rgba(199,196,216,0.35);background:#fff;"
                />
                <div class="muted" style="font-size: 13px;">
                  {props.logoIsDefault
                    ? "Menggunakan logo default. Upload untuk mengganti."
                    : "Logo ini dipakai di login, sidebar, favicon, dan meta tags."}
                </div>
              </div>
            ) : (
              <div class="muted" style="margin-top: 8px; font-size: 13px;">
                Belum ada logo custom.
              </div>
            )}
            <input class="input" name="logo" type="file" accept="image/*" />
            <div class="muted" style="margin-top: 6px; font-size: 13px;">
              Rekomendasi: PNG 512x512.
            </div>
          </div>
          <div class="formRow">
            <div class="label">Deskripsi (SEO)</div>
            <textarea
              class="textarea"
              name="appDescription"
              placeholder="Tulis deskripsi singkat untuk meta description..."
            >
              {props.appDescription ?? ""}
            </textarea>
          </div>
          <div class="formRow">
            <div class="label">Batas ukuran media (MB)</div>
            <input
              class="input"
              name="mediaMaxMb"
              type="number"
              min="1"
              max="100"
              value={String(props.mediaMaxMb)}
            />
            <div class="muted" style="margin-top: 6px; font-size: 13px;">
              Dipakai untuk upload media dan download media via URL pada
              Message/Broadcast.
            </div>
          </div>
          <div class="formRow">
            <div class="label">Mode Maintenance</div>
            <div class="toggleRow">
              <div class="muted" style="font-size: 13px;">
                Jika aktif, hanya admin yang bisa login.
              </div>
              <label class="toggle">
                <input
                  type="checkbox"
                  name="maintenance"
                  checked={props.maintenance}
                />
                <span class="toggleTrack">
                  <span class="toggleThumb" />
                </span>
              </label>
            </div>
            <div class="muted" style="margin-top: 6px; font-size: 13px;">
              Status: {props.maintenance ? "ON" : "OFF"}
            </div>
          </div>
          <div style="margin-top: 14px;" class="btnRow">
            <button class="btn primary" type="submit">
              Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  </AdminLayout>
);
