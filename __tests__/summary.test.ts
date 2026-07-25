/**
 * Tests for the auto-generated TL;DR summary utilities.
 *
 * Validates: first sentence extraction, key file extraction, language detection,
 * and the main generateTLDR function.
 */

import { describe, it, expect } from 'vitest';
import {
  extractFirstSentence,
  extractKeyFiles,
  detectPrimaryLanguage,
  generateTLDR,
} from '@/lib/summary';

// --- extractFirstSentence -------------------------------------

describe('extractFirstSentence', () => {
  it('should extract a simple first sentence', () => {
    const result = extractFirstSentence('This project uses TypeScript for type safety. It also uses React.');
    expect(result).toBe('This project uses TypeScript for type safety.');
  });

  it('should return empty string for empty input', () => {
    expect(extractFirstSentence('')).toBe('');
  });

  it('should strip markdown formatting before extracting', () => {
    const md = '**The system** uses `Node.js` for the backend. More details follow.';
    const result = extractFirstSentence(md);
    expect(result).not.toContain('**');
    expect(result).not.toContain('`');
  });

  it('should return empty string for "Not applicable" sentences', () => {
    expect(extractFirstSentence('Not applicable for this codebase.')).toBe('');
  });

  it('should return empty for very short sentences (< 20 chars)', () => {
    expect(extractFirstSentence('Short.')).toBe('');
  });

  it('should strip code blocks before extracting', () => {
    const md = '```bash\nnpm install\n```\nThis installs all dependencies.';
    const result = extractFirstSentence(md);
    expect(result).toBe('This installs all dependencies.');
  });

  it('should handle sentences ending with exclamation marks', () => {
    const result = extractFirstSentence('This feature is critically important! Read more below.');
    expect(result).toContain('important!');
  });
});

// --- extractKeyFiles ------------------------------------------

describe('extractKeyFiles', () => {
  it('should extract frequently mentioned file paths', () => {
    const md = [
      'The main entry is lib/analyzer.ts which handles analysis.',
      'lib/analyzer.ts calls lib/gemini.ts for AI calls.',
      'lib/gemini.ts manages rate limiting.',
    ].join('\n');
    const files = extractKeyFiles(md);
    expect(files).toContain('lib/analyzer.ts');
  });

  it('should return empty array when no paths appear twice', () => {
    const md = 'The file lib/foo.ts is used once.';
    const files = extractKeyFiles(md);
    expect(files).toHaveLength(0);
  });

  it('should respect the maxFiles limit', () => {
    const paths = ['lib/a.ts', 'lib/b.ts', 'lib/c.ts', 'lib/d.ts', 'lib/e.ts', 'lib/f.ts'];
    const md = paths.map((p) => `${p} is used. See ${p} for details.`).join('\n');
    const files = extractKeyFiles(md, 3);
    expect(files.length).toBeLessThanOrEqual(3);
  });

  it('should return empty array for empty input', () => {
    expect(extractKeyFiles('')).toHaveLength(0);
  });
});

// --- detectPrimaryLanguage ------------------------------------

describe('detectPrimaryLanguage', () => {
  it('should detect TypeScript as the primary language', () => {
    const md = 'This project uses TypeScript extensively. TypeScript types ensure safety. TypeScript is the primary language.';
    expect(detectPrimaryLanguage(md)).toBe('TypeScript');
  });

  it('should detect Python', () => {
    const md = 'Python is used throughout. Python scripts handle ETL. Python 3.11 required.';
    expect(detectPrimaryLanguage(md)).toBe('Python');
  });

  it('should return null for empty string', () => {
    expect(detectPrimaryLanguage('')).toBeNull();
  });

  it('should return null when no known language is mentioned', () => {
    expect(detectPrimaryLanguage('This repo uses a proprietary scripting language.')).toBeNull();
  });

  it('should pick the most-mentioned language when multiple appear', () => {
    const md = 'TypeScript TypeScript TypeScript Python Python Go';
    expect(detectPrimaryLanguage(md)).toBe('TypeScript');
  });
});

// --- generateTLDR ---------------------------------------------

const SAMPLE_REPORT = `
# 1. Repository Overview
This project is a Next.js application for analyzing GitHub repositories using AI. It provides deep technical documentation.

# 2. Architecture & Design
The system uses a three-tier architecture with a Next.js frontend, API routes for server-side processing, and the Gemini AI API.

# 3. Module Breakdown
The lib directory contains all business logic organized by feature. Each module is independent.

# 4. Core Execution Flow
The main execution flow starts at app/page.tsx which triggers the API route.

# 5. API Surface
The API exposes two endpoints: POST /api/analyze and GET /api/analyze/stream.

# 11. Quick Reference
The most important files are lib/gemini.ts and lib/github.ts for understanding data flow.
lib/gemini.ts and lib/github.ts are called from app/api/analyze/route.ts.
`.trim();

describe('generateTLDR', () => {
  it('should return a TLDRSummary object', () => {
    const result = generateTLDR(SAMPLE_REPORT, true);
    expect(result).toHaveProperty('bullets');
    expect(result).toHaveProperty('keyFiles');
    expect(result).toHaveProperty('primaryLanguage');
    expect(result).toHaveProperty('isComplete');
  });

  it('should generate at least 1 bullet point', () => {
    const result = generateTLDR(SAMPLE_REPORT, true);
    expect(result.bullets.length).toBeGreaterThanOrEqual(1);
  });

  it('should generate at most 5 bullet points', () => {
    const result = generateTLDR(SAMPLE_REPORT, true);
    expect(result.bullets.length).toBeLessThanOrEqual(5);
  });

  it('should propagate the isComplete flag', () => {
    expect(generateTLDR(SAMPLE_REPORT, true).isComplete).toBe(true);
    expect(generateTLDR(SAMPLE_REPORT, false).isComplete).toBe(false);
  });

  it('should detect TypeScript in a TypeScript-heavy report', () => {
    const md = SAMPLE_REPORT + '\nThis is a TypeScript TypeScript TypeScript project.';
    const result = generateTLDR(md);
    expect(result.primaryLanguage).toBe('TypeScript');
  });

  it('should handle empty markdown gracefully', () => {
    const result = generateTLDR('', true);
    expect(result.bullets).toHaveLength(0);
    expect(result.keyFiles).toHaveLength(0);
    expect(result.primaryLanguage).toBeNull();
  });

  it('should not include "Not applicable" bullets', () => {
    const md = `# 1. Repository Overview\nNot applicable for this codebase.\n# 2. Architecture & Design\nThis is a well-structured system with clear separation of concerns.`;
    const result = generateTLDR(md, false);
    for (const bullet of result.bullets) {
      expect(bullet.toLowerCase()).not.toContain('not applicable');
    }
  });

  it('should extract key files that appear multiple times', () => {
    const result = generateTLDR(SAMPLE_REPORT, true);
    // lib/gemini.ts and lib/github.ts appear twice in SAMPLE_REPORT
    expect(result.keyFiles.length).toBeGreaterThan(0);
  });
});
