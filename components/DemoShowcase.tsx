"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SEED_ANALYSES } from "@/lib/seed-history";

const LANG_DOTS: Record<string, string> = {
  JavaScript: "#f0db4f",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Go: "#00ADD8",
  Rust: "#dea584",
};

export default function DemoShowcase() {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = SEED_ANALYSES[activeIdx];

  return (
    <div className="max-w-5xl mx-auto px-6">
      {/* ── Section Header ── */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/10 border border-gold/15 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold/90">
            Demo Analyses
          </span>
        </div>
        <h2 className="font-sans text-3xl sm:text-4xl font-bold text-cream mb-3">
          See what ghexplainer generates
        </h2>
        <p className="font-body italic text-dust text-lg max-w-xl mx-auto">
          Browse real analyses of popular open-source repos — no waiting, no API calls
        </p>
      </div>

      {/* ── IDE-style Tabs ── */}
      <div className="flex items-end gap-0 border-b border-edge/60 overflow-x-auto">
        {SEED_ANALYSES.map((analysis, idx) => {
          const isActive = idx === activeIdx;
          const langColor = LANG_DOTS[analysis.language || ""] || "#888";
          return (
            <button
              key={analysis.repoSlug}
              onClick={() => setActiveIdx(idx)}
              className={`
                relative flex items-center gap-2 px-5 py-3 text-sm font-mono transition-all duration-300 whitespace-nowrap shrink-0
                ${isActive
                  ? "bg-panel text-cream border-t-2 border-t-gold border-l border-r border-edge rounded-t-lg -mb-px z-10"
                  : "text-faint hover:text-dust hover:bg-surface/40"
                }
              `}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: langColor }}
              />
              <span className={isActive ? "font-semibold" : ""}>{analysis.repoSlug}</span>
              {isActive && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-gold/15 text-gold/80 font-semibold uppercase tracking-wider ml-1">
                  demo
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Active Analysis Panel ── */}
      <div className="rounded-b-2xl rounded-tr-2xl border-l border-r border-b border-edge bg-panel/60 overflow-hidden">
        {/* Meta bar */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 bg-surface/30 border-b border-edge/40">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: LANG_DOTS[active.language || ""] || "#888" }}
            />
            <a
              href={active.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans font-semibold text-cream hover:text-gold transition-colors"
            >
              {active.repoSlug} ↗
            </a>
          </div>
          {active.description && (
            <p className="font-body italic text-sm text-dust flex-1 min-w-[200px]">
              {active.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-[11px] text-faint font-mono">
            <span>⭐ {active.stars?.toLocaleString()}</span>
            <span>{active.language}</span>
            <span>{active.filesAnalyzed} files</span>
            <span>{(active.durationMs / 1000).toFixed(0)}s</span>
          </div>
        </div>

        {/* Demo notice banner */}
        <div className="px-6 py-2.5 bg-gold/[0.03] border-b border-gold/10">
          <p className="text-[12px] text-gold/70 font-body">
            ✦ This is a pre-generated demo — paste any GitHub URL above to generate your own analysis
          </p>
        </div>

        {/* Rendered markdown content */}
        <div key={activeIdx} className="reveal" style={{ animationDuration: "0.4s" }}>
          <article className="prose-custom prose prose-invert prose-sm max-w-none p-6 sm:p-10">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {active.markdown}
            </ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  );
}
