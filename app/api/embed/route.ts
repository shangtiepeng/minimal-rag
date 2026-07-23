import { NextRequest, NextResponse } from "next/server";
import { getEmbedding } from "@/lib/embedding";
import { initDatabase, insertDocChunk } from "@/lib/db";
import { splitText } from "@/lib/chunk";

/**
 * 上传知识文档 API
 * POST /api/embed
 * body: { text: string, source?: string }
 *
 * 流程：文本切分 → 逐段生成 embedding → 存入向量数据库
 */
export async function POST(req: NextRequest) {
  try {
    const { text, source } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "请提供 text 字段" },
        { status: 400 }
      );
    }

    // 初始化数据库（首次调用时）
    await initDatabase();

    // 切分文档
    const chunks = splitText(text, 500, 50);

    // 逐段生成 embedding 并存储
    let inserted = 0;
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk.content);
      await insertDocChunk(chunk.content, embedding, source || "manual");
      inserted++;
    }

    return NextResponse.json({
      success: true,
      message: `文档已切分为 ${chunks.length} 个片段并存储`,
      chunks: inserted,
    });
  } catch (error: any) {
    console.error("Embed error:", error);
    return NextResponse.json(
      { error: error.message || "文档处理失败" },
      { status: 500 }
    );
  }
}
