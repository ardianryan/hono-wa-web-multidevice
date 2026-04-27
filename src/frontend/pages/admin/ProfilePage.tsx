import type { FC } from "hono/jsx";
import { AdminLayout, PageHeader } from "./ui.js";

type LayoutBase = {
  appName: string;
  username: string;
  appDescription?: string;
  logoUrl?: string;
  avatarUrl?: string;
};

export const ProfilePage: FC<
  LayoutBase & {
    role?: "admin" | "user";
    email?: string | null;
    avatarUrl: string;
    gravatarUrl: string;
    profilePhotoUrl?: string | null;
    alert?: string;
  }
> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
    role={props.role}
    active="profile"
  >
    <PageHeader
      title="Profil"
      subtitle="Ubah email, foto profil, dan password"
    />
    {props.alert ? <div class="alert">{props.alert}</div> : null}
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <div style="display:flex; gap: 14px; align-items: center; flex-wrap: wrap;">
          <img
            src={props.avatarUrl}
            alt={props.username}
            style="width:64px;height:64px;border-radius:999px;object-fit:cover;border:1px solid rgba(199,196,216,0.35);background:#fff;"
          />
          <div>
            <div style="font-weight:800; font-size: 18px; letter-spacing: -0.02em;">
              {props.username}
            </div>
            <div class="muted" style="margin-top: 4px;">
              Username tidak bisa diubah.
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="grid-column: span 12;">
        <form
          method="post"
          action="/admin/profile"
          encType="multipart/form-data"
        >
          <div class="formRow">
            <div class="label">Email</div>
            <input
              class="input"
              name="email"
              type="email"
              placeholder="contoh: kamu@email.com"
              value={props.email ?? ""}
            />
            <div class="muted" style="margin-top: 6px; font-size: 13px;">
              Email dipakai untuk Gravatar.
            </div>
          </div>

          <div class="formRow">
            <div class="label">Gravatar (default)</div>
            <div style="margin-top: 8px; display:flex; gap: 12px; align-items: center;">
              <img
                src={props.gravatarUrl}
                alt="Gravatar"
                style="width:52px;height:52px;border-radius:999px;object-fit:cover;border:1px solid rgba(199,196,216,0.35);background:#fff;"
              />
              <div class="muted" style="font-size: 13px;">
                Foto ini otomatis berdasarkan email.
              </div>
            </div>
          </div>

          <div class="formRow">
            <div class="label">Upload Foto Profil (opsional)</div>
            {props.profilePhotoUrl ? (
              <div class="muted" style="margin-top: 6px; font-size: 13px;">
                Saat ini menggunakan foto upload.
              </div>
            ) : (
              <div class="muted" style="margin-top: 6px; font-size: 13px;">
                Jika tidak upload, akan pakai Gravatar.
              </div>
            )}
            <input class="input" name="photo" type="file" accept="image/*" />
          </div>

          <div class="formRow">
            <div class="label">Password Saat Ini</div>
            <input class="input" name="currentPassword" type="password" />
          </div>
          <div class="formRow">
            <div class="label">Password Baru</div>
            <input class="input" name="newPassword" type="password" />
          </div>
          <div class="formRow">
            <div class="label">Ulangi Password Baru</div>
            <input class="input" name="newPassword2" type="password" />
          </div>

          <div style="margin-top: 14px;" class="btnRow">
            <button class="btn primary" type="submit">
              Simpan Perubahan
            </button>
            <a class="btn" href="/admin">
              Kembali
            </a>
          </div>
        </form>
      </div>
    </div>
  </AdminLayout>
);
