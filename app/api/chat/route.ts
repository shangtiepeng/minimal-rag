import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
});

// 允许流式响应最长 30 秒
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  // 取最后一条用户消息，做 RAG 检索
  const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user");
  const userQuery = lastUserMessage?.content || "";

  // 检索相关文档片段
  const contextDocs = await retrieveRelevantDocs(userQuery);

  // 构建 system prompt，注入检索到的知识
  const systemPrompt = `你是一个基于知识库回答问题的助手。请根据以下检索到的知识片段回答用户问题。
如果知识片段中没有相关信息，请诚实回答"根据现有知识库，我无法回答这个问题"，不要编造内容。

## 知识片段：
${contextDocs.map((doc, i) => `[片段${i + 1}] ${doc.content}`).join("\n\n")}`;

  const result = await streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages,
  });

  return result.toDataStreamResponse();
}

/**
 * RAG 检索：将用户问题转为向量，在数据库中做相似度搜索
 */
async function retrieveRelevantDocs(query: string, topK = 3) {
  try {
    const { getEmbedding } = await import("@/lib/embedding");
    const { querySimilarDocs } = await import("@/lib/db");

    const queryEmbedding = await getEmbedding(query);
    const docs = await querySimilarDocs(queryEmbedding, topK);

    return docs.length > 0
      ? docs
      : [{ content: "（暂无相关知识片段）" }];
  } catch (error) {
    console.error("RAG retrieval error:", error);
    // 数据库未就绪时，回退为无知识上下文
    return [{ content: "（知识库未初始化，请先上传文档）" }];
  }
}
