"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { saveAllChunks, getAllStoredChunks, deleteStoredChunk, clearAllChunks, getChunksCount } from "@/lib/indexedDB";

interface Chunk {
  id: string;
  content: string;
  embedding: number[];
  source?: string;
  createdAt: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [uploadSource, setUploadSource] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [chunksCount, setChunksCount] = useState(0);
  const [isLoadingChunks, setIsLoadingChunks] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);

  // 页面加载时从 IndexedDB 恢复文档
  useEffect(() => {
    loadChunks();
  }, []);

  async function loadChunks() {
    setIsLoadingChunks(true);
    try {
      const stored = await getAllStoredChunks();
      setChunks(stored);
      setChunksCount(stored.length);
    } catch (e) {
      console.error("Failed to load chunks:", e);
    }
    setIsLoadingChunks(false);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 计算余弦相似度
  function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
  }

  // 上传文档到 IndexedDB
  const handleUpload = async () => {
    if (!uploadText.trim()) return;
    setUploading(true);
    setUploadMsg("正在切分和生成向量...");
    try {
      const res = await fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: uploadText, source: uploadSource || "网页上传" }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "处理失败");

      // 保存到 IndexedDB
      const newChunks: Chunk[] = [];
      let idx = Date.now();
      for (const piece of data.pieces) {
        const chunk: Chunk = {
          id: `chunk-${idx++}`,
          content: piece.content,
          embedding: piece.embedding,
          source: uploadSource || "网页上传",
          createdAt: new Date().toISOString(),
        };
        newChunks.push(chunk);
      }
      await saveAllChunks(newChunks);
      await loadChunks();

      setUploadMsg(`✅ 成功！已切分为 ${newChunks.length} 个片段存入本地`);
      setUploadText("");
      setUploadSource("");
    } catch (err: any) {
      setUploadMsg(`❌ ${err.message}`);
    }
    setUploading(false);
  };

  // 本地 RAG 检索
  async function retrieveRelevantDocs(query: string, topK = 3): Promise<string[]> {
    if (chunks.length === 0) return [];

    try {
      // 生成查询向量
      const embedRes = await fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: query }),
      });
      if (!embedRes.ok) return [];
      const { pieces } = await embedRes.json();
      if (!pieces || pieces.length === 0) return [];
      const queryEmbedding = pieces[0].embedding;

      // 本地计算相似度
      const scored = chunks.map((chunk) => ({
        content: chunk.content,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
      }));
      scored.sort((a, b) => b.similarity - a.similarity);
      return scored.slice(0, topK).map((s) => s.content);
    } catch {
      return [];
    }
  }

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage: Message = { id: Date.now().toString(), role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    try {
      // RAG 检索
      const relevantDocs = await retrieveRelevantDocs(currentInput);
      const contextSection = relevantDocs.length > 0
        ? `\n\n## 参考知识：\n${relevantDocs.map((d, i) => `[${i + 1}] ${d}`).join("\n")}`
        : "";

      const systemPrompt = `你是一个基于知识库回答问题的助手。如果知识库中有相关信息，请基于它回答；如果没有，请诚实说明"知识库中没有找到相关信息"，不要编造。${contextSection}`;

      // 流式调用 LLM
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: currentInput },
          ],
        }),
      });

      if (!res.ok) throw new Error("请求失败");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      const assistantId = (Date.now() + 1).toString();

      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        assistantContent += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: assistantContent } : m
          )
        );
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "assistant", content: `❌ 出错了：${err.message}` },
      ]);
    }
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      {/* 顶部栏 */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">📚 RAG 问答助手</h1>
          {isLoadingChunks ? (
            <span className="text-xs text-[var(--text-muted)]">加载中...</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)]">
              {chunksCount} 条知识
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { if (confirm("确定清空所有知识库？")) clearAllChunks().then(loadChunks); }}
            className="px-3 py-1.5 text-sm rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-red-500 transition text-red-400"
          >
            清空知识库
          </button>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="px-3 py-1.5 text-sm rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] transition"
          >
            {showUpload ? "关闭上传" : "管理知识库"}
          </button>
        </div>
      </header>

      {/* 知识库上传区 */}
      {showUpload && (
        <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)] space-y-3">
          <div>
            <label className="text-sm text-[var(--text-muted)] mb-1 block">文档来源（可选）</label>
            <input
              value={uploadSource}
              onChange={(e) => setUploadSource(e.target.value)}
              placeholder="如：产品手册、FAQ文档..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] mb-1 block">粘贴文档内容</label>
            <textarea
              value={uploadText}
              onChange={(e) => setUploadText(e.target.value)}
              placeholder="将知识文档内容粘贴到这里，系统会自动切分并向量化存储到浏览器本地..."
              rows={6}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleUpload}
              disabled={uploading || !uploadText.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-[var(--accent)] text-white disabled:opacity-40 hover:opacity-90 transition"
            >
              {uploading ? "处理中..." : "上传到知识库"}
            </button>
            {uploadMsg && <span className="text-sm text-[var(--text-muted)]">{uploadMsg}</span>}
          </div>
          {chunks.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              <p className="text-xs text-[var(--text-muted)] mb-1">已存储的片段：</p>
              {chunks.map((c) => (
                <div key={c.id} className="flex items-start gap-2 text-xs bg-[var(--bg)] px-2 py-1 rounded">
                  <span className="text-[var(--text-muted)] flex-shrink-0">{c.source}</span>
                  <span className="text-[var(--text-muted)] flex-1 truncate">{c.content}</span>
                  <button onClick={() => deleteStoredChunk(c.id).then(loadChunks)} className="text-red-400 hover:text-red-300 flex-shrink-0">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-[var(--text-muted)] mt-20 space-y-2">
            <p className="text-2xl">👋</p>
            <p>向知识库提问吧！</p>
            <p className="text-xs">先点击右上角「管理知识库」上传文档，再开始对话</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-[var(--accent)] text-white rounded-br-md"
                  : "bg-[var(--surface)] border border-[var(--border)] rounded-bl-md whitespace-pre-wrap"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[var(--surface)] border border-[var(--border)] px-4 py-2.5 rounded-2xl rounded-bl-md text-sm text-[var(--text-muted)]">
              思考中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="p-4 border-t border-[var(--border)]">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题... (Enter 发送，Shift+Enter 换行)"
            rows={1}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none max-h-32"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm disabled:opacity-40 hover:opacity-90 transition"
          >
            发送
          </button>
        </form>
      </div>
    </div>
  );
}
