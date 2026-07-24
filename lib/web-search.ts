const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const SEARCH_TIMEOUT_MS = 12_000;

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

function isPublicHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseResults(value: unknown): WebSearchResult[] {
  if (typeof value !== "object" || value === null || !("results" in value) || !Array.isArray(value.results)) {
    return [];
  }

  return value.results
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .flatMap((item) => {
      if (!isPublicHttpUrl(item.url) || typeof item.content !== "string") return [];
      const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : item.url;
      return [{ title, url: item.url, content: item.content.trim().slice(0, 1_500) }];
    })
    .slice(0, 3);
}

export function isWebSearchAvailable(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 TAVILY_API_KEY，无法执行联网搜索。");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: 3,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`联网搜索服务请求失败（HTTP ${response.status}）。`);
    }

    return parseResults(await response.json());
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("联网搜索超时，请稍后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
