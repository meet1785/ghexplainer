/**
 * Tests for the markdown → HTML export module.
 *
 * Validates: heading conversion, code blocks, bold/italic,
 * links, lists, full HTML document structure.
 */

import { describe, it, expect } from "vitest";
import { markdownToHtml, escapeHtml } from "@/lib/export";

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

// ─── escapeHtml ───────────────────────────────────────────────

describe("escapeHtml", () => {
  it("should escape ampersands", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("should escape less-than characters", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  it("should escape greater-than characters", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  it("should escape double quotes", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("should escape single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("should escape a script injection attempt", () => {
    const malicious = '<script>alert("xss")</script>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain("<script>");
    expect(escaped).not.toContain("</script>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  it("should return an empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("should leave plain text unchanged", () => {
    expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
  });
});

// ─── markdownToHtml XSS protection ───────────────────────────

describe("markdownToHtml XSS protection", () => {
  it("should escape < and > in repoName in the title", () => {
    const html = markdownToHtml("# Hello", '<script>alert("xss")</script>');
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("should escape double quotes in repoName in the title", () => {
    const html = markdownToHtml("# Hello", '"quoted"');
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    expect(titleMatch?.[1]).not.toContain('"quoted"');
    expect(titleMatch?.[1]).toContain("&quot;quoted&quot;");
  });

  it("should escape HTML in repoName in the header paragraph", () => {
    const html = markdownToHtml("# Hello", "<b>bold</b>");
    // The header p tag should not render unescaped HTML
    expect(html).not.toContain("<strong><b>bold</b></strong>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });
});
