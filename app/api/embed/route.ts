import { NextRequest, NextResponse } from "next/server";
import { getEmbeddings } from "@/lib/embedding";
import { splitText } from "@/lib/chunk";
import { getProviderErrorMessage } from "@/lib/openai";

const MAX_DOCUMENT_LENGTH = 60_000;

/**
 * 文档切分 + 向量化接口
 * 返回片段和向量，由客户端存入 IndexedDB
 * POST /api/embed
 * body: { text: string, source?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const text = typeof body === "object" && body !== null && "text" in body
      ? body.text
      : undefined;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "请提供 text 字段" }, { status: 400 });
    }

    if (text.length > MAX_DOCUMENT_LENGTH) {
      return NextResponse.json(
        { error: `文档超过 ${MAX_DOCUMENT_LENGTH.toLocaleString()} 字符限制，请拆分后上传。` },
        { status: 413 }
      );
    }

    // 切分文档
    const rawChunks = splitText(text, 500, 50);
    const embeddings = await getEmbeddings(rawChunks.map((chunk) => chunk.content));
    const pieces = rawChunks.map((chunk, index) => ({
      content: chunk.content,
      embedding: embeddings[index],
    }));

    return NextResponse.json({
      success: true,
      totalPieces: pieces.length,
      pieces,
    });
  } catch (error: unknown) {
    console.error("Embed error:", getProviderErrorMessage(error));
    return NextResponse.json(
      { error: getProviderErrorMessage(error) },
      { status: 500 }
    );
  }
}
