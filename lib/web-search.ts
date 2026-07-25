const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const SEARCH_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 4;
const MAX_CONTENT_LENGTH = 1_200;
const FINANCE_QUERY_PATTERN = /股市|a股|港股|美股|指数|行情|股票|财经|金融|纳斯达克|标普|道琼斯/i;
const TIME_SENSITIVE_QUERY_PATTERN = /今天|本周|这周|近期|最新|实时|当前|刚刚|20\d{2}[-年/]\d{1,2}[-月/]\d{1,2}/i;
const FRESHNESS_WINDOW_DAYS = 14;
const TRUSTED_FINANCE_DOMAINS = new Set([
  "sse.com.cn",
  "szse.cn",
  "csrc.gov.cn",
  "eastmoney.com",
  "stcn.com",
  "cnstock.com",
  "cs.com.cn",
  "yicai.com",
  "caixin.com",
  "reuters.com",
  "bloomberg.com",
  "cnbc.com",
  "marketwatch.com",
  "nasdaq.com",
  "nyse.com",
  "finance.yahoo.com",
]);

type MarketScope = "a-share" | "hong-kong" | "us";

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
  score: number;
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

function getShanghaiDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

function getHostname(value: string): string {
  return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
}

function isTrustedFinanceDomain(hostname: string): boolean {
  return [...TRUSTED_FINANCE_DOMAINS].some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

function isLowValuePage(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase();
  return /\/(?:category|categories|tag|tags|topic|topics)\//.test(pathname) || /\/page\/\d+\/?$/.test(pathname);
}

function getMarketScope(query: string): MarketScope | undefined {
  const hasAShare = /a股|中国股市|上证|深证|创业板|沪深/i.test(query);
  const hasHongKong = /港股|恒生|恒指/i.test(query);
  const hasUs = /美股|标普|纳斯达克|道琼斯|华尔街/i.test(query);

  if (hasAShare && !hasHongKong && !hasUs) return "a-share";
  if (hasHongKong && !hasAShare && !hasUs) return "hong-kong";
  if (hasUs && !hasAShare && !hasHongKong) return "us";
  return undefined;
}

function matchesMarketScope(result: WebSearchResult, scope: MarketScope): boolean {
  const text = `${result.title}\n${result.content}`;

  if (scope === "a-share") return /a股|中国股市|上证|深证|创业板|沪深|shanghai composite|shenzhen/i.test(text);
  if (scope === "hong-kong") return /港股|恒生|恒指|hang seng/i.test(text);
  return /美股|标普|纳斯达克|道琼斯|dow jones|s&p 500|nasdaq|wall street/i.test(text);
}

function parsePublishedDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function extractDate(value: string): string | undefined {
  const match = value.match(/(20\d{2})[-年/](\d{1,2})[-月/](\d{1,2})/);
  if (!match) return undefined;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isWithinFreshnessWindow(dateString: string): boolean {
  const currentDate = new Date(`${getShanghaiDate()}T00:00:00.000Z`);
  const sourceDate = new Date(dateString);
  const ageInDays = (currentDate.getTime() - sourceDate.getTime()) / 86_400_000;

  return ageInDays >= -1 && ageInDays <= FRESHNESS_WINDOW_DAYS;
}

function parseResults(value: unknown, query: string): WebSearchResult[] {
  if (typeof value !== "object" || value === null || !("results" in value) || !Array.isArray(value.results)) {
    return [];
  }

  const results = value.results
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .flatMap((item) => {
      if (!isPublicHttpUrl(item.url) || typeof item.content !== "string") return [];
      const title = typeof item.title === "string" && item.title.trim() ? item.title.trim().replace(/\s+/g, " ") : item.url;
      const score = typeof item.score === "number" && Number.isFinite(item.score) ? item.score : 0;
      const publishedDate =
        parsePublishedDate(item.published_date) ||
        extractDate(item.url) ||
        extractDate(item.content.slice(0, 500));
      return [{
        title,
        url: item.url,
        content: item.content.trim().slice(0, MAX_CONTENT_LENGTH),
        publishedDate,
        score,
      }];
    });
  const usefulResults = results.filter((result) => !isLowValuePage(result.url));
  const nonCategoryResults = usefulResults.length > 0 ? usefulResults : results;
  const needsFreshSources = TIME_SENSITIVE_QUERY_PATTERN.test(query);
  const freshResults = needsFreshSources
    ? nonCategoryResults.filter((result) => !result.publishedDate || isWithinFreshnessWindow(result.publishedDate))
    : nonCategoryResults;
  const temporalCandidates = freshResults.length > 0 ? freshResults : nonCategoryResults;
  const marketScope = getMarketScope(query);
  const candidates = marketScope
    ? temporalCandidates.filter((result) => matchesMarketScope(result, marketScope))
    : temporalCandidates;
  const isFinanceQuery = FINANCE_QUERY_PATTERN.test(query);

  return candidates
    .sort((a, b) => {
      const aTrust = isFinanceQuery && isTrustedFinanceDomain(getHostname(a.url)) ? 1 : 0;
      const bTrust = isFinanceQuery && isTrustedFinanceDomain(getHostname(b.url)) ? 1 : 0;
      return bTrust - aTrust || b.score - a.score;
    })
    .slice(0, MAX_RESULTS);
}

export function isWebSearchAvailable(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 TAVILY_API_KEY，无法执行联网搜索。");
  const isFinanceQuery = FINANCE_QUERY_PATTERN.test(query);
  const datedQuery = `${query.trim()} 截至 ${getShanghaiDate()} 的最新信息${
    isFinanceQuery ? "，优先交易所、指数公司和权威财经媒体，排除自媒体与历史资料" : ""
  }`;

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
        query: datedQuery,
        search_depth: "advanced",
        max_results: 6,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`联网搜索服务请求失败（HTTP ${response.status}）。`);
    }

    return parseResults(await response.json(), query);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("联网搜索超时，请稍后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
