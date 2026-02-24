"use client";

import { useState, FormEvent } from "react";

interface RepoFormProps {
  onSubmit: (url: string) => void;
  loading: boolean;
}

const EXAMPLES = [
  { url: "https://github.com/pallets/flask", label: "pallets/flask", icon: "🐍" },
  { url: "https://github.com/expressjs/express", label: "expressjs/express", icon: "🟢" },
  { url: "https://github.com/fastapi/fastapi", label: "fastapi/fastapi", icon: "⚡" },
  { url: "https://github.com/gin-gonic/gin", label: "gin-gonic/gin", icon: "🔵" },
];

export default function RepoForm({ onSubmit, loading }: RepoFormProps) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Input row */}
        <div className="relative flex gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              disabled={loading}
              className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-700/50 bg-gray-900/80 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 disabled:opacity-50 text-sm font-mono backdrop-blur-sm transition-all duration-200"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold transition-all duration-200 text-sm shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 disabled:shadow-none"
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

        {/* Example repos */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[11px] text-gray-600 uppercase tracking-wide font-medium">Try an example:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.url}
              type="button"
              onClick={() => setUrl(ex.url)}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-800/50 bg-gray-900/30 text-gray-400 hover:text-indigo-300 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all duration-200 disabled:opacity-40"
            >
              <span>{ex.icon}</span>
              <span>{ex.label}</span>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
