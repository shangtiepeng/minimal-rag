import { neon, NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Neon Postgres 连接（Vercel 部署时自动集成）
 * 本地开发时使用 DATABASE_URL 环境变量
 * 使用懒加载，避免构建时因缺少 DATABASE_URL 报错
 */

interface DocChunk {
  id: number;
  content: string;
  similarity: number;
}

let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL 未设置，请在环境变量中配置 Neon Postgres 连接串");
    }
    _sql = neon(url);
  }
  return _sql;
}

/**
 * 初始化数据库表（首次使用时调用）
 * 使用 pgvector 扩展存储和检索向量
 */
export async function initDatabase() {
  const sql = getSql();
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`
    CREATE TABLE IF NOT EXISTS doc_chunks (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      embedding vector(1536),
      source TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // 创建向量索引，加速相似度搜索
  await sql`
    CREATE INDEX IF NOT EXISTS doc_chunks_embedding_idx
    ON doc_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
  `;
}

/**
 * 插入文档片段及其向量
 */
export async function insertDocChunk(
  content: string,
  embedding: number[],
  source?: string
) {
  const sql = getSql();
  const embeddingStr = `[${embedding.join(",")}]`;
  await sql`
    INSERT INTO doc_chunks (content, embedding, source)
    VALUES (${content}, ${embeddingStr}::vector, ${source || null})
  `;
}

/**
 * 向量相似度搜索：找到与查询最相关的文档片段
 */
export async function querySimilarDocs(
  queryEmbedding: number[],
  topK: number = 3
): Promise<DocChunk[]> {
  const sql = getSql();
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const rows = await sql`
    SELECT id, content, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM doc_chunks
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `;

  return rows as DocChunk[];
}

/**
 * 获取所有文档片段（管理页面用）
 */
export async function getAllDocs() {
  const sql = getSql();
  return await sql`SELECT id, content, source, created_at FROM doc_chunks ORDER BY created_at DESC`;
}

/**
 * 删除指定文档片段
 */
export async function deleteDocChunk(id: number) {
  const sql = getSql();
  await sql`DELETE FROM doc_chunks WHERE id = ${id}`;
}
