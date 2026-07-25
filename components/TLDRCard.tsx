"use client";

import { useState } from "react";
import type { TLDRSummary } from "@/lib/summary";

interface TLDRCardProps {
  summary: TLDRSummary;
  repoSlug: string;
}

/**
 * Collapsible TL;DR summary card shown at the top of the Report tab.
 * Displays key insight bullets, top referenced files, and primary language.
 */
export function TLDRCard({ summary, repoSlug: _repoSlug }: TLDRCardProps) {
  const [expanded, setExpanded] = useState(true);

  if (summary.bullets.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-gold/20 bg-gold/5 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gold/5 transition-colors duration-200"
        aria-expanded={expanded}
        aria-controls="tldr-body"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-gold text-sm">⚡</span>
          <span className="font-mono text-xs font-semibold text-gold uppercase tracking-[0.12em]">
            TL;DR — Key Insights
          </span>
          {!summary.isComplete && (
            <span className="text-[10px] font-mono text-gold/50 border border-gold/20 px-1.5 py-0.5 rounded">
              partial
            </span>
          )}
          {summary.primaryLanguage && (
            <span className="text-[10px] font-mono text-jade border border-jade/20 px-1.5 py-0.5 rounded bg-jade/5">
              {summary.primaryLanguage}
            </span>
          )}
        </div>
        <span
          className="text-gold/50 transition-transform duration-300 text-sm"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
      </button>

      {/* Body */}
      {expanded && (
        <div id="tldr-body" className="px-5 pb-5 space-y-4">
          {/* Bullet points */}
          <ul className="space-y-2.5">
            {summary.bullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="font-mono text-[10px] text-gold/40 mt-[3px] shrink-0 select-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="font-body text-sm text-cream-dim leading-relaxed">{bullet}</p>
              </li>
            ))}
          </ul>

          {/* Key files */}
          {summary.keyFiles.length > 0 && (
            <div className="pt-3 border-t border-gold/10">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold/40 mb-2">
                Key Files Referenced
              </p>
              <div className="flex flex-wrap gap-2">
                {summary.keyFiles.map((file) => (
                  <span
                    key={file}
                    className="font-mono text-[11px] text-azure/80 bg-azure/5 border border-azure/15 px-2 py-0.5 rounded-md"
                  >
                    {file}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
