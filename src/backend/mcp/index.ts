import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import type { Context } from "hono";
import { z } from "zod";
import { chat, generateImage } from "@tanstack/ai";
import {
  getAdapter,
  getImageAdapter,
  DEFAULT_MODEL,
  DEFAULT_IMAGE_MODEL,
} from "../service/ai.service.js";

// We keep a registry of active sessions
interface McpSession {
  server: McpServer;
  transport: StreamableHTTPTransport;
  lastAccess: number;
}

const activeSessions = new Map<string, McpSession>();

// Cleanup old sessions (idle for more than 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.lastAccess > 3600000) {
      session.transport.close().catch(() => {});
      activeSessions.delete(sessionId);
    }
  }
}, 60000);

function createMcpSession(sessionId: string): McpSession {
  const server = new McpServer({
    name: "honowa-mcp-server",
    version: "1.0.0",
  });

  const transport = new StreamableHTTPTransport({
    sessionIdGenerator: () => sessionId,
  });

  // Register the "chat" tool
  server.registerTool(
    "chat",
    {
      description: "Send prompt/message to AI chat models and get response",
      inputSchema: z.object({
        message: z.string().describe("The user prompt or message to send to the AI model"),
        provider: z.enum(["gemini", "openai", "claude"]).optional().describe("Which AI model provider to use (default: gemini)"),
        model: z.string().optional().describe("Specific model name to use"),
      }),
    },
    async ({ message, provider, model }) => {
      try {
        let modelName = model;
        if (!modelName) {
          if (provider === "openai") {
            modelName = "gpt-4o";
          } else if (provider === "claude") {
            modelName = "claude-3-5-sonnet-20241022";
          } else {
            modelName = DEFAULT_MODEL;
          }
        }

        const stream = chat({
          adapter: getAdapter(modelName),
          messages: [{ role: "user", content: message }],
        });

        let fullContent = "";
        for await (const chunk of stream) {
          if (chunk && typeof chunk === "object") {
            const type = String(chunk.type || "");
            if (type === "TEXT_MESSAGE_CONTENT") {
              fullContent += chunk.delta || chunk.content || "";
            }
          }
        }

        return {
          content: [{ type: "text" as const, text: fullContent }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Register the "image" tool
  server.registerTool(
    "image",
    {
      description: "Generate an image using AI models",
      inputSchema: z.object({
        prompt: z.string().describe("The description of the image to generate"),
        provider: z.enum(["gemini", "openai"]).optional().describe("Which AI model provider to use (default: gemini)"),
        model: z.string().optional().describe("Specific image model name to use"),
        size: z.string().optional().describe("Image size, e.g. 1024x1024"),
      }),
    },
    async ({ prompt, provider, model, size }) => {
      try {
        let modelName = model;
        if (!modelName) {
          if (provider === "openai") {
            modelName = "dall-e-3";
          } else {
            modelName = DEFAULT_IMAGE_MODEL;
          }
        }

        const result = await generateImage({
          adapter: getImageAdapter(modelName),
          prompt,
          ...(size ? { size: size as any } : {}),
        });

        const images = result.images.map((img) => {
          if (img.b64Json) {
            return { type: "image" as const, data: img.b64Json, mimeType: "image/png" };
          }
          return { type: "text" as const, text: `Image URL: ${img.url}` };
        });

        return {
          content: images,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Connect the server to the transport
  server.connect(transport).catch(console.error);

  return { server, transport, lastAccess: Date.now() };
}

// Custom transport wrapper to route request to correct session
export const transport = {
  async handleRequest(c: Context): Promise<Response> {
    const method = c.req.method;

    if (method === "GET") {
      const sessionId = c.req.header("mcp-session-id");
      if (!sessionId) {
        return c.json(
          {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: Mcp-Session-Id header is required" },
            id: null,
          },
          400
        );
      }

      const session = activeSessions.get(sessionId);
      if (!session) {
        return c.json(
          {
            jsonrpc: "2.0",
            error: { code: -32001, message: "Session not found" },
            id: null,
          },
          404
        );
      }

      session.lastAccess = Date.now();
      const response = await session.transport.handleRequest(c);
      return response || c.text("Internal Server Error", 500);
    }

    if (method === "POST") {
      let body: any;
      try {
        body = await c.req.raw.clone().json();
      } catch {
        return c.json(
          {
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error: Invalid JSON" },
            id: null,
          },
          400
        );
      }

      const isArray = Array.isArray(body);
      const messages = isArray ? body : [body];
      const isInitialization = messages.some(
        (msg: any) => msg && msg.method === "initialize"
      );

      if (isInitialization) {
        const sessionId = crypto.randomUUID();
        const session = createMcpSession(sessionId);
        activeSessions.set(sessionId, session);

        const response = await session.transport.handleRequest(c, body);
        return response || c.text("Internal Server Error", 500);
      }

      const sessionId = c.req.header("mcp-session-id");
      if (!sessionId) {
        return c.json(
          {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: Mcp-Session-Id header is required" },
            id: null,
          },
          400
        );
      }

      const session = activeSessions.get(sessionId);
      if (!session) {
        return c.json(
          {
            jsonrpc: "2.0",
            error: { code: -32001, message: "Session not found" },
            id: null,
          },
          404
        );
      }

      session.lastAccess = Date.now();
      const response = await session.transport.handleRequest(c, body);
      return response || c.text("Internal Server Error", 500);
    }

    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      },
      405
    );
  }
};

