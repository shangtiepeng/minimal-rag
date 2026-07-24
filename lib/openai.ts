import { createOpenAI } from "@ai-sdk/openai";

export const openaiApiKey = process.env.OPENAI_API_KEY;
export const chatModel = process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";
export const openaiBaseUrl = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");

async function openaiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
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
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return undefined;
  }

  return typeof error.statusCode === "number" ? error.statusCode : undefined;
}

function getResponseText(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("text" in error)) {
    return undefined;
  }

  return typeof error.text === "string" ? error.text : undefined;
}

export function getProviderErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "AI 服务请求失败";
  const statusCode = getStatusCode(error);
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
