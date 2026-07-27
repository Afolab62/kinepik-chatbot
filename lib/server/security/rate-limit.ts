interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const bucket = new Map<string, RateLimitEntry>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
}

export function checkRateLimit(
  key: string,
  options: { windowMs: number; maxRequests: number },
): RateLimitResult {
  const now = Date.now();
  const current = bucket.get(key);

  if (!current || current.resetAt <= now) {
    bucket.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.max(0, options.maxRequests - 1),
    };
  }

  current.count += 1;

  if (current.count > options.maxRequests) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, current.resetAt - now),
      remaining: 0,
    };
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: Math.max(0, options.maxRequests - current.count),
  };
}

// Avoid unbounded growth in long-lived processes.
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of bucket.entries()) {
    if (value.resetAt <= now) {
      bucket.delete(key);
    }
  }
}, 60_000).unref?.();
