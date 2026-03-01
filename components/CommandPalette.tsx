"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

/**
 * VS Code-style Command Palette (Cmd+K / Ctrl+K)
 *
 * A keyboard-first command interface with fuzzy search:
 * - Open with Cmd+K (Mac) or Ctrl+K (Windows/Linux)
 * - Fuzzy-match commands by name
 * - Keyboard navigation (↑/↓/Enter/Esc)
 * - Categorized commands with shortcuts
 * - Animated entrance/exit
 *
 * Demonstrates: fuzzy search algorithm, keyboard event handling,
 * focus management, accessibility (ARIA), animation, portals.
 */

export interface CommandAction {
  id: string;
  label: string;
  description?: string;
  category: "Navigation" | "Export" | "Analysis" | "View" | "Help";
  shortcut?: string;
  icon: string;
  action: () => void;
  disabled?: boolean;
}

interface CommandPaletteProps {
  commands: CommandAction[];
}

// ─── Fuzzy Search Algorithm ──────────────────────────────────

interface FuzzyResult {
  item: CommandAction;
  score: number;
  matches: number[]; // indices of matched characters
}

function fuzzySearch(query: string, commands: CommandAction[]): FuzzyResult[] {
  if (!query.trim()) {
    return commands.map(item => ({ item, score: 0, matches: [] }));
  }

  const lowerQuery = query.toLowerCase();
  const results: FuzzyResult[] = [];

  for (const item of commands) {
    if (item.disabled) continue;
    const target = `${item.label} ${item.description ?? ""} ${item.category}`.toLowerCase();
    const result = fuzzyMatch(lowerQuery, target);
    if (result) {
      results.push({ item, score: result.score, matches: result.matches });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

function fuzzyMatch(query: string, target: string): { score: number; matches: number[] } | null {
  const matches: number[] = [];
  let queryIdx = 0;
  let score = 0;
  let lastMatchIdx = -2;
  let consecutiveBonus = 0;

  for (let i = 0; i < target.length && queryIdx < query.length; i++) {
    if (target[i] === query[queryIdx]) {
      matches.push(i);
      score += 1;

      // Consecutive match bonus (rewards sequential matches)
      if (i === lastMatchIdx + 1) {
        consecutiveBonus++;
        score += consecutiveBonus * 2;
      } else {
        consecutiveBonus = 0;
      }

      // Word boundary bonus (matching start of words scores higher)
      if (i === 0 || target[i - 1] === " " || target[i - 1] === "/" || target[i - 1] === "-") {
        score += 5;
      }

      // Start-of-string bonus
      if (i === 0) {
        score += 10;
      }

      lastMatchIdx = i;
      queryIdx++;
    }
  }

  // All query chars must match
  if (queryIdx !== query.length) return null;

  // Penalize long gaps between matches
  if (matches.length > 1) {
    const totalGap = matches[matches.length - 1] - matches[0] - matches.length + 1;
    score -= totalGap * 0.5;
  }

  return { score, matches };
}

// ─── Category Icons ──────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Navigation: "text-jade",
  Export: "text-gold",
  Analysis: "text-coral",
  View: "text-azure",
  Help: "text-dust",
};

// ─── Component ───────────────────────────────────────────────

function CommandPalette({ commands }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => fuzzySearch(query, commands), [query, commands]);

  // Keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(prev => !prev);
        setQuery("");
        setSelectedIdx(0);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIdx] as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIdx]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIdx(prev => Math.min(prev + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIdx(prev => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[selectedIdx]) {
          filtered[selectedIdx].item.action();
          setIsOpen(false);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  }, [filtered, selectedIdx]);

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 left-6 z-40">
        <button
          onClick={() => { setIsOpen(true); setQuery(""); setSelectedIdx(0); }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface/80 border border-edge text-faint hover:text-cream hover:border-edge-hover transition-all duration-300 text-xs font-mono backdrop-blur-sm"
          title="Command Palette (Cmd+K)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="hidden sm:inline">Commands</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-midnight border border-edge text-[10px]">
            ⌘K
          </kbd>
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-midnight/60 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
        style={{ animation: "fade-in 0.15s ease-out" }}
      />

      {/* Palette */}
      <div
        className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg"
        style={{ animation: "fade-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)" }}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="rounded-2xl bg-surface border border-edge shadow-2xl shadow-black/40 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-edge">
            <svg className="w-4 h-4 text-faint shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command…"
              className="flex-1 bg-transparent text-cream text-sm py-3.5 placeholder-faint focus:outline-none font-mono"
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={true}
              aria-controls="command-list"
              aria-activedescendant={filtered[selectedIdx] ? `cmd-${filtered[selectedIdx].item.id}` : undefined}
            />
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-midnight border border-edge text-faint font-mono">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            id="command-list"
            role="listbox"
            className="max-h-[340px] overflow-y-auto py-2"
          >
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-faint">
                <p>No commands match &ldquo;{query}&rdquo;</p>
              </div>
            ) : (
              filtered.map((result, idx) => {
                const { item } = result;
                const isSelected = idx === selectedIdx;
                return (
                  <button
                    key={item.id}
                    id={`cmd-${item.id}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      item.action();
                      setIsOpen(false);
                    }}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 ${
                      isSelected
                        ? "bg-gold/10 text-cream"
                        : "text-dust hover:text-cream"
                    }`}
                  >
                    {/* Icon */}
                    <span className={`text-base shrink-0 ${isSelected ? "text-gold" : CATEGORY_COLORS[item.category] ?? "text-faint"}`}>
                      {item.icon}
                    </span>

                    {/* Label + description */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <HighlightedText text={item.label} matches={result.matches} isSelected={isSelected} />
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-edge text-faint font-mono shrink-0">
                          {item.category}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-[11px] text-faint truncate mt-0.5 font-body">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Shortcut */}
                    {item.shortcut && (
                      <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-midnight border border-edge text-faint font-mono shrink-0">
                        {item.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-edge flex items-center justify-between text-[10px] text-faint font-mono">
            <div className="flex items-center gap-3">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>ESC Close</span>
            </div>
            <span>{filtered.length} command{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Highlighted matching text ───────────────────────────────

function HighlightedText({ text, matches, isSelected }: { text: string; matches: number[]; isSelected: boolean }) {
  if (matches.length === 0) {
    return <span className="text-sm font-medium font-mono">{text}</span>;
  }

  const matchSet = new Set(matches.filter(i => i < text.length));

  return (
    <span className="text-sm font-medium font-mono">
      {text.split("").map((char, i) => (
        <span
          key={i}
          className={matchSet.has(i) ? (isSelected ? "text-gold font-bold" : "text-gold/80 font-bold") : ""}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

export default React.memo(CommandPalette);
