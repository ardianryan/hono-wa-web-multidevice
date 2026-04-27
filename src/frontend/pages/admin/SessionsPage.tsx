import type { FC } from "hono/jsx";
import { AdminLayout, PageHeader } from "./ui.js";
import { Skeleton } from "../../components/Skeleton.js";

type LayoutBase = {
  appName: string;
  username: string;
  appDescription?: string;
  logoUrl?: string;
  avatarUrl?: string;
};

type WaSessionRow = {
  id: string;
  sessionId: string;
  createdAt: string;
  userId?: string;
  webhookUrl?: string | null;
};

export const SessionsPage: FC<
  LayoutBase & {
    role: "admin" | "user";
    userId: string;
    maxDevices: number;
    waSessions: WaSessionRow[];
    runtimeSessionIds: string[];
    openQrSessionId?: string;
    alert?: string;
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
    active="sessions"
  >
    <PageHeader
      title="Session Pengguna WA"
      subtitle="Kelola device WhatsApp yang terhubung untuk aksi pesan/broadcast/status"
    />
    {props.alert ? <div class="alert">{props.alert}</div> : null}
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        {props.isLoading ? (
          <Skeleton height={200} />
        ) : (
        <>
        <div class="statLabel">Buat Session Baru</div>
        <div class="muted" style="margin-top: 8px; font-size: 13px;">
          Limit device:{" "}
          {props.role === "admin"
            ? "admin (tanpa limit praktis)"
            : String(props.maxDevices)}
        </div>
        <form
          method="post"
          action="/admin/sessions/new"
          style="margin-top: 10px;"
        >
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
        </>
        )}
      </div>

      <div class="card" style="grid-column: span 12;">
        <div class="statLabel">Daftar Session</div>
        {props.isLoading ? (
          <div style="margin-top: 12px;"><Skeleton height={300} /></div>
        ) : (
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
                  {props.runtimeSessionIds.includes(s.sessionId)
                    ? "active"
                    : "inactive"}
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
                    <a
                      class="btn"
                      href={`/admin/message?sessionId=${encodeURIComponent(s.sessionId)}`}
                    >
                      Message
                    </a>
                    <a
                      class="btn"
                      href={`/admin/broadcast?sessionId=${encodeURIComponent(s.sessionId)}`}
                    >
                      Broadcast
                    </a>
                    <a
                      class="btn"
                      href={`/admin/status?sessionId=${encodeURIComponent(s.sessionId)}`}
                    >
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
        )}
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

    <div
      id="webhookModal"
      class="modalBackdrop"
      role="dialog"
      aria-modal="true"
    >
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
          <div
            class="muted"
            style="margin-top: 10px; font-size: 12px; line-height: 1.5;"
          >
            Isi URL webhook (contoh: n8n, Make, Zapier, custom endpoint) untuk
            menerima event dari device ini. Kosongkan untuk menonaktifkan
            webhook untuk device ini (atau pakai default server jika tersedia).
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
