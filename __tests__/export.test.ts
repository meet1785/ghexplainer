/**
 * Tests for the multi-format export module.
 *
 * Validates: markdownToHtml — heading conversion, code blocks, bold/italic,
 * links, lists, full HTML document structure.
 * Validates: markdownToJson — structured JSON output, section extraction,
 * repoName, generatedAt timestamp.
 */

import { describe, it, expect } from "vitest";
import { markdownToHtml, markdownToJson } from "@/lib/export";

describe("markdownToHtml", () => {
  it("should produce a complete HTML document", () => {
    const html = markdownToHtml("# Hello", "test-repo");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("</html>");
    expect(html).toContain("<title>test-repo — ghexplainer Analysis</title>");
  });

  it("should convert headings", () => {
    const html = markdownToHtml("# Title\n## Subtitle\n### Section", "repo");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h2>Subtitle</h2>");
    expect(html).toContain("<h3>Section</h3>");
  });

  it("should convert bold text", () => {
    const html = markdownToHtml("This is **bold** text", "repo");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("should convert italic text", () => {
    const html = markdownToHtml("This is *italic* text", "repo");
    expect(html).toContain("<em>italic</em>");
  });

  it("should convert inline code", () => {
    const html = markdownToHtml("Use `console.log()` for debugging", "repo");
    expect(html).toContain("<code>console.log()</code>");
  });

  it("should convert code blocks", () => {
    const md = "```typescript\nconst x = 1;\n```";
    const html = markdownToHtml(md, "repo");
    expect(html).toContain('<pre><code class="language-typescript">');
    expect(html).toContain("const x = 1;");
  });

  it("should convert links", () => {
    const html = markdownToHtml("[Click here](https://example.com)", "repo");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
  });

  it("should convert horizontal rules", () => {
    const html = markdownToHtml("above\n---\nbelow", "repo");
    expect(html).toContain("<hr>");
  });

  it("should convert unordered lists", () => {
    const html = markdownToHtml("- Item one\n- Item two", "repo");
    expect(html).toContain("<li>Item one</li>");
    expect(html).toContain("<li>Item two</li>");
  });

  it("should include dark theme styling", () => {
    const html = markdownToHtml("# Test", "repo");
    expect(html).toContain("<style>");
    expect(html).toContain("--bg:");
  });

  it("should handle empty markdown", () => {
    const html = markdownToHtml("", "repo");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>repo — ghexplainer Analysis</title>");
  });
});

// ─── markdownToJson ───────────────────────────────────────────

const SAMPLE_MARKDOWN = `
# 1. Repository Overview

An AI-powered GitHub repo analyser.

# 2. Architecture & Design

Three-layer pipeline: fetch → chunk → generate.

# 3. Module Breakdown

- lib/github.ts — API client
`.trim();

describe("markdownToJson", () => {
  it("should return an object with repoName and generatedAt", () => {
    const result = markdownToJson(SAMPLE_MARKDOWN, "owner/repo");
    expect(result.repoName).toBe("owner/repo");
    expect(result.generatedAt).toBeTruthy();
    // generatedAt should be a valid ISO 8601 date string
    expect(() => new Date(result.generatedAt)).not.toThrow();
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });

  it("should extract sections from the markdown", () => {
    const result = markdownToJson(SAMPLE_MARKDOWN, "owner/repo");
    expect(result.sections).toHaveLength(3);
  });

  it("should preserve section IDs and titles", () => {
    const result = markdownToJson(SAMPLE_MARKDOWN, "owner/repo");
    expect(result.sections[0].id).toBe(1);
    expect(result.sections[0].title).toBe("Repository Overview");
    expect(result.sections[1].id).toBe(2);
    expect(result.sections[1].title).toBe("Architecture & Design");
    expect(result.sections[2].id).toBe(3);
    expect(result.sections[2].title).toBe("Module Breakdown");
  });

  it("should include section content", () => {
    const result = markdownToJson(SAMPLE_MARKDOWN, "owner/repo");
    expect(result.sections[0].content).toContain("AI-powered");
    expect(result.sections[1].content).toContain("Three-layer pipeline");
    expect(result.sections[2].content).toContain("lib/github.ts");
  });

  it("should return an empty sections array for empty markdown", () => {
    const result = markdownToJson("", "owner/repo");
    expect(result.sections).toHaveLength(0);
    expect(result.repoName).toBe("owner/repo");
  });

  it("should be JSON-serialisable without loss", () => {
    const result = markdownToJson(SAMPLE_MARKDOWN, "owner/repo");
    const serialised = JSON.stringify(result);
    const parsed = JSON.parse(serialised);
    expect(parsed.repoName).toBe(result.repoName);
    expect(parsed.sections).toHaveLength(result.sections.length);
    expect(parsed.sections[0].title).toBe(result.sections[0].title);
  });
});
