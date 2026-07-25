/**
 * Client-side section bookmarking using localStorage.
 *
 * Allows users to pin specific sections of a repository analysis for
 * quick re-access. Bookmarks are scoped per repo slug so each repo
 * has its own independent set of bookmarks.
 *
 * Storage key: "ghexplainer_bookmarks"
 * Format: Record<repoSlug, SectionBookmark[]>
 */

export interface SectionBookmark {
  /** CSS anchor / section ID (e.g. "architecture--design") */
  anchor: string;
  /** Human-readable heading text */
  heading: string;
  /** ISO timestamp when bookmark was added */
  addedAt: string;
}

const STORAGE_KEY = 'ghexplainer_bookmarks';

// ─── Storage helpers ──────────────────────────────────────────

function readStore(): Record<string, SectionBookmark[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SectionBookmark[]>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, SectionBookmark[]>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Return all bookmarks for a given repository slug.
 *
 * @param repoSlug - "owner/repo" identifier.
 * @returns Bookmarks sorted by addedAt descending (newest first).
 */
export function getBookmarks(repoSlug: string): SectionBookmark[] {
  const store = readStore();
  const bookmarks = store[repoSlug] ?? [];
  return [...bookmarks].sort(
    (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  );
}

/**
 * Add a bookmark for a section.
 * If a bookmark with the same anchor already exists, it is replaced (idempotent).
 *
 * @param repoSlug - "owner/repo" identifier.
 * @param anchor   - CSS anchor for the section (e.g. "data-flow").
 * @param heading  - Human-readable section heading.
 */
export function addBookmark(
  repoSlug: string,
  anchor: string,
  heading: string
): void {
  const store = readStore();
  const existing = store[repoSlug] ?? [];
  // Remove any existing bookmark with same anchor (deduplicate)
  const filtered = existing.filter((b) => b.anchor !== anchor);
  filtered.push({ anchor, heading, addedAt: new Date().toISOString() });
  store[repoSlug] = filtered;
  writeStore(store);
}

/**
 * Remove a bookmark by anchor.
 *
 * @param repoSlug - "owner/repo" identifier.
 * @param anchor   - CSS anchor to remove.
 */
export function removeBookmark(repoSlug: string, anchor: string): void {
  const store = readStore();
  const existing = store[repoSlug] ?? [];
  store[repoSlug] = existing.filter((b) => b.anchor !== anchor);
  writeStore(store);
}

/**
 * Toggle a bookmark — adds it if not present, removes it if already bookmarked.
 *
 * @param repoSlug - "owner/repo" identifier.
 * @param anchor   - CSS anchor for the section.
 * @param heading  - Section heading (used when adding).
 * @returns `true` if the section is now bookmarked, `false` if removed.
 */
export function toggleBookmark(
  repoSlug: string,
  anchor: string,
  heading: string
): boolean {
  if (isBookmarked(repoSlug, anchor)) {
    removeBookmark(repoSlug, anchor);
    return false;
  } else {
    addBookmark(repoSlug, anchor, heading);
    return true;
  }
}

/**
 * Check whether a specific section anchor is bookmarked.
 *
 * @param repoSlug - "owner/repo" identifier.
 * @param anchor   - CSS anchor to check.
 */
export function isBookmarked(repoSlug: string, anchor: string): boolean {
  const store = readStore();
  return (store[repoSlug] ?? []).some((b) => b.anchor === anchor);
}

/**
 * Remove all bookmarks for a repository.
 *
 * @param repoSlug - "owner/repo" identifier.
 */
export function clearBookmarks(repoSlug: string): void {
  const store = readStore();
  delete store[repoSlug];
  writeStore(store);
}
