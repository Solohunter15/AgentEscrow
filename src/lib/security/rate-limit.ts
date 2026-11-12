export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();
let lastPruneMs = Date.now();

export function checkRateLimit(params: {
  key: string;
  maxRequests: number;
  windowMs: number;
  nowMs?: number;
}): RateLimitResult {
  const now = params.nowMs ?? Date.now();
  const cutoff = now - params.windowMs;

  // Periodically prune stale buckets to prevent unbounded memory growth
  if (now - lastPruneMs > 60_000) {
    lastPruneMs = now;
    for (const [k, b] of buckets.entries()) {
      const active = b.timestamps.filter((t) => t > cutoff);
      if (active.length === 0) {
        buckets.delete(k);
      } else {
        b.timestamps = active;
      }
    }
  }

  const bucket = buckets.get(params.key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= params.maxRequests) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + params.windowMs - now) / 1000)
    );
    buckets.set(params.key, bucket);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.timestamps.push(now);
  buckets.set(params.key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, params.maxRequests - bucket.timestamps.length),
    retryAfterSec: 0,
  };
}

export function clearRateLimitStoreForTests(): void {
  buckets.clear();
}

export function isTrustedBrowserOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return true; // Non-browser / server-to-server requests
  const host = headers.get("x-forwarded-host") || headers.get("host");
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host;
  } catch {
    return false;
  }
}

export function sanitizeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  // Neutralize Excel/Sheets formula injection (=, +, -, @, tab, CR)
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

