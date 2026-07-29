import { runKnowledgeAgent, type AgentKnowledgeChunk } from "@/lib/agent";
import { getProviderErrorMessage } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_QUESTION_LENGTH = 2_000;
const MAX_KNOWLEDGE_CHUNKS = 8;
const MAX_CHUNK_LENGTH = 2_500;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_MESSAGE_LENGTH = 2_000;

interface AgentConversationMessage {
  role: "user" | "assistant";
  content: string;
}

function parseKnowledge(value: unknown): AgentKnowledgeChunk[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_KNOWLEDGE_CHUNKS) return null;

  const chunks: AgentKnowledgeChunk[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || !("content" in item) || typeof item.content !== "string") {
      return null;
    }

    const content = item.content.trim();
    if (!content || content.length > MAX_CHUNK_LENGTH) return null;

    const source = "source" in item && typeof item.source === "string"
      ? item.source.trim().slice(0, 200)
      : undefined;
    chunks.push({ content, source: source || undefined });
  }

  return chunks;
}

function parseHistory(value: unknown): AgentConversationMessage[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HISTORY_MESSAGES) return null;

  const history: AgentConversationMessage[] = [];
  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("role" in item) ||
      !("content" in item) ||
      (item.role !== "user" && item.role !== "assistant") ||
      typeof item.content !== "string"
    ) {
      return null;
    }

    const content = item.content.trim();
    if (!content || content.length > MAX_HISTORY_MESSAGE_LENGTH) return null;
    history.push({ role: item.role, content });
  }

  return history;
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const question = typeof body === "object" && body !== null && "question" in body && typeof body.question === "string"
      ? body.question.trim()
      : "";
    const knowledge = typeof body === "object" && body !== null && "knowledge" in body
      ? parseKnowledge(body.knowledge)
      : [];
    const history = typeof body === "object" && body !== null && "history" in body
      ? parseHistory(body.history)
      : [];

    if (!question || question.length > MAX_QUESTION_LENGTH) {
      return Response.json({ error: "问题不能为空，且不能超过 2,000 个字符。" }, { status: 400 });
    }

    if (!knowledge) {
      return Response.json(
        { error: `knowledge 必须是最多 ${MAX_KNOWLEDGE_CHUNKS} 条、每条不超过 ${MAX_CHUNK_LENGTH} 字符的资料数组。` },
        { status: 400 }
      );
    }

    if (!history) {
      return Response.json(
        { error: `history 必须是最多 ${MAX_HISTORY_MESSAGES} 条、每条不超过 ${MAX_HISTORY_MESSAGE_LENGTH} 字符的对话数组。` },
        { status: 400 }
      );
    }

    return Response.json(await runKnowledgeAgent(question, knowledge, history));
  } catch (error: unknown) {
    const message = getProviderErrorMessage(error);
    console.error("Agent error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
