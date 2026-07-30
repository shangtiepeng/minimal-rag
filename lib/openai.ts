import { createOpenAI } from "@ai-sdk/openai";

export const openaiApiKey = process.env.OPENAI_API_KEY;
export const chatModel = process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";
export const openaiBaseUrl = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
const RETRY_DELAYS_MS = [400, 1_200];

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function canRetry(init?: RequestInit): boolean {
  return init?.body === undefined || typeof init.body === "string";
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(input, init);
      const shouldRetry = canRetry(init) && isRetryableStatus(response.status) && attempt < RETRY_DELAYS_MS.length;
      if (shouldRetry) {
        await wait(RETRY_DELAYS_MS[attempt]);
        continue;
      }

      return response;
    } catch (error: unknown) {
      lastError = error;
      if (!canRetry(init) || attempt === RETRY_DELAYS_MS.length) throw error;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI 服务请求失败");
}

async function validateOpenAIResponse(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";

  // A misconfigured base URL can return a provider's web page with HTTP 200.
  // The streaming parser treats that as an empty stream unless we reject it here.
  if (contentType.includes("text/html")) {
    if (response.status >= 500) {
      throw new Error(`AI 服务商暂时不可用（HTTP ${response.status}）。请稍后重试或更换可用的模型服务。`);
    }

    throw new Error(
      "AI 服务返回了网页 HTML，而不是 OpenAI 兼容 API 的 JSON。请检查 Vercel 中的 OPENAI_BASE_URL 和 OPENAI_API_KEY。"
    );
  }

  return response;
}

export async function openaiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return validateOpenAIResponse(await fetchWithRetry(input, init));
}

export const openai = createOpenAI({
  baseURL: openaiBaseUrl,
  apiKey: openaiApiKey || "",
  fetch: openaiFetch,
});

export async function openaiApiFetch(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${openaiApiKey || ""}`);

  return openaiFetch(`${openaiBaseUrl}/${path.replace(/^\//, "")}`, {
    ...init,
    headers,
  });
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("statusCode" in error && typeof error.statusCode === "number") return error.statusCode;
  if ("status" in error && typeof error.status === "number") return error.status;

  return undefined;
}

function getResponseText(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("text" in error)) {
    return undefined;
  }

  return typeof error.text === "string" ? error.text : undefined;
}

export function getProviderErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "AI 服务请求失败";
  const statusCode = getStatusCode(error) ?? (() => {
    const match = message.match(/\b(4\d{2}|5\d{2})\b/);
    return match ? Number(match[1]) : undefined;
  })();
  const responseText = getResponseText(error);

  const receivedHtml =
    /Unexpected token ['\"]?<|<!doctype html/i.test(message) ||
    /Invalid JSON response/i.test(message) ||
    /<!doctype html|<html/i.test(responseText || "");

  if (receivedHtml) {
    return "AI 服务返回了网页 HTML，而不是 OpenAI 兼容 API 的 JSON。请检查 Vercel 中的 OPENAI_BASE_URL 和 OPENAI_API_KEY。";
  }

  const providerUnavailable =
    statusCode === 502 ||
    statusCode === 503 ||
    /\b(?:502|503)\b.*(?:bad gateway|service temporarily unavailable)/i.test(message) ||
    /\bservice temporarily unavailable\b/i.test(message);

  if (providerUnavailable) {
    return "AI 服务商暂时不可用（HTTP 502/503）。请稍后重试，或更换一把已开通推理服务的 API 密钥。";
  }

  if (statusCode === 401 || statusCode === 403) {
    return "AI 服务认证失败。请检查 Vercel 中的 OPENAI_API_KEY 是否有效，并确认它属于当前 OPENAI_BASE_URL 对应的服务。";
  }

  if (!openaiApiKey) {
    return "未配置 OPENAI_API_KEY。请在 Vercel 的 Production 环境变量中配置后重新部署。";
  }

  return message;
}
