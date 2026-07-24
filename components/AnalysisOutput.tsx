"use client";

import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Download, Copy, Terminal, ExternalLink, RefreshCw, Layout, Menu, Share2, Search, X, MessageSquare, Code, Shield, Beaker, Layers, Webhook, Users } from "lucide-react";
import type { RepoInfo } from "@/lib/github";
import type { GraphifyResult } from "@/lib/graphify";
import type { SecurityReport } from "@/lib/security";
import { buildGraphifyGraph } from "@/lib/graphify";
import { auditRepositorySecurity } from "@/lib/security";
import type { TestIQReport } from "@/lib/testing";
import { analyzeTestingHealth } from "@/lib/testing";
import type { ArchLensReport } from "@/lib/archlens";
import type { RouteMapReport } from "@/lib/routemap";
import type { TeamPulseReport } from "@/lib/teampulse";
import type { CodeQualityReport } from "@/lib/codequality";
import type { LicenseReport } from "@/lib/license";
import type { DeployFlowReport } from "@/lib/deployflow";
import DependencyGraph from "./DependencyGraph";
import GraphifyVisualizer from "./GraphifyVisualizer";
import SecurityRadar from "./SecurityRadar";
import TestIQDashboard from "./TestIQDashboard";
import MetricsDashboard from "./MetricsDashboard";
import { ArchLensDashboard } from "./ArchLensDashboard";
import { RouteMapDashboard } from "./RouteMapDashboard";
import { TeamPulseDashboard } from "./TeamPulseDashboard";
import { CodeQualityDashboard } from "./CodeQualityDashboard";
import { LicenseDashboard } from "./LicenseDashboard";
import { DeployFlowDashboard } from "./DeployFlowDashboard";
import TableOfContents from "./TableOfContents";
import { computeProjectMetrics } from "@/lib/metrics";
import { formatDuration } from "@/lib/format";
import { searchSections, countTotalMatches } from "@/lib/search";

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
  /** File paths for dependency graph */
  filePaths?: string[];
  /** Module chunks for dependency graph */
  moduleChunks?: Array<{
    module: string;
    files: Array<{ path: string; content: string }>;
    totalChars: number;
    dependencies: string[];
  }>;
  /** File data for metrics dashboard */
  fileData?: Array<{ path: string; content: string }>;
  /** Graphify codebase knowledge graph */
  graphifyData?: GraphifyResult;
  /** Security audit report */
  securityReport?: SecurityReport;
  /** Testing health report */
  testReport?: TestIQReport;
  archReport?: ArchLensReport;
  apiReport?: RouteMapReport;
  teamReport?: TeamPulseReport;
  qualityReport?: CodeQualityReport;
  licenseReport?: LicenseReport;
  deployReport?: DeployFlowReport;
}

type TabType = 'report' | 'metrics' | 'graph' | 'graphify' | 'security' | 'testing' | 'arch' | 'api' | 'team' | 'quality' | 'license' | 'deploy';

function phaseLabel(phase: string): string {
  if (!phase || phase === "complete") return "";
  if (phase === "interrupted") return "Connection interrupted";
  if (phase === "partial-error") return "Partial results (some batches failed)";
  if (phase.startsWith("batch-")) return `Section batch ${phase.replace("batch-", "")} of 3`;
  return phase;
}

const TabButton = ({ id, icon: Icon, label, count, active, onClick, disabled }: any) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono transition-all duration-200 border-b-2 ${
      active
        ? "text-gold border-gold"
        : disabled
        ? "text-faint/30 border-transparent cursor-not-allowed"
        : "text-faint hover:text-cream border-transparent hover:border-edge"
    }`}
  >
    <Icon className="w-3.5 h-3.5" />
    <span>{label}</span>
    {count !== undefined && count > 0 && (
      <span className="ml-1 px-1 py-0.5 bg-surface rounded text-[10px]">{count}</span>
    )}
  </button>
);

function AnalysisOutput({
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
  filePaths,
  moduleChunks,
  fileData,
  graphifyData,
  securityReport,
  testReport,
  archReport,
  apiReport,
  teamReport,
  qualityReport,
  licenseReport,
  deployReport,
}: AnalysisOutputProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("report");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocusIdx, setSearchFocusIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isStreaming = !complete && phase !== "complete";
  const articleRef = useRef<HTMLElement>(null);

  const healthScore = useMemo(() => {
    if (!fileData || fileData.length === 0) return null;
    return computeProjectMetrics(fileData).healthScore;
  }, [fileData]);

  const resolvedGraphifyData = useMemo(() => {
    if (graphifyData) return graphifyData;
    if (fileData && fileData.length > 0) {
      return buildGraphifyGraph(fileData);
    }
    return null;
  }, [graphifyData, fileData]);

  const resolvedSecurityReport = useMemo(() => {
    if (securityReport) return securityReport;
    if (fileData && fileData.length > 0) {
      return auditRepositorySecurity(fileData);
    }
    return null;
  }, [securityReport, fileData]);

  const resolvedTestReport = useMemo(() => {
    if (testReport) return testReport;
    if (fileData && fileData.length > 0) {
      return analyzeTestingHealth(fileData);
    }
    return null;
  }, [testReport, fileData]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchSections(markdown, searchQuery);
  }, [markdown, searchQuery]);

  const totalMatches = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    return countTotalMatches(markdown, searchQuery);
  }, [markdown, searchQuery]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && activeTab === "report") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, searchOpen]);

  const jumpToResult = useCallback((anchor: string, heading: string) => {
    const byId = document.getElementById(anchor);
    if (byId) {
      byId.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (articleRef.current) {
      const h = Array.from(articleRef.current.querySelectorAll("h1,h2,h3,h4,h5,h6"))
        .find((el) => el.textContent?.trim() === heading);
      h?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleCopyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    downloadBlob(blob, `${repoInfo.repo}-analysis.md`);
  };

  const handleDownloadHTML = () => {
    import("@/lib/export").then(({ markdownToHtml }) => {
      const html = markdownToHtml(markdown, `${repoInfo.owner}/${repoInfo.repo}`);
      const blob = new Blob([html], { type: "text/html" });
      downloadBlob(blob, `${repoInfo.repo}-analysis.html`);
    });
  };

  return (
    <div className="w-full">
      {activeTab === "report" && (
        <TableOfContents containerRef={articleRef} isComplete={complete} />
      )}

      <div className="sticky top-0.5 z-20 bg-midnight/80 backdrop-blur-xl border-b border-edge">
        <div className="max-w-5xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3">
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

          <div className="hidden sm:flex items-center gap-3 text-[11px] text-faint font-mono">
            {repoInfo.stars > 0 && <span>⭐ {repoInfo.stars.toLocaleString()}</span>}
            {repoInfo.language && <span>· {repoInfo.language}</span>}
            <span>· {filesAnalyzed} files</span>
            <span>· {chunks} chunks</span>
            {durationMs > 0 && <span>· {formatDuration(durationMs)}</span>}
            {healthScore !== null && (
              <span
                className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold"
                style={{
                  color: healthScore >= 80 ? "#40c0a0" : healthScore >= 60 ? "#f0a040" : "#e06070",
                  backgroundColor: healthScore >= 80 ? "#40c0a010" : healthScore >= 60 ? "#f0a04010" : "#e0607010",
                  border: `1px solid ${healthScore >= 80 ? "#40c0a040" : healthScore >= 60 ? "#f0a04040" : "#e0607040"}`,
                }}
                title="Code Health Score"
              >
                ◎ {healthScore}/100
              </span>
            )}
          </div>

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
              .md
            </button>
            <button
              onClick={handleDownloadHTML}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-jade/80 text-midnight font-semibold hover:bg-jade transition-colors shadow-sm"
            >
              .html
            </button>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between border-t border-edge/40 overflow-x-auto">
          <div className="flex items-center gap-0">
            <TabButton id="report" icon={FileText} label="Report" active={activeTab === 'report'} onClick={() => setActiveTab('report')} />
            <TabButton id="metrics" icon={Layout} label="Metrics" active={activeTab === 'metrics'} disabled={!fileData?.length} onClick={() => setActiveTab('metrics')} />
            <TabButton id="graph" icon={Code} label="Graph" active={activeTab === 'graph'} disabled={!filePaths?.length && !moduleChunks?.length} onClick={() => setActiveTab('graph')} />
            <TabButton id="graphify" icon={Layers} label="Graphify" active={activeTab === 'graphify'} disabled={!resolvedGraphifyData} onClick={() => setActiveTab('graphify')} />
            <TabButton id="security" icon={Shield} label="Security" active={activeTab === 'security'} disabled={!resolvedSecurityReport} onClick={() => setActiveTab('security')} />
            <TabButton id="testing" icon={Beaker} label="TestIQ" count={resolvedTestReport?.untestedSourceFiles?.length} active={activeTab === 'testing'} disabled={!resolvedTestReport} onClick={() => setActiveTab('testing')} />
            <TabButton id="arch" icon={Layers} label="ArchLens" count={archReport?.totalDependencies} active={activeTab === 'arch'} disabled={!archReport} onClick={() => setActiveTab('arch')} />
            <TabButton id="api" icon={Webhook} label="RouteMap" count={apiReport?.totalRoutes} active={activeTab === 'api'} disabled={!apiReport} onClick={() => setActiveTab('api')} />
            <TabButton id="team" icon={Users} label="TeamPulse" active={activeTab === 'team'} disabled={!teamReport} onClick={() => setActiveTab('team')} />
            <TabButton id="quality" icon={FileText} label="CodeQuality" active={activeTab === 'quality'} disabled={!qualityReport} onClick={() => setActiveTab('quality')} />
            <TabButton id="license" icon={Shield} label="License" active={activeTab === 'license'} disabled={!licenseReport} onClick={() => setActiveTab('license')} />
            <TabButton id="deploy" icon={Terminal} label="DeployFlow" active={activeTab === 'deploy'} disabled={!deployReport} onClick={() => setActiveTab('deploy')} />
          </div>
          {activeTab === "report" && (
            <button
              onClick={() => {
                setSearchOpen((o) => !o);
                setSearchQuery("");
                setSearchFocusIdx(0);
                setTimeout(() => searchInputRef.current?.focus(), 50);
              }}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-mono transition-all duration-200 ${
                searchOpen
                  ? "text-gold bg-gold/10 border border-gold/30"
                  : "text-faint hover:text-cream"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          )}
        </div>

        {searchOpen && activeTab === "report" && (
          <div className="max-w-5xl mx-auto px-6 py-3 border-t border-edge/30 bg-midnight/60">
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-edge focus-within:border-gold/50 transition-colors">
                <Search className="w-3.5 h-3.5 text-faint shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchFocusIdx(0); }}
                  placeholder="Search in report…"
                  className="flex-1 bg-transparent text-sm text-cream placeholder-faint outline-none font-mono"
                />
              </div>
              <button
                onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                className="text-faint hover:text-coral transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

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

      <div className="max-w-4xl mx-auto px-6 pb-16">
        {activeTab === "report" && (
          <>
            {isStreaming && (
              <div className="mb-4 p-4 rounded-xl bg-gold/5 border border-gold/20 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-gold animate-pulse shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gold">Analysis in progress…</p>
                  {phaseLabel(phase) && <p className="text-xs text-gold/60 mt-0.5 font-mono">Step: {phaseLabel(phase)}</p>}
                </div>
              </div>
            )}
            <article ref={articleRef} className="prose-custom prose prose-invert prose-sm max-w-none p-8 sm:p-10 rounded-2xl bg-panel/50 border border-edge">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </article>
          </>
        )}

        {activeTab === "metrics" && fileData && <MetricsDashboard files={fileData} />}
        {activeTab === "graph" && <DependencyGraph markdown={markdown} filePaths={filePaths} modules={moduleChunks} />}
        {activeTab === "graphify" && resolvedGraphifyData && <GraphifyVisualizer graphData={resolvedGraphifyData} />}
        {activeTab === "security" && resolvedSecurityReport && <SecurityRadar report={resolvedSecurityReport} />}
        {activeTab === 'testing' && resolvedTestReport && <TestIQDashboard report={resolvedTestReport} />}
        {activeTab === 'arch' && archReport && <ArchLensDashboard report={archReport} />}
        {activeTab === 'api' && apiReport && <RouteMapDashboard report={apiReport} />}
        {activeTab === 'team' && teamReport && <TeamPulseDashboard report={teamReport} />}
        {activeTab === 'quality' && qualityReport && <CodeQualityDashboard report={qualityReport} />}
        {activeTab === 'license' && licenseReport && <LicenseDashboard report={licenseReport} />}
        {activeTab === 'deploy' && deployReport && <DeployFlowDashboard report={deployReport} />}

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

export default AnalysisOutput;
