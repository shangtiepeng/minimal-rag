"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN" translate="no" className="notranslate">
      <body className="antialiased notranslate" translate="no">
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-semibold">页面暂时无法加载</h1>
          <p className="max-w-md text-sm text-[var(--text-muted)]">
            页面内容可能被浏览器翻译或扩展修改。请关闭该网站的翻译后重新加载。
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white transition hover:opacity-90"
          >
            重新加载页面
          </button>
        </main>
      </body>
    </html>
  );
}
