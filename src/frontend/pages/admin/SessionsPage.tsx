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
        <div class="tableResponsive">
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
                  <td>
                    <div class="webhookBadge">
                      <i class="fa-solid fa-globe"></i>
                      <span>
                        {s.webhookUrl
                          ? s.webhookUrl.includes(",")
                            ? `${s.webhookUrl.split(",").length} URLs`
                            : s.webhookUrl
                          : "(tidak ada)"}
                      </span>
                    </div>
                  </td>
                  <td>
                    {props.runtimeSessionIds.includes(s.sessionId) ? (
                      <span class="statusBadge active">
                        <i class="fa-solid fa-circle-play"></i>
                        Active
                      </span>
                    ) : (
                      <span class="statusBadge inactive">
                        <i class="fa-solid fa-circle-stop"></i>
                        Inactive
                      </span>
                    )}
                  </td>
                  <td class="muted">{new Date(s.createdAt).toLocaleString()}</td>
                  <td>
                    <div class="btnRow">
                      <button
                        class="btn success js-open-qr"
                        type="button"
                        data-session-id={s.sessionId}
                      >
                        <i class="fa-solid fa-plug" style="margin-right: 6px;"></i>
                        Connect
                      </button>
                      <button
                        class="btn primary js-open-webhook"
                        type="button"
                        data-session-id={s.sessionId}
                        data-webhook-url={s.webhookUrl ?? ""}
                      >
                        <i class="fa-solid fa-link" style="margin-right: 6px;"></i>
                        Webhook
                      </button>
                      <form
                        method="post"
                        action={`/admin/sessions/${encodeURIComponent(s.sessionId)}/delete`}
                        onsubmit="return confirm('Hapus session ini? Ini akan logout device, stop runtime, dan menghapus record session.');"
                      >
                        <button class="btn danger" type="submit">
                          <i class="fa-solid fa-trash" style="margin-right: 6px;"></i>
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
        )}
      </div>
    </div>

    <div id="qrModal" class="modalBackdrop" role="dialog" aria-modal="true">
      <div class="modalCard">
        <div class="modalHead">
          <div class="modalTitle" id="qrModalTitle">
            Connect Device
          </div>
          <button class="modalClose" type="button" id="qrModalClose">
            x
          </button>
        </div>
        <div class="modalTabs" style="display: flex; border-bottom: 1px solid #eee; margin-bottom: 15px;">
           <button class="tabBtn active" id="tabQR" style="flex: 1; padding: 10px; background: none; border: none; border-bottom: 2px solid #25D366; cursor: pointer; font-weight: bold;">Scan QR</button>
           <button class="tabBtn" id="tabPair" style="flex: 1; padding: 10px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; color: #666;">Pair with Number</button>
        </div>
        
        <div id="paneQR">
          <div class="qrPane" id="qrModalPane">
            <div class="spinner" />
            <div class="qrHint">Menyiapkan QR...</div>
          </div>
        </div>

        <div id="panePair" style="display: none; padding: 10px 0;">
           <div class="formRow">
              <div class="label">Nomor WhatsApp</div>
              <input type="text" id="pairPhone" class="input" placeholder="6281234567890" />
              <div class="muted" style="font-size: 11px; margin-top: 4px;">Gunakan kode negara (62...) tanpa tanda + atau spasi.</div>
           </div>
           <button class="btn primary" id="btnGetPairCode" style="width: 100%; margin-top: 10px;">Dapatkan Kode Pairing</button>
           
           <div id="pairResult" style="display: none; margin-top: 20px; text-align: center;">
              <div class="muted" style="font-size: 13px; margin-bottom: 10px;">Masukkan kode ini di WhatsApp &gt; Perangkat Tertaut &gt; Tautkan dengan nomor telepon:</div>
              <div id="pairCodeDisplay" style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #25D366; background: #f0fdf4; padding: 15px; border-radius: 8px; border: 2px dashed #25D366;">
                 --------
              </div>
           </div>
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
            <div class="label">Webhook URLs</div>
            <div id="webhookUrlList" style="display:flex; flex-direction:column; gap:8px;"></div>
            <button type="button" class="btn" id="addWebhookUrlBtn" style="margin-top:8px; font-size:12px; width:fit-content;">
              <i class="fa-solid fa-plus" style="margin-right:4px;"></i> Tambah URL
            </button>
            <input type="hidden" name="webhookUrl" id="webhookUrlInput" />
          </div>
          <div
            class="muted"
            style="margin-top: 10px; font-size: 12px; line-height: 1.5;"
          >
            Isi URL webhook (contoh: n8n, Make, Zapier, custom endpoint) untuk
            menerima event dari device ini. Kosongkan untuk menonaktifkan
            webhook untuk device ini.
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
  
  const tabQR = document.getElementById("tabQR");
  const tabPair = document.getElementById("tabPair");
  const paneQR = document.getElementById("paneQR");
  const panePair = document.getElementById("panePair");
  const btnGetPairCode = document.getElementById("btnGetPairCode");
  const pairPhone = document.getElementById("pairPhone");
  const pairResult = document.getElementById("pairResult");
  const pairCodeDisplay = document.getElementById("pairCodeDisplay");

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

  const switchTab = (mode) => {
     if (mode === 'qr') {
        tabQR.style.borderBottomColor = '#25D366';
        tabQR.style.color = '#333';
        tabPair.style.borderBottomColor = 'transparent';
        tabPair.style.color = '#666';
        paneQR.style.display = 'block';
        panePair.style.display = 'none';
        refreshBtn.style.display = 'inline-block';
        pollQr();
     } else {
        tabPair.style.borderBottomColor = '#25D366';
        tabPair.style.color = '#333';
        tabQR.style.borderBottomColor = 'transparent';
        tabQR.style.color = '#666';
        paneQR.style.display = 'none';
        panePair.style.display = 'block';
        refreshBtn.style.display = 'none';
        stopPoll();
     }
  };

  tabQR.addEventListener('click', () => switchTab('qr'));
  tabPair.addEventListener('click', () => switchTab('pair'));

  btnGetPairCode.addEventListener('click', async () => {
     const phone = pairPhone.value.trim();
     if (!phone) return alert('Masukkan nomor HP');
     
     btnGetPairCode.disabled = true;
     btnGetPairCode.textContent = 'Meminta kode...';
     pairResult.style.display = 'none';

     try {
        const res = await fetch('/admin/sessions/pair', {
           method: 'POST',
           headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
           body: new URLSearchParams({ sessionId: currentSessionId, phone })
        });
        const data = await res.json();
        if (data.success) {
           pairCodeDisplay.textContent = data.code;
           pairResult.style.display = 'block';
        } else {
           alert(data.error || 'Gagal mengambil kode');
        }
     } catch (err) {
        alert('Gagal menghubungi server');
     } finally {
        btnGetPairCode.disabled = false;
        btnGetPairCode.textContent = 'Dapatkan Kode Pairing';
     }
  });

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
    if (!currentSessionId || paneQR.style.display === 'none') return;
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
    title.textContent = 'Connect Device - ' + sessionId;
    modal.classList.add('show');
    switchTab('qr');
    pairResult.style.display = 'none';
    pairPhone.value = '';
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
  
  const listContainer = document.getElementById("webhookUrlList");
  const addBtn = document.getElementById("addWebhookUrlBtn");
  const form = document.getElementById("webhookForm");
  const hiddenInput = document.getElementById("webhookUrlInput");

  const closeModal = () => {
    modal.classList.remove("show");
  };

  const renderInput = (val) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "8px";
    
    const inp = document.createElement("input");
    inp.className = "input";
    inp.type = "url";
    inp.placeholder = "https://...";
    inp.style.flex = "1";
    inp.value = val || "";
    
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn danger js-remove-url";
    btn.title = "Hapus";
    btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    
    row.appendChild(inp);
    row.appendChild(btn);
    listContainer.appendChild(row);
  };

  addBtn.addEventListener("click", () => {
    renderInput("");
  });

  listContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-remove-url");
    if (btn) {
      btn.parentElement.remove();
    }
  });

  form.addEventListener("submit", () => {
    const inputs = listContainer.querySelectorAll("input");
    const urls = [];
    inputs.forEach(inp => {
      if (inp.value.trim()) urls.push(inp.value.trim());
    });
    hiddenInput.value = urls.join(",");
  });

  const openModal = (sessionId, webhookUrl) => {
    if (!sessionId) return;
    title.textContent = "Webhook - " + sessionId;
    sessionIdInput.value = sessionId;
    listContainer.innerHTML = "";
    if (webhookUrl) {
      const urls = webhookUrl.split(",");
      urls.forEach(u => renderInput(u));
    } else {
      renderInput("");
    }
    modal.classList.add("show");
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
