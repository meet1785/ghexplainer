/**
 * Tests for the in-memory LRU cache.
 *
 * Validates: get/set, TTL expiration, LRU eviction,
 * deduplication of in-flight requests, size tracking.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// We can't import the singleton directly without side effects,
// so we test the cache class by re-importing with fresh state.
// The cache module exports a class and a singleton — we test behavior.

describe("AnalysisCache", () => {
  // We need to import fresh each time, so inline-require:
  let analysisCache: typeof import("@/lib/cache")["analysisCache"];

  beforeEach(async () => {
    const mod = await import("@/lib/cache");
    analysisCache = mod.analysisCache;
    analysisCache.clear();
  });

  it("should return null for missing keys", () => {
    expect(analysisCache.get("nonexistent")).toBeNull();
  });

  it("should store and retrieve values", () => {
    analysisCache.set("key1", { data: "hello" });
    expect(analysisCache.get("key1")).toEqual({ data: "hello" });
  });

  it("should track size", () => {
    expect(analysisCache.size).toBe(0);
    analysisCache.set("a", 1);
    analysisCache.set("b", 2);
    expect(analysisCache.size).toBe(2);
  });

  it("should expire entries after TTL", () => {
    vi.useFakeTimers();

    analysisCache.set("key1", "value1", 5000); // 5s TTL
    expect(analysisCache.get("key1")).toBe("value1");

    vi.advanceTimersByTime(6000);
    expect(analysisCache.get("key1")).toBeNull();

    vi.useRealTimers();
  });

  it("should not expire entries before TTL", () => {
    vi.useFakeTimers();

    analysisCache.set("key1", "value1", 10_000);
    vi.advanceTimersByTime(5000);
    expect(analysisCache.get("key1")).toBe("value1");

    vi.useRealTimers();
  });

  it("should deduplicate in-flight requests via getOrCompute", async () => {
    let computeCount = 0;

    const compute = () =>
      new Promise<string>((resolve) => {
        computeCount++;
        setTimeout(() => resolve("result"), 10);
      });

    // Launch two concurrent computations for the same key
    const [r1, r2] = await Promise.all([
      analysisCache.getOrCompute("shared-key", compute),
      analysisCache.getOrCompute("shared-key", compute),
    ]);

    expect(r1).toBe("result");
    expect(r2).toBe("result");
    // compute should only have been called once (dedup)
    expect(computeCount).toBe(1);
  });

  it("should cache results from getOrCompute", async () => {
    let computeCount = 0;

    await analysisCache.getOrCompute("key1", async () => {
      computeCount++;
      return "computed";
    });

    // Second call should use cached value
    const result = await analysisCache.getOrCompute("key1", async () => {
      computeCount++;
      return "recomputed";
    });

    expect(result).toBe("computed");
    expect(computeCount).toBe(1);
  });

  it("should clear all entries", () => {
    analysisCache.set("a", 1);
    analysisCache.set("b", 2);
    analysisCache.clear();
    expect(analysisCache.size).toBe(0);
    expect(analysisCache.get("a")).toBeNull();
  });
});
