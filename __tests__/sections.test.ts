/**
 * Tests for the markdown section parser (lib/sections.ts).
 *
 * Validates: heading detection, content extraction, ID generation,
 * section search, preamble handling, top-level section filtering,
 * and edge-case inputs.
 */

import { describe, it, expect } from "vitest";
import {
  headingToId,
  parseAnalysisSections,
  getSectionByTitle,
  getSectionContent,
  getTopLevelSections,
  type AnalysisSection,
} from "@/lib/sections";

// ─── headingToId ──────────────────────────────────────────────

describe("headingToId", () => {
  it("should convert plain text to kebab-case", () => {
    expect(headingToId("Repository Overview")).toBe("repository-overview");
  });

  it("should strip leading ordinals", () => {
    expect(headingToId("1. Architecture Overview")).toBe("architecture-overview");
    expect(headingToId("11. Interview Notes")).toBe("interview-notes");
  });

  it("should replace & with 'and'", () => {
    expect(headingToId("Key Components & APIs")).toBe("key-components-and-apis");
  });

  it("should remove special characters", () => {
    expect(headingToId("Error Handling (try/catch)")).toBe("error-handling-trycatch");
  });

  it("should collapse multiple spaces or hyphens", () => {
    expect(headingToId("A  B   C")).toBe("a-b-c");
    expect(headingToId("hello--world")).toBe("hello-world");
  });

  it("should trim leading/trailing hyphens", () => {
    expect(headingToId("  Hello World  ")).toBe("hello-world");
  });

  it("should handle all-lowercase input unchanged", () => {
    expect(headingToId("security")).toBe("security");
  });

  it("should handle empty string", () => {
    expect(headingToId("")).toBe("");
  });
});

// ─── parseAnalysisSections ────────────────────────────────────

const SAMPLE_MD = `
# Repository Overview

This is a Flask-based web application.

## Architecture

The project follows an MVC pattern.

### Controllers

Request handlers live here.

## Data Flow

Data travels from the HTTP layer through services.

## Security

Input validation and auth middleware.
`.trim();

describe("parseAnalysisSections", () => {
  it("should return sections in document order", () => {
    const sections = parseAnalysisSections(SAMPLE_MD);
    const titles = sections.map((s) => s.title);
    expect(titles).toEqual([
      "Repository Overview",
      "Architecture",
      "Controllers",
      "Data Flow",
      "Security",
    ]);
  });

  it("should detect the correct heading level for each section", () => {
    const sections = parseAnalysisSections(SAMPLE_MD);
    expect(sections.find((s) => s.title === "Repository Overview")!.level).toBe(1);
    expect(sections.find((s) => s.title === "Architecture")!.level).toBe(2);
    expect(sections.find((s) => s.title === "Controllers")!.level).toBe(3);
  });

  it("should include the heading line in section content", () => {
    const sections = parseAnalysisSections(SAMPLE_MD);
    const arch = sections.find((s) => s.title === "Architecture")!;
    expect(arch.content.startsWith("## Architecture")).toBe(true);
  });

  it("should include body text in section content", () => {
    const sections = parseAnalysisSections(SAMPLE_MD);
    const arch = sections.find((s) => s.title === "Architecture")!;
    expect(arch.content).toContain("MVC pattern");
  });

  it("should assign correct lineStart indices", () => {
    const sections = parseAnalysisSections(SAMPLE_MD);
    const lines = SAMPLE_MD.split("\n");
    for (const section of sections) {
      expect(lines[section.lineStart]).toContain(section.title);
    }
  });

  it("should generate stable IDs from headings", () => {
    const sections = parseAnalysisSections(SAMPLE_MD);
    expect(sections.find((s) => s.title === "Repository Overview")!.id).toBe("repository-overview");
    expect(sections.find((s) => s.title === "Data Flow")!.id).toBe("data-flow");
    expect(sections.find((s) => s.title === "Security")!.id).toBe("security");
  });

  it("should handle preamble text before the first heading", () => {
    const md = "Some intro text\n\n# First Section\n\nContent here.";
    const sections = parseAnalysisSections(md);
    const preamble = sections.find((s) => s.id === "preamble");
    expect(preamble).toBeDefined();
    expect(preamble!.content).toContain("Some intro text");
    expect(preamble!.level).toBe(0);
  });

  it("should not emit a preamble for whitespace-only leading content", () => {
    const md = "\n\n# First Section\n\nContent here.";
    const sections = parseAnalysisSections(md);
    expect(sections.find((s) => s.id === "preamble")).toBeUndefined();
  });

  it("should return an empty array for empty markdown", () => {
    expect(parseAnalysisSections("")).toEqual([]);
  });

  it("should return an empty array for whitespace-only markdown", () => {
    expect(parseAnalysisSections("   \n\n  ")).toEqual([]);
  });

  it("should handle markdown with only a heading and no body", () => {
    const md = "## Lone Heading";
    const sections = parseAnalysisSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Lone Heading");
    expect(sections[0].content).toBe("## Lone Heading");
  });

  it("should handle consecutive headings with no body", () => {
    const md = "## Alpha\n## Beta\n## Gamma";
    const sections = parseAnalysisSections(md);
    expect(sections).toHaveLength(3);
    expect(sections.map((s) => s.title)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("should support all heading levels 1–6", () => {
    const md = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6";
    const sections = parseAnalysisSections(md);
    const levels = sections.map((s) => s.level);
    expect(levels).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("should not treat lines with # inside code blocks as headings", () => {
    const md = "## Real Heading\n\n```python\n# just a comment\n```\n\nMore text.";
    const sections = parseAnalysisSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Real Heading");
  });
});

// ─── getSectionByTitle ────────────────────────────────────────

describe("getSectionByTitle", () => {
  let sections: AnalysisSection[];

  beforeEach(() => {
    sections = parseAnalysisSections(SAMPLE_MD);
  });

  function beforeEach(fn: () => void) { fn(); }

  it("should find a section by exact title (case-insensitive)", () => {
    expect(getSectionByTitle(sections, "Architecture")).toBeDefined();
    expect(getSectionByTitle(sections, "architecture")).toBeDefined();
    expect(getSectionByTitle(sections, "ARCHITECTURE")).toBeDefined();
  });

  it("should find a section by partial title", () => {
    const result = getSectionByTitle(sections, "data");
    expect(result).toBeDefined();
    expect(result!.title).toBe("Data Flow");
  });

  it("should return undefined when no match", () => {
    expect(getSectionByTitle(sections, "nonexistent-section")).toBeUndefined();
  });

  it("should return the first match when multiple titles contain the query", () => {
    // Both "Repository Overview" and nothing else contains "overview" here
    const result = getSectionByTitle(sections, "overview");
    expect(result!.title).toBe("Repository Overview");
  });

  it("should handle empty query string", () => {
    // Empty query matches every section — returns the first one
    const result = getSectionByTitle(sections, "");
    expect(result).toBeDefined();
  });
});

// ─── getSectionContent ────────────────────────────────────────

describe("getSectionContent", () => {
  it("should return the full section content for a known title", () => {
    const content = getSectionContent(SAMPLE_MD, "security");
    expect(content).not.toBeNull();
    expect(content).toContain("## Security");
    expect(content).toContain("Input validation");
  });

  it("should return null when the section is not found", () => {
    const content = getSectionContent(SAMPLE_MD, "nonexistent-xyz");
    expect(content).toBeNull();
  });

  it("should work with empty markdown", () => {
    expect(getSectionContent("", "anything")).toBeNull();
  });
});

// ─── getTopLevelSections ──────────────────────────────────────

describe("getTopLevelSections", () => {
  it("should return only level-2 headings", () => {
    const sections = parseAnalysisSections(SAMPLE_MD);
    const topLevel = getTopLevelSections(sections);
    expect(topLevel.every((s) => s.level === 2)).toBe(true);
    const titles = topLevel.map((s) => s.title);
    expect(titles).toContain("Architecture");
    expect(titles).toContain("Data Flow");
    expect(titles).toContain("Security");
    // h1 and h3 should be excluded
    expect(titles).not.toContain("Repository Overview");
    expect(titles).not.toContain("Controllers");
  });

  it("should return an empty array when there are no level-2 headings", () => {
    const sections = parseAnalysisSections("# Only H1\n\nsome text");
    expect(getTopLevelSections(sections)).toHaveLength(0);
  });

  it("should return an empty array for empty sections list", () => {
    expect(getTopLevelSections([])).toHaveLength(0);
  });
});
