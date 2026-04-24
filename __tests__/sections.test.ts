/**
 * Tests for the markdown section parser.
 *
 * Validates: section extraction, single-section lookup by ID,
 * single-section lookup by title, edge cases (empty input,
 * preamble text, missing sections, content trimming).
 */

import { describe, it, expect } from "vitest";
import {
  extractSections,
  getSection,
  getSectionByTitle,
} from "@/lib/sections";

// ─── Helpers ─────────────────────────────────────────────────

/** Minimal 11-section analysis document. */
const FULL_MARKDOWN = `
# 1. Repository Overview

This project is a Next.js web application that analyzes GitHub repos.

# 2. Architecture & Design

It uses a three-layer architecture: fetch → chunk → generate.

## 2.1 Sub-heading

Sub-heading content is part of section 2.

# 3. Module Breakdown

- lib/github.ts — GitHub API client
- lib/chunker.ts — smart chunking engine

# 4. Core Execution Flow

Entry point is app/page.tsx → API → analyzeRepo().

# 5. API Surface

POST /api/analyze — accepts { url, noCache }.

# 6. Key Business Logic

Rate limiting via sliding window in lib/rate-limit.ts.

# 7. Data Flow & State Management

Data flows from GitHub → chunker → Gemini → cache → response.

# 8. Configuration & Environment

Required env vars: GEMINI_API_KEY. Optional: GITHUB_TOKEN.

# 9. Dependencies & Tech Stack

Next.js 16, React 19, Tailwind CSS 4, Google Gemini SDK.

# 10. Strengths & Weaknesses

Strengths: streaming, caching. Weaknesses: in-memory only cache.

# 11. Quick Reference

- Entry: app/page.tsx
- API: app/api/analyze/stream/route.ts
- Cache: lib/cache.ts
`.trim();

// ─── extractSections ──────────────────────────────────────────

describe("extractSections", () => {
  it("should return an empty array for empty input", () => {
    expect(extractSections("")).toHaveLength(0);
    expect(extractSections("   ")).toHaveLength(0);
  });

  it("should return an empty array when there are no section headers", () => {
    expect(extractSections("Some random text\nwithout any headers")).toHaveLength(0);
  });

  it("should extract all 11 sections from a full document", () => {
    const sections = extractSections(FULL_MARKDOWN);
    expect(sections).toHaveLength(11);
  });

  it("should assign correct IDs in order", () => {
    const ids = extractSections(FULL_MARKDOWN).map((s) => s.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("should assign correct titles", () => {
    const sections = extractSections(FULL_MARKDOWN);
    expect(sections[0].title).toBe("Repository Overview");
    expect(sections[1].title).toBe("Architecture & Design");
    expect(sections[10].title).toBe("Quick Reference");
  });

  it("should capture body content for each section", () => {
    const sections = extractSections(FULL_MARKDOWN);
    expect(sections[0].content).toContain("Next.js web application");
    expect(sections[2].content).toContain("lib/github.ts");
    expect(sections[10].content).toContain("lib/cache.ts");
  });

  it("should include sub-headings (## lines) in the parent section content", () => {
    const sections = extractSections(FULL_MARKDOWN);
    const arch = sections.find((s) => s.id === 2)!;
    expect(arch.content).toContain("## 2.1 Sub-heading");
    expect(arch.content).toContain("Sub-heading content is part of section 2.");
  });

  it("should trim leading/trailing whitespace from content", () => {
    const md = "# 1. Overview\n\n  \n\nSome content\n\n";
    const [section] = extractSections(md);
    expect(section.content).toBe("Some content");
  });

  it("should ignore preamble text before the first section header", () => {
    const md = "Preamble text here.\n\n# 1. Overview\n\nContent.";
    const sections = extractSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].content).not.toContain("Preamble");
  });

  it("should handle a single section", () => {
    const md = "# 5. API Surface\n\nPOST /api/analyze";
    const sections = extractSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe(5);
    expect(sections[0].title).toBe("API Surface");
    expect(sections[0].content).toBe("POST /api/analyze");
  });

  it("should handle sections with empty content", () => {
    const md = "# 1. Overview\n\n# 2. Architecture\n\nContent here.";
    const sections = extractSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].content).toBe("");
    expect(sections[1].content).toBe("Content here.");
  });

  it("should handle multi-digit section numbers", () => {
    const md = "# 10. Strengths & Weaknesses\n\nSome analysis.\n\n# 11. Quick Reference\n\nBullets.";
    const sections = extractSections(md);
    expect(sections[0].id).toBe(10);
    expect(sections[1].id).toBe(11);
  });
});

// ─── getSection ───────────────────────────────────────────────

describe("getSection", () => {
  it("should return the correct section by ID", () => {
    const section = getSection(FULL_MARKDOWN, 1);
    expect(section).not.toBeNull();
    expect(section!.id).toBe(1);
    expect(section!.title).toBe("Repository Overview");
  });

  it("should return null for a non-existent ID", () => {
    expect(getSection(FULL_MARKDOWN, 99)).toBeNull();
    expect(getSection(FULL_MARKDOWN, 0)).toBeNull();
  });

  it("should return null for empty markdown", () => {
    expect(getSection("", 1)).toBeNull();
  });

  it("should find any of the 11 sections", () => {
    for (let i = 1; i <= 11; i++) {
      const section = getSection(FULL_MARKDOWN, i);
      expect(section).not.toBeNull();
      expect(section!.id).toBe(i);
    }
  });
});

// ─── getSectionByTitle ────────────────────────────────────────

describe("getSectionByTitle", () => {
  it("should return the correct section by exact title", () => {
    const section = getSectionByTitle(FULL_MARKDOWN, "Repository Overview");
    expect(section).not.toBeNull();
    expect(section!.id).toBe(1);
  });

  it("should be case-insensitive", () => {
    expect(getSectionByTitle(FULL_MARKDOWN, "repository overview")).not.toBeNull();
    expect(getSectionByTitle(FULL_MARKDOWN, "REPOSITORY OVERVIEW")).not.toBeNull();
    expect(getSectionByTitle(FULL_MARKDOWN, "Repository Overview")).not.toBeNull();
  });

  it("should trim whitespace from the query title", () => {
    expect(getSectionByTitle(FULL_MARKDOWN, "  Quick Reference  ")).not.toBeNull();
  });

  it("should return null for a non-existent title", () => {
    expect(getSectionByTitle(FULL_MARKDOWN, "Nonexistent Section")).toBeNull();
  });

  it("should return null for empty markdown", () => {
    expect(getSectionByTitle("", "Repository Overview")).toBeNull();
  });

  it("should find sections with special characters in title", () => {
    const section = getSectionByTitle(FULL_MARKDOWN, "Architecture & Design");
    expect(section).not.toBeNull();
    expect(section!.id).toBe(2);
  });

  it("should find the last section by title", () => {
    const section = getSectionByTitle(FULL_MARKDOWN, "Quick Reference");
    expect(section).not.toBeNull();
    expect(section!.id).toBe(11);
  });
});
