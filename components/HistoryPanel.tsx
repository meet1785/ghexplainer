"use client";

import { useState, useEffect } from "react";
import { getHistory, deleteAnalysis, clearHistory, seedHistoryIfEmpty, type SavedAnalysis } from "@/lib/history";

interface HistoryPanelProps {
  onLoad: (entry: SavedAnalysis) => void;
  refreshKey?: number;
}

export default function HistoryPanel({ onLoad, refreshKey = 0 }: HistoryPanelProps) {
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    seedHistoryIfEmpty();
    setHistory(getHistory());
  }, []);

  useEffect(() => {
    if (refreshKey > 0) {
      setHistory(getHistory());
    }
  }, [refreshKey]);

  if (history.length === 0) return null;

  const displayList = expanded ? history : history.slice(0, 3);

  return (
    <section className="w-full max-w-2xl mt-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-dust flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-gold/50" />
          Your Analyses
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-edge text-faint font-mono">
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
            className="text-[10px] text-faint hover:text-coral transition-colors font-mono"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {displayList.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface/50 border border-edge/60 hover:border-gold/30 transition-all duration-300 group"
          >
            <button
              onClick={() => onLoad(entry)}
              className="flex-1 flex items-center gap-3 text-left min-w-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-cream-dim truncate group-hover:text-cream transition-colors">
                    {entry.repoSlug}
                  </span>
                  {entry.language && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-edge text-faint font-mono shrink-0">
                      {entry.language}
                    </span>
                  )}
                  {!entry.complete && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-coral/10 border border-coral/20 text-coral shrink-0 font-mono">
                      Partial
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-faint font-mono">
                  <span>{new Date(entry.savedAt).toLocaleDateString()}</span>
                  <span>⭐ {entry.stars.toLocaleString()}</span>
                  <span>{entry.filesAnalyzed} files</span>
                  {entry.durationMs > 0 && (
                    <span>{(entry.durationMs / 1000).toFixed(0)}s</span>
                  )}
                </div>
              </div>
              <span className="text-faint group-hover:text-gold transition-colors shrink-0 text-xs font-mono">
                View →
              </span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteAnalysis(entry.id);
                setHistory(getHistory());
              }}
              className="text-faint hover:text-coral transition-colors shrink-0 p-1"
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
          className="mt-3 w-full text-center text-[11px] text-faint hover:text-gold transition-colors py-1 font-mono"
        >
          {expanded ? "Show less" : `Show all ${history.length} analyses`}
        </button>
      )}
    </section>
  );
}
