import { openai } from "@ai-sdk/openai";

/**
 * 生成文本的 embedding 向量
 * 使用 text-embedding-3-small 模型，1536 维，便宜够用
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const { embed } = await import("ai");

  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: text,
  });

  return embedding;
}
