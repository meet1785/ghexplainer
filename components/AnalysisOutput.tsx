"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RepoInfo } from "@/lib/github";

interface AnalysisOutputProps {
  markdown: string;
  repoInfo: RepoInfo;
  filesAnalyzed: number;
  chunks: number;
  durationMs: number;
  cached: boolean;
  /** Whether the analysis has fully completed */
  complete: boolean;
  /** Current analysis phase (e.g. "chunk-3/7", "cross-module", "complete") */
  phase: string;
  onReset: () => void;
  /** Retry/continue the analysis */
  onRetry?: () => void;
}

/** User-friendly phase label */
function phaseLabel(phase: string): string {
  if (!phase || phase === "complete") return "";
  if (phase === "interrupted") return "Connection interrupted";
  if (phase === "partial-error") return "Partial results (some batches failed)";
  if (phase.startsWith("batch-")) return `Section batch ${phase.replace("batch-", "")} of 3`;
  return phase;
}

export default function AnalysisOutput({
  markdown,
  repoInfo,
  filesAnalyzed,
  chunks,
  durationMs,
  cached,
  complete,
  phase,
  onReset,
  onRetry,
}: AnalysisOutputProps) {
  const [copied, setCopied] = useState(false);
  const isStreaming = !complete && phase !== "complete";

  const handleCopyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    downloadBlob(blob, `${repoInfo.repo}-analysis.md`);
  };

  return (
    <div className="w-full bg-[#030712]">
      {/* Sticky header bar */}
      <div className="sticky top-0 z-20 bg-[#030712]/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-5xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Repo info */}
          <div className="flex items-center gap-3">
            <button
              onClick={onReset}
              className="p-2 rounded-lg hover:bg-gray-800/50 text-gray-400 hover:text-white transition-colors"
              title="Back to home"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <a
                href={`https://github.com/${repoInfo.owner}/${repoInfo.repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-white hover:text-indigo-300 transition-colors"
              >
                {repoInfo.owner}/{repoInfo.repo}
              </a>
              {cached && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                  CACHED
                </span>
              )}
              {isStreaming && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded animate-pulse">
                  STREAMING
                </span>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-gray-500">
            {repoInfo.stars > 0 && <span>⭐ {repoInfo.stars.toLocaleString()}</span>}
            {repoInfo.language && <span>• {repoInfo.language}</span>}
            <span>• {filesAnalyzed} files</span>
            <span>• {chunks} chunks</span>
            {durationMs > 0 && <span>• {(durationMs / 1000).toFixed(1)}s</span>}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyMarkdown}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 ${
                copied
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-gray-700/50 text-gray-400 hover:text-white hover:border-gray-600"
              }`}
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
            <button
              onClick={handleDownloadMarkdown}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download .md
            </button>
          </div>
        </div>
      </div>

      {/* Analysis meta card */}
      <div className="max-w-4xl mx-auto px-6 pt-8 pb-4">
        <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border border-gray-800/30">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Repository</p>
              <p className="text-sm font-medium text-white">{repoInfo.owner}/{repoInfo.repo}</p>
            </div>
            {repoInfo.description && (
              <div className="flex-1 min-w-[200px]">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Description</p>
                <p className="text-sm text-gray-400 line-clamp-1">{repoInfo.description}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Analysis</p>
              <p className="text-sm text-gray-400">{filesAnalyzed} files across {chunks} module{chunks !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Rendered markdown */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        {/* Streaming in-progress banner */}
        {isStreaming && (
          <div className="mb-4 p-4 rounded-xl bg-amber-950/30 border border-amber-800/30 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-200">Analysis in progress…</p>
              {phaseLabel(phase) && (
                <p className="text-xs text-amber-400/70 mt-0.5">Current step: {phaseLabel(phase)}</p>
              )}
              <p className="text-xs text-amber-400/50 mt-0.5">Partial results shown below — updates as more modules complete.</p>
            </div>
          </div>
        )}

        {/* Incomplete analysis banner (connection dropped) */}
        {!complete && phase === "interrupted" && (
          <div className="mb-4 p-4 rounded-xl bg-orange-950/30 border border-orange-800/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-orange-400 text-lg">⚠️</span>
              <div>
                <p className="text-sm font-medium text-orange-200">Response is incomplete</p>
                <p className="text-xs text-orange-400/70 mt-0.5">Connection was interrupted. Partial results shown below.</p>
              </div>
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="shrink-0 text-xs px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors"
              >
                Retry Full Analysis
              </button>
            )}
          </div>
        )}
        <article className="prose-custom prose prose-invert prose-sm max-w-none p-8 sm:p-10 rounded-2xl bg-gray-950/50 border border-gray-800/30">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {markdown}
          </ReactMarkdown>
        </article>

        {/* Bottom actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-6 border-t border-gray-800/30">
          <button
            onClick={onReset}
            className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl border border-gray-700/50 text-gray-400 hover:text-white hover:border-gray-600 transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Analyze Another Repo
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyMarkdown}
              className="text-xs px-4 py-2 rounded-lg border border-gray-700/50 text-gray-400 hover:text-white hover:border-gray-600 transition-all duration-200"
            >
              {copied ? "✓ Copied!" : "📋 Copy Markdown"}
            </button>
            <button
              onClick={handleDownloadMarkdown}
              className="text-xs px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              📥 Download .md
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
