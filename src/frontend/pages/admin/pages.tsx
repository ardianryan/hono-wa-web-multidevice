import type { FC } from "hono/jsx";
import { AdminLayout, PageHeader, StatCard } from "./ui.js";

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

type WaSessionRow = {
  id: string;
  sessionId: string;
  createdAt: string;
  userId?: string;
  webhookUrl?: string | null;
};

export const DashboardPage: FC<
  LayoutBase & {
  role: "admin" | "user";
  totalUsers: number;
  totalWaSessions: number;
  runtimeSessions: number;
  }
> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
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
      <StatCard label="Total Users" value={String(props.totalUsers)} colSpan={4} />
      <StatCard
        label="Total WA Sessions"
        value={String(props.totalWaSessions)}
        colSpan={4}
      />
      <StatCard
        label="Runtime Sessions"
        value={String(props.runtimeSessions)}
        colSpan={4}
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

export const UsersListPage: FC<
  LayoutBase & {
    users: UserRow[];
    alert?: string;
  }
> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
    active="users"
  >
    <PageHeader
      title="Manajemen User"
      subtitle="Tambah, edit, hapus user yang bisa login dan atur limit device WhatsApp"
      actions={
        <a class="btn primary" href="/admin/users/new">
          Tambah User
        </a>
      }
    />
    {props.alert ? <div class="alert">{props.alert}</div> : null}
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <table class="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Max Device</th>
              <th>Dibuat</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {props.users.map((u) => (
              <tr>
                <td>{u.username}</td>
                <td class="muted">{u.role}</td>
                <td class="muted">{String(u.maxDevices)}</td>
                <td class="muted">{new Date(u.createdAt).toLocaleString()}</td>
                <td>
                  <div class="btnRow">
                    <a class="btn" href={`/admin/users/${u.id}/edit`}>
                      Edit
                    </a>
                    <form method="post" action={`/admin/users/${u.id}/delete`}>
                      <button class="btn danger" type="submit">
                        Hapus
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </AdminLayout>
);

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
              <option value="user" selected={(props.user?.role ?? "user") === "user"}>
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
              Password {props.mode === "edit" ? "(kosongkan jika tidak ganti)" : ""}
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

export const SettingsPage: FC<
  LayoutBase & {
    maintenance: boolean;
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
    active="settings"
  >
    <PageHeader
      title="Pengaturan Aplikasi"
      subtitle="Nama aplikasi dan mode maintenance"
    />
    {props.alert ? <div class="alert">{props.alert}</div> : null}
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <form method="post" action="/admin/settings" encType="multipart/form-data">
          <div class="formRow">
            <div class="label">Nama Aplikasi</div>
            <input class="input" name="appName" type="text" value={props.appName} />
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

export const SessionsPage: FC<
  LayoutBase & {
    role: "admin" | "user";
    userId: string;
    maxDevices: number;
    waSessions: WaSessionRow[];
    runtimeSessionIds: string[];
    openQrSessionId?: string;
    alert?: string;
  }
> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
    active="sessions"
  >
    <PageHeader
      title="Session Pengguna WA"
      subtitle="Kelola device WhatsApp yang terhubung untuk aksi pesan/broadcast/status"
    />
    {props.alert ? <div class="alert">{props.alert}</div> : null}
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <div class="statLabel">Buat Session Baru</div>
        <div class="muted" style="margin-top: 8px; font-size: 13px;">
          Limit device: {props.role === "admin" ? "admin (tanpa limit praktis)" : String(props.maxDevices)}
        </div>
        <form method="post" action="/admin/sessions/new" style="margin-top: 10px;">
          <div class="formRow">
            <div class="label">Session ID</div>
            <input
              class="input"
              name="sessionId"
              type="text"
              placeholder="contoh: user1-device1"
              required
            />
          </div>
          <div style="margin-top: 12px;" class="btnRow">
            <button class="btn primary" type="submit">
              Create Session
            </button>
          </div>
        </form>
      </div>

      <div class="card" style="grid-column: span 12;">
        <div class="statLabel">Daftar Session</div>
        <table class="table">
          <thead>
            <tr>
              <th>Session ID</th>
              <th>Webhook</th>
              <th>Runtime</th>
              <th>Dibuat</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {props.waSessions.map((s) => (
              <tr>
                <td>{s.sessionId}</td>
                <td class="muted">
                  <div style="max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    {s.webhookUrl ? s.webhookUrl : "(default)"}
                  </div>
                </td>
                <td class="muted">
                  {props.runtimeSessionIds.includes(s.sessionId) ? "active" : "inactive"}
                </td>
                <td class="muted">{new Date(s.createdAt).toLocaleString()}</td>
                <td>
                  <div class="btnRow">
                    <button
                      class="btn js-open-qr"
                      type="button"
                      data-session-id={s.sessionId}
                    >
                      Scan QR
                    </button>
                    <button
                      class="btn js-open-webhook"
                      type="button"
                      data-session-id={s.sessionId}
                      data-webhook-url={s.webhookUrl ?? ""}
                    >
                      Webhook
                    </button>
                    <a class="btn" href={`/admin/message?sessionId=${encodeURIComponent(s.sessionId)}`}>
                      Message
                    </a>
                    <a class="btn" href={`/admin/broadcast?sessionId=${encodeURIComponent(s.sessionId)}`}>
                      Broadcast
                    </a>
                    <a class="btn" href={`/admin/status?sessionId=${encodeURIComponent(s.sessionId)}`}>
                      Status
                    </a>
                    <form
                      method="post"
                      action={`/admin/sessions/${encodeURIComponent(s.sessionId)}/delete`}
                      onsubmit="return confirm('Hapus session ini? Ini akan logout device, stop runtime, dan menghapus record session.');"
                    >
                      <button class="btn danger" type="submit">
                        Hapus
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div id="qrModal" class="modalBackdrop" role="dialog" aria-modal="true">
      <div class="modalCard">
        <div class="modalHead">
          <div class="modalTitle" id="qrModalTitle">
            Scan QR
          </div>
          <button class="modalClose" type="button" id="qrModalClose">
            x
          </button>
        </div>
        <div class="qrPane" id="qrModalPane">
          <div class="spinner" />
          <div class="qrHint">Menyiapkan QR...</div>
        </div>
        <div class="btnRow" style="margin-top: 12px;">
          <button class="btn" type="button" id="qrModalRefresh">
            Refresh
          </button>
          <button class="btn" type="button" id="qrModalCloseBottom">
            Tutup
          </button>
        </div>
      </div>
    </div>

    <div id="webhookModal" class="modalBackdrop" role="dialog" aria-modal="true">
      <div class="modalCard">
        <div class="modalHead">
          <div class="modalTitle" id="webhookModalTitle">
            Webhook
          </div>
          <button class="modalClose" type="button" id="webhookModalClose">
            x
          </button>
        </div>
        <form method="post" action="/admin/sessions/webhook" id="webhookForm">
          <input type="hidden" name="sessionId" id="webhookSessionId" />
          <div class="formRow">
            <div class="label">Webhook URL</div>
            <input
              class="input"
              id="webhookUrlInput"
              name="webhookUrl"
              type="url"
              placeholder="https://example.com/webhook"
            />
          </div>
          <div class="muted" style="margin-top: 10px; font-size: 12px; line-height: 1.5;">
            Kosongkan untuk menonaktifkan webhook untuk device ini (atau pakai default server jika tersedia).
          </div>
          <div class="btnRow" style="margin-top: 12px;">
            <button class="btn primary" type="submit">
              Simpan
            </button>
            <button class="btn" type="submit" name="clear" value="1">
              Reset
            </button>
            <button class="btn" type="button" id="webhookModalCloseBottom">
              Tutup
            </button>
          </div>
        </form>
      </div>
    </div>

    <script
      dangerouslySetInnerHTML={{
        __html: `
(() => {
  const modal = document.getElementById("qrModal");
  const pane = document.getElementById("qrModalPane");
  const title = document.getElementById("qrModalTitle");
  const closeTop = document.getElementById("qrModalClose");
  const closeBottom = document.getElementById("qrModalCloseBottom");
  const refreshBtn = document.getElementById("qrModalRefresh");
  const openButtons = document.querySelectorAll(".js-open-qr");
  let currentSessionId = "";
  let pollTimer = null;

  const stopPoll = () => {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const closeModal = () => {
    stopPoll();
    modal.classList.remove("show");
  };

  const renderLoading = (text) => {
    pane.innerHTML = '<div class="spinner"></div><div class="qrHint">' + text + '</div>';
  };

  const renderReady = () => {
    pane.innerHTML = '<div style="font-size:42px;">✅</div><div style="font-weight:900;">Sesi sudah READY</div><div class="qrHint">Tidak perlu scan QR lagi.</div>';
    try { if (window.__showToast) window.__showToast("Sesi sudah READY", "success"); } catch (_) {}
  };

  const renderError = (message) => {
    pane.innerHTML = '<div style="font-size:40px;">⚠️</div><div style="font-weight:900;">Gagal memuat QR</div><div class="qrHint">' + (message || 'Coba refresh beberapa detik lagi.') + '</div>';
    try { if (window.__showToast) window.__showToast(message || "Gagal memuat QR", "error"); } catch (_) {}
  };

  const renderQR = (sessionId, qrImageUrl) => {
    pane.innerHTML =
      '<div class="qrImageWrap"><img src="' + qrImageUrl + '" alt="QR" width="250" height="250" /></div>' +
      '<div class="qrHint">Session: <strong>' + sessionId + '</strong><br/>Scan QR ini di WhatsApp > Perangkat Tertaut.</div>';
  };

  const pollQr = async () => {
    if (!currentSessionId) return;
    try {
      const res = await fetch('/admin/session-qr/' + encodeURIComponent(currentSessionId), {
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      if (data.status === 'ready') {
        renderReady();
        return;
      }
      if (data.status === 'qr' && data.qrImageUrl) {
        renderQR(currentSessionId, data.qrImageUrl);
        pollTimer = setTimeout(pollQr, 3000);
        return;
      }
      renderLoading('Menunggu QR dari WhatsApp...');
      pollTimer = setTimeout(pollQr, 3000);
    } catch (err) {
      renderError('Koneksi ke server bermasalah');
    }
  };

  const openModal = (sessionId) => {
    if (!sessionId) return;
    currentSessionId = sessionId;
    title.textContent = 'Scan QR - ' + sessionId;
    modal.classList.add('show');
    stopPoll();
    renderLoading('Mengambil QR terbaru...');
    pollQr();
  };

  openButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const sessionId = btn.getAttribute('data-session-id');
      openModal(sessionId || '');
    });
  });

  closeTop.addEventListener('click', closeModal);
  closeBottom.addEventListener('click', closeModal);
  refreshBtn.addEventListener('click', () => {
    if (!currentSessionId) return;
    renderLoading('Merefresh QR...');
    pollQr();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  const autoSession = ${JSON.stringify(props.openQrSessionId ?? "")};
  if (autoSession) openModal(autoSession);
})();
        `,
      }}
    />

    <script
      dangerouslySetInnerHTML={{
        __html: `
(() => {
  const modal = document.getElementById("webhookModal");
  const title = document.getElementById("webhookModalTitle");
  const closeTop = document.getElementById("webhookModalClose");
  const closeBottom = document.getElementById("webhookModalCloseBottom");
  const openButtons = document.querySelectorAll(".js-open-webhook");
  const sessionIdInput = document.getElementById("webhookSessionId");
  const urlInput = document.getElementById("webhookUrlInput");

  const closeModal = () => {
    modal.classList.remove("show");
  };

  const openModal = (sessionId, webhookUrl) => {
    if (!sessionId) return;
    title.textContent = "Webhook - " + sessionId;
    sessionIdInput.value = sessionId;
    urlInput.value = webhookUrl || "";
    modal.classList.add("show");
    urlInput.focus();
  };

  openButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const sessionId = btn.getAttribute("data-session-id") || "";
      const webhookUrl = btn.getAttribute("data-webhook-url") || "";
      openModal(sessionId, webhookUrl);
    });
  });

  closeTop.addEventListener("click", closeModal);
  closeBottom.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
})();
        `,
      }}
    />
  </AdminLayout>
);

const SessionSelect: FC<{ sessions: WaSessionRow[]; selected?: string }> = (
  props,
) => (
  <select class="select" name="sessionId" required>
    <option value="" selected={!props.selected}>
      Pilih session...
    </option>
    {props.sessions.map((s) => (
      <option value={s.sessionId} selected={props.selected === s.sessionId}>
        {s.sessionId}
      </option>
    ))}
  </select>
);

export const MessagePage: FC<
  LayoutBase & {
    waSessions: WaSessionRow[];
    selectedSessionId?: string;
    alert?: string;
  }
> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
    active="message"
  >
    <PageHeader title="WhatsApp Action: Message" subtitle="Kirim pesan teks via session" />
    {props.alert ? <div class="alert">{props.alert}</div> : null}
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <form method="post" action="/admin/message/send">
          <div class="formRow">
            <div class="label">Session</div>
            <SessionSelect sessions={props.waSessions} selected={props.selectedSessionId} />
          </div>
          <div class="formRow">
            <div class="label">Phone</div>
            <input class="input" name="phone" type="text" placeholder="contoh: 0812..." required />
          </div>
          <div class="formRow">
            <div class="label">Message</div>
            <textarea class="textarea" name="message" required />
          </div>
          <div style="margin-top: 14px;" class="btnRow">
            <button class="btn primary" type="submit">
              Kirim
            </button>
          </div>
        </form>
      </div>
    </div>
  </AdminLayout>
);

export const BroadcastPage: FC<
  LayoutBase & {
    waSessions: WaSessionRow[];
    selectedSessionId?: string;
    alert?: string;
  }
> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
    active="broadcast"
  >
    <PageHeader
      title="WhatsApp Action: Broadcast"
      subtitle="Kirim pesan ke banyak nomor (batch)"
    />
    {props.alert ? <div class="alert">{props.alert}</div> : null}
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <form method="post" action="/admin/broadcast/send">
          <div class="formRow">
            <div class="label">Session</div>
            <SessionSelect sessions={props.waSessions} selected={props.selectedSessionId} />
          </div>
          <div class="formRow">
            <div class="label">Phones (pisahkan dengan newline atau koma)</div>
            <textarea class="textarea" name="phones" required />
          </div>
          <div class="formRow">
            <div class="label">Message</div>
            <textarea class="textarea" name="message" required />
          </div>
          <div class="formRow">
            <div class="label">Delay (ms)</div>
            <input class="input" name="delayMs" type="number" min="0" value="2000" />
          </div>
          <div style="margin-top: 14px;" class="btnRow">
            <button class="btn primary" type="submit">
              Kirim Broadcast
            </button>
          </div>
        </form>
      </div>
    </div>
  </AdminLayout>
);

export const StatusPage: FC<
  LayoutBase & {
    waSessions: WaSessionRow[];
    selectedSessionId?: string;
    alert?: string;
  }
> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
    active="status"
  >
    <PageHeader title="WhatsApp Action: Status" subtitle="Buat status WhatsApp" />
    {props.alert ? <div class="alert">{props.alert}</div> : null}
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <form method="post" action="/admin/status/create">
          <div class="formRow">
            <div class="label">Session</div>
            <SessionSelect sessions={props.waSessions} selected={props.selectedSessionId} />
          </div>
          <div class="formRow">
            <div class="label">Text</div>
            <textarea class="textarea" name="text" />
          </div>
          <div class="formRow">
            <div class="label">Media URL (optional)</div>
            <input class="input" name="mediaUrl" type="url" placeholder="https://..." />
          </div>
          <div style="margin-top: 14px;" class="btnRow">
            <button class="btn primary" type="submit">
              Buat Status
            </button>
          </div>
        </form>
      </div>
    </div>
  </AdminLayout>
);

export const HelpPage: FC<LayoutBase> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
    active="dashboard"
  >
    <PageHeader title="Help" subtitle="Panduan cepat penggunaan dashboard" />
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <div class="statLabel">Login</div>
        <div class="muted" style="margin-top: 10px; font-size: 14px; line-height: 1.7;">
          Admin default dibuat otomatis. Masuk lewat /login. Jika mode maintenance aktif,
          hanya admin yang bisa login.
        </div>
      </div>
      <div class="card" style="grid-column: span 12;">
        <div class="statLabel">Session Pengguna WA</div>
        <div class="muted" style="margin-top: 10px; font-size: 14px; line-height: 1.7;">
          Buat sessionId, lalu scan QR pada menu Session. Setelah READY, gunakan menu
          Message/Broadcast/Status.
        </div>
      </div>
    </div>
  </AdminLayout>
);

export const ApiDocsPage: FC<
  LayoutBase & {
    apiKeyLast4?: string | null;
    apiKeyCreatedAt?: string | null;
    newApiKey?: string | null;
    alert?: string;
  }
> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
    active="apiDocs"
  >
    <PageHeader
      title="API Documentation"
      subtitle="Integrasi aplikasi lain menggunakan API Key per user"
    />
    {props.alert ? <div class="alert">{props.alert}</div> : null}
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        <div class="label">API Key</div>
        <div class="muted" style="margin-top: 10px; font-size: 13px; line-height: 1.7;">
          Kirim API Key melalui header <b>X-API-Key</b> atau <b>Authorization: Bearer</b>.
        </div>
        <div
          style="margin-top: 12px; display:flex; align-items:center; justify-content: space-between; gap: 12px; flex-wrap: wrap;"
        >
          <div>
            <div style="font-weight:800; letter-spacing:-0.02em;">
              {props.apiKeyLast4
                ? `•••• •••• •••• ${props.apiKeyLast4}`
                : "Belum ada API Key"}
            </div>
            <div class="muted" style="margin-top: 4px; font-size: 13px;">
              {props.apiKeyCreatedAt ? `Dibuat: ${props.apiKeyCreatedAt}` : ""}
            </div>
          </div>
          <form method="post" action="/admin/api-docs/api-key/rotate">
            <button class="btn primary" type="submit">
              Generate / Reset Key
            </button>
          </form>
        </div>

        {props.newApiKey ? (
          <div
            style="margin-top: 12px; padding: 12px 12px; border-radius: 14px; background: rgba(53,37,205,0.06); border: 1px solid rgba(53,37,205,0.18);"
          >
            <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
              <div style="font-weight:800; letter-spacing: -0.02em;">
                API Key Baru (copy sekarang)
              </div>
              <button class="btn" type="button" id="copyApiKeyBtn" data-api-key={props.newApiKey}>
                Copy
              </button>
            </div>
            <div
              style="margin-top: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 13px; word-break: break-all;"
            >
              {props.newApiKey}
            </div>
            <div class="muted" style="margin-top: 8px; font-size: 13px;">
              API Key ini hanya ditampilkan sekali. Jika hilang, generate ulang.
            </div>
          </div>
        ) : null}
      </div>

      <div class="card" style="grid-column: span 12;">
        <div class="label">Endpoints</div>
        <div class="muted" style="margin-top: 10px; font-size: 13px; line-height: 1.7;">
          Semua endpoint di bawah membutuhkan API Key dan hanya bisa akses session yang
          dimiliki user (admin bisa akses semua).
        </div>
        <div style="margin-top: 12px;">
          <div style="font-weight:800;">GET /sessions</div>
          <div class="muted" style="margin-top: 6px; font-size: 13px;">
            List session yang terdaftar untuk user.
          </div>
        </div>
        <div style="margin-top: 12px;">
          <div style="font-weight:800;">GET /session/status/:sessionId</div>
          <div class="muted" style="margin-top: 6px; font-size: 13px;">
            Cek status runtime session.
          </div>
        </div>
        <div style="margin-top: 12px;">
          <div style="font-weight:800;">POST /send/:sessionId</div>
          <div class="muted" style="margin-top: 6px; font-size: 13px;">
            Body JSON: {"{ phone, message }"}
          </div>
        </div>
        <div style="margin-top: 12px;">
          <div style="font-weight:800;">POST /send-group/:sessionId</div>
          <div class="muted" style="margin-top: 6px; font-size: 13px;">
            Body JSON: {"{ groupId, message }"}
          </div>
        </div>
        <div style="margin-top: 12px;">
          <div style="font-weight:800;">POST /broadcast/:sessionId</div>
          <div class="muted" style="margin-top: 6px; font-size: 13px;">
            Body JSON: {"{ phones: string[], message, delayMs? }"}
          </div>
        </div>
        <div style="margin-top: 12px;">
          <div style="font-weight:800;">POST /status/:sessionId</div>
          <div class="muted" style="margin-top: 6px; font-size: 13px;">
            Body JSON: {"{ text?, mediaUrl? }"}
          </div>
        </div>
        <div style="margin-top: 12px;">
          <div style="font-weight:800;">DELETE /session/:sessionId</div>
          <div class="muted" style="margin-top: 6px; font-size: 13px;">
            Logout dan hapus session dari runtime.
          </div>
        </div>
      </div>

      <div class="card" style="grid-column: span 12;">
        <div class="label">Contoh cURL</div>
        <pre
          style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);"
        >{`curl -X POST "http://localhost:3000/send/sesi1" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <API_KEY_ANDA>" \\
  -d '{"phone":"081234567890","message":"Halo!"}'`}</pre>
      </div>
    </div>
    <script
      dangerouslySetInnerHTML={{
        __html: `
(() => {
  const btn = document.getElementById("copyApiKeyBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const key = btn.getAttribute("data-api-key") || "";
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      if (window.__showToast) window.__showToast("API Key copied", "success");
    } catch (_) {
      if (window.__showToast) window.__showToast("Gagal copy (clipboard diblokir)", "error");
    }
  });
})();
        `,
      }}
    />
  </AdminLayout>
);

export const ProfilePage: FC<
  LayoutBase & {
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
    active="profile"
  >
    <PageHeader title="Profil" subtitle="Ubah email, foto profil, dan password" />
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
        <form method="post" action="/admin/profile" encType="multipart/form-data">
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
