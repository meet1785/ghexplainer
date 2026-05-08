/**
 * Tests for the analysis history module.
 *
 * Validates: save/get/delete, pinning, eviction rules,
 * deduplication, and clear-all behavior.
 *
 * localStorage is mocked in-memory so tests are hermetic and fast.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getHistory,
  saveAnalysis,
  deleteAnalysis,
  clearHistory,
  pinAnalysis,
  unpinAnalysis,
  togglePinAnalysis,
  type SavedAnalysis,
} from "@/lib/history";

// ─── localStorage mock ────────────────────────────────────────

function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

// ─── Test fixture ─────────────────────────────────────────────

function makeEntry(slug: string, overrides: Partial<Omit<SavedAnalysis, "id" | "savedAt">> = {}): Omit<SavedAnalysis, "id" | "savedAt"> {
  return {
    url: `https://github.com/${slug}`,
    repoSlug: slug,
    description: `Description of ${slug}`,
    language: "TypeScript",
    stars: 100,
    markdown: `# ${slug}\nSome content.`,
    complete: true,
    filesAnalyzed: 5,
    chunks: 2,
    durationMs: 3000,
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────

describe("history module", () => {
  beforeEach(() => {
    // Replace window.localStorage with a fresh in-memory mock
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: createLocalStorageMock() },
      writable: true,
      configurable: true,
    });
    // Reflect on localStorage directly so getItem/setItem work
    Object.defineProperty(globalThis, "localStorage", {
      value: (globalThis as typeof globalThis & { window: { localStorage: Storage } }).window.localStorage,
      writable: true,
      configurable: true,
    });
    // Clear the seed flag so tests start clean
    localStorage.removeItem("ghexplainer_history");
    localStorage.removeItem("ghexplainer_history_seed_loaded");
  });

  // ── Basic CRUD ───────────────────────────────────────────────

  it("should return empty array when no history exists", () => {
    expect(getHistory()).toHaveLength(0);
  });

  it("should save an analysis and retrieve it", () => {
    saveAnalysis(makeEntry("owner/repo"));
    const history = getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].repoSlug).toBe("owner/repo");
  });

  it("should deduplicate by repoSlug (keeps latest)", () => {
    saveAnalysis(makeEntry("owner/repo", { stars: 10 }));
    saveAnalysis(makeEntry("owner/repo", { stars: 20 }));
    const history = getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].stars).toBe(20);
  });

  it("should delete an analysis by id", () => {
    const saved = saveAnalysis(makeEntry("owner/repo"));
    deleteAnalysis(saved.id);
    expect(getHistory()).toHaveLength(0);
  });

  it("should clear all history", () => {
    saveAnalysis(makeEntry("owner/repo1"));
    saveAnalysis(makeEntry("owner/repo2"));
    clearHistory();
    expect(getHistory()).toHaveLength(0);
  });

  it("should sort by newest first", () => {
    saveAnalysis(makeEntry("owner/old"));
    // Small delay is not feasible in sync tests; just ensure order after two saves
    saveAnalysis(makeEntry("owner/new"));
    const history = getHistory();
    expect(history[0].repoSlug).toBe("owner/new");
  });

  // ── Pinning ──────────────────────────────────────────────────

  it("should pin an analysis so it appears first", () => {
    saveAnalysis(makeEntry("owner/a"));
    const pinnable = saveAnalysis(makeEntry("owner/b"));
    pinAnalysis(pinnable.id);
    const history = getHistory();
    expect(history[0].repoSlug).toBe("owner/b");
    expect(history[0].pinned).toBe(true);
  });

  it("should unpin a pinned analysis", () => {
    const entry = saveAnalysis(makeEntry("owner/a"));
    pinAnalysis(entry.id);
    unpinAnalysis(entry.id);
    const updated = getHistory().find((h) => h.id === entry.id);
    expect(updated?.pinned).toBe(false);
  });

  it("should toggle pin state from unpinned to pinned", () => {
    const entry = saveAnalysis(makeEntry("owner/a"));
    const newState = togglePinAnalysis(entry.id);
    expect(newState).toBe(true);
    expect(getHistory().find((h) => h.id === entry.id)?.pinned).toBe(true);
  });

  it("should toggle pin state from pinned to unpinned", () => {
    const entry = saveAnalysis(makeEntry("owner/a"));
    pinAnalysis(entry.id);
    const newState = togglePinAnalysis(entry.id);
    expect(newState).toBe(false);
    expect(getHistory().find((h) => h.id === entry.id)?.pinned).toBe(false);
  });

  it("should sort pinned entries above unpinned regardless of date", () => {
    const older = saveAnalysis(makeEntry("owner/pinned"));
    saveAnalysis(makeEntry("owner/unpinned-new"));
    pinAnalysis(older.id);
    const history = getHistory();
    expect(history[0].repoSlug).toBe("owner/pinned");
  });

  it("should preserve pinned state when updating an existing entry", () => {
    const entry = saveAnalysis(makeEntry("owner/repo"));
    pinAnalysis(entry.id);
    // Re-save the same repo (simulates a re-analysis)
    saveAnalysis(makeEntry("owner/repo", { stars: 999 }));
    const updated = getHistory().find((h) => h.repoSlug === "owner/repo");
    expect(updated).toBeDefined();
    expect(updated?.pinned).toBe(true);
    expect(updated?.stars).toBe(999);
  });

  // ── Eviction ─────────────────────────────────────────────────

  it("should not evict pinned entries when history is full", () => {
    // Save 20 entries (MAX_ENTRIES) and pin the first one
    const first = saveAnalysis(makeEntry("owner/first"));
    pinAnalysis(first.id);
    // Save 19 more entries to fill up to MAX_ENTRIES
    for (let i = 0; i < 19; i++) {
      saveAnalysis(makeEntry(`owner/repo-${i}`));
    }
    // Now save a 21st entry — should evict an unpinned entry, not the pinned one
    saveAnalysis(makeEntry("owner/new"));
    const history = getHistory();
    expect(history.some((h) => h.repoSlug === "owner/first")).toBe(true);
    // Total count should be ≤ MAX_ENTRIES (20) + pinned entries
    expect(history.length).toBeLessThanOrEqual(21);
  });
});
