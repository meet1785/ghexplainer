/**
 * Tests for the sliding-window rate limiter.
 *
 * Validates: basic allow/deny, sliding window, cleanup,
 * headers, IP extraction, concurrent clients, edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  RateLimiter,
  getClientIp,
  rateLimitHeaders,
  RATE_LIMIT_PRESETS,
  type RateLimitResult,
} from "@/lib/rate-limit";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxRequests: 3, windowMs: 10_000 });
  });

  afterEach(() => {
    limiter.destroy();
  });

  it("should allow requests under the limit", () => {
    const r1 = limiter.check("client-a");
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r1.limit).toBe(3);

    const r2 = limiter.check("client-a");
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check("client-a");
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("should deny requests over the limit", () => {
    limiter.check("client-a");
    limiter.check("client-a");
    limiter.check("client-a");

    const r4 = limiter.check("client-a");
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("should track clients independently", () => {
    // Fill up client-a
    limiter.check("client-a");
    limiter.check("client-a");
    limiter.check("client-a");
    expect(limiter.check("client-a").allowed).toBe(false);

    // client-b should still be allowed
    const rb = limiter.check("client-b");
    expect(rb.allowed).toBe(true);
    expect(rb.remaining).toBe(2);
  });

  it("should reset after window expires (sliding window)", () => {
    vi.useFakeTimers();

    limiter.check("client-a");
    limiter.check("client-a");
    limiter.check("client-a");
    expect(limiter.check("client-a").allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(11_000);

    // Should be allowed again
    const result = limiter.check("client-a");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);

    vi.useRealTimers();
  });

  it("should slide the window correctly (partial expiry)", () => {
    vi.useFakeTimers();

    // Request at t=0
    limiter.check("client-a");

    // Request at t=5s
    vi.advanceTimersByTime(5_000);
    limiter.check("client-a");

    // Request at t=8s
    vi.advanceTimersByTime(3_000);
    limiter.check("client-a");

    // At t=8s: all 3 requests in window (0, 5s, 8s) → limit reached
    expect(limiter.check("client-a").allowed).toBe(false);

    // Advance to t=11s → first request (t=0) expires, window has (5s, 8s) = 2 requests
    vi.advanceTimersByTime(3_000);
    const result = limiter.check("client-a");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0); // 2 existing + 1 new = 3 (limit)

    vi.useRealTimers();
  });

  it("should provide correct resetAt timestamp", () => {
    const result = limiter.check("client-a");
    const nowSeconds = Math.ceil(Date.now() / 1000);
    // resetAt should be ~10 seconds from now
    expect(result.resetAt).toBeGreaterThanOrEqual(nowSeconds + 9);
    expect(result.resetAt).toBeLessThanOrEqual(nowSeconds + 11);
  });

  it("should cleanup expired entries", () => {
    vi.useFakeTimers();

    limiter.check("client-a");
    limiter.check("client-b");
    expect(limiter.size).toBe(2);

    // Advance past 2x window (cleanup threshold)
    vi.advanceTimersByTime(25_000);
    limiter.cleanup();

    expect(limiter.size).toBe(0);

    vi.useRealTimers();
  });

  it("should not cleanup active entries", () => {
    vi.useFakeTimers();

    limiter.check("client-a");

    // Advance to just before cleanup threshold
    vi.advanceTimersByTime(15_000);
    limiter.check("client-b"); // fresh request

    limiter.cleanup();
    // client-a should be cleaned up (last access 15s ago, > 2*10s=20s? No, 15s < 20s)
    // Actually: client-a lastAccess was at t=0, now is t=15s, expiry = 2*10000 = 20s
    // 15000 - 0 = 15000 < 20000 → NOT cleaned up
    expect(limiter.size).toBe(2);

    vi.useRealTimers();
  });

  it("should reset all state", () => {
    limiter.check("client-a");
    limiter.check("client-b");
    expect(limiter.size).toBe(2);

    limiter.reset();
    expect(limiter.size).toBe(0);

    // client-a should be fresh
    const result = limiter.check("client-a");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });
});

describe("getClientIp", () => {
  function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/test", {
      headers: new Headers(headers),
    });
  }

  it("should extract IP from x-forwarded-for", () => {
    const req = makeRequest({ "x-forwarded-for": "203.0.113.50, 70.41.3.18" });
    expect(getClientIp(req)).toBe("203.0.113.50");
  });

  it("should extract IP from x-real-ip", () => {
    const req = makeRequest({ "x-real-ip": "198.51.100.42" });
    expect(getClientIp(req)).toBe("198.51.100.42");
  });

  it("should extract IP from cf-connecting-ip", () => {
    const req = makeRequest({ "cf-connecting-ip": "192.0.2.1" });
    expect(getClientIp(req)).toBe("192.0.2.1");
  });

  it("should prefer x-forwarded-for over x-real-ip", () => {
    const req = makeRequest({
      "x-forwarded-for": "10.0.0.1",
      "x-real-ip": "10.0.0.2",
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("should return 'anonymous' when no headers present", () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe("anonymous");
  });

  it("should handle whitespace in headers", () => {
    const req = makeRequest({ "x-forwarded-for": "  203.0.113.50 , 70.41.3.18 " });
    expect(getClientIp(req)).toBe("203.0.113.50");
  });
});

describe("rateLimitHeaders", () => {
  it("should generate correct allowed headers", () => {
    const result: RateLimitResult = {
      allowed: true,
      remaining: 4,
      limit: 5,
      resetAt: 1700000000,
      retryAfterSeconds: 0,
    };
    const headers = rateLimitHeaders(result);
    expect(headers["X-RateLimit-Limit"]).toBe("5");
    expect(headers["X-RateLimit-Remaining"]).toBe("4");
    expect(headers["X-RateLimit-Reset"]).toBe("1700000000");
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("should include Retry-After when blocked", () => {
    const result: RateLimitResult = {
      allowed: false,
      remaining: 0,
      limit: 5,
      resetAt: 1700000000,
      retryAfterSeconds: 42,
    };
    const headers = rateLimitHeaders(result);
    expect(headers["Retry-After"]).toBe("42");
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
  });
});

describe("RATE_LIMIT_PRESETS", () => {
  it("should have sensible defaults for analyze route", () => {
    expect(RATE_LIMIT_PRESETS.analyze.maxRequests).toBeGreaterThanOrEqual(3);
    expect(RATE_LIMIT_PRESETS.analyze.windowMs).toBeGreaterThanOrEqual(30_000);
  });

  it("should allow more chat requests than analyze requests", () => {
    expect(RATE_LIMIT_PRESETS.chat.maxRequests).toBeGreaterThan(
      RATE_LIMIT_PRESETS.analyze.maxRequests
    );
  });

  it("should have matching analyze and stream limits", () => {
    expect(RATE_LIMIT_PRESETS.stream.maxRequests).toBe(
      RATE_LIMIT_PRESETS.analyze.maxRequests
    );
  });
});
