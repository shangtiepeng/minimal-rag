"use client";

import { useChat } from "ai/react";
import { useState, useRef, useEffect } from "react";

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: "/api/chat",
    });

  const [showUpload, setShowUpload] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [uploadSource, setUploadSource] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleUpload = async () => {
    if (!uploadText.trim()) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const res = await fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: uploadText,
          source: uploadSource || "网页上传",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setUploadMsg(`✅ ${data.message}`);
        setUploadText("");
        setUploadSource("");
      } else {
        setUploadMsg(`❌ ${data.error}`);
      }
    } catch (err: any) {
      setUploadMsg(`❌ ${err.message}`);
    }
    setUploading(false);
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      {/* 顶部栏 */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold">📚 RAG 问答助手</h1>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="px-3 py-1.5 text-sm rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] transition"
        >
          {showUpload ? "关闭上传" : "管理知识库"}
        </button>
      </header>

      {/* 知识库上传区 */}
      {showUpload && (
        <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)] space-y-3">
          <div>
            <label className="text-sm text-[var(--text-muted)] mb-1 block">
              文档来源（可选）
            </label>
            <input
              value={uploadSource}
              onChange={(e) => setUploadSource(e.target.value)}
              placeholder="如：产品手册、FAQ文档..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] mb-1 block">
              粘贴文档内容
            </label>
            <textarea
              value={uploadText}
              onChange={(e) => setUploadText(e.target.value)}
              placeholder="将知识文档内容粘贴到这里，系统会自动切分并向量化存储..."
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
            {uploadMsg && (
              <span className="text-sm text-[var(--text-muted)]">
                {uploadMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-[var(--text-muted)] mt-20 space-y-2">
            <p className="text-2xl">👋</p>
            <p>向知识库提问吧！</p>
            <p className="text-xs">
              先点击右上角「管理知识库」上传文档，再开始对话
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-[var(--accent)] text-white rounded-br-md"
                  : "bg-[var(--surface)] border border-[var(--border)] rounded-bl-md"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
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
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="输入你的问题..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)]"
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
