import { createOpenAI } from "@ai-sdk/openai";

const OPENAI_API_URL =
  process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const ENABLE_WEB_SEARCH = process.env.ENABLE_WEB_SEARCH === "true";
const WEB_SEARCH_ALLOWED_DOMAINS = (
  process.env.WEB_SEARCH_ALLOWED_DOMAINS ??
  "pubmed.ncbi.nlm.nih.gov,ncbi.nlm.nih.gov,nature.com,cell.com,sciencedirect.com,jci.org,ashpublications.org"
)
  .split(",")
  .map((domain) => domain.trim())
  .filter(Boolean);

export const openaiProvider = createOpenAI({
  baseURL: OPENAI_API_URL,
  apiKey: OPENAI_API_KEY,
});

export function getOpenAIModel() {
  return openaiProvider(OPENAI_MODEL);
}

export function getWebSearchTools() {
  if (!ENABLE_WEB_SEARCH) {
    return undefined;
  }

  return {
    web_search: (openaiProvider as any).tools?.webSearch?.({
      externalWebAccess: true,
      searchContextSize: "medium",
      filters: { allowedDomains: WEB_SEARCH_ALLOWED_DOMAINS },
    }),
  };
}

export function validateApiKey(): { valid: boolean; error?: string } {
  if (!OPENAI_API_KEY) {
    return {
      valid: false,
      error:
        "No API key configured. Set OPENAI_API_KEY in your .env.local file.",
    };
  }
  return { valid: true };
}

export function validateServerConfig(): { valid: boolean; error?: string } {
  if (!OPENAI_API_KEY) {
    return {
      valid: false,
      error: "Missing required env var OPENAI_API_KEY.",
    };
  }

  if (!OPENAI_MODEL || !OPENAI_MODEL.trim()) {
    return {
      valid: false,
      error: "Missing required env var OPENAI_MODEL.",
    };
  }

  if (!OPENAI_API_URL || !/^https?:\/\//i.test(OPENAI_API_URL)) {
    return {
      valid: false,
      error:
        "OPENAI_BASE_URL must be a valid absolute http(s) URL when provided.",
    };
  }

  return { valid: true };
}
