/**
 * 文档切分工具：将长文本按固定大小切分成片段
 */

export interface Chunk {
  content: string;
  index: number;
}

/**
 * 将文本按 chunkSize 切分，overlap 为相邻片段的重叠字数
 */
export function splitText(
  text: string,
  chunkSize: number = 500,
  overlap: number = 50
): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const content = text.slice(start, end).trim();

    if (content.length > 0) {
      chunks.push({ content, index });
      index++;
    }

    start += chunkSize - overlap;
  }

  return chunks;
}
