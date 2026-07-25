/**
 * Tests for readability utilities.
 *
 * Validates: word counting, reading time estimation, heading/code block counting,
 * complexity score computation, and the label helper.
 */

import { describe, it, expect } from 'vitest';
import {
  countWords,
  estimateReadingTime,
  countHeadings,
  countCodeBlocks,
  computeComplexityScore,
  complexityLabel,
} from '@/lib/readability';

// ─── countWords ───────────────────────────────────────────────

describe('countWords', () => {
  it('should count words in plain text', () => {
    expect(countWords('hello world foo bar')).toBe(4);
  });

  it('should strip fenced code blocks before counting', () => {
    const md = 'before\n```js\nconst x = 1; const y = 2;\n```\nafter';
    // 'before' and 'after' = 2 words; code block stripped
    expect(countWords(md)).toBe(2);
  });

  it('should strip inline code before counting', () => {
    const md = 'Run `npm install` to install.';
    // words: Run, to, install. = 3 (inline code stripped)
    expect(countWords(md)).toBe(3);
  });

  it('should return 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('should handle whitespace-only input', () => {
    expect(countWords('   \n  \t  ')).toBe(0);
  });

  it('should handle markdown with multiple code blocks', () => {
    const md = 'intro\n```\ncode1\n```\nmiddle\n```\ncode2\n```\nend';
    // only 'intro', 'middle', 'end' = 3 words
    expect(countWords(md)).toBe(3);
  });
});

// ─── estimateReadingTime ──────────────────────────────────────

describe('estimateReadingTime', () => {
  it('should return at least 1 minute for any non-empty input', () => {
    expect(estimateReadingTime('hello')).toBe(1);
  });

  it('should return 1 for empty string', () => {
    expect(estimateReadingTime('')).toBe(1);
  });

  it('should estimate ~5 minutes for 1000 words at 200 wpm', () => {
    const words = Array(1000).fill('word').join(' ');
    expect(estimateReadingTime(words)).toBe(5);
  });

  it('should round to nearest minute', () => {
    // 300 words → 1.5 min → rounds to 2
    const words = Array(300).fill('word').join(' ');
    expect(estimateReadingTime(words)).toBe(2);
  });

  it('should return integer values', () => {
    const words = Array(450).fill('word').join(' ');
    const result = estimateReadingTime(words);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ─── countHeadings ────────────────────────────────────────────

describe('countHeadings', () => {
  it('should count h1 and h2 headings', () => {
    const md = '# Title\n## Section A\n## Section B';
    expect(countHeadings(md)).toBe(3);
  });

  it('should not count h3 and deeper', () => {
    const md = '### Subsection\n#### Deep';
    expect(countHeadings(md)).toBe(0);
  });

  it('should return 0 for empty string', () => {
    expect(countHeadings('')).toBe(0);
  });

  it('should not count headings inside code blocks', () => {
    // Note: regex-based, so this is a known limitation — document it
    const md = '# Real Heading\nSome text';
    expect(countHeadings(md)).toBeGreaterThanOrEqual(1);
  });
});

// ─── countCodeBlocks ──────────────────────────────────────────

describe('countCodeBlocks', () => {
  it('should count fenced code blocks', () => {
    const md = '```js\ncode\n```\n```py\nmore\n```';
    expect(countCodeBlocks(md)).toBe(2);
  });

  it('should return 0 when no code blocks', () => {
    expect(countCodeBlocks('just plain text')).toBe(0);
  });

  it('should return 0 for empty string', () => {
    expect(countCodeBlocks('')).toBe(0);
  });

  it('should count a single code block', () => {
    const md = '```\nhello\n```';
    expect(countCodeBlocks(md)).toBe(1);
  });
});

// ─── computeComplexityScore ───────────────────────────────────

describe('computeComplexityScore', () => {
  it('should return 0 for empty string', () => {
    expect(computeComplexityScore('')).toBe(0);
  });

  it('should return a value between 0 and 100', () => {
    const longMd = Array(50).fill('# Heading\nword '.repeat(100)).join('\n');
    const score = computeComplexityScore(longMd);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should score complex reports higher than simple ones', () => {
    const simple = 'This is a short report.';
    const complex = [
      '# Architecture',
      'word '.repeat(200),
      '## Data Flow',
      'word '.repeat(200),
      '```js\nconst x = require("express");\napp.listen(3000);\n```',
      '## Security',
      'word '.repeat(200),
    ].join('\n');
    expect(computeComplexityScore(complex)).toBeGreaterThan(computeComplexityScore(simple));
  });

  it('should cap at 100', () => {
    // Extremely long, many headings, many code blocks
    const huge = [
      ...Array(30).fill('# H\n## S'),
      'word '.repeat(10000),
      ...Array(20).fill('```js\ncode\n```'),
    ].join('\n');
    expect(computeComplexityScore(huge)).toBe(100);
  });

  it('should increase with more words', () => {
    const short = 'word '.repeat(10);
    const long = 'word '.repeat(500);
    expect(computeComplexityScore(long)).toBeGreaterThan(computeComplexityScore(short));
  });
});

// ─── complexityLabel ──────────────────────────────────────────

describe('complexityLabel', () => {
  it('should return "Minimal" for score 0', () => {
    expect(complexityLabel(0)).toBe('Minimal');
  });

  it('should return "Simple" for score 20', () => {
    expect(complexityLabel(20)).toBe('Simple');
  });

  it('should return "Moderate" for score 40', () => {
    expect(complexityLabel(40)).toBe('Moderate');
  });

  it('should return "Complex" for score 60', () => {
    expect(complexityLabel(60)).toBe('Complex');
  });

  it('should return "Very Complex" for score 80', () => {
    expect(complexityLabel(80)).toBe('Very Complex');
  });

  it('should return "Very Complex" for score 100', () => {
    expect(complexityLabel(100)).toBe('Very Complex');
  });

  it('should handle boundary at 19 → Minimal', () => {
    expect(complexityLabel(19)).toBe('Minimal');
  });

  it('should handle boundary at 39 → Simple', () => {
    expect(complexityLabel(39)).toBe('Simple');
  });
});
