/**
 * Auto-generated TL;DR summary for markdown analysis reports.
 *
 * Extracts the most informative first sentences from each major section
 * and synthesizes them into a short 5-bullet summary card. Runs entirely
 * client-side — no extra API calls needed.
 */

export interface TLDRSummary {
  /** 3–5 key insight bullet points extracted from the report */
  bullets: string[];
  /** File paths mentioned most frequently across the report */
  keyFiles: string[];
  /** Primary programming language detected from the report text */
  primaryLanguage: string | null;
  /** Whether the source report was complete (11 sections) */
  isComplete: boolean;
}

// --- Internal helpers -----------------------------------------

/**
 * Extract the first meaningful sentence from a block of text.
 * Returns an empty string if no sentence can be extracted.
 */
export function extractFirstSentence(text: string): string {
  // Strip markdown formatting
  const clean = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/^[#>*\-+]\s*/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Split on sentence boundaries
  const sentenceMatch = clean.match(/[^.!?]+[.!?]/);
  if (!sentenceMatch) return '';

  const sentence = sentenceMatch[0].trim();
  // Skip very short or generic sentences
  if (sentence.length < 20) return '';
  // Skip sentences that are just "Not applicable..."
  if (/not applicable/i.test(sentence)) return '';

  return sentence;
}

/**
 * Extract file paths mentioned in the markdown (e.g., `lib/foo.ts`, `src/bar.js`).
 * Returns up to N most-frequently-mentioned paths.
 */
export function extractKeyFiles(markdown: string, maxFiles = 5): string[] {
  // Match common path patterns: lib/foo.ts, src/bar.js, app/page.tsx, etc.
  const pathPattern = /\b([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)+)/g;
  const counts = new Map<string, number>();

  let match;
  while ((match = pathPattern.exec(markdown)) !== null) {
    const path = match[1];
    // Only count paths that look like source files (have an extension or are recognizable)
    if (!path.includes('.') && !path.match(/[A-Z]/)) continue;
    // Skip URLs
    if (path.startsWith('http')) continue;
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2) // Only paths mentioned at least twice
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxFiles)
    .map(([path]) => path);
}

/**
 * Detect the primary programming language from the report text.
 * Looks for explicit mentions like "TypeScript", "Python", etc.
 */
export function detectPrimaryLanguage(markdown: string): string | null {
  const LANGUAGES = [
    'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'Kotlin',
    'Swift', 'C#', 'C++', 'Ruby', 'PHP', 'Scala', 'Dart', 'Elixir',
  ];

  // Count mentions of each language
  const counts = new Map<string, number>();
  for (const lang of LANGUAGES) {
    const escapedLang = lang.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // For C++ and C#, \b doesn't work well because + and # are non-word characters.
    const regex = new RegExp(`(?:^|\\s)${escapedLang}(?=$|\\s|[.,;!?])`, 'gi');
    const matches = markdown.match(regex);
    if (matches && matches.length > 0) {
      counts.set(lang, matches.length);
    }
  }

  if (counts.size === 0) return null;

  // Return the most-mentioned language
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// --- Section extraction ---------------------------------------

interface ReportSection {
  heading: string;
  firstSentence: string;
}

/**
 * Split markdown into sections and extract the first sentence of each.
 * Only processes top-level sections (# headings).
 */
function extractSectionSummaries(markdown: string): ReportSection[] {
  const lines = markdown.split('\n');
  const sections: ReportSection[] = [];

  let currentHeading = '';
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentHeading) return;
    const body = currentLines.join('\n');
    const firstSentence = extractFirstSentence(body);
    if (firstSentence) {
      sections.push({ heading: currentHeading, firstSentence });
    }
    currentLines = [];
  };

  for (const line of lines) {
    // Only top-level headings (single #)
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      flush();
      currentHeading = h1Match[1].trim();
    } else if (currentHeading) {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

// --- Public API -----------------------------------------------

/**
 * Generate a TL;DR summary from a markdown analysis report.
 *
 * Extracts 3-5 key insights by sampling the most informative sections,
 * identifies the most-referenced source files, and detects the primary
 * programming language.
 *
 * @param markdown  - Full markdown analysis text.
 * @param complete  - Whether the report is fully complete (all 11 sections).
 * @returns         A TLDRSummary object ready to display.
 *
 * @example
 *   const tldr = generateTLDR(reportMarkdown, true);
 *   // { bullets: [...], keyFiles: [...], primaryLanguage: 'TypeScript', isComplete: true }
 */
export function generateTLDR(markdown: string, complete = true): TLDRSummary {
  const sections = extractSectionSummaries(markdown);
  const keyFiles = extractKeyFiles(markdown);
  const primaryLanguage = detectPrimaryLanguage(markdown);

  // Pick the most informative sections to build bullet points
  // Priority: Overview, Architecture, Core Flow, Key Logic, Quick Reference
  const PRIORITY_KEYWORDS = [
    'overview', 'architecture', 'flow', 'logic', 'reference',
    'data', 'api', 'security', 'performance',
  ];

  const scored = sections.map((s) => {
    const headingLower = s.heading.toLowerCase();
    const priorityScore = PRIORITY_KEYWORDS.findIndex((kw) => headingLower.includes(kw));
    return { ...s, priorityScore: priorityScore === -1 ? 999 : priorityScore };
  });

  scored.sort((a, b) => a.priorityScore - b.priorityScore);

  const bullets = scored
    .slice(0, 5)
    .map((s) => s.firstSentence)
    .filter((s) => s.length > 0);

  return { bullets, keyFiles, primaryLanguage, isComplete: complete };
}
