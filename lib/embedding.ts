import { embedMany } from "ai";
import { openai } from "@/lib/openai";

/**
 * 生成文本的 embedding 向量
 * 使用 text-embedding-3-small 模型，1536 维，便宜够用
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: texts,
  });

  return embeddings;
}
