/**
 * Client-side analysis history using localStorage.
 * Stores generated repo docs for future access.
 */

import { SEED_ANALYSES } from "./seed-history";

export interface SavedAnalysis {
  /** Unique ID */
  id: string;
  /** GitHub URL */
  url: string;
  /** owner/repo */
  repoSlug: string;
  /** Repo description */
  description: string;
  /** Primary language */
  language: string | null;
  /** Star count */
  stars: number;
  /** Full markdown output */
  markdown: string;
  /** Whether analysis completed fully */
  complete: boolean;
  /** Files analyzed */
  filesAnalyzed: number;
  /** Chunks used */
  chunks: number;
  /** Duration in ms */
  durationMs: number;
  /** ISO timestamp */
  savedAt: string;
  /** Whether the entry is pinned — pinned entries always appear first and are never auto-evicted */
  pinned?: boolean;
}

const STORAGE_KEY = "ghexplainer_history";
const MAX_ENTRIES = 20;

/**
 * Get all saved analyses, pinned entries first, then newest first within each group.
 */
export function getHistory(): SavedAnalysis[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedAnalysis[];
    return parsed.sort((a, b) => {
      // Pinned entries float to the top
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
    });
  } catch {
    return [];
  }
}

/**
 * Save an analysis to history. Deduplicates by repoSlug (keeps latest).
 * Evicts oldest entries beyond MAX_ENTRIES — pinned entries are never evicted.
 */
export function saveAnalysis(entry: Omit<SavedAnalysis, "id" | "savedAt">): SavedAnalysis {
  const history = getHistory();
  const saved: SavedAnalysis = {
    ...entry,
    id: `${entry.repoSlug}-${Date.now()}`,
    savedAt: new Date().toISOString(),
  };

  // Remove older entry for same repo (keep only latest), preserving its pinned state
  const existing = history.find((h) => h.repoSlug === entry.repoSlug);
  if (existing?.pinned && !entry.pinned) {
    saved.pinned = true;
  }
  const filtered = history.filter((h) => h.repoSlug !== entry.repoSlug);
  filtered.unshift(saved);

  // Evict oldest non-pinned entries beyond limit.
  // Pinned entries are intentionally allowed to exceed MAX_ENTRIES — they represent
  // analyses the user explicitly marked as important and should never be auto-removed.
  const pinned = filtered.filter((h) => h.pinned);
  const unpinned = filtered.filter((h) => !h.pinned);
  const unpinnedBudget = Math.max(0, MAX_ENTRIES - pinned.length);
  const trimmedUnpinned = unpinned.slice(0, unpinnedBudget);
  const trimmed = [...pinned, ...trimmedUnpinned];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full — remove oldest unpinned entries and retry
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...pinned, ...trimmedUnpinned.slice(0, 5)]));
    } catch {
      // Give up silently
    }
  }

  return saved;
}

/**
 * Delete a single analysis from history.
 */
export function deleteAnalysis(id: string): void {
  const history = getHistory().filter((h) => h.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore
  }
}

/**
 * Pin an analysis so it always appears first and is never auto-evicted.
 */
export function pinAnalysis(id: string): void {
  setAnalysisPinned(id, true);
}

/**
 * Unpin a previously pinned analysis.
 */
export function unpinAnalysis(id: string): void {
  setAnalysisPinned(id, false);
}

/**
 * Toggle the pinned state of an analysis.
 * Returns the new pinned state.
 */
export function togglePinAnalysis(id: string): boolean {
  const history = getHistory();
  const entry = history.find((h) => h.id === id);
  const newState = !entry?.pinned;
  setAnalysisPinned(id, newState);
  return newState;
}

function setAnalysisPinned(id: string, pinned: boolean): void {
  const history = getHistory().map((h) =>
    h.id === id ? { ...h, pinned } : h
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore
  }
}

/**
 * Clear all history.
 */
export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    // Also mark seed as cleared so it doesn't re-appear
    localStorage.setItem(STORAGE_KEY + "_seed_loaded", "cleared");
  } catch {
    // ignore
  }
}

/**
 * Seed history with hardcoded demo analyses on first visit.
 * Only runs once — sets a flag in localStorage.
 * Uses synchronous import for production reliability.
 */
export function seedHistoryIfEmpty(): void {
  if (typeof window === "undefined") return;
  try {
    const flag = localStorage.getItem(STORAGE_KEY + "_seed_loaded");
    if (flag) return; // Already seeded or user cleared

    const existing = getHistory();
    if (existing.length > 0) {
      localStorage.setItem(STORAGE_KEY + "_seed_loaded", "true");
      return;
    }

    const seeded: SavedAnalysis[] = SEED_ANALYSES.map((entry, i) => ({
      ...entry,
      id: `${entry.repoSlug}-seed-${i}`,
      savedAt: new Date(Date.now() - i * 86400000).toISOString(), // Stagger dates
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    localStorage.setItem(STORAGE_KEY + "_seed_loaded", "true");
  } catch {
    // ignore
  }
}
