import { load } from "cheerio";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "链接内容提取失败";
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address);

  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) {
    return true;
  }

  const ipv4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return ipv4Mapped ? isPrivateIpv4(ipv4Mapped[1]) : false;
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持 http 或 https 链接");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("不允许导入本机或内网地址");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("不允许导入本机或内网地址");
  }
}

async function fetchDocument(initialUrl: URL): Promise<{ response: Response; finalUrl: URL }> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    await assertPublicUrl(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl, {
        headers: {
          Accept: "text/html,text/plain,text/markdown;q=0.9,*/*;q=0.1",
          "User-Agent": "minimal-rag-document-importer/1.0",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("链接跳转时缺少目标地址");
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (!response.ok) {
        throw new Error(`链接请求失败（HTTP ${response.status}）`);
      }

      return { response, finalUrl: currentUrl };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("链接跳转次数过多");
}

async function readResponseText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_DOCUMENT_BYTES) {
    throw new Error("链接文档超过 2 MB 限制");
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_DOCUMENT_BYTES) {
      await reader.cancel();
      throw new Error("链接文档超过 2 MB 限制");
    }
    chunks.push(value);
  }

  const text = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    text.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(text);
}

function extractDocument(contentType: string, rawText: string): { title: string; text: string } {
  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
    const $ = load(rawText);
    $("script, style, noscript, svg, nav, footer, header, aside, form").remove();
    const main = $("article, main, [role='main']").first();
    const root = main.length > 0 ? main : $("body");
    const text = root.text().replace(/\s+/g, " ").trim();
    const title = $("title").first().text().replace(/\s+/g, " ").trim();
    return { title, text };
  }

  if (
    contentType.includes("text/plain") ||
    contentType.includes("text/markdown") ||
    contentType.includes("text/x-markdown")
  ) {
    return { title: "", text: rawText.trim() };
  }

  throw new Error("目前仅支持公开网页、TXT 和 Markdown 链接");
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const rawUrl = typeof body === "object" && body !== null && "url" in body
      ? body.url
      : undefined;

    if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
      return NextResponse.json({ error: "请提供链接地址" }, { status: 400 });
    }

    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      return NextResponse.json({ error: "链接格式不正确" }, { status: 400 });
    }

    const { response, finalUrl } = await fetchDocument(url);
    const rawText = await readResponseText(response);
    const { title, text } = extractDocument(response.headers.get("content-type") || "", rawText);

    if (text.length < 20) {
      return NextResponse.json(
        { error: "未能从链接中提取到足够正文。该页面可能需要登录或依赖浏览器脚本加载。" },
        { status: 422 }
      );
    }

    return NextResponse.json({ title, source: finalUrl.toString(), text });
  } catch (error: unknown) {
    console.error("URL import error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
