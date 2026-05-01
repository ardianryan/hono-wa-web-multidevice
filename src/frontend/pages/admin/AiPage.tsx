import type { FC } from "hono/jsx";
import { AdminLayout, PageHeader } from "./ui.js";
import { HistoryChatPrompt } from "../../components/HistoryChatPrompt.js";

export type AiChatHistory = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  model: string | null;
  createdAt: Date;
};

type LayoutBase = {
  appName: string;
  username: string;
  appDescription?: string;
  logoUrl?: string;
  avatarUrl?: string;
  role?: "admin" | "user";
  history?: AiChatHistory[];
};

export const AiPage: FC<LayoutBase> = (props) => (
  <AdminLayout
    appName={props.appName}
    username={props.username}
    appDescription={props.appDescription}
    logoUrl={props.logoUrl}
    avatarUrl={props.avatarUrl}
    role={props.role}
    active="ai"
  >
    <PageHeader
      title="AI Assistant"
      subtitle="Chat cerdas dan generate gambar artistik dengan AI"
    />
    <div style="margin-top: 24px;">
      <div id="ai-chat-root">
        <div
          class="card"
          style="display:flex; align-items:center; justify-content:center; min-height:500px; gap:16px; flex-direction:column; border-radius: 24px; border: 1px dashed #cbd5e1; background: #f8fafc;"
        >
          <div class="spinner" style="width: 32px; height: 32px;" />
          <div class="muted" style="font-size: 14px; font-weight: 500;">
            Menyiapkan AI Assistant...
          </div>
        </div>
      </div>
    </div>
    <HistoryChatPrompt history={props.history || []} />

    <script type="module" src="/assets/ai-chat.js" />
  </AdminLayout>
);
