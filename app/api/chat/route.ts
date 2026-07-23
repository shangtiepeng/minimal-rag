import { type CoreMessage } from "ai";
import { chatModel, getProviderErrorMessage, openaiApiFetch } from "@/lib/openai";

// 允许流式响应最长 60 秒
export const maxDuration = 60;

function isCoreMessage(value: unknown): value is CoreMessage {
  if (typeof value !== "object" || value === null) return false;

  const message = value as { role?: unknown; content?: unknown };
  return (
    typeof message.content === "string" &&
    (message.role === "system" || message.role === "user" || message.role === "assistant")
  );
}

function getUpstreamErrorMessage(body: string): string {
  try {
    const data: unknown = JSON.parse(body);
    if (typeof data === "object" && data !== null && "error" in data) {
      const error = data.error;
      if (typeof error === "string") return error;
      if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
        return error.message;
      }
    }
  } catch {
    // Use the generic message below when the provider did not return JSON.
  }

  return "AI 服务请求失败";
}

function getTextDelta(data: unknown): string {
  if (typeof data !== "object" || data === null || !("choices" in data) || !Array.isArray(data.choices)) {
    return "";
  }

  const delta = data.choices[0]?.delta;
  return typeof delta === "object" && delta !== null && "content" in delta && typeof delta.content === "string"
    ? delta.content
    : "";
}

function getFinishReason(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("choices" in data) || !Array.isArray(data.choices)) {
    return undefined;
  }

  const finishReason = data.choices[0]?.finish_reason;
  return typeof finishReason === "string" ? finishReason : undefined;
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const messages = typeof body === "object" && body !== null && "messages" in body
      ? body.messages
      : undefined;

    if (!Array.isArray(messages) || !messages.every(isCoreMessage)) {
      return Response.json({ error: "messages 必须是有效的消息数组" }, { status: 400 });
    }

    // GPT-5 requires max_completion_tokens, which this older AI SDK cannot send.
    const response = await openaiApiFetch("chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chatModel,
        messages,
        stream: true,
        ...(chatModel.startsWith("gpt-5") ? { max_completion_tokens: 1024 } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(getUpstreamErrorMessage(await response.text()));
    }

    if (!response.body) {
      throw new Error("AI 服务未返回可读取的内容");
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let hasText = false;
        let hitLengthLimit = false;
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const processEvent = (event: string) => {
          const payload = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");

          if (!payload || payload === "[DONE]") return;

          const data: unknown = JSON.parse(payload);
          if (typeof data === "object" && data !== null && "error" in data) {
            throw new Error(getUpstreamErrorMessage(payload));
          }

          const textDelta = getTextDelta(data);
          if (textDelta) {
            hasText = true;
            controller.enqueue(encoder.encode(textDelta));
          }

          if (getFinishReason(data) === "length") {
            hitLengthLimit = true;
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() || "";
            for (const event of events) {
              processEvent(event);
            }
          }

          buffer += decoder.decode();
          if (buffer.trim()) processEvent(buffer);

          if (!hasText) {
            controller.enqueue(
              encoder.encode("❌ AI 服务没有返回内容，请检查 Vercel 中的 AI 服务配置后重试。")
            );
          } else if (hitLengthLimit) {
            controller.enqueue(encoder.encode("\n\n（回复达到长度上限，可继续追问以获取后续内容。）"));
          }
        } catch (error: unknown) {
          const message = getProviderErrorMessage(error);
          console.error("Chat stream error:", message);
          controller.enqueue(encoder.encode(`❌ ${message}`));
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error: unknown) {
    console.error("Chat error:", getProviderErrorMessage(error));
    return Response.json({ error: getProviderErrorMessage(error) }, { status: 500 });
  }
}
