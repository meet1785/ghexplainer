/**
 * Tests for the markdown → HTML export module.
 *
 * Validates: heading conversion, code blocks, bold/italic,
 * links, lists, full HTML document structure.
 */

import { describe, it, expect } from "vitest";
import { markdownToHtml } from "@/lib/export";

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
