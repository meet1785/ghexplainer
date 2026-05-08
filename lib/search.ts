/**
 * Section-aware full-text search for markdown analysis output.
 *
 * Splits the markdown into heading-delimited sections, then scores each
 * section against the query (heading matches weighted 3×).  Results are
 * sorted best-first so callers can surface the most relevant sections for
 * quick in-page navigation.
 */

export interface SearchResult {
  /** Section heading text */
  heading: string;
  /** Heading level (1–6) */
  level: number;
  /** CSS anchor ID for navigation (matches react-markdown anchors) */
  anchor: string;
  /** Relevance score — heading matches count 3×, body matches count 1× */
  score: number;
  /** Short surrounding-context snippet of the first match in the section body */
  snippet: string;
}

// ─── Anchor generation ────────────────────────────────────────

/**
 * Convert a heading text to a URL-safe anchor ID.
 * Mirrors the slug algorithm used by react-markdown / remark-slug.
 *
 * @example
 *   generateAnchor("Overview & Goals")  // "overview--goals"
 */
export function generateAnchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Internal helpers ─────────────────────────────────────────

/**
 * Count non-overlapping occurrences of `query` inside `text`.
 * Both arguments must already be lower-cased by the caller.
 */
export function countOccurrences(text: string, query: string): number {
  if (!query) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(query, idx)) !== -1) {
    count++;
    idx += query.length;
  }
  return count;
}

/**
 * Strip common markdown formatting characters from a snippet so it reads
 * as plain text in the search-results UI.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")   // fenced code blocks
    .replace(/`[^`]*`/g, " ")           // inline code
    .replace(/\*{1,3}([^*]*)\*{1,3}/g, "$1") // bold / italic
    .replace(/_{1,3}([^_]*)_{1,3}/g, "$1")
    .replace(/!\[.*?\]\(.*?\)/g, "")    // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → label
    .replace(/^[#>*\-+]\s+/gm, "")     // leading symbols
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Section splitting ────────────────────────────────────────

interface Section {
  heading: string;
  level: number;
  content: string;
}

/**
 * Split markdown into an array of heading-delimited sections.
 * Text before the first heading is placed in a synthetic "Introduction" section.
 */
function splitIntoSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];

  let currentHeading = "Introduction";
  let currentLevel = 1;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // Flush previous section
      sections.push({
        heading: currentHeading,
        level: currentLevel,
        content: currentContent.join("\n"),
      });
      currentHeading = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Flush final section
  sections.push({
    heading: currentHeading,
    level: currentLevel,
    content: currentContent.join("\n"),
  });

  return sections;
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Search for `query` within a markdown string and return matching sections
 * sorted by descending relevance score.
 *
 * @param markdown - Full markdown text to search within.
 * @param query    - User search query (case-insensitive, leading/trailing space ignored).
 * @returns        Matching sections, sorted best-first.  Empty array when query is blank.
 *
 * @example
 *   searchSections(markdown, "architecture")
 *   // → [{ heading: "Architecture Overview", level: 2, score: 5, ... }, ...]
 */
export function searchSections(markdown: string, query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const sections = splitIntoSections(markdown);
  const results: SearchResult[] = [];

  for (const section of sections) {
    const headingLower = section.heading.toLowerCase();
    const contentLower = section.content.toLowerCase();

    const headingHits = countOccurrences(headingLower, q);
    const bodyHits = countOccurrences(contentLower, q);
    const score = headingHits * 3 + bodyHits;

    if (score === 0) continue;

    // Build a short snippet around the first occurrence in the body
    const matchIndex = contentLower.indexOf(q);
    let snippet = "";
    if (matchIndex !== -1) {
      const CONTEXT = 60;
      const start = Math.max(0, matchIndex - CONTEXT);
      const end = Math.min(section.content.length, matchIndex + q.length + CONTEXT);
      const raw =
        (start > 0 ? "…" : "") +
        section.content.slice(start, end) +
        (end < section.content.length ? "…" : "");
      snippet = stripMarkdown(raw);
    } else {
      // Heading matched only — use the first ~120 chars of body as context
      snippet = stripMarkdown(section.content.slice(0, 120));
      if (section.content.length > 120) snippet += "…";
    }

    results.push({
      heading: section.heading,
      level: section.level,
      anchor: generateAnchor(section.heading),
      score,
      snippet,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Count the total number of non-overlapping occurrences of `query` across
 * the entire markdown string — useful for displaying a "N matches" badge.
 *
 * @param markdown - Full markdown text.
 * @param query    - User search query (case-insensitive).
 * @returns        Total match count.
 */
export function countTotalMatches(markdown: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  return countOccurrences(markdown.toLowerCase(), q);
}
