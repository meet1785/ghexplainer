/**
 * Tests for the client-side analysis history module.
 *
 * Focuses on the pure filterHistory function (no localStorage needed)
 * and searchHistory (with localStorage mocked).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  filterHistory,
  searchHistory,
  type SavedAnalysis,
} from "@/lib/history";

// ─── Helpers ──────────────────────────────────────────────────

function makeAnalysis(overrides: Partial<SavedAnalysis> = {}): SavedAnalysis {
  return {
    id: "test-id",
    url: "https://github.com/owner/repo",
    repoSlug: "owner/repo",
    description: "A test repository",
    language: "TypeScript",
    stars: 42,
    markdown: "# Analysis",
    complete: true,
    filesAnalyzed: 10,
    chunks: 2,
    durationMs: 5000,
    savedAt: new Date().toISOString(),
    ...overrides,
  };
}

const SAMPLE_ANALYSES: SavedAnalysis[] = [
  makeAnalysis({
    id: "1",
    repoSlug: "pallets/flask",
    description: "A lightweight WSGI web application framework",
    language: "Python",
  }),
  makeAnalysis({
    id: "2",
    repoSlug: "expressjs/express",
    description: "Fast, unopinionated, minimalist web framework for node",
    language: "JavaScript",
  }),
  makeAnalysis({
    id: "3",
    repoSlug: "fastapi/fastapi",
    description: "FastAPI framework, high performance, easy to learn",
    language: "Python",
  }),
  makeAnalysis({
    id: "4",
    repoSlug: "gin-gonic/gin",
    description: "Gin is a HTTP web framework written in Go",
    language: "Go",
  }),
];

// ─── filterHistory ────────────────────────────────────────────

describe("filterHistory", () => {
  it("should return all analyses for an empty query", () => {
    expect(filterHistory(SAMPLE_ANALYSES, "")).toHaveLength(4);
  });

  it("should return all analyses for a whitespace-only query", () => {
    expect(filterHistory(SAMPLE_ANALYSES, "   ")).toHaveLength(4);
  });

  it("should match by repoSlug (partial)", () => {
    const results = filterHistory(SAMPLE_ANALYSES, "flask");
    expect(results).toHaveLength(1);
    expect(results[0].repoSlug).toBe("pallets/flask");
  });

  it("should match by owner in repoSlug", () => {
    const results = filterHistory(SAMPLE_ANALYSES, "pallets");
    expect(results).toHaveLength(1);
    expect(results[0].repoSlug).toBe("pallets/flask");
  });

  it("should match by description keyword", () => {
    const results = filterHistory(SAMPLE_ANALYSES, "minimalist");
    expect(results).toHaveLength(1);
    expect(results[0].repoSlug).toBe("expressjs/express");
  });

  it("should match by language", () => {
    const results = filterHistory(SAMPLE_ANALYSES, "python");
    expect(results).toHaveLength(2);
    const slugs = results.map((r) => r.repoSlug);
    expect(slugs).toContain("pallets/flask");
    expect(slugs).toContain("fastapi/fastapi");
  });

  it("should be case-insensitive", () => {
    expect(filterHistory(SAMPLE_ANALYSES, "FLASK")).toHaveLength(1);
    expect(filterHistory(SAMPLE_ANALYSES, "Flask")).toHaveLength(1);
    expect(filterHistory(SAMPLE_ANALYSES, "flask")).toHaveLength(1);
  });

  it("should return empty array when no match found", () => {
    const results = filterHistory(SAMPLE_ANALYSES, "nonexistent-repo-xyz");
    expect(results).toHaveLength(0);
  });

  it("should return empty array for empty input list", () => {
    expect(filterHistory([], "flask")).toHaveLength(0);
  });

  it("should match partial description words", () => {
    const results = filterHistory(SAMPLE_ANALYSES, "WSGI");
    expect(results).toHaveLength(1);
    expect(results[0].repoSlug).toBe("pallets/flask");
  });

  it("should handle analyses with null language", () => {
    const analyses = [
      makeAnalysis({ id: "5", repoSlug: "a/b", language: null }),
    ];
    // Should not throw, and should not match a language query
    expect(() => filterHistory(analyses, "python")).not.toThrow();
    expect(filterHistory(analyses, "python")).toHaveLength(0);
  });

  it("should match multiple fields simultaneously", () => {
    // "go" matches both the Go language and "gin-gonic/gin" description
    const results = filterHistory(SAMPLE_ANALYSES, "go");
    // language "Go" and description "...written in Go"
    expect(results.some((r) => r.language === "Go")).toBe(true);
  });

  it("should preserve original order from input array", () => {
    const results = filterHistory(SAMPLE_ANALYSES, "python");
    expect(results[0].repoSlug).toBe("pallets/flask");
    expect(results[1].repoSlug).toBe("fastapi/fastapi");
  });
});

// ─── searchHistory (localStorage mock) ───────────────────────

describe("searchHistory", () => {
  beforeEach(() => {
    // Mock localStorage
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });

    // Pre-populate with sample data
    storage.set(
      "ghexplainer_history",
      JSON.stringify(SAMPLE_ANALYSES)
    );
  });

  it("should return all history for empty query", () => {
    const results = searchHistory("");
    expect(results).toHaveLength(4);
  });

  it("should filter history by query", () => {
    const results = searchHistory("flask");
    expect(results).toHaveLength(1);
    expect(results[0].repoSlug).toBe("pallets/flask");
  });

  it("should return empty array when nothing matches", () => {
    const results = searchHistory("xyznotfound");
    expect(results).toHaveLength(0);
  });

  it("should return empty array when localStorage has no history", () => {
    localStorage.setItem("ghexplainer_history", "");
    const results = searchHistory("flask");
    expect(results).toHaveLength(0);
  });
});
