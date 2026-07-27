const REDACT_KEYS = [
  /key/i,
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
];

function shouldRedact(key: string): boolean {
  return REDACT_KEYS.some((pattern) => pattern.test(key));
}

export function sanitizeTextForLog(value: string, maxLength = 500): string {
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}...`;
}

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[Truncated]";

  if (typeof value === "string") {
    return sanitizeTextForLog(value, 300);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeForLog(item, depth + 1));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (shouldRedact(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeForLog(v, depth + 1);
      }
    }
    return out;
  }

  return value;
}
