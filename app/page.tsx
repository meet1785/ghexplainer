"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import RepoForm from "@/components/RepoForm";
import type { AnalysisMode } from "@/components/RepoForm";
import LoadingState from "@/components/LoadingState";
import Logo from "@/components/Logo";
import AnalysisOutput from "@/components/AnalysisOutput";
import HistoryPanel from "@/components/HistoryPanel";
import DemoShowcase from "@/components/DemoShowcase";
import ChatPanel from "@/components/ChatPanel";
import CommandPalette from "@/components/CommandPalette";
import { type CommandAction } from "@/components/CommandPalette";
import { saveAnalysis, type SavedAnalysis } from "@/lib/history";
import type { RepoInfo } from "@/lib/github";
import { buildShareUrl, parseRepoFromSearchParams } from "@/lib/share";

type AppState = "idle" | "loading" | "done" | "error";

interface ModuleChunk {
  module: string;
  files: Array<{ path: string; content: string }>;
  totalChars: number;
  dependencies: string[];
}

interface AnalysisData {
  markdown: string;
  repoInfo: RepoInfo;
  filesAnalyzed: number;
  chunks: number;
  durationMs: number;
  cached: boolean;
  complete: boolean;
  phase: string;
  filePaths?: string[];
  moduleChunks?: ModuleChunk[];
  fileData?: Array<{ path: string; content: string }>;
}

const HOW_IT_WORKS = [
  { step: "01", title: "Paste a GitHub URL", description: "Enter any public repository URL — no login or token needed." },
  { step: "02", title: "AI Analyzes the Code", description: "We fetch the source files, chunk them by module, and run multi-pass analysis via Gemini." },
  { step: "03", title: "Get Deep Documentation", description: "Receive a structured 11-section technical report covering architecture, logic, and more." },
];

const FEATURES = [
  { icon: "◆", title: "Architecture Analysis", description: "Identifies design patterns, component relationships, and system architecture from source code." },
  { icon: "◈", title: "Data Flow Tracing", description: "Maps how data moves through the codebase — from input to storage to output." },
  { icon: "▣", title: "Smart Chunking", description: "Splits large repos into logical modules with dependency analysis for thorough coverage." },
  { icon: "◎", title: "Multi-Pass AI", description: "Analyzes each module, reasons across modules, then synthesizes a unified document." },
  { icon: "▿", title: "Export as Markdown", description: "Export the full analysis as a clean .md file — ready for your docs, notes, or portfolio." },
  { icon: "⟐", title: "Caching Built-in", description: "Repeated analyses are instant — results are cached in-memory for 1 hour." },
];

export default function Home() {
  const [state, setState] = useState<AppState>("idle");
  const [currentStep, setCurrentStep] = useState<string>("");
  const [result, setResult] = useState<AnalysisData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [lastUrl, setLastUrl] = useState<string>("");
  const [lastMode, setLastMode] = useState<AnalysisMode>("stream");
  const [historyKey, setHistoryKey] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);

  /* ── Deep-link: auto-analyze from ?repo= query param on first mount ── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const repoUrl = parseRepoFromSearchParams(
      new URLSearchParams(window.location.search)
    );
    if (repoUrl) {
      // Default to stream mode for deep-linked analyses
      handleAnalyze(repoUrl);
    }
    // Only run once on mount — handleAnalyze identity is stable (useCallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Handlers (logic preserved from original) ── */

  const saveToHistory = useCallback((data: AnalysisData, url: string) => {
    try {
      saveAnalysis({
        url,
        repoSlug: `${data.repoInfo.owner}/${data.repoInfo.repo}`,
        description: data.repoInfo.description ?? "",
        language: data.repoInfo.language,
        stars: data.repoInfo.stars,
        markdown: data.markdown,
        complete: data.complete,
        filesAnalyzed: data.filesAnalyzed,
        chunks: data.chunks,
        durationMs: data.durationMs,
      });
    } catch {
      // Silently fail
    }
  }, []);

  const handleLoadHistory = useCallback((entry: SavedAnalysis) => {
    const data: AnalysisData = {
      markdown: entry.markdown,
      repoInfo: {
        owner: entry.repoSlug.split("/")[0],
        repo: entry.repoSlug.split("/")[1],
        defaultBranch: "main",
        description: entry.description,
        stars: entry.stars,
        language: entry.language,
        topics: [],
        createdAt: "",
        updatedAt: "",
      },
      filesAnalyzed: entry.filesAnalyzed,
      chunks: entry.chunks,
      durationMs: entry.durationMs,
      cached: true,
      complete: entry.complete,
      phase: "complete",
    };
    setResult(data);
    setLastUrl(entry.url);
    setState("done");
    setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, []);

  const handleAnalyzeComplete = useCallback(async (url: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState("loading");
    setErrorMsg("");
    setResult(null);
    setLastUrl(url);
    setLastMode("complete");

    const STEP_MESSAGES = [
      "Parsing repository URL…",
      "Fetching metadata from GitHub…",
      "Walking file tree…",
      "Reading source files…",
      "Chunking code by module…",
      "Analyzing modules with Gemini…",
      "Cross-module reasoning…",
      "Synthesizing final documentation…",
    ];

    let stepIdx = 0;
    setCurrentStep(STEP_MESSAGES[0]);
    const stepInterval = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, STEP_MESSAGES.length - 1);
      setCurrentStep(STEP_MESSAGES[stepIdx]);
    }, 12_000);

    const timeoutId = setTimeout(() => controller.abort(), 300_000);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      clearInterval(stepInterval);

      if (!res.ok) {
        const text = await res.text();
        let msg: string;
        try { msg = JSON.parse(text).error; } catch { msg = `HTTP ${res.status}: ${text.slice(0, 200)}`; }
        throw new Error(msg);
      }

      const data = await res.json();
      const analysisData: AnalysisData = {
        markdown: data.markdown,
        repoInfo: data.repoInfo,
        filesAnalyzed: data.filesAnalyzed,
        chunks: data.chunks,
        durationMs: data.durationMs,
        cached: data.cached,
        complete: true,
        phase: "complete",
      };
      setResult(analysisData);
      setState("done");
      // Update the address bar so the current URL is shareable
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", buildShareUrl(url));
      }
      saveToHistory(analysisData, url);
      setHistoryKey(k => k + 1);
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (e) {
      clearTimeout(timeoutId);
      clearInterval(stepInterval);
      const msg = (e as Error).message ?? "Something went wrong.";
      setErrorMsg(
        msg.includes("aborted")
          ? "Request timed out. The repository may be very large. Try Stream mode for partial results, or try again later."
          : msg
      );
      setState("error");
    }
  }, [saveToHistory]);

  const handleAnalyze = useCallback(async (url: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState("loading");
    setErrorMsg("");
    setResult(null);
    setCurrentStep("Connecting…");
    setLastUrl(url);
    setLastMode("stream");

    let partialMarkdown = "";
    let repoInfo: RepoInfo | null = null;
    let filesAnalyzed = 0;
    let chunks = 0;
    let hasShownResult = false;
    let filePaths: string[] | undefined;
    let moduleChunks: ModuleChunk[] | undefined;
    let fileData: Array<{ path: string; content: string }> | undefined;

    const timeoutId = setTimeout(() => controller.abort(), 300_000);

    try {
      const res = await fetch(
        `/api/analyze/stream?url=${encodeURIComponent(url)}`,
        { signal: controller.signal }
      );

      if (!res.ok) {
        const text = await res.text();
        let msg: string;
        try { msg = JSON.parse(text).error; } catch { msg = `HTTP ${res.status}: ${text.slice(0, 200)}`; }
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

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let event;
          try { event = JSON.parse(trimmed); } catch { continue; }

          switch (event.type) {
            case "heartbeat":
              break;
            case "progress":
              setCurrentStep(event.step ?? "");
              break;
            case "meta":
              repoInfo = event.repoInfo;
              filesAnalyzed = event.filesAnalyzed ?? 0;
              chunks = event.chunks ?? 0;
              filePaths = event.filePaths;
              moduleChunks = event.moduleChunks;
              fileData = event.fileData;
              break;
            case "partial":
              partialMarkdown = event.markdown ?? "";
              if (repoInfo && !hasShownResult) {
                hasShownResult = true;
                setState("done");
                const partialData: AnalysisData = {
                  markdown: partialMarkdown,
                  repoInfo,
                  filesAnalyzed,
                  chunks,
                  durationMs: 0,
                  cached: false,
                  complete: event.complete ?? false,
                  phase: event.phase ?? "",
                  filePaths,
                  moduleChunks,
                  fileData,
                };
                setResult(partialData);
                saveToHistory(partialData, url);
                setHistoryKey(k => k + 1);
                setTimeout(() => {
                  resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 100);
              } else if (hasShownResult) {
                const updatedData: AnalysisData = {
                  markdown: partialMarkdown,
                  repoInfo: repoInfo!,
                  filesAnalyzed,
                  chunks,
                  durationMs: 0,
                  cached: false,
                  complete: event.complete ?? false,
                  phase: event.phase ?? "",
                  filePaths,
                  moduleChunks,
                  fileData,
                };
                setResult(updatedData);
                saveToHistory(updatedData, url);
                setHistoryKey(k => k + 1);
              }
              break;
            case "done":
              clearTimeout(timeoutId);
              if (repoInfo) {
                const doneData: AnalysisData = {
                  markdown: event.markdown ?? partialMarkdown,
                  repoInfo,
                  filesAnalyzed,
                  chunks,
                  durationMs: event.durationMs ?? 0,
                  cached: event.cached ?? false,
                  complete: true,
                  phase: "complete",
                  filePaths,
                  moduleChunks,
                  fileData,
                };
                setResult(doneData);
                // Update the address bar so the current URL is shareable
                if (typeof window !== "undefined") {
                  window.history.replaceState({}, "", buildShareUrl(url));
                }
                saveToHistory(doneData, url);
                setHistoryKey(k => k + 1);
              }
              setState("done");
              break;
            case "error":
              throw new Error(event.message ?? "Analysis failed");
          }
        }
      }

      clearTimeout(timeoutId);

      if (!hasShownResult) {
        throw new Error("Stream ended without producing any output. Please try again.");
      }
    } catch (e) {
      clearTimeout(timeoutId);
      const msg = (e as Error).message ?? "Something went wrong.";

      if (partialMarkdown && repoInfo) {
        const partialData: AnalysisData = {
          markdown: partialMarkdown,
          repoInfo,
          filesAnalyzed,
          chunks,
          durationMs: 0,
          cached: false,
          complete: false,
          phase: "interrupted",
          filePaths,
          moduleChunks,
          fileData,
        };
        setResult(partialData);
        saveToHistory(partialData, url);
        setHistoryKey(k => k + 1);
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
  }, [saveToHistory]);

  const handleReset = () => {
    abortRef.current?.abort();
    setState("idle");
    setResult(null);
    setErrorMsg("");
    setCurrentStep("");
    setLastUrl("");
    setLastMode("stream");
    // Clear the ?repo= param so the clean home page URL is shown
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRetry = useCallback(() => {
    if (lastUrl) {
      if (lastMode === "complete") handleAnalyzeComplete(lastUrl);
      else handleAnalyze(lastUrl);
    }
  }, [lastUrl, lastMode, handleAnalyze, handleAnalyzeComplete]);

  const handleSubmit = useCallback((url: string, mode: AnalysisMode) => {
    if (mode === "complete") handleAnalyzeComplete(url);
    else handleAnalyze(url);
  }, [handleAnalyze, handleAnalyzeComplete]);

  /* ── Command Palette actions ── */
  const commands: CommandAction[] = useMemo(() => {
    const cmds: CommandAction[] = [
      {
        id: "home",
        label: "Go to Home",
        description: "Reset and return to the landing page",
        category: "Navigation",
        icon: "⌂",
        shortcut: "⌘H",
        action: handleReset,
      },
      {
        id: "scroll-top",
        label: "Scroll to Top",
        description: "Jump to the top of the page",
        category: "Navigation",
        icon: "↑",
        action: () => window.scrollTo({ top: 0, behavior: "smooth" }),
      },
      {
        id: "toggle-chat",
        label: chatOpen ? "Close Chat Panel" : "Open Chat Panel",
        description: "Ask follow-up questions about the analyzed repo",
        category: "View",
        icon: "💬",
        shortcut: "⌘J",
        action: () => setChatOpen(o => !o),
        disabled: state !== "done",
      },
    ];

    if (state === "done" && result) {
      cmds.push(
        {
          id: "copy-md",
          label: "Copy Markdown",
          description: "Copy analysis output to clipboard",
          category: "Export",
          icon: "📋",
          shortcut: "⌘C",
          action: () => navigator.clipboard.writeText(result.markdown),
        },
        {
          id: "download-md",
          label: "Download .md File",
          description: "Save analysis as a Markdown file",
          category: "Export",
          icon: "↓",
          action: () => {
            const blob = new Blob([result.markdown], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${result.repoInfo.repo}-analysis.md`;
            a.click();
            URL.revokeObjectURL(url);
          },
        },
        {
          id: "retry",
          label: "Retry Analysis",
          description: "Re-run the analysis on the same repository",
          category: "Analysis",
          icon: "↻",
          action: handleRetry,
        },
        {
          id: "copy-share-link",
          label: "Copy Shareable Link",
          description: "Copy a direct link to this repository analysis",
          category: "Share",
          icon: "🔗",
          action: () => {
            const shareUrl = buildShareUrl(lastUrl);
            navigator.clipboard.writeText(shareUrl);
          },
        },
      );
    }

    cmds.push(
      {
        id: "github",
        label: "View on GitHub",
        description: "Open the ghexplainer repository",
        category: "Help",
        icon: "◆",
        action: () => window.open("https://github.com/meet1785/ghexplainer", "_blank"),
      },
    );

    return cmds;
  }, [state, result, chatOpen, handleReset, handleRetry, lastUrl]);

  /* ── Cmd+J shortcut for chat ── */
  // Handled via useEffect
  // (CommandPalette handles Cmd+K internally)

  /* ── Render ── */

  return (
    <main className="min-h-screen relative">
      {/* Fixed dot grid */}
      <div className="fixed inset-0 bg-dots pointer-events-none" />

      {/* ═══ Hero ═══ */}
      <section className="relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-48 -left-32 w-[600px] h-[600px] bg-gold/5 rounded-full blur-[200px] float-blob" />
          <div className="absolute -top-24 -right-16 w-[500px] h-[500px] bg-jade/5 rounded-full blur-[180px] float-blob-alt" />
          <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-coral/5 rounded-full blur-[150px] float-blob" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-14 flex flex-col items-center z-10">
          {/* Badges */}
          <div className="flex items-center gap-2.5 mb-5 reveal">
            <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] bg-jade/10 text-jade border border-jade/20 rounded-full font-mono">
              Open Source
            </span>
            <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] bg-gold/10 text-gold border border-gold/20 rounded-full font-mono">
              Free to Use
            </span>
          </div>

          {/* Logo + Title */}
          <div className="mb-2 reveal reveal-d1 pulse-gold rounded-2xl">
            <Logo size={56} />
          </div>
          <h1 className="text-6xl sm:text-8xl font-extrabold tracking-tight text-center mt-1 mb-6 reveal reveal-d2">
            <span
              className="bg-gradient-to-r from-gold via-coral to-jade bg-clip-text text-transparent animate-gradient"
            >
              ghexplainer
            </span>
          </h1>

          {/* Tagline */}
          <p className="font-body italic text-lg sm:text-xl text-dust text-center max-w-2xl leading-relaxed mb-10 reveal reveal-d3">
            AI-powered deep technical documentation for any public GitHub repository.
            Understand architecture, data flow, and key logic in minutes.
          </p>

          {/* Form */}
          {(state === "idle" || state === "error") && (
            <div className="w-full max-w-2xl reveal reveal-d4">
              <RepoForm onSubmit={handleSubmit} loading={false} />
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="w-full max-w-2xl mt-4 p-4 rounded-xl bg-coral/10 border border-coral/30 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <span className="text-coral text-lg shrink-0">⚠</span>
                <div>
                  <p className="font-semibold text-sm text-coral">Analysis failed</p>
                  <p className="mt-1 text-sm text-coral/80 font-body">{errorMsg}</p>
                </div>
              </div>
            </div>
          )}

          {/* Loading */}
          {state === "loading" && <LoadingState step={currentStep} />}
        </div>
      </section>

      {/* ═══ Result ═══ */}
      {state === "done" && result && (
        <div ref={resultRef} className="relative z-10">
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
            filePaths={result.filePaths}
            moduleChunks={result.moduleChunks}
            fileData={result.fileData}
          />
        </div>
      )}

      {/* ═══ Idle Sections ═══ */}
      {state === "idle" && (
        <div className="relative z-10">
          {/* Demo Showcase — the star of the show */}
          <section className="py-20 border-t border-edge/30">
            <DemoShowcase />
          </section>

          {/* User&apos;s Previous Analyses */}
          <div className="max-w-5xl mx-auto px-6 py-8">
            <HistoryPanel onLoad={handleLoadHistory} refreshKey={historyKey} />
          </div>

          {/* How It Works */}
          <section className="max-w-5xl mx-auto px-6 py-20 border-t border-edge/30">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold/60 text-center mb-3">
              Process
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12 text-cream">
              How It Works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {HOW_IT_WORKS.map((item) => (
                <div
                  key={item.step}
                  className="relative p-6 rounded-2xl bg-surface/60 border border-edge/50 group hover:border-gold/30 transition-all duration-500"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <span className="font-mono text-4xl font-bold text-gold/15 group-hover:text-gold/30 transition-colors duration-500 select-none">
                      {item.step}
                    </span>
                    <h3 className="font-semibold text-cream text-base">{item.title}</h3>
                  </div>
                  <p className="font-body text-dust text-[15px] leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Features */}
          <section className="max-w-5xl mx-auto px-6 py-20 border-t border-edge/30">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-jade/60 text-center mb-3">
              Capabilities
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12 text-cream">
              What You Get
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="p-5 rounded-2xl bg-surface/40 border border-edge/40 hover:border-edge-hover transition-all duration-300 group"
                >
                  <span className="text-gold/50 text-xl mb-3 block group-hover:text-gold/80 transition-colors duration-300">
                    {feature.icon}
                  </span>
                  <h3 className="font-semibold text-cream text-sm mb-1.5">{feature.title}</h3>
                  <p className="font-body text-dust text-sm leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 11 Sections */}
          <section className="max-w-5xl mx-auto px-6 py-20 border-t border-edge/30">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-coral/60 text-center mb-3">
              Coverage
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12 text-cream">
              11-Section Deep Analysis
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                "Repository Overview",
                "Architecture & Design",
                "Module Breakdown",
                "Core Execution Flow",
                "API Surface",
                "Key Business Logic",
                "Data Flow & State Management",
                "Configuration & Environment",
                "Dependencies & Tech Stack",
                "Strengths & Weaknesses",
                "Quick Reference",
              ].map((section, i) => (
                <div
                  key={section}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface/25 border border-edge/25 text-sm group hover:border-gold/20 transition-all duration-300"
                >
                  <span className="font-mono text-xs text-gold/30 group-hover:text-gold/60 transition-colors min-w-[1.5rem]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-cream-dim font-body">{section}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ═══ Footer ═══ */}
      <footer className="relative z-10 border-t border-edge/30 mt-8">
        <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Logo size={24} />
            <span className="font-bold text-sm text-gold/70">ghexplainer</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-faint font-mono">
            <span>Public repos only</span>
            <span className="text-edge">|</span>
            <span>No code stored</span>
            <span className="text-edge">|</span>
            <a
              href="https://github.com/meet1785/ghexplainer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-dust hover:text-gold transition-colors duration-300"
            >
              GitHub →
            </a>
          </div>
        </div>
      </footer>

      {/* ═══ Command Palette (Cmd+K) ═══ */}
      <CommandPalette commands={commands} />

      {/* ═══ AI Chat Panel ═══ */}
      {state === "done" && result && (
        <ChatPanel
          analysisMarkdown={result.markdown}
          repoSlug={`${result.repoInfo.owner}/${result.repoInfo.repo}`}
          isOpen={chatOpen}
          onToggle={() => setChatOpen(o => !o)}
        />
      )}
    </main>
  );
}
