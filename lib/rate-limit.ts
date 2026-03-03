/**
 * Sliding-window rate limiter for API routes.
 *
 * Protects expensive Gemini AI calls from abuse by limiting
 * requests per IP address within a configurable time window.
 *
 * Architecture:
 * - In-memory store keyed by IP address
 * - Sliding window algorithm (timestamps array)
 * - Auto-cleanup of expired entries to prevent memory leaks
 * - Configurable per-route limits
 *
 * Provides standard rate-limit headers:
 * - X-RateLimit-Limit: max requests per window
 * - X-RateLimit-Remaining: requests left in current window
 * - X-RateLimit-Reset: epoch seconds when window resets
 * - Retry-After: seconds until next request allowed (on 429)
 */

export interface RateLimitConfig {
  /** Maximum requests allowed per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Requests remaining in the current window */
  remaining: number;
  /** Total limit */
  limit: number;
  /** Epoch timestamp (seconds) when the window resets */
  resetAt: number;
  /** Seconds until the client can retry (0 if allowed) */
  retryAfterSeconds: number;
}

interface ClientRecord {
  /** Timestamps of requests within the current window */
  timestamps: number[];
  /** Last access time (for cleanup) */
  lastAccess: number;
}

/** Default presets for different route types */
export const RATE_LIMIT_PRESETS = {
  /** /api/analyze — expensive full analysis (3 Gemini calls) */
  analyze: { maxRequests: 5, windowMs: 60_000 } as RateLimitConfig,
  /** /api/analyze/stream — streaming analysis (3 Gemini calls) */
  stream: { maxRequests: 5, windowMs: 60_000 } as RateLimitConfig,
  /** /api/chat — follow-up questions (1 Gemini call each) */
  chat: { maxRequests: 20, windowMs: 60_000 } as RateLimitConfig,
} as const;

/**
 * In-memory sliding-window rate limiter.
 *
 * Each instance tracks a separate limit (e.g., one per API route).
 * Uses a sliding window: counts only requests within the last `windowMs`.
 */
export class RateLimiter {
  private store = new Map<string, ClientRecord>();
  private config: RateLimitConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfig) {
    this.config = config;
    // Periodically clean up expired entries to prevent memory leaks
    // Only start cleanup in long-running processes (not in tests)
    if (typeof globalThis !== "undefined" && !process.env.VITEST) {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
      // Allow Node to exit even if interval is pending
      if (this.cleanupInterval && typeof this.cleanupInterval === "object" && "unref" in this.cleanupInterval) {
        this.cleanupInterval.unref();
      }
    }
  }

  /**
   * Check if a request from the given identifier is allowed.
   * If allowed, records the request timestamp.
   */
  check(identifier: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let record = this.store.get(identifier);
    if (!record) {
      record = { timestamps: [], lastAccess: now };
      this.store.set(identifier, record);
    }

    // Slide the window: remove timestamps older than windowMs
    record.timestamps = record.timestamps.filter((t) => t > windowStart);
    record.lastAccess = now;

    const resetAt = Math.ceil((now + this.config.windowMs) / 1000);

    if (record.timestamps.length >= this.config.maxRequests) {
      // Rate limited — calculate retry-after from oldest timestamp in window
      const oldestInWindow = record.timestamps[0];
      const retryAfterMs = oldestInWindow + this.config.windowMs - now;
      const retryAfterSeconds = Math.ceil(Math.max(0, retryAfterMs) / 1000);

      return {
        allowed: false,
        remaining: 0,
        limit: this.config.maxRequests,
        resetAt,
        retryAfterSeconds,
      };
    }

    // Allowed — record this request
    record.timestamps.push(now);
    const remaining = this.config.maxRequests - record.timestamps.length;

    return {
      allowed: true,
      remaining,
      limit: this.config.maxRequests,
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Remove expired entries from the store.
   * Called periodically to prevent unbounded memory growth.
   */
  cleanup(): void {
    const now = Date.now();
    const expiry = this.config.windowMs * 2; // Keep records for 2x window

    for (const [key, record] of this.store) {
      if (now - record.lastAccess > expiry) {
        this.store.delete(key);
      }
    }
  }

  /** Number of tracked clients (for monitoring/testing) */
  get size(): number {
    return this.store.size;
  }

  /** Reset all tracked state (primarily for testing) */
  reset(): void {
    this.store.clear();
  }

  /** Stop the cleanup interval */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// ─── Singleton instances per route ───────────────────────────

export const analyzeLimiter = new RateLimiter(RATE_LIMIT_PRESETS.analyze);
export const streamLimiter = new RateLimiter(RATE_LIMIT_PRESETS.stream);
export const chatLimiter = new RateLimiter(RATE_LIMIT_PRESETS.chat);

// ─── Helper: Extract client IP from Next.js request ──────────

/**
 * Extract the client's IP address from a Next.js request.
 * Checks standard proxy headers, falls back to "anonymous".
 */
export function getClientIp(req: Request): string {
  // Check standard proxy headers
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs: "client, proxy1, proxy2"
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  // Vercel/Cloudflare specific headers
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  return "anonymous";
}

// ─── Helper: Apply rate-limit headers to a Response ──────────

/**
 * Create standard rate-limit headers from a RateLimitResult.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
  };

  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}
