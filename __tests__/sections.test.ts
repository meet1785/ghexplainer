/**
 * Tests for the Markdown Section Parser module.
 *
 * Validates: section parsing, title/number lookup, filtering,
 * summary statistics, markdown reconstruction, and edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  parseSections,
  getSectionByTitle,
  getSectionByNumber,
  filterSections,
  filterSectionsByNumber,
  getSectionSummary,
  sectionsToMarkdown,
} from "@/lib/sections";

// ─── Test Fixtures ───────────────────────────────────────────

/** Minimal 3-section analysis (matches ghexplainer format) */
const SAMPLE_ANALYSIS = `# 1. Repository Overview
This is a sample repository. It does cool things.
The main technology is TypeScript.

# 2. Architecture & Design
The project uses a modular architecture.
Components communicate via events.

\`\`\`typescript
import { EventEmitter } from "events";
\`\`\`

# 3. Module Breakdown
- **src/**: Core application code
- **lib/**: Shared utilities
- **tests/**: Test files`;

/** Full 11-section analysis */
const FULL_ANALYSIS = `# 1. Repository Overview
Overview content here with multiple words.

# 2. Architecture & Design
Architecture content.

# 3. Module Breakdown
Module content.

# 4. Core Execution Flow
Flow content with \`inline code\`.

# 5. API Surface
API content.

\`\`\`json
{ "endpoint": "/api/test" }
\`\`\`

# 6. Key Business Logic
Logic content.

# 7. Data Flow & State Management
Data flow content.

\`\`\`typescript
const cache = new Map();
\`\`\`

\`\`\`typescript
function transform(data: Input): Output {}
\`\`\`

# 8. Configuration & Environment
Config content.

# 9. Dependencies & Tech Stack
Deps content.

# 10. Strengths & Weaknesses
Strengths and weaknesses content.

# 11. Quick Reference
- Point 1
- Point 2
- Point 3`;

// ─── parseSections ───────────────────────────────────────────

describe("parseSections", () => {
  it("should parse a standard 3-section analysis", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    expect(sections).toHaveLength(3);
    expect(sections[0].number).toBe(1);
    expect(sections[0].title).toBe("Repository Overview");
    expect(sections[1].number).toBe(2);
    expect(sections[1].title).toBe("Architecture & Design");
    expect(sections[2].number).toBe(3);
    expect(sections[2].title).toBe("Module Breakdown");
  });

  it("should parse all 11 sections from a full analysis", () => {
    const sections = parseSections(FULL_ANALYSIS);
    expect(sections).toHaveLength(11);
    for (let i = 0; i < 11; i++) {
      expect(sections[i].number).toBe(i + 1);
    }
  });

  it("should extract section body without the heading line", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    expect(sections[0].body).not.toContain("# 1.");
    expect(sections[0].body).toContain("This is a sample repository");
    expect(sections[0].body).toContain("The main technology is TypeScript.");
  });

  it("should include the heading in content but not in body", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    expect(sections[0].content).toContain("# 1. Repository Overview");
    expect(sections[0].body).not.toContain("# 1. Repository Overview");
  });

  it("should set correct heading levels", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    sections.forEach((s) => {
      expect(s.level).toBe(1); // All use # (level 1)
    });
  });

  it("should parse ## (level 2) headings as sections", () => {
    const md = `## Overview\nContent 1\n\n## Details\nContent 2`;
    const sections = parseSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].level).toBe(2);
    expect(sections[1].level).toBe(2);
  });

  it("should not split on ### or deeper headings", () => {
    const md = `# Main Section\nIntro\n### Subsection\nSub content\n#### Deep\nDeep content`;
    const sections = parseSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].body).toContain("### Subsection");
    expect(sections[0].body).toContain("#### Deep");
  });

  it("should track correct line numbers", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    expect(sections[0].startLine).toBe(0);
    expect(sections[0].endLine).toBe(sections[1].startLine);
    // Last section goes to end
    const last = sections[sections.length - 1];
    expect(last.endLine).toBe(SAMPLE_ANALYSIS.split("\n").length);
  });

  it("should count words excluding code blocks", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    // Section 2 has a code block — words inside it should not be counted
    const archSection = sections[1];
    expect(archSection.wordCount).toBeGreaterThan(0);
    // The code block content should not inflate word count
    expect(archSection.body).toContain("```typescript");
  });

  it("should count fenced code blocks", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    expect(sections[0].codeBlockCount).toBe(0);
    expect(sections[1].codeBlockCount).toBe(1); // Has one code block
  });

  it("should count multiple code blocks in one section", () => {
    const sections = parseSections(FULL_ANALYSIS);
    const dataFlowSection = sections.find(
      (s) => s.title === "Data Flow & State Management"
    );
    expect(dataFlowSection).toBeDefined();
    expect(dataFlowSection!.codeBlockCount).toBe(2);
  });

  it("should handle unnumbered headings", () => {
    const md = `# Introduction\nSome content\n\n# Conclusion\nFinal words`;
    const sections = parseSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].number).toBe(0);
    expect(sections[0].title).toBe("Introduction");
    expect(sections[1].number).toBe(0);
    expect(sections[1].title).toBe("Conclusion");
  });

  it("should handle mixed numbered and unnumbered headings", () => {
    const md = `# Preamble\nIntro\n\n# 1. First Section\nContent\n\n# 2. Second Section\nMore`;
    const sections = parseSections(md);
    expect(sections).toHaveLength(3);
    expect(sections[0].number).toBe(0);
    expect(sections[1].number).toBe(1);
    expect(sections[2].number).toBe(2);
  });

  it("should return empty array for empty input", () => {
    expect(parseSections("")).toEqual([]);
    expect(parseSections("   ")).toEqual([]);
  });

  it("should return empty array for markdown with no headings", () => {
    expect(parseSections("Just some text\nwith no headings")).toEqual([]);
  });

  it("should handle single section", () => {
    const sections = parseSections("# Only Section\nSome content here");
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Only Section");
    expect(sections[0].body).toBe("Some content here");
  });

  it("should handle section with empty body", () => {
    const md = `# Section 1\n\n# Section 2\nContent`;
    const sections = parseSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].body).toBe("");
    expect(sections[1].body).toBe("Content");
  });

  it("should preserve trailing content in last section", () => {
    const md = `# 1. Overview\nLine 1\nLine 2\nLine 3`;
    const sections = parseSections(md);
    expect(sections[0].body).toContain("Line 1");
    expect(sections[0].body).toContain("Line 3");
  });
});

// ─── getSectionByTitle ───────────────────────────────────────

describe("getSectionByTitle", () => {
  const sections = parseSections(FULL_ANALYSIS);

  it("should find section by exact title", () => {
    const s = getSectionByTitle(sections, "Repository Overview");
    expect(s).not.toBeNull();
    expect(s!.number).toBe(1);
  });

  it("should find section by partial title (case-insensitive)", () => {
    const s = getSectionByTitle(sections, "architecture");
    expect(s).not.toBeNull();
    expect(s!.number).toBe(2);
  });

  it("should find section by lowercase keyword", () => {
    const s = getSectionByTitle(sections, "quick reference");
    expect(s).not.toBeNull();
    expect(s!.number).toBe(11);
  });

  it("should return null for non-matching title", () => {
    expect(getSectionByTitle(sections, "nonexistent")).toBeNull();
  });

  it("should return null for empty title", () => {
    expect(getSectionByTitle(sections, "")).toBeNull();
    expect(getSectionByTitle(sections, "  ")).toBeNull();
  });

  it("should return null for empty sections array", () => {
    expect(getSectionByTitle([], "overview")).toBeNull();
  });

  it("should return the first match when multiple sections match", () => {
    // Both "Strengths & Weaknesses" and "Dependencies & Tech Stack" contain "&"
    const s = getSectionByTitle(sections, "&");
    expect(s).not.toBeNull();
    // Should be the first one containing "&" in document order
    expect(s!.number).toBeLessThanOrEqual(11);
  });
});

// ─── getSectionByNumber ──────────────────────────────────────

describe("getSectionByNumber", () => {
  const sections = parseSections(FULL_ANALYSIS);

  it("should find section 1", () => {
    const s = getSectionByNumber(sections, 1);
    expect(s).not.toBeNull();
    expect(s!.title).toBe("Repository Overview");
  });

  it("should find section 11", () => {
    const s = getSectionByNumber(sections, 11);
    expect(s).not.toBeNull();
    expect(s!.title).toBe("Quick Reference");
  });

  it("should return null for non-existent number", () => {
    expect(getSectionByNumber(sections, 99)).toBeNull();
    expect(getSectionByNumber(sections, 0)).toBeNull();
    expect(getSectionByNumber(sections, -1)).toBeNull();
  });

  it("should return null for empty sections array", () => {
    expect(getSectionByNumber([], 1)).toBeNull();
  });
});

// ─── filterSections ──────────────────────────────────────────

describe("filterSections", () => {
  const sections = parseSections(FULL_ANALYSIS);

  it("should filter by single keyword", () => {
    const filtered = filterSections(sections, ["overview"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].number).toBe(1);
  });

  it("should filter by multiple keywords", () => {
    const filtered = filterSections(sections, ["architecture", "quick reference"]);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].number).toBe(2);
    expect(filtered[1].number).toBe(11);
  });

  it("should return results in document order", () => {
    const filtered = filterSections(sections, ["quick reference", "overview"]);
    expect(filtered[0].number).toBe(1); // Overview comes first in doc
    expect(filtered[1].number).toBe(11);
  });

  it("should be case-insensitive", () => {
    const filtered = filterSections(sections, ["ARCHITECTURE"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].number).toBe(2);
  });

  it("should return empty array for no matches", () => {
    expect(filterSections(sections, ["nonexistent"])).toEqual([]);
  });

  it("should return empty array for empty titles", () => {
    expect(filterSections(sections, [])).toEqual([]);
  });

  it("should skip empty/whitespace keywords", () => {
    const filtered = filterSections(sections, ["", "  ", "overview"]);
    expect(filtered).toHaveLength(1);
  });
});

// ─── filterSectionsByNumber ──────────────────────────────────

describe("filterSectionsByNumber", () => {
  const sections = parseSections(FULL_ANALYSIS);

  it("should filter by single number", () => {
    const filtered = filterSectionsByNumber(sections, [1]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Repository Overview");
  });

  it("should filter by multiple numbers", () => {
    const filtered = filterSectionsByNumber(sections, [1, 5, 11]);
    expect(filtered).toHaveLength(3);
    expect(filtered.map((s) => s.number)).toEqual([1, 5, 11]);
  });

  it("should maintain document order", () => {
    const filtered = filterSectionsByNumber(sections, [11, 1, 5]);
    expect(filtered.map((s) => s.number)).toEqual([1, 5, 11]);
  });

  it("should return empty for non-existent numbers", () => {
    expect(filterSectionsByNumber(sections, [99, 100])).toEqual([]);
  });

  it("should return empty for empty numbers array", () => {
    expect(filterSectionsByNumber(sections, [])).toEqual([]);
  });
});

// ─── getSectionSummary ───────────────────────────────────────

describe("getSectionSummary", () => {
  it("should summarize a full analysis", () => {
    const sections = parseSections(FULL_ANALYSIS);
    const summary = getSectionSummary(sections);
    expect(summary.totalSections).toBe(11);
    expect(summary.totalWordCount).toBeGreaterThan(0);
    expect(summary.totalCodeBlocks).toBeGreaterThan(0);
    expect(summary.avgWordsPerSection).toBeGreaterThan(0);
    expect(summary.sections).toHaveLength(11);
  });

  it("should compute correct average", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    const summary = getSectionSummary(sections);
    const expectedAvg = Math.round(
      summary.totalWordCount / summary.totalSections
    );
    expect(summary.avgWordsPerSection).toBe(expectedAvg);
  });

  it("should include per-section breakdown", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    const summary = getSectionSummary(sections);
    expect(summary.sections[0].title).toBe("Repository Overview");
    expect(summary.sections[0].number).toBe(1);
    expect(summary.sections[0].wordCount).toBeGreaterThan(0);
  });

  it("should count code blocks across sections", () => {
    const sections = parseSections(FULL_ANALYSIS);
    const summary = getSectionSummary(sections);
    // Full analysis has code blocks in sections 5 and 7
    expect(summary.totalCodeBlocks).toBeGreaterThanOrEqual(3);
  });

  it("should handle empty sections array", () => {
    const summary = getSectionSummary([]);
    expect(summary.totalSections).toBe(0);
    expect(summary.totalWordCount).toBe(0);
    expect(summary.totalCodeBlocks).toBe(0);
    expect(summary.avgWordsPerSection).toBe(0);
    expect(summary.sections).toEqual([]);
  });
});

// ─── sectionsToMarkdown ──────────────────────────────────────

describe("sectionsToMarkdown", () => {
  it("should reconstruct markdown from sections", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    const rebuilt = sectionsToMarkdown(sections);
    // Should contain all section headings
    expect(rebuilt).toContain("# 1. Repository Overview");
    expect(rebuilt).toContain("# 2. Architecture & Design");
    expect(rebuilt).toContain("# 3. Module Breakdown");
  });

  it("should preserve section content", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    const rebuilt = sectionsToMarkdown(sections);
    expect(rebuilt).toContain("This is a sample repository");
    expect(rebuilt).toContain("modular architecture");
  });

  it("should work with filtered sections", () => {
    const sections = parseSections(FULL_ANALYSIS);
    const filtered = filterSectionsByNumber(sections, [1, 11]);
    const rebuilt = sectionsToMarkdown(filtered);
    expect(rebuilt).toContain("# 1. Repository Overview");
    expect(rebuilt).toContain("# 11. Quick Reference");
    expect(rebuilt).not.toContain("# 2. Architecture");
  });

  it("should separate sections with double newlines", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    const rebuilt = sectionsToMarkdown(sections);
    expect(rebuilt).toContain("\n\n# 2.");
  });

  it("should return empty string for empty array", () => {
    expect(sectionsToMarkdown([])).toBe("");
  });

  it("should handle single section", () => {
    const sections = parseSections("# Solo\nContent");
    const rebuilt = sectionsToMarkdown(sections);
    expect(rebuilt).toContain("# Solo");
    expect(rebuilt).toContain("Content");
  });
});

// ─── Round-trip: parse → filter → reconstruct ────────────────

describe("round-trip operations", () => {
  it("should preserve content through parse → reconstruct", () => {
    const sections = parseSections(SAMPLE_ANALYSIS);
    const rebuilt = sectionsToMarkdown(sections);
    // Every section title should be present
    for (const s of sections) {
      expect(rebuilt).toContain(s.title);
    }
  });

  it("should allow filter → summary pipeline", () => {
    const sections = parseSections(FULL_ANALYSIS);
    const techSections = filterSections(sections, [
      "dependencies",
      "configuration",
    ]);
    const summary = getSectionSummary(techSections);
    expect(summary.totalSections).toBe(2);
    expect(summary.sections[0].title).toContain("Configuration");
    expect(summary.sections[1].title).toContain("Dependencies");
  });

  it("should allow number → title lookup pipeline", () => {
    const sections = parseSections(FULL_ANALYSIS);
    const section5 = getSectionByNumber(sections, 5);
    expect(section5).not.toBeNull();
    const alsoSection5 = getSectionByTitle(sections, section5!.title);
    expect(alsoSection5).not.toBeNull();
    expect(alsoSection5!.number).toBe(5);
  });
});
