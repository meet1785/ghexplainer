"use client";

import { useState, useRef, useCallback } from "react";
import RepoForm from "@/components/RepoForm";
import LoadingState from "@/components/LoadingState";
import AnalysisOutput from "@/components/AnalysisOutput";
import type { RepoInfo } from "@/lib/github";

type AppState = "idle" | "loading" | "done" | "error";

interface AnalysisData {
  markdown: string;
  repoInfo: RepoInfo;
  filesAnalyzed: number;
  chunks: number;
  durationMs: number;
  cached: boolean;
  /** Whether the analysis completed fully or was cut short */
  complete: boolean;
  /** Current phase label for streaming UI */
  phase: string;
}

const FEATURES = [
  {
    icon: "🏗️",
    title: "Architecture Analysis",
    description: "Identifies design patterns, component relationships, and system architecture from source code.",
  },
  {
    icon: "🔄",
    title: "Data Flow Tracing",
    description: "Maps how data moves through the codebase — from input to storage to output.",
  },
  {
    icon: "🧩",
    title: "Smart Chunking",
    description: "Splits large repos into logical modules with dependency analysis for thorough coverage.",
  },
  {
    icon: "🤖",
    title: "Multi-Pass AI",
    description: "Analyzes each module, reasons across modules, then synthesizes a unified document.",
  },
  {
    icon: "📥",
    title: "Download as Markdown",
    description: "Export the full analysis as a clean .md file — ready for your docs, notes, or portfolio.",
  },
  {
    icon: "⚡",
    title: "Caching Built-in",
    description: "Repeated analyses are instant — results are cached in-memory for 1 hour.",
  },
];

const HOW_IT_WORKS = [
  { step: "1", title: "Paste a GitHub URL", description: "Enter any public repository URL — no login or token needed." },
  { step: "2", title: "AI Analyzes the Code", description: "We fetch the source files, chunk them by module, and run multi-pass analysis via Gemini." },
  { step: "3", title: "Get Deep Documentation", description: "Receive a structured 11-section technical report covering architecture, logic, and more." },
];

export default function Home() {
  const [state, setState] = useState<AppState>("idle");
  const [currentStep, setCurrentStep] = useState<string>("");
  const [result, setResult] = useState<AnalysisData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [lastUrl, setLastUrl] = useState<string>("");

  /**
   * Parse an NDJSON stream line-by-line.
   * Uses fetch + getReader() (NOT EventSource) for maximum control.
   */
  const handleAnalyze = useCallback(async (url: string) => {
    // Abort any previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState("loading");
    setErrorMsg("");
    setResult(null);
    setCurrentStep("Connecting…");
    setLastUrl(url);

    // Partial results accumulator
    let partialMarkdown = "";
    let repoInfo: RepoInfo | null = null;
    let filesAnalyzed = 0;
    let chunks = 0;
    let hasShownResult = false;

    // Client-side timeout (5 min)
    const timeoutId = setTimeout(() => controller.abort(), 300_000);

    try {
      const res = await fetch(
        `/api/analyze/stream?url=${encodeURIComponent(url)}`,
        { signal: controller.signal }
      );

      if (!res.ok) {
        const text = await res.text();
        let msg: string;
        try {
          msg = JSON.parse(text).error;
        } catch {
          msg = `HTTP ${res.status}: ${text.slice(0, 200)}`;
        }
        throw new Error(msg);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let event;
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue; // skip malformed lines
          }

          switch (event.type) {
            case "heartbeat":
              // Keep-alive — no action needed
              break;

            case "progress":
              setCurrentStep(event.step ?? "");
              break;

            case "meta":
              repoInfo = event.repoInfo;
              filesAnalyzed = event.filesAnalyzed ?? 0;
              chunks = event.chunks ?? 0;
              break;

            case "partial":
              partialMarkdown = event.markdown ?? "";
              // Show result immediately on first partial
              if (repoInfo && !hasShownResult) {
                hasShownResult = true;
                setState("done");
                setResult({
                  markdown: partialMarkdown,
                  repoInfo,
                  filesAnalyzed,
                  chunks,
                  durationMs: 0,
                  cached: false,
                  complete: event.complete ?? false,
                  phase: event.phase ?? "",
                });
                setTimeout(() => {
                  resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 100);
              } else if (hasShownResult) {
                // Update existing result with newer markdown
                setResult((prev) =>
                  prev
                    ? { ...prev, markdown: partialMarkdown, complete: event.complete ?? false, phase: event.phase ?? "" }
                    : prev
                );
              }
              break;

            case "done":
              clearTimeout(timeoutId);
              if (repoInfo) {
                setResult({
                  markdown: event.markdown ?? partialMarkdown,
                  repoInfo,
                  filesAnalyzed,
                  chunks,
                  durationMs: event.durationMs ?? 0,
                  cached: event.cached ?? false,
                  complete: true,
                  phase: "complete",
                });
              }
              setState("done");
              break;

            case "error":
              throw new Error(event.message ?? "Analysis failed");
          }
        }
      }

      clearTimeout(timeoutId);

      // If we never got a result from the stream, something went wrong
      if (!hasShownResult && !result) {
        throw new Error("Stream ended without producing any output. Please try again.");
      }
    } catch (e) {
      clearTimeout(timeoutId);
      const msg = (e as Error).message ?? "Something went wrong.";

      // If we have partial results, show them instead of an error
      if (partialMarkdown && repoInfo) {
        setResult({
          markdown: partialMarkdown,
          repoInfo,
          filesAnalyzed,
          chunks,
          durationMs: 0,
          cached: false,
          complete: false,
          phase: "interrupted",
        });
        setState("done");
      } else {
        setErrorMsg(
          msg.includes("aborted")
            ? "Request timed out. The repository may be very large or the AI service is busy. Please try again."
            : msg
        );
        setState("error");
      }
    }
  }, [result]);

  const handleReset = () => {
    abortRef.current?.abort();
    setState("idle");
    setResult(null);
    setErrorMsg("");
    setCurrentStep("");
    setLastUrl("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRetry = useCallback(() => {
    if (lastUrl) handleAnalyze(lastUrl);
  }, [lastUrl, handleAnalyze]);

  return (
    <main className="min-h-screen bg-[#030712] text-gray-100">
      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-600/20 rounded-full blur-[120px]" />
          <div className="absolute -top-20 right-0 w-96 h-96 bg-purple-600/15 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-blue-600/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 pt-16 pb-12 flex flex-col items-center">
          {/* Logo and badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
              Open Source
            </span>
            <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
              Free to Use
            </span>
          </div>

          {/* Title */}
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-center mt-4 mb-5">
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-gradient">
              ghexplainer
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 text-center max-w-2xl leading-relaxed mb-8">
            AI-powered deep technical documentation for any public GitHub repository.
            Understand architecture, data flow, and key logic in minutes.
          </p>

          {/* ─── Input Form ─── */}
          {(state === "idle" || state === "error") && (
            <div className="w-full max-w-2xl">
              <RepoForm onSubmit={handleAnalyze} loading={false} />
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="w-full max-w-2xl mt-4 p-4 rounded-xl bg-red-950/50 border border-red-800/50 text-red-300 text-sm backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <span className="text-red-400 text-lg shrink-0">⚠️</span>
                <div>
                  <p className="font-medium text-red-200">Analysis failed</p>
                  <p className="mt-1 text-red-300/80">{errorMsg}</p>
                </div>
              </div>
            </div>
          )}

          {/* Loading */}
          {state === "loading" && <LoadingState step={currentStep} />}
        </div>
      </section>

      {/* ─── Result Section ─── */}
      {state === "done" && result && (
        <div ref={resultRef}>
          <AnalysisOutput
            markdown={result.markdown}
            repoInfo={result.repoInfo}
            filesAnalyzed={result.filesAnalyzed}
            chunks={result.chunks}
            durationMs={result.durationMs}
            cached={result.cached}
            complete={result.complete}
            phase={result.phase}
            onReset={handleReset}
            onRetry={handleRetry}
          />
        </div>
      )}

      {/* ─── How It Works (only show on idle) ─── */}
      {state === "idle" && (
        <>
          <section className="max-w-5xl mx-auto px-6 py-16">
            <h2 className="text-2xl font-bold text-center mb-2 text-white">How It Works</h2>
            <p className="text-gray-500 text-center text-sm mb-10">Three simple steps to deep code understanding</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {HOW_IT_WORKS.map((item) => (
                <div
                  key={item.step}
                  className="relative p-6 rounded-2xl bg-gray-900/50 border border-gray-800/50 backdrop-blur-sm group hover:border-indigo-500/30 transition-all duration-300"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-sm font-bold">
                      {item.step}
                    </span>
                    <h3 className="font-semibold text-white">{item.title}</h3>
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ─── Features Grid ─── */}
          <section className="max-w-5xl mx-auto px-6 py-16">
            <h2 className="text-2xl font-bold text-center mb-2 text-white">What You Get</h2>
            <p className="text-gray-500 text-center text-sm mb-10">Comprehensive analysis powered by Google Gemini</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="p-5 rounded-2xl bg-gray-900/30 border border-gray-800/30 hover:border-gray-700/50 transition-all duration-300 group"
                >
                  <span className="text-2xl mb-3 block">{feature.icon}</span>
                  <h3 className="font-semibold text-white text-sm mb-1.5">{feature.title}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ─── Documentation Sections Preview ─── */}
          <section className="max-w-5xl mx-auto px-6 py-16">
            <h2 className="text-2xl font-bold text-center mb-2 text-white">11-Section Deep Analysis</h2>
            <p className="text-gray-500 text-center text-sm mb-10">Every report covers these areas</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                "Repository Overview",
                "High-Level Architecture",
                "Key Components Deep Dive",
                "Data Flow Analysis",
                "Important Algorithms & Logic",
                "Configuration & Environment",
                "Error Handling & Edge Cases",
                "Testing Strategies",
                "Performance Considerations",
                "Security Analysis",
                "Interview Prep Notes",
              ].map((section, i) => (
                <div
                  key={section}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-900/20 border border-gray-800/20 text-sm"
                >
                  <span className="text-indigo-400/60 font-mono text-xs min-w-[1.5rem]">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-gray-300">{section}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ─── Footer ─── */}
      <footer className="border-t border-gray-800/50 mt-8">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔍</span>
            <span className="font-semibold text-sm text-gray-400">ghexplainer</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-600">
            <span>Public repos only</span>
            <span>•</span>
            <span>No code stored</span>
            <span>•</span>
            <a
              href="https://github.com/meet1785/ghexplainer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-indigo-400 transition-colors"
            >
              GitHub Repository ↗
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
