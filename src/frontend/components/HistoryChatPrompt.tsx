import type { FC } from "hono/jsx";
import type { AiChatHistory } from "../pages/admin/AiPage.js";

export const HistoryChatPrompt: FC<{ history: AiChatHistory[] }> = (props) => {
  const history = props.history || [];

  return (
    <div class="card" style="margin-top: 18px;">
      <div class="statLabel">Chat History & Prompts</div>
      <div style="margin-top: 12px; overflow-x: auto;">
        {history.length === 0 ? (
          <div class="muted" style="padding: 20px; text-align: center; font-size: 14px;">
            Belum ada riwayat chat.
          </div>
        ) : (
          <table class="table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Role</th>
                <th>Pesan</th>
                <th>Model</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td style="white-space: nowrap; font-size: 13px;">
                    {new Date(item.createdAt).toLocaleString("id-ID", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td>
                    <span
                      class={`chip`}
                      style={`background: ${
                        item.role === "user" ? "rgba(53,37,205,0.1)" : "rgba(34,197,94,0.1)"
                      }; color: ${item.role === "user" ? "#3525cd" : "#166534"};`}
                    >
                      {item.role}
                    </span>
                  </td>
                  <td>
                    <div
                      style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px;"
                      title={item.content}
                    >
                      {item.content.startsWith("[IMAGE]") ? (
                        <span style="display: flex; align-items: center; gap: 8px; color: #8b5cf6; font-weight: 600;">
                          <i class="fa-solid fa-image"></i>
                          Generated Image
                        </span>
                      ) : (
                        item.content
                      )}
                    </div>
                  </td>
                  <td class="muted" style="font-size: 12px;">
                    {item.model || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
