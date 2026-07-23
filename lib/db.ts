/**
 * 内存向量存储 - 无需数据库，部署即用
 * 缺点：每次部署/重启后数据会清空
 */

interface DocChunk {
  id: number;
  content: string;
  embedding: number[];
  source?: string;
  createdAt: Date;
}

// 内存存储
const memoryStore: DocChunk[] = [];
let idCounter = 0;

/**
 * 初始化（内存版无需操作）
 */
export async function initDatabase() {
  // 内存存储，无需初始化
  console.log("Using in-memory vector store");
}

/**
 * 插入文档片段及其向量
 */
export async function insertDocChunk(
  content: string,
  embedding: number[],
  source?: string
) {
  idCounter++;
  memoryStore.push({
    id: idCounter,
    content,
    embedding,
    source,
    createdAt: new Date(),
  });
}

/**
 * 余弦相似度计算
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 向量相似度搜索：找到与查询最相关的文档片段
 */
export async function querySimilarDocs(
  queryEmbedding: number[],
  topK: number = 3
): Promise<{ id: number; content: string; similarity: number }[]> {
  if (memoryStore.length === 0) {
    return [];
  }

  // 计算所有文档的相似度
  const scored = memoryStore.map((doc) => ({
    id: doc.id,
    content: doc.content,
    similarity: cosineSimilarity(queryEmbedding, doc.embedding),
  }));

  // 按相似度排序，取 topK
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

/**
 * 获取所有文档片段（管理页面用）
 */
export async function getAllDocs() {
  return memoryStore.map((doc) => ({
    id: doc.id,
    content: doc.content,
    source: doc.source,
    created_at: doc.createdAt.toISOString(),
  }));
}

/**
 * 删除指定文档片段
 */
export async function deleteDocChunk(id: number) {
  const index = memoryStore.findIndex((doc) => doc.id === id);
  if (index !== -1) {
    memoryStore.splice(index, 1);
  }
}
