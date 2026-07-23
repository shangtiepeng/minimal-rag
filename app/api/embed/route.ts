import { NextRequest, NextResponse } from "next/server";
import { getEmbedding } from "@/lib/embedding";
import { splitText } from "@/lib/chunk";

/**
 * 文档切分 + 向量化接口
 * 返回片段和向量，由客户端存入 IndexedDB
 * POST /api/embed
 * body: { text: string, source?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "请提供 text 字段" }, { status: 400 });
    }

    // 切分文档
    const rawChunks = splitText(text, 500, 50);

    // 逐段生成 embedding
    const pieces = [];
    for (const chunk of rawChunks) {
      const embedding = await getEmbedding(chunk.content);
      pieces.push({ content: chunk.content, embedding });
    }

    return NextResponse.json({
      success: true,
      totalPieces: pieces.length,
      pieces,
    });
  } catch (error: any) {
    console.error("Embed error:", error);
    return NextResponse.json(
      { error: error.message || "文档处理失败" },
      { status: 500 }
    );
  }
}
