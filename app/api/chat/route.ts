import { streamText, type CoreMessage } from "ai";
import { getProviderErrorMessage, openai } from "@/lib/openai";

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

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const messages = typeof body === "object" && body !== null && "messages" in body
      ? body.messages
      : undefined;

    if (!Array.isArray(messages) || !messages.every(isCoreMessage)) {
      return Response.json({ error: "messages 必须是有效的消息数组" }, { status: 400 });
    }

    // 客户端已完成 RAG 检索，context 在 system message 中。
    const result = await streamText({
      model: openai("gpt-4o-mini"),
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error: unknown) {
    console.error("Chat error:", getProviderErrorMessage(error));
    return Response.json({ error: getProviderErrorMessage(error) }, { status: 500 });
  }
}
