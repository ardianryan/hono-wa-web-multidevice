import type { FC } from "hono/jsx";
import { AdminLayout, PageHeader } from "./ui.js";
import { SessionSelect } from "../../components/SessionSelect.js";
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

type ActionLogRow = {
  id: string;
  sessionId: string;
  createdAt: string;
  success: boolean;
  payload: any;
  error?: string | null;
};

const UNSEND_WINDOW_MS = 48 * 60 * 60 * 1000;
const collectMessageIds = (payload: any): string[] => {
  const direct = Array.isArray(payload?.sentMessageIds)
    ? payload.sentMessageIds
    : [];
  const nested = Array.isArray(payload?.sentItems)
    ? payload.sentItems.flatMap((item: any) =>
        Array.isArray(item?.messageIds) ? item.messageIds : [],
      )
    : [];
  return Array.from(
    new Set(
      [...direct, ...nested].map((v) => String(v ?? "").trim()).filter(Boolean),
    ),
  );
};
const canUnsend = (row: ActionLogRow) =>
  collectMessageIds(row.payload).length > 0 &&
  Date.now() - new Date(row.createdAt).getTime() <= UNSEND_WINDOW_MS;

export const StatusPage: FC<
  LayoutBase & {
    role?: "admin" | "user";
    waSessions: WaSessionRow[];
    selectedSessionId?: string;
    alert?: string;
    history?: ActionLogRow[];
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
    active="status"
  >
    <PageHeader
      title="WhatsApp Action: Status"
      subtitle="Buat status WhatsApp"
    />
    {props.alert ? <div class="alert">{props.alert}</div> : null}
    <div class="grid">
      <div class="card" style="grid-column: span 12;">
        {props.isLoading ? (
          <Skeleton height={280} />
        ) : (
        <form method="post" action="/admin/status/create">
          <div class="formRow">
            <div class="label">Session</div>
            <SessionSelect
              sessions={props.waSessions}
              selected={props.selectedSessionId}
            />
          </div>
          <div class="formRow">
            <div class="label">Text</div>
            <textarea class="textarea" name="text" />
          </div>
          <div class="formRow">
            <div class="label">Media URL (optional)</div>
            <input
              class="input"
              name="mediaUrl"
              type="url"
              placeholder="https://..."
            />
          </div>
          <div style="margin-top: 14px;" class="btnRow">
            <button class="btn primary" type="submit">
              Buat Status
            </button>
          </div>
        </form>
        )}
      </div>
      <div class="card" style="grid-column: span 12;">
        <div class="statLabel">History Status</div>
        {props.isLoading ? (
          <div style="margin-top: 12px;"><Skeleton height={300} /></div>
        ) : (
        <>
        <div class="muted" style="margin-top: 8px; font-size: 13px;">
          Menampilkan {String((props.history ?? []).length)} data terbaru.
        </div>
        <form
          id="history-status-bulk-form"
          method="post"
          action="/admin/history/delete-selected"
        >
          <input type="hidden" name="actionType" value="status" />
          <input
            type="hidden"
            name="sessionId"
            value={props.selectedSessionId ?? ""}
          />
          <div class="btnRow" style="margin-top: 10px;">
            <button class="btn danger" type="submit">
              Delete Selected
            </button>
            <button
              class="btn danger"
              type="submit"
              formaction="/admin/history/delete-all"
            >
              Delete All
            </button>
            <a
              class="btn"
              href={`/admin/history/download.csv?actionType=status&sessionId=${encodeURIComponent(props.selectedSessionId ?? "")}`}
            >
              Download CSV
            </a>
          </div>
        </form>
        <table class="table" style="margin-top: 12px;">
          <thead>
            <tr>
              <th>Pilih</th>
              <th>Waktu</th>
              <th>Session</th>
              <th>Media URL</th>
              <th>Text</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {(props.history ?? []).map((h) => (
              <tr>
                <td class="muted">
                  <input
                    type="checkbox"
                    name="selectedIds"
                    value={h.id}
                    form="history-status-bulk-form"
                  />
                </td>
                <td class="muted">{new Date(h.createdAt).toLocaleString()}</td>
                <td>{h.sessionId}</td>
                <td class="muted">
                  <div style="max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    {String(h.payload?.mediaUrl ?? "-")}
                  </div>
                </td>
                <td class="muted">
                  <div style="max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    {String(h.payload?.text ?? "-")}
                  </div>
                </td>
                <td class="muted">
                  {h.success
                    ? "sent"
                    : `failed${h.error ? `: ${h.error}` : ""}`}
                </td>
                <td>
                  <div class="btnRow">
                    <form method="post" action="/admin/history/resend">
                      <input type="hidden" name="actionType" value="status" />
                      <input
                        type="hidden"
                        name="sessionId"
                        value={props.selectedSessionId ?? ""}
                      />
                      <input type="hidden" name="actionLogId" value={h.id} />
                      <button class="btn success" type="submit">
                        Resend
                      </button>
                    </form>
                    <form method="post" action="/admin/history/unsend">
                      <input type="hidden" name="actionType" value="status" />
                      <input
                        type="hidden"
                        name="sessionId"
                        value={props.selectedSessionId ?? ""}
                      />
                      <input type="hidden" name="actionLogId" value={h.id} />
                      <button
                        class="btn warning"
                        type="submit"
                        disabled={!canUnsend(h)}
                      >
                        Unsend
                      </button>
                    </form>
                    <form method="post" action="/admin/history/delete">
                      <input type="hidden" name="actionType" value="status" />
                      <input
                        type="hidden"
                        name="sessionId"
                        value={props.selectedSessionId ?? ""}
                      />
                      <input type="hidden" name="actionLogId" value={h.id} />
                      <button class="btn danger" type="submit">
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
        )}
      </div>
    </div>
  </AdminLayout>
);
