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
  complete: boolean;
  phase: string;
  onReset: () => void;
  onRetry?: () => void;
}

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
    <div className="w-full">
      {/* Sticky header bar */}
      <div className="sticky top-0 z-20 bg-midnight/80 backdrop-blur-xl border-b border-edge">
        <div className="max-w-5xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Left: back + repo info */}
          <div className="flex items-center gap-3">
            <button
              onClick={onReset}
              className="p-2 rounded-lg hover:bg-surface text-dust hover:text-cream transition-colors duration-300"
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
                className="font-mono text-sm font-semibold text-cream hover:text-gold transition-colors"
              >
                {repoInfo.owner}/{repoInfo.repo}
              </a>
              {cached && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono bg-jade/10 text-jade border border-jade/20 rounded">
                  CACHED
                </span>
              )}
              {isStreaming && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono bg-gold/10 text-gold border border-gold/20 rounded animate-pulse">
                  STREAMING
                </span>
              )}
            </div>
          </div>

          {/* Center: stats */}
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-faint font-mono">
            {repoInfo.stars > 0 && <span>⭐ {repoInfo.stars.toLocaleString()}</span>}
            {repoInfo.language && <span>· {repoInfo.language}</span>}
            <span>· {filesAnalyzed} files</span>
            <span>· {chunks} chunks</span>
            {durationMs > 0 && <span>· {(durationMs / 1000).toFixed(1)}s</span>}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyMarkdown}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-mono transition-all duration-300 ${
                copied
                  ? "border-jade/30 bg-jade/10 text-jade"
                  : "border-edge text-dust hover:text-cream hover:border-edge-hover"
              }`}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
            <button
              onClick={handleDownloadMarkdown}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gold text-midnight font-semibold hover:bg-gold-bright transition-colors shadow-sm"
            >
              Download .md
            </button>
          </div>
        </div>
      </div>

      {/* Meta card */}
      <div className="max-w-4xl mx-auto px-6 pt-8 pb-4">
        <div className="p-5 rounded-2xl bg-surface/60 border border-edge">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-faint font-mono mb-1">Repository</p>
              <p className="font-mono text-sm font-medium text-cream">{repoInfo.owner}/{repoInfo.repo}</p>
            </div>
            {repoInfo.description && (
              <div className="flex-1 min-w-[200px]">
                <p className="text-[10px] uppercase tracking-[0.15em] text-faint font-mono mb-1">Description</p>
                <p className="font-body italic text-sm text-dust line-clamp-1">{repoInfo.description}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-faint font-mono mb-1">Analysis</p>
              <p className="text-sm text-dust font-mono">{filesAnalyzed} files / {chunks} module{chunks !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Markdown content */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        {/* Streaming banner */}
        {isStreaming && (
          <div className="mb-4 p-4 rounded-xl bg-gold/5 border border-gold/20 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-gold animate-pulse shrink-0" />
            <div>
              <p className="text-sm font-medium text-gold">Analysis in progress…</p>
              {phaseLabel(phase) && (
                <p className="text-xs text-gold/60 mt-0.5 font-mono">Step: {phaseLabel(phase)}</p>
              )}
              <p className="text-xs text-gold/40 mt-0.5 font-body italic">
                Partial results shown below — updates as more modules complete.
              </p>
            </div>
          </div>
        )}

        {/* Interrupted banner */}
        {!complete && phase === "interrupted" && (
          <div className="mb-4 p-4 rounded-xl bg-coral/10 border border-coral/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-coral text-lg">⚠</span>
              <div>
                <p className="text-sm font-medium text-coral">Response is incomplete</p>
                <p className="text-xs text-coral/60 mt-0.5 font-body italic">
                  Connection was interrupted. Partial results shown below.
                </p>
              </div>
            </div>
            {onRetry && (
              <button
                onClick={onRetry}
                className="shrink-0 text-xs px-4 py-2 rounded-lg bg-coral text-midnight font-semibold hover:bg-coral/90 transition-colors"
              >
                Retry Full Analysis
              </button>
            )}
          </div>
        )}

        {/* Rendered markdown */}
        <article className="prose-custom prose prose-invert prose-sm max-w-none p-8 sm:p-10 rounded-2xl bg-panel/50 border border-edge">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {markdown}
          </ReactMarkdown>
        </article>

        {/* Bottom actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-6 border-t border-edge/40">
          <button
            onClick={onReset}
            className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl border border-edge text-dust hover:text-cream hover:border-edge-hover transition-all duration-300"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Analyze Another
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyMarkdown}
              className="text-xs px-4 py-2 rounded-lg border border-edge text-dust hover:text-cream hover:border-edge-hover font-mono transition-all duration-300"
            >
              {copied ? "✓ Copied!" : "Copy Markdown"}
            </button>
            <button
              onClick={handleDownloadMarkdown}
              className="text-xs px-4 py-2 rounded-lg bg-gold text-midnight font-semibold hover:bg-gold-bright transition-colors"
            >
              Download .md
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
