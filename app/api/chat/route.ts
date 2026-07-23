import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

// 允许流式响应最长 60 秒
export const maxDuration = 60;

const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  // 直接将 messages 发给 LLM（客户端已做 RAG，context 在 system message 里）
  const result = await streamText({
    model: openai("gpt-4o-mini"),
    messages,
  });

  return result.toDataStreamResponse();
}
