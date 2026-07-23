import "./globals.css";

export const metadata = {
  title: "RAG 问答助手",
  description: "基于知识库的极简 RAG 问答对话",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
