import { chat, toServerSentEventsResponse, generateImage } from "@tanstack/ai";
import { createGeminiChat, geminiImage } from "@tanstack/ai-gemini";
import { createOpenaiChat, openaiImage } from "@tanstack/ai-openai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import type { Context } from "hono";
import type { ToolDefinition } from "@tanstack/ai";
import { db } from "../config/db.js";
import { aiChats } from "../config/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";


export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_IMAGE_MODEL = "imagen-4.0-generate-001";


export const getAdapter = (modelName: string) => {
  if (modelName.startsWith("gpt") || modelName.includes("openai")) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
    return createOpenaiChat(modelName as any, apiKey, {
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }

  if (modelName.startsWith("claude") || modelName.includes("anthropic")) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
    return createAnthropicChat(modelName as any, apiKey);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  return createGeminiChat(modelName as any, apiKey);
};

export const getImageAdapter = (modelName: string) => {
  if (modelName.startsWith("dall-e") || modelName.includes("openai")) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
    return (openaiImage as any)(modelName, {
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  return (geminiImage as any)(modelName, apiKey);
};



type MessageRole = "user" | "assistant" | "tool";

export type AiChatMessage = {
  role: MessageRole;
  content: any; // Can be string or parts array
  parts?: any[]; // Some clients might send parts separately
};

export type AiChatOptions = {
  messages: Array<AiChatMessage>;
  conversationId?: string;
  model?: string;
  tools?: Array<ToolDefinition<any, any, any>>;
  data?: Record<string, any>;
};

export const getMessageText = (msg: any): string => {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.content)
      .filter(Boolean)
      .join("\n");
  }
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.content)
      .filter(Boolean)
      .join("\n");
  }
  return "";
};


export const handleAiChat = async (c: Context): Promise<Response> => {
  let body: AiChatOptions;
  try {
    body = await c.req.json<AiChatOptions>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const dataObj = body.data || {};
  const conversationId = body.conversationId ?? dataObj.conversationId;
  const model = body.model ?? dataObj.model;
  const tools = body.tools ?? dataObj.tools;
  const messages = body.messages;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: "messages is required and must be a non-empty array" }, 400);
  }

  try {
    const modelName = model ?? DEFAULT_MODEL;
    const stream = chat({
      adapter: getAdapter(modelName),
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(conversationId ? { conversationId } : {}),
    });

    const user = c.get("authUser") as any;
    console.log("[ai.service] handleAiChat user:", user?.id, "conversationId:", conversationId);
    if (user && conversationId) {
      // Save last user message
      const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
      const userContent = lastUserMessage ? getMessageText(lastUserMessage) : "";
      console.log("[ai.service] lastUserMessage content extracted:", userContent.substring(0, 50) + (userContent.length > 50 ? "..." : ""));

      if (userContent) {
        saveAiChatMessage({
          userId: user.id,
          conversationId,
          role: "user",
          content: userContent,
          model: modelName,
        }).then(() => console.log("[ai.service] user msg saved"))
          .catch(err => console.error("[ai.service] save user msg error:", err));
      } else {
        console.warn("[ai.service] lastUserMessage content is empty, not saving");
      }

      // Intercept stream to save assistant message
      let fullContent = "";
      let thinkingContent = "";
      async function* interceptStream(source: AsyncIterable<any>) {
        for await (const chunk of source) {
          // Chunk can be an object with type and content, or sometimes other formats
          if (chunk && typeof chunk === "object") {
            const type = String(chunk.type || "");

            // Only process actual content chunks — ignore event/metadata chunks like 
            // STEP_STARTED, STEP_FINISHED, RUN_STARTED, RUN_FINISHED, *_START, *_END
            // These have delta/content properties but they are accumulated values, not new content
            const isReasoningContent = type === "REASONING_MESSAGE_CONTENT";
            const isTextContent = type === "TEXT_MESSAGE_CONTENT";

            if (isReasoningContent && chunk.delta) {
              thinkingContent += chunk.delta;
            } else if (isTextContent) {
              // TEXT_MESSAGE_CONTENT may use delta or content
              fullContent += chunk.delta || chunk.content || "";
            }
            // All other chunk types (STEP_FINISHED, RUN_STARTED, etc.) are ignored for content
          }
          yield chunk;
        }

        if (fullContent || thinkingContent) {
          await saveAiChatMessage({
            userId: user.id,
            conversationId,
            role: "assistant",
            content: fullContent,
            reasoning: thinkingContent || undefined,
            model: modelName,
          });
        }
      }

      return toServerSentEventsResponse(interceptStream(stream));
    }

    return toServerSentEventsResponse(stream);
  } catch (error) {
    console.error("[ai.service] chat error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      500,
    );
  }
};

export const handleAiImage = async (c: Context): Promise<Response> => {
  let body: { prompt: string; model?: string; size?: string; conversationId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { prompt, model, size, conversationId } = body;

  if (!prompt) {
    return c.json({ error: "prompt is required" }, 400);
  }

  try {
    const modelName = model ?? DEFAULT_IMAGE_MODEL;

    const result = await generateImage({
      adapter: getImageAdapter(modelName),
      prompt,
      ...(size ? { size: size as any } : {}),
    });

    const user = c.get("authUser") as any;
    if (user && conversationId) {
      const image = result.images[0];
      const imageUrl = image.b64Json ? `data:image/png;base64,${image.b64Json}` : image.url;

      // Save user prompt
      await saveAiChatMessage({
        userId: user.id,
        conversationId,
        role: "user",
        content: prompt,
        model: modelName,
      });

      // Save assistant response
      await saveAiChatMessage({
        userId: user.id,
        conversationId,
        role: "assistant",
        content: `[IMAGE]${imageUrl}`,
        model: modelName,
      });
    }

    return c.json({
      success: true,
      images: result.images,
      model: modelName,
      conversationId,
    });
  } catch (error) {
    console.error("[ai.service] image error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      500,
    );
  }
};

export const createAiChatStream = (opts: {
  messages: Array<AiChatMessage>;
  model?: string;
  tools?: Array<ToolDefinition<any, any, any>>;
  conversationId?: string;
}) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const modelName = opts.model ?? DEFAULT_MODEL;

  return chat({
    adapter: getAdapter(modelName),
    messages: opts.messages,
    ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
    ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
  });
};


export const saveAiChatMessage = async (data: {
  userId: string;
  conversationId: string;
  role: string;
  content: string;
  reasoning?: string;
  model?: string;
}) => {
  if (!data.content && !data.reasoning) {
    console.warn("[ai.service] saveAiChatMessage skipped: empty content and reasoning");
    return;
  }
  return db.insert(aiChats).values({
    id: uuidv4(),
    userId: data.userId,
    conversationId: data.conversationId,
    role: data.role,
    content: data.content || "",
    reasoning: data.reasoning ?? null,
    model: data.model ?? DEFAULT_MODEL,
    createdAt: new Date(),
  });
};


export const getAiChatHistory = async (userId: string, limit = 50) => {
  return db
    .select()
    .from(aiChats)
    .where(eq(aiChats.userId, userId))
    .orderBy(desc(aiChats.createdAt))
    .limit(limit);
};

export const deleteAllAiChatHistory = async (userId: string) => {
  return db.delete(aiChats).where(eq(aiChats.userId, userId));
};
