"use client";

import { useState, FormEvent } from "react";

export type AnalysisMode = "stream" | "complete";

interface RepoFormProps {
  onSubmit: (url: string, mode: AnalysisMode) => void;
  loading: boolean;
}

const EXAMPLES = [
  { url: "https://github.com/pallets/flask", label: "pallets/flask", lang: "Python" },
  { url: "https://github.com/expressjs/express", label: "expressjs/express", lang: "JS" },
  { url: "https://github.com/fastapi/fastapi", label: "fastapi/fastapi", lang: "Python" },
  { url: "https://github.com/gin-gonic/gin", label: "gin-gonic/gin", lang: "Go" },
];

export default function RepoForm({ onSubmit, loading }: RepoFormProps) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<AnalysisMode>("stream");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed) onSubmit(trimmed, mode);
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Input row */}
        <div className="relative flex gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo (or /tree/branch) or owner/repo"
              disabled={loading}
              className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-edge bg-surface/80 text-cream placeholder-faint focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold/40 disabled:opacity-50 text-sm font-mono backdrop-blur-sm transition-all duration-300"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-gold to-coral hover:from-gold-bright hover:to-coral disabled:from-faint disabled:to-faint disabled:cursor-not-allowed text-midnight font-bold transition-all duration-300 text-sm shadow-lg shadow-gold/10 hover:shadow-gold/20 disabled:shadow-none"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing…
              </span>
            ) : (
              "Analyze →"
            )}
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-faint uppercase tracking-[0.15em] font-mono">Mode:</span>
          <div className="flex rounded-lg border border-edge overflow-hidden">
            <button
              type="button"
              onClick={() => setMode("stream")}
              disabled={loading}
              className={`flex items-center gap-1.5 text-xs px-3.5 py-1.5 font-mono transition-all duration-300 ${
                mode === "stream"
                  ? "bg-gold/10 text-gold border-r border-gold/20"
                  : "bg-surface/30 text-faint hover:text-dust border-r border-edge"
              } disabled:opacity-40`}
            >
              <span>⚡</span>
              <span>Stream</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("complete")}
              disabled={loading}
              className={`flex items-center gap-1.5 text-xs px-3.5 py-1.5 font-mono transition-all duration-300 ${
                mode === "complete"
                  ? "bg-jade/10 text-jade"
                  : "bg-surface/30 text-faint hover:text-dust"
              } disabled:opacity-40`}
            >
              <span>◆</span>
              <span>Complete</span>
            </button>
          </div>
          <span className="text-[10px] text-faint font-body italic">
            {mode === "stream" ? "Live progress as modules are analyzed" : "Waits for full result — more reliable for large repos"} · branch/tag URLs supported
          </span>
        </div>

        {/* Example repos */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[11px] text-faint uppercase tracking-[0.15em] font-mono">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.url}
              type="button"
              onClick={() => setUrl(ex.url)}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-edge bg-surface/30 text-dust hover:text-gold hover:border-gold/30 transition-all duration-300 disabled:opacity-40 font-mono"
            >
              <span className="text-[10px] text-faint">{ex.lang}</span>
              <span>{ex.label}</span>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
