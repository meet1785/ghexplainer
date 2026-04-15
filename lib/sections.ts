/**
 * Markdown Section Parser for ghexplainer analysis output.
 *
 * Parses the structured 11-section markdown analysis into individual
 * sections with metadata, enabling:
 * - Programmatic access to individual sections
 * - Section-level filtering and export
 * - Section statistics (word count, code blocks)
 * - Reconstruction of markdown from selected sections
 *
 * All functions are pure and side-effect free for easy testing.
 */

// ─── Types ───────────────────────────────────────────────────

export interface Section {
  /** Section number (1-11 for standard analysis, 0 for unnumbered) */
  number: number;
  /** Section title (e.g. "Repository Overview") */
  title: string;
  /** Heading level (1 = #, 2 = ##, etc.) */
  level: number;
  /** Full markdown content including the heading */
  content: string;
  /** Body content without the heading line */
  body: string;
  /** 0-based start line in the original markdown */
  startLine: number;
  /** 0-based end line (exclusive) in the original markdown */
  endLine: number;
  /** Word count of the body (excludes code blocks) */
  wordCount: number;
  /** Number of fenced code blocks (``` ... ```) */
  codeBlockCount: number;
}

export interface SectionSummary {
  /** Total number of sections found */
  totalSections: number;
  /** Total word count across all sections */
  totalWordCount: number;
  /** Total fenced code blocks across all sections */
  totalCodeBlocks: number;
  /** Average words per section */
  avgWordsPerSection: number;
  /** Per-section breakdown */
  sections: Array<{
    number: number;
    title: string;
    wordCount: number;
    codeBlockCount: number;
  }>;
}

// ─── Parsing ─────────────────────────────────────────────────

/**
 * Regex to match markdown headings.
 * Captures: level (# count), optional section number, and title text.
 *
 * Matches patterns like:
 * - "# 1. Repository Overview"
 * - "## Architecture & Design"
 * - "# Title"
 */
const HEADING_REGEX = /^(#{1,6})\s+(?:(\d+)\.\s+)?(.+)$/;

/**
 * Count words in text, excluding fenced code blocks.
 * Counts sequences of word characters separated by whitespace.
 */
function countWords(text: string): number {
  // Remove fenced code blocks before counting
  const withoutCode = text.replace(/```[\s\S]*?```/g, "");
  const words = withoutCode.match(/\S+/g);
  return words?.length ?? 0;
}

/**
 * Count fenced code blocks (``` ... ```) in text.
 */
function countCodeBlocks(text: string): number {
  const matches = text.match(/```/g);
  if (!matches) return 0;
  return Math.floor(matches.length / 2);
}

/**
 * Parse a markdown analysis document into structured sections.
 *
 * Splits on top-level headings (# or ##) and extracts metadata
 * for each section. Handles the standard ghexplainer format:
 * `# N. Section Title` as well as unnumbered headings.
 *
 * @param markdown - The full markdown analysis text
 * @returns Array of parsed sections in document order
 *
 * @example
 *   const sections = parseSections("# 1. Overview\nContent...\n# 2. Architecture\nMore...");
 *   // → [{ number: 1, title: "Overview", ... }, { number: 2, title: "Architecture", ... }]
 */
export function parseSections(markdown: string): Section[] {
  if (!markdown || !markdown.trim()) return [];

  const lines = markdown.split("\n");
  const sections: Section[] = [];

  // Find all heading positions
  const headingPositions: Array<{
    line: number;
    level: number;
    number: number;
    title: string;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING_REGEX);
    if (match) {
      const level = match[1].length;
      // Only split on top-level headings (level 1 or 2)
      if (level <= 2) {
        headingPositions.push({
          line: i,
          level,
          number: match[2] ? parseInt(match[2], 10) : 0,
          title: match[3].trim(),
        });
      }
    }
  }

  // Build sections from heading positions
  for (let i = 0; i < headingPositions.length; i++) {
    const current = headingPositions[i];
    const nextLine = i + 1 < headingPositions.length
      ? headingPositions[i + 1].line
      : lines.length;

    const sectionLines = lines.slice(current.line, nextLine);
    const content = sectionLines.join("\n");
    // Body is everything after the heading line
    const bodyLines = sectionLines.slice(1);
    const body = bodyLines.join("\n").trim();

    sections.push({
      number: current.number,
      title: current.title,
      level: current.level,
      content,
      body,
      startLine: current.line,
      endLine: nextLine,
      wordCount: countWords(body),
      codeBlockCount: countCodeBlocks(body),
    });
  }

  return sections;
}

// ─── Lookup ──────────────────────────────────────────────────

/**
 * Find a section by its title (case-insensitive partial match).
 *
 * @param sections - Parsed sections array
 * @param title - Title to search for (case-insensitive, partial match)
 * @returns The first matching section, or null if not found
 *
 * @example
 *   getSectionByTitle(sections, "architecture")
 *   // → { number: 2, title: "Architecture & Design", ... }
 */
export function getSectionByTitle(
  sections: Section[],
  title: string
): Section | null {
  if (!title || !title.trim()) return null;
  const needle = title.toLowerCase().trim();
  return (
    sections.find((s) => s.title.toLowerCase().includes(needle)) ?? null
  );
}

/**
 * Find a section by its number (1-11 for standard analysis).
 *
 * @param sections - Parsed sections array
 * @param num - Section number to find
 * @returns The matching section, or null if not found
 *
 * @example
 *   getSectionByNumber(sections, 3)
 *   // → { number: 3, title: "Module Breakdown", ... }
 */
export function getSectionByNumber(
  sections: Section[],
  num: number
): Section | null {
  return sections.find((s) => s.number === num) ?? null;
}

// ─── Filtering ───────────────────────────────────────────────

/**
 * Filter sections by title keywords (case-insensitive partial match).
 * Returns sections whose title contains any of the provided keywords.
 *
 * @param sections - Parsed sections array
 * @param titles - Array of title keywords to match
 * @returns Filtered sections in original document order
 *
 * @example
 *   filterSections(sections, ["architecture", "security"])
 *   // → [architectureSection, securitySection]
 */
export function filterSections(
  sections: Section[],
  titles: string[]
): Section[] {
  if (!titles.length) return [];
  const needles = titles.map((t) => t.toLowerCase().trim()).filter(Boolean);
  return sections.filter((s) =>
    needles.some((n) => s.title.toLowerCase().includes(n))
  );
}

/**
 * Filter sections by their numbers.
 *
 * @param sections - Parsed sections array
 * @param numbers - Array of section numbers to include
 * @returns Filtered sections in original document order
 *
 * @example
 *   filterSectionsByNumber(sections, [1, 2, 11])
 *   // → [overviewSection, architectureSection, quickRefSection]
 */
export function filterSectionsByNumber(
  sections: Section[],
  numbers: number[]
): Section[] {
  const numSet = new Set(numbers);
  return sections.filter((s) => numSet.has(s.number));
}

// ─── Summary ─────────────────────────────────────────────────

/**
 * Generate a statistical summary of the parsed sections.
 *
 * @param sections - Parsed sections array
 * @returns Summary with counts and per-section breakdown
 *
 * @example
 *   const summary = getSectionSummary(sections);
 *   // → { totalSections: 11, totalWordCount: 5432, ... }
 */
export function getSectionSummary(sections: Section[]): SectionSummary {
  const totalWordCount = sections.reduce((sum, s) => sum + s.wordCount, 0);
  const totalCodeBlocks = sections.reduce(
    (sum, s) => sum + s.codeBlockCount,
    0
  );

  return {
    totalSections: sections.length,
    totalWordCount,
    totalCodeBlocks,
    avgWordsPerSection:
      sections.length > 0
        ? Math.round(totalWordCount / sections.length)
        : 0,
    sections: sections.map((s) => ({
      number: s.number,
      title: s.title,
      wordCount: s.wordCount,
      codeBlockCount: s.codeBlockCount,
    })),
  };
}

// ─── Reconstruction ──────────────────────────────────────────

/**
 * Reconstruct markdown from an array of sections.
 * Joins section content with double newlines between sections.
 *
 * @param sections - Sections to combine (in desired order)
 * @returns Combined markdown string
 *
 * @example
 *   const partial = sectionsToMarkdown(filterSections(sections, ["overview", "architecture"]));
 */
export function sectionsToMarkdown(sections: Section[]): string {
  return sections.map((s) => s.content).join("\n\n");
}
