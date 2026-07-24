import "./globals.css";

export const metadata = {
  title: "RAG 问答助手",
  description: "基于知识库的极简 RAG 问答对话",
  other: {
    google: "notranslate",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" translate="no" className="notranslate">
      <body className="antialiased notranslate" translate="no">{children}</body>
    </html>
  );
}
