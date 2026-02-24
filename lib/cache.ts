/**
 * In-memory LRU cache for analysis results.
 *
 * Implements the "Cache Storage" layer from the architecture:
 * - Caches completed analysis results keyed by owner/repo
 * - TTL-based expiration (default 1 hour)
 * - LRU eviction when max entries exceeded
 * - Prevents duplicate in-flight requests for the same repo
 */

export interface CacheEntry<T> {
  data: T;
  createdAt: number;
  ttl: number;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 50;

class AnalysisCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private inFlight = new Map<string, Promise<T>>();

  /**
   * Get a cached result if available and not expired.
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.createdAt > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  /**
   * Store a result in cache.
   */
  set(key: string, data: T, ttl = DEFAULT_TTL_MS): void {
    // Evict oldest if at capacity
    if (this.cache.size >= MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { data, createdAt: Date.now(), ttl });
  }

  /**
   * Deduplicate in-flight requests.
   * If the same key is already being processed, returns the existing promise.
   */
  async getOrCompute(key: string, compute: () => Promise<T>, ttl = DEFAULT_TTL_MS): Promise<T> {
    // Check cache first
    const cached = this.get(key);
    if (cached !== null) return cached;

    // Check if already in-flight
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    // Compute and cache
    const promise = compute()
      .then((result) => {
        this.set(key, result, ttl);
        this.inFlight.delete(key);
        return result;
      })
      .catch((err) => {
        this.inFlight.delete(key);
        throw err;
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  /** Number of cached entries */
  get size(): number {
    return this.cache.size;
  }

  /** Clear all cache */
  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }
}

// Singleton for the app
export const analysisCache = new AnalysisCache();
