/* @jsxImportSource react */
import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const AiChat = () => {
  const [input, setInput] = useState("");
  const [isImageMode, setIsImageMode] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [localMessages, setLocalMessages] = useState<any[]>([]);
  const [conversationId] = useState(() => "conv-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9));
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, isLoading: isChatLoading } = useChat({
    connection: fetchServerSentEvents("/api/ai/chat"),
    body: { conversationId },
  });

  // Combine remote messages with local image messages
  const allMessages = [...messages, ...localMessages].sort((a, b) => {
    const timeA = new Date(a.createdAt || Date.now()).getTime();
    const timeB = new Date(b.createdAt || Date.now()).getTime();
    return timeA - timeB;
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages, isChatLoading, imageGenerating]);

  const handleImageGeneration = async (prompt: string) => {
    setImageGenerating(true);
    // Add user message locally
    const userMsg = {
      id: "local-" + Date.now(),
      role: "user",
      parts: [{ type: "text", content: prompt }],
      createdAt: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, conversationId }),
      });
      const data = await res.json();

      if (data.success && data.images && data.images.length > 0) {
        const img = data.images[0];
        const imageUrl = img.b64Json ? `data:image/png;base64,${img.b64Json}` : img.url;
        
        const assistantMsg = {
          id: "local-" + (Date.now() + 1),
          role: "assistant",
          parts: [{ type: "image", url: imageUrl }],
          createdAt: new Date().toISOString(),
        };
        setLocalMessages((prev) => [...prev, assistantMsg]);
      } else {
        throw new Error(data.error || "Gagal generate gambar");
      }
    } catch (err: any) {
      const errorMsg = {
        id: "local-" + (Date.now() + 1),
        role: "assistant",
        parts: [{ type: "text", content: "⚠️ Error: " + err.message }],
        createdAt: new Date().toISOString(),
      };
      setLocalMessages((prev) => [...prev, errorMsg]);
    } finally {
      setImageGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isChatLoading || imageGenerating) return;

    if (isImageMode) {
      handleImageGeneration(trimmed);
    } else {
      sendMessage(trimmed);
    }
    setInput("");
  };

  const isLoading = isChatLoading || imageGenerating;

  return (
    <div style={styles.container}>
      {/* Header with Mode Toggle */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.statusDot} />
          <span style={styles.headerTitle}>AI Assistant</span>
        </div>
        <div style={styles.modeTabs}>
          <button
            onClick={() => setIsImageMode(false)}
            style={{
              ...styles.modeBtn,
              ...(isImageMode ? {} : styles.modeBtnActive),
            }}
          >
            <i className="fa-solid fa-message" style={{ marginRight: "6px" }} />
            Chat
          </button>
          <button
            onClick={() => setIsImageMode(true)}
            style={{
              ...styles.modeBtn,
              ...(isImageMode ? styles.modeBtnActive : {}),
            }}
          >
            <i className="fa-solid fa-image" style={{ marginRight: "6px" }} />
            Generate Image
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} style={styles.messagesArea}>
        {allMessages.length === 0 && !isLoading && (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>
              <i className={isImageMode ? "fa-solid fa-wand-magic-sparkles" : "fa-solid fa-robot"} />
            </div>
            <div style={styles.emptyTitle}>
              {isImageMode ? "Bikin Gambar Apa Hari Ini?" : "Halo! Ada yang bisa dibantu?"}
            </div>
            <div style={styles.emptySub}>
              {isImageMode 
                ? "Masukkan prompt deskriptif untuk membuat gambar keren." 
                : "Ketik pesan untuk mulai percakapan dengan AI assistant."}
            </div>
          </div>
        )}
        {allMessages.map((message) => {
          const isAssistant = message.role === "assistant";
          return (
            <div
              key={message.id}
              style={{
                ...styles.messageRow,
                justifyContent: isAssistant ? "flex-start" : "flex-end",
              }}
            >
              {isAssistant && (
                <div style={styles.botAvatar}>
                  <i className="fa-solid fa-robot" style={{ fontSize: "12px" }} />
                </div>
              )}
              <div
                style={{
                  ...styles.messageBubble,
                  ...(isAssistant ? styles.assistantBubble : styles.userBubble),
                }}
              >
                {message.parts.map((part: any, idx: number) => {
                  if (part.type === "thinking") {
                    return (
                      <div key={idx} style={styles.thinking}>
                        <i className="fa-solid fa-brain" style={{ marginRight: "6px" }} />
                        {part.content}
                      </div>
                    );
                  }
                  if (part.type === "text") {
                    return (
                      <div
                        key={idx}
                        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                      >
                        {part.content}
                      </div>
                    );
                  }
                  if (part.type === "image") {
                    return (
                      <div key={idx} style={styles.imageContainer}>
                        <img src={part.url} style={styles.image} alt="Generated" />
                        <a 
                          href={part.url} 
                          download="generated-image.png" 
                          style={styles.downloadBtn}
                          title="Download Image"
                        >
                          <i className="fa-solid fa-download" />
                        </a>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div style={{ ...styles.messageRow, justifyContent: "flex-start" }}>
            <div style={styles.botAvatar}>
              <i className="fa-solid fa-robot" style={{ fontSize: "12px" }} />
            </div>
            <div style={{ ...styles.messageBubble, ...styles.assistantBubble }}>
              <div style={styles.typingDots}>
                <span style={{ ...styles.dot, animationDelay: "0ms" }} />
                <span style={{ ...styles.dot, animationDelay: "150ms" }} />
                <span style={{ ...styles.dot, animationDelay: "300ms" }} />
              </div>
              {imageGenerating && (
                <div style={{ fontSize: "11px", marginTop: "4px", color: "#64748b", fontWeight: 500 }}>
                  Generating your masterpiece...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} style={styles.inputForm}>
        <div style={styles.inputWrapper}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isImageMode ? "Deskripsikan gambar yang ingin dibuat..." : "Ketik pesan..."}
            style={styles.textInput}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            style={{
              ...styles.sendBtn,
              opacity: (!input.trim() || isLoading) ? 0.6 : 1,
              background: isImageMode ? "linear-gradient(135deg, #ec4899, #8b5cf6)" : "linear-gradient(135deg, #3b82f6, #2563eb)",
            }}
          >
            {isLoading ? (
              <div className="spinner-small" style={{ width: "18px", height: "18px", border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            ) : (
              <i className={isImageMode ? "fa-solid fa-wand-magic-sparkles" : "fa-solid fa-paper-plane"} />
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 240px)",
    minHeight: "500px",
    background: "#ffffff",
    borderRadius: "24px",
    overflow: "hidden",
    boxShadow: "0 20px 50px rgba(0,0,0,0.08)",
    border: "1px solid rgba(226, 232, 240, 0.8)",
    position: "relative",
  },
  header: {
    padding: "16px 24px",
    background: "#fff",
    borderBottom: "1px solid rgba(226, 232, 240, 0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  statusDot: {
    width: "8px",
    height: "8px",
    background: "#10b981",
    borderRadius: "50%",
    boxShadow: "0 0 10px rgba(16, 185, 129, 0.5)",
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: "16px",
    color: "#1e293b",
    letterSpacing: "-0.01em",
  },
  modeTabs: {
    display: "flex",
    background: "#f1f5f9",
    padding: "4px",
    borderRadius: "12px",
    gap: "4px",
  },
  modeBtn: {
    border: "none",
    background: "none",
    padding: "6px 12px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#64748b",
    cursor: "pointer",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
  },
  modeBtnActive: {
    background: "#fff",
    color: "#1e293b",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
  },
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    background: "linear-gradient(to bottom, #ffffff, #f8fafc)",
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    textAlign: "center",
    padding: "40px",
  },
  emptyIcon: {
    width: "72px",
    height: "72px",
    borderRadius: "20px",
    background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
    display: "grid",
    placeItems: "center",
    color: "#fff",
    fontSize: "32px",
    boxShadow: "0 20px 40px rgba(59, 130, 246, 0.2)",
    marginBottom: "8px",
  },
  emptyTitle: {
    fontWeight: 800,
    fontSize: "20px",
    color: "#0f172a",
  },
  emptySub: {
    fontSize: "14px",
    color: "#64748b",
    maxWidth: "280px",
    lineHeight: "1.5",
  },
  messageRow: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-end",
    width: "100%",
  },
  botAvatar: {
    width: "32px",
    height: "32px",
    borderRadius: "10px",
    background: "linear-gradient(135deg, #1e293b, #334155)",
    display: "grid",
    placeItems: "center",
    color: "#fff",
    flexShrink: 0,
    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
  },
  messageBubble: {
    maxWidth: "80%",
    padding: "12px 18px",
    borderRadius: "18px",
    fontSize: "14px",
    lineHeight: "1.6",
    position: "relative",
    transition: "all 0.3s ease",
  },
  userBubble: {
    background: "linear-gradient(135deg, #3b82f6, #2563eb)",
    color: "#ffffff",
    borderBottomRightRadius: "4px",
    boxShadow: "0 10px 25px rgba(37, 99, 235, 0.15)",
  },
  assistantBubble: {
    background: "#ffffff",
    color: "#1e293b",
    borderBottomLeftRadius: "4px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 4px 15px rgba(0,0,0,0.03)",
  },
  thinking: {
    fontSize: "12px",
    color: "#64748b",
    display: "flex",
    alignItems: "center",
    marginBottom: "8px",
    fontWeight: 500,
    padding: "4px 8px",
    background: "#f1f5f9",
    borderRadius: "6px",
    width: "fit-content",
  },
  imageContainer: {
    position: "relative",
    marginTop: "4px",
    borderRadius: "12px",
    overflow: "hidden",
    border: "1px solid #e2e8f0",
  },
  image: {
    width: "100%",
    maxHeight: "400px",
    display: "block",
    objectFit: "cover",
  },
  downloadBtn: {
    position: "absolute",
    top: "10px",
    right: "10px",
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    background: "rgba(0,0,0,0.5)",
    backdropFilter: "blur(4px)",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    textDecoration: "none",
    fontSize: "14px",
    transition: "all 0.2s ease",
  },
  typingDots: {
    display: "flex",
    gap: "4px",
    padding: "4px 0",
  },
  dot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#94a3b8",
    animation: "dotPulse 1s ease-in-out infinite",
  },
  inputForm: {
    padding: "20px 24px",
    borderTop: "1px solid #e2e8f0",
    background: "#fff",
  },
  inputWrapper: {
    display: "flex",
    alignItems: "center",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "6px 6px 6px 16px",
    transition: "all 0.2s ease",
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
  },
  textInput: {
    flex: 1,
    border: "none",
    background: "transparent",
    padding: "10px 0",
    fontSize: "15px",
    color: "#1e293b",
    outline: "none",
  },
  sendBtn: {
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    border: "none",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    transition: "all 0.2s ease",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  },
};

// ─── Mount ────────────────────────────────────────────────────────────────────

const root = document.getElementById("ai-chat-root");
if (root) {
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    @keyframes dotPulse {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1.2); }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .message-area::-webkit-scrollbar {
      width: 6px;
    }
    .message-area::-webkit-scrollbar-thumb {
      background: #e2e8f0;
      border-radius: 10px;
    }
    .input-wrapper:focus-within {
      border-color: #3b82f6 !important;
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1) !important;
    }
  `;
  document.head.appendChild(styleEl);

  createRoot(root).render(<AiChat />);
}
