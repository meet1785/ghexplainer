/**
 * Multi-format export module.
 *
 * Implements the "Output" layer from the architecture:
 * - Markdown (primary, always returned)
 * - HTML Report (rendered from markdown with styling)
 *
 * Note: PDF generation would require a headless browser or library like
 * puppeteer/jspdf which adds significant bundle size. For now we support
 * Markdown + HTML; PDF can be generated client-side from the HTML via
 * window.print() → "Save as PDF".
 */

/**
 * Convert markdown documentation to a styled standalone HTML report.
 */
export function markdownToHtml(markdown: string, repoName: string): string {
  // Simple markdown → HTML conversion for server-side rendering
  // Handles: headings, bold, italic, code blocks, inline code, lists, links, tables, hr
  let html = markdown;

  // Escape HTML entities first (but preserve markdown syntax chars)
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<pre><code class="language-${lang || "text"}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headings
  html = html.replace(/^######\s+(.*)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.*)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.*)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Horizontal rules
  html = html.replace(/^---+$/gm, "<hr>");

  // Unordered and ordered lists — processed line-by-line for correct <ul>/<ol> wrapping
  {
    const lines = html.split("\n");
    const out: string[] = [];
    let inUl = false;
    let inOl = false;
    for (const line of lines) {
      const ulMatch = line.match(/^[-*]\s+(.*)$/);
      const olMatch = line.match(/^(\d+)\.\s+(.*)$/);
      if (ulMatch) {
        if (inOl) { out.push("</ol>"); inOl = false; }
        if (!inUl) { out.push("<ul>"); inUl = true; }
        out.push(`<li>${ulMatch[1]}</li>`);
      } else if (olMatch) {
        if (inUl) { out.push("</ul>"); inUl = false; }
        if (!inOl) { out.push("<ol>"); inOl = true; }
        out.push(`<li>${olMatch[2]}</li>`);
      } else {
        if (inUl) { out.push("</ul>"); inUl = false; }
        if (inOl) { out.push("</ol>"); inOl = false; }
        out.push(line);
      }
    }
    if (inUl) out.push("</ul>");
    if (inOl) out.push("</ol>");
    html = out.join("\n");
  }

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Tables (basic support)
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match
      .split("|")
      .filter((c) => c.trim())
      .map((c) => c.trim());
    if (cells.every((c) => /^[-:]+$/.test(c))) return ""; // separator row
    const tag = "td";
    const row = cells.map((c) => `<${tag}>${c}</${tag}>`).join("");
    return `<tr>${row}</tr>`;
  });
  html = html.replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, (match) => `<table>${match}</table>`);

  // Paragraphs: wrap remaining lines
  html = html.replace(/^(?!<[a-z]|$)(.*\S.*)$/gm, "<p>$1</p>");

  // Clean up multiple empty lines
  html = html.replace(/\n{3,}/g, "\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${repoName} — ghexplainer Analysis</title>
  <style>
    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --border: #334155;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --accent: #818cf8;
      --accent-bg: #312e81;
      --code-bg: #0f172a;
      --success: #22c55e;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.7;
      padding: 2rem;
      max-width: 900px;
      margin: 0 auto;
    }
    h1 { font-size: 1.8rem; color: var(--accent); margin: 2rem 0 1rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; color: var(--accent); margin: 1.5rem 0 0.75rem; }
    h3 { font-size: 1.15rem; color: var(--text); margin: 1.25rem 0 0.5rem; }
    h4, h5, h6 { font-size: 1rem; color: var(--text-muted); margin: 1rem 0 0.5rem; }
    p { margin: 0.5rem 0; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      background: var(--code-bg);
      border: 1px solid var(--border);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.9em;
      font-family: 'Fira Code', 'Consolas', monospace;
    }
    pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      overflow-x: auto;
      margin: 1rem 0;
    }
    pre code { border: none; padding: 0; }
    ul, ol { margin: 0.5rem 0 0.5rem 1.5rem; }
    li { margin: 0.25rem 0; }
    table { border-collapse: collapse; margin: 1rem 0; width: 100%; }
    td, th { border: 1px solid var(--border); padding: 0.5rem 0.75rem; text-align: left; }
    tr:nth-child(even) { background: var(--surface); }
    hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
    strong { color: #f1f5f9; }
    .header {
      text-align: center;
      padding: 2rem 0;
      border-bottom: 2px solid var(--border);
      margin-bottom: 2rem;
    }
    .header h1 { border: none; color: var(--accent); font-size: 2.2rem; }
    .header p { color: var(--text-muted); font-size: 0.9rem; }
    .footer {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.8rem;
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
    }
    @media print {
      body { background: white; color: #1a1a1a; }
      code, pre { background: #f5f5f5; border-color: #e5e5e5; }
      h1, h2 { color: #4338ca; }
      .header h1 { color: #4338ca; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔍 ghexplainer</h1>
    <p>Technical Analysis Report — <strong>${repoName}</strong></p>
    <p>Generated ${new Date().toISOString().split("T")[0]}</p>
  </div>
  ${html}
  <div class="footer">
    <p>Generated by <strong>ghexplainer</strong> — AI-powered GitHub repository analysis</p>
    <p>To save as PDF: File → Print → Save as PDF</p>
  </div>
</body>
</html>`;
}
