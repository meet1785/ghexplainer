/**
 * Tests for section bookmarking utilities.
 *
 * Validates: add, remove, toggle, isBookmarked, getBookmarks, clearBookmarks.
 * Uses vi.stubGlobal to mock localStorage in the Node test environment.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addBookmark,
  removeBookmark,
  toggleBookmark,
  isBookmarked,
  getBookmarks,
  clearBookmarks,
} from '@/lib/bookmarks';

// ─── localStorage mock ────────────────────────────────────────

function makeLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
}

const localStorageMock = makeLocalStorageMock();

beforeEach(() => {
  localStorageMock.clear();
  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('window', { localStorage: localStorageMock });
});

// ─── addBookmark ──────────────────────────────────────────────

describe('addBookmark', () => {
  it('should add a bookmark for a repo', () => {
    addBookmark('owner/repo', 'architecture', 'Architecture & Design');
    expect(isBookmarked('owner/repo', 'architecture')).toBe(true);
  });

  it('should allow multiple bookmarks per repo', () => {
    addBookmark('owner/repo', 'architecture', 'Architecture');
    addBookmark('owner/repo', 'data-flow', 'Data Flow');
    const bookmarks = getBookmarks('owner/repo');
    expect(bookmarks).toHaveLength(2);
  });

  it('should be idempotent — adding same anchor twice keeps only one', () => {
    addBookmark('owner/repo', 'api-surface', 'API Surface');
    addBookmark('owner/repo', 'api-surface', 'API Surface (updated)');
    const bookmarks = getBookmarks('owner/repo');
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].heading).toBe('API Surface (updated)');
  });

  it('should isolate bookmarks by repoSlug', () => {
    addBookmark('owner/repo-a', 'overview', 'Overview');
    addBookmark('owner/repo-b', 'overview', 'Overview');
    expect(getBookmarks('owner/repo-a')).toHaveLength(1);
    expect(getBookmarks('owner/repo-b')).toHaveLength(1);
  });
});

// ─── removeBookmark ───────────────────────────────────────────

describe('removeBookmark', () => {
  it('should remove an existing bookmark', () => {
    addBookmark('owner/repo', 'arch', 'Architecture');
    removeBookmark('owner/repo', 'arch');
    expect(isBookmarked('owner/repo', 'arch')).toBe(false);
  });

  it('should not throw when anchor does not exist', () => {
    expect(() => removeBookmark('owner/repo', 'nonexistent')).not.toThrow();
  });

  it('should only remove the specified anchor', () => {
    addBookmark('owner/repo', 'arch', 'Architecture');
    addBookmark('owner/repo', 'security', 'Security');
    removeBookmark('owner/repo', 'arch');
    expect(isBookmarked('owner/repo', 'security')).toBe(true);
    expect(getBookmarks('owner/repo')).toHaveLength(1);
  });
});

// ─── toggleBookmark ───────────────────────────────────────────

describe('toggleBookmark', () => {
  it('should add bookmark and return true when not bookmarked', () => {
    const result = toggleBookmark('owner/repo', 'arch', 'Architecture');
    expect(result).toBe(true);
    expect(isBookmarked('owner/repo', 'arch')).toBe(true);
  });

  it('should remove bookmark and return false when already bookmarked', () => {
    addBookmark('owner/repo', 'arch', 'Architecture');
    const result = toggleBookmark('owner/repo', 'arch', 'Architecture');
    expect(result).toBe(false);
    expect(isBookmarked('owner/repo', 'arch')).toBe(false);
  });

  it('should toggle back and forth correctly', () => {
    expect(toggleBookmark('owner/repo', 'arch', 'A')).toBe(true);
    expect(toggleBookmark('owner/repo', 'arch', 'A')).toBe(false);
    expect(toggleBookmark('owner/repo', 'arch', 'A')).toBe(true);
  });
});

// ─── isBookmarked ─────────────────────────────────────────────

describe('isBookmarked', () => {
  it('should return false for unknown repo', () => {
    expect(isBookmarked('unknown/repo', 'arch')).toBe(false);
  });

  it('should return false for unknown anchor in known repo', () => {
    addBookmark('owner/repo', 'arch', 'Architecture');
    expect(isBookmarked('owner/repo', 'unknown-anchor')).toBe(false);
  });

  it('should return true when bookmarked', () => {
    addBookmark('owner/repo', 'arch', 'Architecture');
    expect(isBookmarked('owner/repo', 'arch')).toBe(true);
  });
});

// ─── getBookmarks ─────────────────────────────────────────────

describe('getBookmarks', () => {
  it('should return empty array for unknown repo', () => {
    expect(getBookmarks('unknown/repo')).toHaveLength(0);
  });

  it('should return bookmarks in newest-first order', async () => {
    // Simulate timestamps
    addBookmark('owner/repo', 'arch', 'Architecture');
    // Wait a tick to ensure different timestamps
    await new Promise((r) => setTimeout(r, 5));
    addBookmark('owner/repo', 'security', 'Security');

    const bookmarks = getBookmarks('owner/repo');
    expect(bookmarks[0].anchor).toBe('security'); // newest first
    expect(bookmarks[1].anchor).toBe('arch');
  });

  it('should include heading and anchor in each bookmark', () => {
    addBookmark('owner/repo', 'api-surface', 'API Surface');
    const bookmarks = getBookmarks('owner/repo');
    expect(bookmarks[0].anchor).toBe('api-surface');
    expect(bookmarks[0].heading).toBe('API Surface');
  });

  it('should include addedAt timestamp', () => {
    addBookmark('owner/repo', 'arch', 'Architecture');
    const bookmarks = getBookmarks('owner/repo');
    expect(bookmarks[0].addedAt).toBeDefined();
    expect(() => new Date(bookmarks[0].addedAt)).not.toThrow();
  });
});

// ─── clearBookmarks ───────────────────────────────────────────

describe('clearBookmarks', () => {
  it('should remove all bookmarks for a repo', () => {
    addBookmark('owner/repo', 'arch', 'Architecture');
    addBookmark('owner/repo', 'security', 'Security');
    clearBookmarks('owner/repo');
    expect(getBookmarks('owner/repo')).toHaveLength(0);
  });

  it('should not affect other repos', () => {
    addBookmark('owner/repo-a', 'arch', 'Architecture');
    addBookmark('owner/repo-b', 'security', 'Security');
    clearBookmarks('owner/repo-a');
    expect(getBookmarks('owner/repo-b')).toHaveLength(1);
  });

  it('should not throw when called on empty repo', () => {
    expect(() => clearBookmarks('empty/repo')).not.toThrow();
  });
});
