/**
 * Markdown Section Parser.
 *
 * Parses the structured 11-section analysis markdown into discrete
 * section objects, enabling:
 * - Per-section copy / export
 * - Context-aware chat (pass only the relevant section)
 * - Server-side section extraction without a DOM
 *
 * All functions are pure and side-effect free.
 */

export interface AnalysisSection {
  /** Stable kebab-case identifier derived from the heading text */
  id: string;
  /** Original heading text (without leading `#` characters) */
  title: string;
  /** Heading level (1 = `#`, 2 = `##`, etc.) */
  level: number;
  /** Full section content including the heading line itself */
  content: string;
  /** Zero-based line index of the heading in the original markdown */
  lineStart: number;
}

// ─── Internal helpers ────────────────────────────────────────

/**
 * Convert a heading string to a stable kebab-case ID.
 *
 * Examples:
 *   "Repository Overview"      → "repository-overview"
 *   "1. Architecture Overview" → "architecture-overview"
 *   "Key Components & APIs"    → "key-components-and-apis"
 */
export function headingToId(text: string): string {
  return text
    .trim()
    // Drop any leading ordinal: "1. Title" → "Title"
    .replace(/^\d+\.\s*/, "")
    // Replace & with "and"
    .replace(/&/g, "and")
    // Lower-case
    .toLowerCase()
    // Replace non-alphanumeric (except spaces/hyphens) with empty
    .replace(/[^\w\s-]/g, "")
    // Collapse whitespace to a single hyphen
    .replace(/\s+/g, "-")
    // Collapse repeated hyphens
    .replace(/-{2,}/g, "-")
    // Trim leading/trailing hyphens
    .replace(/^-+|-+$/g, "");
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

// ─── Public API ───────────────────────────────────────────────

/**
 * Parse a markdown string into an ordered list of {@link AnalysisSection} objects.
 *
 * Each section runs from its own heading line up to (but not including) the
 * next heading of the same or higher level. Content before the first heading
 * is collected into a synthetic "preamble" section with `level: 0`.
 *
 * @param markdown - The full markdown string to parse.
 * @returns An ordered array of sections, in document order.
 */
export function parseAnalysisSections(markdown: string): AnalysisSection[] {
  const lines = markdown.split("\n");
  const sections: AnalysisSection[] = [];

  let preambleLines: string[] = [];
  let currentHeading: { level: number; title: string; lineStart: number } | null = null;
  let currentLines: string[] = [];
  let inCodeFence = false;

  const flush = () => {
    if (currentHeading) {
      sections.push({
        id: headingToId(currentHeading.title),
        title: currentHeading.title,
        level: currentHeading.level,
        content: currentLines.join("\n"),
        lineStart: currentHeading.lineStart,
      });
    } else if (preambleLines.length > 0 && preambleLines.some((l) => l.trim())) {
      // Non-empty preamble before the first heading
      sections.push({
        id: "preamble",
        title: "",
        level: 0,
        content: preambleLines.join("\n"),
        lineStart: 0,
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code blocks so that `# comment` inside them is not parsed as a heading
    if (/^(`{3,}|~{3,})/.test(line)) {
      inCodeFence = !inCodeFence;
    }

    const match = !inCodeFence ? line.match(HEADING_RE) : null;

    if (match) {
      flush();
      const level = match[1].length;
      const title = match[2].trim();
      currentHeading = { level, title, lineStart: i };
      currentLines = [line];
      preambleLines = []; // preamble is now closed
    } else if (currentHeading) {
      currentLines.push(line);
    } else {
      preambleLines.push(line);
    }
  }

  flush();
  return sections;
}

/**
 * Find a section whose title matches the given string (case-insensitive).
 *
 * Accepts partial matches, e.g. `"architecture"` will match
 * `"1. Architecture Overview"`.
 *
 * @param sections - The array returned by {@link parseAnalysisSections}.
 * @param title    - The title (or partial title) to search for.
 * @returns The first matching section, or `undefined` if none found.
 */
export function getSectionByTitle(
  sections: AnalysisSection[],
  title: string
): AnalysisSection | undefined {
  const q = title.trim().toLowerCase();
  return sections.find((s) => s.title.toLowerCase().includes(q));
}

/**
 * Extract the markdown content of a named section from a markdown string.
 *
 * Convenience wrapper that combines {@link parseAnalysisSections} and
 * {@link getSectionByTitle}. Returns `null` when the section is not found.
 *
 * @param markdown - The full markdown string.
 * @param title    - The section title to look up (case-insensitive, partial).
 */
export function getSectionContent(
  markdown: string,
  title: string
): string | null {
  const sections = parseAnalysisSections(markdown);
  const section = getSectionByTitle(sections, title);
  return section?.content ?? null;
}

/**
 * Return only top-level (`##`) section headings from a parsed section list.
 * Useful for building a table of contents or section picker.
 */
export function getTopLevelSections(
  sections: AnalysisSection[]
): AnalysisSection[] {
  return sections.filter((s) => s.level === 2);
}
