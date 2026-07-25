"use client";

import { useState } from "react";
import { triggerDownload } from "@/lib/download";
import { markdownToHtml } from "@/lib/export";

interface ExportMenuProps {
  markdown: string;
  repoSlug: string;
}

export default function ExportMenu({ markdown, repoSlug }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleExportMarkdown = () => {
    triggerDownload(markdown, `${repoSlug.replace("/", "-")}-analysis.md`, "text/markdown");
    setIsOpen(false);
  };

  const handleExportHtml = () => {
    const html = markdownToHtml(markdown, repoSlug);
    triggerDownload(html, `${repoSlug.replace("/", "-")}-analysis.html`, "text/html");
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-edge bg-surface/30 text-xs font-mono text-faint hover:text-dust hover:border-gold/30 transition-all duration-300"
        title="Export Analysis"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Export</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-36 bg-surface border border-edge rounded-lg shadow-xl z-50 overflow-hidden py-1">
            <button
              onClick={handleExportMarkdown}
              className="w-full text-left px-3 py-2 text-xs font-mono text-dust hover:text-cream hover:bg-gold/10 transition-colors"
            >
              Markdown (.md)
            </button>
            <button
              onClick={handleExportHtml}
              className="w-full text-left px-3 py-2 text-xs font-mono text-dust hover:text-cream hover:bg-gold/10 transition-colors"
            >
              HTML (.html)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
