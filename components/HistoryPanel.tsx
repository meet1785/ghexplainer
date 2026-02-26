"use client";

import { useState, useEffect } from "react";
import { getHistory, deleteAnalysis, clearHistory, seedHistoryIfEmpty, type SavedAnalysis } from "@/lib/history";

interface HistoryPanelProps {
  onLoad: (entry: SavedAnalysis) => void;
  /** Increment to trigger re-fetching history from localStorage */
  refreshKey?: number;
}

export default function HistoryPanel({ onLoad, refreshKey = 0 }: HistoryPanelProps) {
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Seed demo analyses on first visit, then load history
    seedHistoryIfEmpty();
    // Small delay to allow async seed import to complete
    const timer = setTimeout(() => setHistory(getHistory()), 100);
    return () => clearTimeout(timer);
  }, []);

  // Re-fetch history when refreshKey changes (e.g. after each batch save)
  useEffect(() => {
    if (refreshKey > 0) {
      setHistory(getHistory());
    }
  }, [refreshKey]);

  if (history.length === 0) return null;

  const displayList = expanded ? history : history.slice(0, 3);

  return (
    <section className="w-full max-w-2xl mt-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
          <span>📚</span> Previous Analyses
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800/60 text-gray-500 font-normal">
            {history.length}
          </span>
        </h3>
        {history.length > 0 && (
          <button
            onClick={() => {
              if (confirm("Clear all saved analyses?")) {
                clearHistory();
                setHistory([]);
              }
            }}
            className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {displayList.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gray-900/40 border border-gray-800/40 hover:border-indigo-500/30 transition-all duration-200 group"
          >
            <button
              onClick={() => onLoad(entry)}
              className="flex-1 flex items-center gap-3 text-left min-w-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200 truncate">
                    {entry.repoSlug}
                  </span>
                  {entry.language && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-500 shrink-0">
                      {entry.language}
                    </span>
                  )}
                  {!entry.complete && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-500 shrink-0">
                      Partial
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-600">
                  <span>{new Date(entry.savedAt).toLocaleDateString()}</span>
                  <span>⭐ {entry.stars.toLocaleString()}</span>
                  <span>{entry.filesAnalyzed} files</span>
                  {entry.durationMs > 0 && (
                    <span>{(entry.durationMs / 1000).toFixed(0)}s</span>
                  )}
                </div>
              </div>
              <span className="text-gray-600 group-hover:text-indigo-400 transition-colors shrink-0 text-xs">
                View →
              </span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteAnalysis(entry.id);
                setHistory(getHistory());
              }}
              className="text-gray-700 hover:text-red-400 transition-colors shrink-0 p-1"
              title="Remove"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {history.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 w-full text-center text-[11px] text-gray-600 hover:text-indigo-400 transition-colors py-1"
        >
          {expanded ? "Show less" : `Show all ${history.length} analyses`}
        </button>
      )}
    </section>
  );
}
