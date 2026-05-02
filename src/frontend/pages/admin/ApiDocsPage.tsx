import type { FC } from "hono/jsx";
import { AdminLayout, PageHeader } from "./ui.js";

type LayoutBase = {
  appName: string;
  username: string;
  appDescription?: string;
  logoUrl?: string;
  avatarUrl?: string;
};

export const ApiDocsPage: FC<
  LayoutBase & {
    role?: "admin" | "user";
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
    role={props.role}
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
        <div
          class="muted"
          style="margin-top: 10px; font-size: 13px; line-height: 1.7;"
        >
          Kirim API Key melalui header <b>X-API-Key</b> atau{" "}
          <b>Authorization: Bearer</b>.
        </div>
        <div style="margin-top: 12px; display:flex; align-items:center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
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
          <div style="margin-top: 12px; padding: 12px 12px; border-radius: 14px; background: rgba(53,37,205,0.06); border: 1px solid rgba(53,37,205,0.18);">
            <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
              <div style="font-weight:800; letter-spacing: -0.02em;">
                API Key Baru (copy sekarang)
              </div>
              <button
                class="btn"
                type="button"
                id="copyApiKeyBtn"
                data-api-key={props.newApiKey}
              >
                Copy
              </button>
            </div>
            <div style="margin-top: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 13px; word-break: break-all;">
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
        <div
          class="muted"
          style="margin-top: 10px; font-size: 13px; line-height: 1.7;"
        >
          Semua endpoint di bawah membutuhkan API Key dan hanya bisa akses
          session yang dimiliki user (admin bisa akses semua).
        </div>
        <div
          class="muted"
          style="margin-top: 10px; font-size: 13px; line-height: 1.7;"
        >
          Base URL: <b>http://localhost:3000</b>
          <br />
          Auth Header:
          <br />- <b>X-API-Key</b>: {"<API_KEY>"}
          <br />- <b>Authorization</b>: {"Bearer <API_KEY>"}
        </div>

        <div style="margin-top: 14px;">
          <div style="font-weight:900;">GET /sessions</div>
          <div
            class="muted"
            style="margin-top: 6px; font-size: 13px; line-height: 1.7;"
          >
            List session yang terdaftar untuk user (dari DB) + status runtime
            jika sedang aktif.
          </div>
        </div>

        <div style="margin-top: 14px;">
          <div style="font-weight:900;">GET /session/status/:sessionId</div>
          <div
            class="muted"
            style="margin-top: 6px; font-size: 13px; line-height: 1.7;"
          >
            Cek status runtime 1 session.
          </div>
        </div>

        <div style="margin-top: 14px;">
          <div style="font-weight:900;">POST /send/:sessionId</div>
          <div
            class="muted"
            style="margin-top: 6px; font-size: 13px; line-height: 1.7;"
          >
            Kirim pesan ke nomor.
            <br />
            JSON: {"{ phone, message?, mediaUrl? }"}
            <br />
            Upload: multipart/form-data (field file: <b>media</b>, ukuran
            mengikuti setting admin <b>media_max_mb</b>).
            <br />
            Catatan: message boleh kosong jika ada media.
          </div>
        </div>

        <div style="margin-top: 14px;">
          <div style="font-weight:900;">POST /send-group/:sessionId</div>
          <div
            class="muted"
            style="margin-top: 6px; font-size: 13px; line-height: 1.7;"
          >
            Kirim pesan ke grup.
            <br />
            JSON: {"{ groupId, message }"} (text-only)
          </div>
        </div>

        <div style="margin-top: 14px;">
          <div style="font-weight:900;">POST /broadcast/:sessionId</div>
          <div
            class="muted"
            style="margin-top: 6px; font-size: 13px; line-height: 1.7;"
          >
            Kirim pesan ke banyak nomor.
            <br />
            JSON: {"{ phones, message?, mediaUrl?, delayMs? }"}
            <br />
            Upload: multipart/form-data (field file: <b>media</b>).
            <br />
            <b>delayMs</b> minimal 5000, dan maksimal 200 nomor per request.
          </div>
        </div>

        <div style="margin-top: 14px;">
          <div style="font-weight:900;">POST /status/:sessionId</div>
          <div
            class="muted"
            style="margin-top: 6px; font-size: 13px; line-height: 1.7;"
          >
            Buat status WhatsApp.
            <br />
            JSON: {"{ text?, mediaUrl? }"} (tidak mendukung upload file via
            API).
          </div>
        </div>

        <div style="margin-top: 14px;">
          <div style="font-weight:900;">DELETE /session/:sessionId</div>
          <div
            class="muted"
            style="margin-top: 6px; font-size: 13px; line-height: 1.7;"
          >
            Logout + stop runtime + hapus record session (sesuai scope
            user/admin).
          </div>
        </div>
      </div>

      <div class="card" style="grid-column: span 12;">
        <div class="label">Integrasi n8n</div>
        <div
          class="muted"
          style="margin-top: 10px; font-size: 13px; line-height: 1.7;"
        >
          Gunakan custom node <b>n8n-nodes-honowa</b> untuk mengintegrasikan
          WhatsApp dengan workflow n8n secara native.
        </div>

        <div style="margin-top: 14px;">
          <div style="font-weight:900;">1. Instalasi</div>
          <div
            class="muted"
            style="margin-top: 6px; font-size: 13px; line-height: 1.7;"
          >
            Di n8n: <b>Settings &gt; Community Nodes &gt; Install a node</b>
            <br />
            Masukkan: <code>n8n-nodes-honowa</code>
          </div>
        </div>

        <div style="margin-top: 14px;">
          <div style="font-weight:900;">2. Konfigurasi</div>
          <div
            class="muted"
            style="margin-top: 6px; font-size: 13px; line-height: 1.7;"
          >
            Buat credential <b>HonoWA API</b> di n8n:
            <br />- <b>Base URL</b>: URL server ini (contoh: <code>http://domain-anda.com</code>)
            <br />- <b>API Key</b>: Gunakan API Key dari bagian atas halaman ini.
          </div>
        </div>

        <div style="margin-top: 14px;">
          <div style="font-weight:900;">3. Fitur n8n</div>
          <div
            class="muted"
            style="margin-top: 6px; font-size: 13px; line-height: 1.7;"
          >
            - Dropdown otomatis untuk memilih Session aktif.
            <br />- Support pengiriman Media (URL atau Binary/Upload).
            <br />- Support Broadcast dengan delay otomatis.
            <br />- AI Ready: Bisa digunakan sebagai tool oleh AI Agent n8n.
          </div>
        </div>
      </div>

      <div class="card" style="grid-column: span 12;">
        <div class="label">Contoh cURL (X-API-Key)</div>
        <div
          class="muted"
          style="margin-top: 10px; font-size: 13px; line-height: 1.7;"
        >
          Ganti <b>sesi1</b> dan <b>{`<API_KEY_ANDA>`}</b> sesuai data kamu.
        </div>
        <div style="margin-top: 12px; font-weight: 900;">GET /sessions</div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl "http://localhost:3000/sessions" \\
  -H "X-API-Key: <API_KEY_ANDA>"`}</pre>

        <div style="margin-top: 12px; font-weight: 900;">
          GET /session/status/:sessionId
        </div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl "http://localhost:3000/session/status/sesi1" \\
  -H "X-API-Key: <API_KEY_ANDA>"`}</pre>

        <div style="margin-top: 12px; font-weight: 900;">
          POST /send/:sessionId (text)
        </div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl -X POST "http://localhost:3000/send/sesi1" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <API_KEY_ANDA>" \\
  -d '{"phone":"081234567890","message":"Halo!"}'`}</pre>

        <div style="margin-top: 12px; font-weight: 900;">
          POST /send/:sessionId (mediaUrl)
        </div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl -X POST "http://localhost:3000/send/sesi1" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <API_KEY_ANDA>" \\
  -d '{"phone":"081234567890","message":"Caption","mediaUrl":"https://example.com/file.jpg"}'`}</pre>

        <div style="margin-top: 12px; font-weight: 900;">
          POST /send/:sessionId (upload)
        </div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl -X POST "http://localhost:3000/send/sesi1" \\
  -H "X-API-Key: <API_KEY_ANDA>" \\
  -F "phone=081234567890" \\
  -F "message=Caption" \\
  -F "media=@/path/to/file.jpg"`}</pre>

        <div style="margin-top: 12px; font-weight: 900;">
          POST /send-group/:sessionId
        </div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl -X POST "http://localhost:3000/send-group/sesi1" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <API_KEY_ANDA>" \\
  -d '{"groupId":"120363xxxx@g.us","message":"Halo grup!"}'`}</pre>

        <div style="margin-top: 12px; font-weight: 900;">
          POST /broadcast/:sessionId (text)
        </div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl -X POST "http://localhost:3000/broadcast/sesi1" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <API_KEY_ANDA>" \\
  -d '{"phones":["0812...","0898..."],"message":"Halo","delayMs":5000}'`}</pre>

        <div style="margin-top: 12px; font-weight: 900;">
          POST /broadcast/:sessionId (mediaUrl)
        </div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl -X POST "http://localhost:3000/broadcast/sesi1" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <API_KEY_ANDA>" \\
  -d '{"phones":["0812...","0898..."],"message":"Caption","mediaUrl":"https://example.com/file.pdf","delayMs":5000}'`}</pre>

        <div style="margin-top: 12px; font-weight: 900;">
          POST /broadcast/:sessionId (upload)
        </div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl -X POST "http://localhost:3000/broadcast/sesi1" \\
  -H "X-API-Key: <API_KEY_ANDA>" \\
  -F "phones=0812...,0898..." \\
  -F "message=Caption" \\
  -F "delayMs=5000" \\
  -F "media=@/path/to/file.pdf"`}</pre>

        <div style="margin-top: 12px; font-weight: 900;">
          POST /status/:sessionId
        </div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl -X POST "http://localhost:3000/status/sesi1" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <API_KEY_ANDA>" \\
  -d '{"text":"Halo","mediaUrl":"https://example.com/image.jpg"}'`}</pre>

        <div style="margin-top: 12px; font-weight: 900;">
          DELETE /session/:sessionId
        </div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl -X DELETE "http://localhost:3000/session/sesi1" \\
  -H "X-API-Key: <API_KEY_ANDA>"`}</pre>
      </div>

      <div class="card" style="grid-column: span 12;">
        <div class="label">Contoh cURL (Authorization: Bearer)</div>
        <div
          class="muted"
          style="margin-top: 10px; font-size: 13px; line-height: 1.7;"
        >
          Contoh berikut sama, hanya header auth yang berbeda.
        </div>
        <div style="margin-top: 12px; font-weight: 900;">GET /sessions</div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl "http://localhost:3000/sessions" \\
  -H "Authorization: Bearer <API_KEY_ANDA>"`}</pre>

        <div style="margin-top: 12px; font-weight: 900;">
          POST /send/:sessionId (text)
        </div>
        <pre style="margin-top: 10px; white-space: pre-wrap; font-size: 13px; padding: 12px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(199,196,216,0.35);">{`curl -X POST "http://localhost:3000/send/sesi1" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <API_KEY_ANDA>" \\
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
