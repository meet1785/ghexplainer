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
}

const STORAGE_KEY = "ghexplainer_history";
const MAX_ENTRIES = 20;

/**
 * Get all saved analyses, newest first.
 */
export function getHistory(): SavedAnalysis[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedAnalysis[];
    return parsed.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  } catch {
    return [];
  }
}

/**
 * Save an analysis to history. Deduplicates by repoSlug (keeps latest).
 * Evicts oldest entries beyond MAX_ENTRIES.
 */
export function saveAnalysis(entry: Omit<SavedAnalysis, "id" | "savedAt">): SavedAnalysis {
  const history = getHistory();
  const saved: SavedAnalysis = {
    ...entry,
    id: `${entry.repoSlug}-${Date.now()}`,
    savedAt: new Date().toISOString(),
  };

  // Remove older entry for same repo (keep only latest)
  const filtered = history.filter((h) => h.repoSlug !== entry.repoSlug);
  filtered.unshift(saved);

  // Evict oldest beyond limit
  const trimmed = filtered.slice(0, MAX_ENTRIES);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full — remove oldest and retry
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed.slice(0, 10)));
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
