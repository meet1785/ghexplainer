/**
 * Readability utilities — estimate reading time and analysis complexity
 * from a markdown analysis report.
 *
 * Both functions are pure (no side effects) and run entirely client-side.
 */

// ─── Reading Time ─────────────────────────────────────────────

const WORDS_PER_MINUTE = 200;

/**
 * Count the approximate number of words in a markdown string.
 * Strips fenced code blocks before counting — code is skimmed, not read word-by-word.
 */
export function countWords(markdown: string): number {
  // Strip fenced code blocks (they're skimmed, not read)
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ');

  const words = stripped
    .split(/\s+/)
    .filter((w) => w.length > 0);

  return words.length;
}

/**
 * Estimate the reading time for a markdown analysis report.
 *
 * @param markdown - Full markdown text.
 * @returns Reading time in minutes (minimum 1).
 *
 * @example
 *   estimateReadingTime(longReport) // → 12
 */
export function estimateReadingTime(markdown: string): number {
  const words = countWords(markdown);
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

// ─── Complexity Score ─────────────────────────────────────────

/**
 * Count the number of h1/h2 headings in a markdown string.
 * Used as a proxy for structural depth.
 */
export function countHeadings(markdown: string): number {
  const matches = markdown.match(/^#{1,2}\s+.+$/gm);
  return matches ? matches.length : 0;
}

/**
 * Count the number of fenced code blocks in a markdown string.
 */
export function countCodeBlocks(markdown: string): number {
  const matches = markdown.match(/```[\s\S]*?```/g);
  return matches ? matches.length : 0;
}

/**
 * Compute a complexity score (0–100) for an analysis report.
 *
 * The score reflects:
 * - Word depth (longer reports are more complex)
 * - Structural depth (more headings = more sections = more concepts)
 * - Code density (more code blocks = more technical depth)
 *
 * Deliberately uncalibrated to an absolute scale — useful as a relative
 * indicator between analyses, not an absolute measure.
 *
 * @param markdown - Full markdown text.
 * @returns Integer in range [0, 100].
 *
 * @example
 *   computeComplexityScore(simpleReadme) // → 12
 *   computeComplexityScore(deepReport)   // → 78
 */
export function computeComplexityScore(markdown: string): number {
  const wordScore = Math.min(40, Math.floor(countWords(markdown) / 80));  // 0-40
  const headingScore = Math.min(30, countHeadings(markdown) * 2);          // 0-30
  const codeScore = Math.min(30, countCodeBlocks(markdown) * 3);           // 0-30

  return Math.min(100, wordScore + headingScore + codeScore);
}

/**
 * Return a human-readable complexity label for a score.
 *
 * @param score - Value in [0, 100].
 */
export function complexityLabel(score: number): string {
  if (score >= 80) return 'Very Complex';
  if (score >= 60) return 'Complex';
  if (score >= 40) return 'Moderate';
  if (score >= 20) return 'Simple';
  return 'Minimal';
}
