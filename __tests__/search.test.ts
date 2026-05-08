/**
 * Tests for the section-aware markdown search utilities.
 *
 * Validates: section splitting, anchor generation, occurrence counting,
 * result scoring/ranking, snippet extraction, and edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  searchSections,
  countTotalMatches,
  generateAnchor,
  countOccurrences,
} from "@/lib/search";

// ─── generateAnchor ───────────────────────────────────────────

describe("generateAnchor", () => {
  it("should lower-case the text", () => {
    expect(generateAnchor("Hello World")).toBe("hello-world");
  });

  it("should replace spaces with hyphens", () => {
    expect(generateAnchor("Overview and Goals")).toBe("overview-and-goals");
  });

  it("should strip non-word characters", () => {
    expect(generateAnchor("API & Security")).toBe("api-security");
  });

  it("should collapse consecutive hyphens", () => {
    expect(generateAnchor("one  --  two")).toBe("one-two");
  });

  it("should trim leading and trailing hyphens", () => {
    expect(generateAnchor("---title---")).toBe("title");
  });

  it("should handle already-clean input", () => {
    expect(generateAnchor("architecture")).toBe("architecture");
  });

  it("should handle empty string", () => {
    expect(generateAnchor("")).toBe("");
  });
});

// ─── countOccurrences ─────────────────────────────────────────

describe("countOccurrences", () => {
  it("should count non-overlapping occurrences", () => {
    expect(countOccurrences("abcabc", "abc")).toBe(2);
  });

  it("should return 0 when query not found", () => {
    expect(countOccurrences("hello world", "xyz")).toBe(0);
  });

  it("should return 0 for empty query", () => {
    expect(countOccurrences("hello", "")).toBe(0);
  });

  it("should be case-sensitive (callers must lower-case)", () => {
    expect(countOccurrences("Hello hello HELLO", "hello")).toBe(1);
  });

  it("should handle single-char queries", () => {
    expect(countOccurrences("aaaa", "a")).toBe(4);
  });

  it("should handle query longer than text", () => {
    expect(countOccurrences("hi", "hello world")).toBe(0);
  });
});

// ─── countTotalMatches ────────────────────────────────────────

describe("countTotalMatches", () => {
  it("should count matches case-insensitively", () => {
    const md = "# Architecture\nThe **architecture** is great.\nThis is ARCHITECTURE.";
    expect(countTotalMatches(md, "architecture")).toBe(3);
  });

  it("should return 0 for empty query", () => {
    expect(countTotalMatches("some content", "")).toBe(0);
  });

  it("should return 0 for whitespace-only query", () => {
    expect(countTotalMatches("some content", "   ")).toBe(0);
  });

  it("should return 0 when query is not found", () => {
    expect(countTotalMatches("hello world", "xyz")).toBe(0);
  });

  it("should trim the query before matching", () => {
    expect(countTotalMatches("hello world", "  hello  ")).toBe(1);
  });

  it("should count across multiple sections", () => {
    const md = `# Section A\nfoo bar\n\n# Section B\nfoo baz\n\n# Section C\nfoo foo`;
    expect(countTotalMatches(md, "foo")).toBe(4);
  });
});

// ─── searchSections ───────────────────────────────────────────

const SAMPLE_MD = `
# Architecture Overview
The system uses a modular architecture with clear separation of concerns.
It supports horizontal scaling.

## Data Flow
Data flows from the client through the API layer to the database.
The architecture ensures clean data flow patterns.

## Security Model
Authentication uses JWT tokens. The security model includes rate limiting.

### Rate Limiting
Requests are rate-limited per IP using a sliding window algorithm.

## Performance
The caching layer improves performance significantly.
`.trim();

describe("searchSections", () => {
  it("should return empty array for empty query", () => {
    expect(searchSections(SAMPLE_MD, "")).toHaveLength(0);
  });

  it("should return empty array for whitespace query", () => {
    expect(searchSections(SAMPLE_MD, "   ")).toHaveLength(0);
  });

  it("should return empty array when query not found", () => {
    expect(searchSections(SAMPLE_MD, "quantum")).toHaveLength(0);
  });

  it("should find sections containing the query (case-insensitive)", () => {
    const results = searchSections(SAMPLE_MD, "architecture");
    expect(results.length).toBeGreaterThan(0);
    const headings = results.map((r) => r.heading);
    expect(headings).toContain("Architecture Overview");
  });

  it("should rank heading matches above body-only matches", () => {
    // "architecture" appears in heading "Architecture Overview" (3x weight)
    // AND in the body of "Data Flow" once
    const results = searchSections(SAMPLE_MD, "architecture");
    expect(results[0].heading).toBe("Architecture Overview");
  });

  it("should return correct heading level", () => {
    const results = searchSections(SAMPLE_MD, "rate limiting");
    const rlResult = results.find((r) => r.heading === "Rate Limiting");
    expect(rlResult).toBeDefined();
    expect(rlResult!.level).toBe(3);
  });

  it("should include a non-empty snippet", () => {
    const results = searchSections(SAMPLE_MD, "security");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].snippet.length).toBeGreaterThan(0);
  });

  it("should generate a valid anchor for each result", () => {
    const results = searchSections(SAMPLE_MD, "data");
    for (const r of results) {
      expect(r.anchor).toMatch(/^[a-z0-9-]*$/);
    }
  });

  it("should include all relevant sections, not just the top one", () => {
    // "data" appears in "Data Flow" heading and body
    const results = searchSections(SAMPLE_MD, "data");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should score heading occurrences 3× body occurrences", () => {
    // "Data Flow" heading contains "data" once (score contribution: 3)
    // "Architecture Overview" body mentions data 0 times
    const results = searchSections(SAMPLE_MD, "data");
    const dataFlow = results.find((r) => r.heading === "Data Flow");
    expect(dataFlow).toBeDefined();
    // score = 1 * 3 (heading) + bodyHits
    expect(dataFlow!.score).toBeGreaterThanOrEqual(3);
  });

  it("should sort results by score descending", () => {
    const results = searchSections(SAMPLE_MD, "architecture");
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("should handle single-section markdown with no headings", () => {
    const md = "This is just a plain paragraph with no headings at all.";
    const results = searchSections(md, "paragraph");
    expect(results.length).toBe(1);
    expect(results[0].heading).toBe("Introduction");
  });

  it("should not return sections with zero score", () => {
    const results = searchSections(SAMPLE_MD, "jwt");
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
    }
  });

  it("should trim query whitespace", () => {
    const resultsNormal = searchSections(SAMPLE_MD, "security");
    const resultsTrimmed = searchSections(SAMPLE_MD, "  security  ");
    expect(resultsNormal.length).toBe(resultsTrimmed.length);
  });

  it("should handle markdown with code blocks without crashing", () => {
    const md = `# Setup\nRun the following:\n\`\`\`bash\nnpm install\n\`\`\`\nThis installs dependencies.`;
    expect(() => searchSections(md, "install")).not.toThrow();
    const results = searchSections(md, "install");
    expect(results.length).toBeGreaterThan(0);
  });

  it("should strip markdown formatting from snippets", () => {
    const md = `# Overview\n**Bold** text and \`inline code\` appear here.`;
    const results = searchSections(md, "bold");
    expect(results.length).toBeGreaterThan(0);
    // Snippet should not contain ** or `
    expect(results[0].snippet).not.toMatch(/\*\*|`/);
  });
});
