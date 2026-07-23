"use client";

import React, { useState, useMemo } from "react";
import { Beaker, AlertTriangle, FileCode, CheckCircle, Search, ChevronDown, ChevronRight, ShieldAlert, Code } from "lucide-react";
import type { TestIQReport, TestFileAnalysis, TestSmell } from "@/lib/testing";

interface TestIQDashboardProps {
  report: TestIQReport;
}

const getScoreColor = (score: number) => {
  if (score > 80) return "text-jade border-jade/50";
  if (score >= 50) return "text-gold border-gold/50";
  return "text-coral border-coral/50";
};

const getScoreBg = (score: number) => {
  if (score > 80) return "bg-jade/10";
  if (score >= 50) return "bg-gold/10";
  return "bg-coral/10";
};

const getSeverityColor = (severity?: string) => {
  switch (severity?.toLowerCase()) {
    case "high":
    case "critical":
      return "text-coral bg-coral/10 border-coral/20";
    case "medium":
      return "text-gold bg-gold/10 border-gold/20";
    case "low":
      return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    default:
      return "text-dust bg-surface/50 border-edge";
  }
};

const MetricCard = ({ title, value, icon: Icon, colorClass }: { title: string, value: number | string, icon: any, colorClass: string }) => (
  <div className={`p-4 rounded-xl border border-edge bg-surface/60 backdrop-blur-sm flex items-center gap-4 transition-all duration-300 hover:border-faint/50`}>
    <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
      <Icon className={`w-6 h-6 ${colorClass.split(' ')[0]}`} />
    </div>
    <div>
      <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-1">{title}</p>
      <p className="text-2xl font-bold text-cream font-mono">{value}</p>
    </div>
  </div>
);

const TestFileItem = ({ file, expanded, onToggle }: { file: TestFileAnalysis, expanded: boolean, onToggle: () => void }) => {
  const smellsCount = file.smells?.length || 0;
  const hasSmells = smellsCount > 0;

  return (
    <div className={`border border-edge rounded-lg bg-surface/40 backdrop-blur-sm overflow-hidden transition-all duration-200 ${expanded ? 'shadow-lg shadow-black/20 border-faint/50' : 'hover:border-faint/30'}`}>
      <div 
        className="p-3 md:p-4 cursor-pointer flex items-center justify-between gap-4"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <FileCode className="w-5 h-5 text-dust shrink-0" />
          <div className="truncate">
            <h4 className="text-cream font-medium text-sm truncate" title={file.path}>{file.path}</h4>
            <p className="text-xs text-faint mt-0.5">
              {hasSmells ? (
                <span className="text-coral flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {smellsCount} smell{smellsCount !== 1 ? 's' : ''} detected
                </span>
              ) : (
                <span className="text-jade flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Clean test file
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasSmells && (
            <span className="px-2 py-0.5 rounded-full bg-coral/10 border border-coral/20 text-coral text-[10px] font-bold font-mono">
              {smellsCount}
            </span>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-dust" /> : <ChevronRight className="w-4 h-4 text-dust" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-edge pt-4 bg-midnight/30">
          {!hasSmells ? (
            <p className="text-sm text-dust flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-jade" /> No test smells found in this file. Great job!
            </p>
          ) : (
            <div className="space-y-4">
              {file.smells.map((smell, idx) => (
                <div key={idx} className="bg-surface/50 border border-edge rounded-md p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h5 className="text-sm font-medium text-cream flex items-center gap-2">
                        {smell.type}
                      </h5>
                    </div>
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wider shrink-0 ${getSeverityColor("medium")}`}>
                      issue
                    </span>
                  </div>
                  
                  {smell.snippet && (
                    <div className="mt-3 bg-midnight border border-edge rounded p-2 overflow-x-auto">
                      <div className="flex items-center gap-2 mb-1.5 px-1">
                        <Code className="w-3 h-3 text-faint" />
                        <span className="text-[10px] text-faint font-mono">
                          Line {smell.line || '?'}
                        </span>
                      </div>
                      <pre className="text-xs font-mono text-coral/90 whitespace-pre-wrap break-all">
                        <code>{smell.snippet}</code>
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const TestIQDashboard: React.FC<TestIQDashboardProps> = ({ report }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const totalTestFiles = report.totalTestFiles ?? report.testFiles?.length ?? 0;
  const totalSuites = report.totalSuites ?? 0;
  const totalCases = report.totalCases ?? 0;
  const totalSmells = report.totalSmells ?? report.testFiles?.reduce((acc, f) => acc + (f.smells?.length || 0), 0) ?? 0;

  const scoreColor = getScoreColor(report.score);
  const scoreBg = getScoreBg(report.score);

  const filteredFiles = useMemo(() => {
    if (!report.testFiles) return [];
    if (!searchQuery) return report.testFiles;
    const q = searchQuery.toLowerCase();
    return report.testFiles.filter(f => f.path.toLowerCase().includes(q));
  }, [report.testFiles, searchQuery]);

  // Sort files: those with smells first, then by path
  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      const aSmells = a.smells?.length || 0;
      const bSmells = b.smells?.length || 0;
      if (aSmells !== bSmells) return bSmells - aSmells;
      return a.path.localeCompare(b.path);
    });
  }, [filteredFiles]);

  const untestedFiles = report.untestedSourceFiles || [];

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      {/* Header / Summary Section */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Score Gauge */}
        <div className="lg:col-span-1 bg-surface/60 backdrop-blur-sm border border-edge rounded-2xl p-6 flex flex-col items-center justify-center">
          <div className={`relative w-32 h-32 rounded-full border-4 flex flex-col items-center justify-center mb-4 transition-colors duration-500 ${scoreColor} ${scoreBg}`}>
            <span className="text-4xl font-black font-mono">{report.score}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold opacity-80 mt-1">Score</span>
            
            {/* Simple circular progress illusion */}
            <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
              <circle 
                cx="50" cy="50" r="48" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="4" 
                strokeDasharray={`${(report.score / 100) * 301.59} 301.59`}
                className="opacity-50 transition-all duration-1000 ease-out"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-cream text-center uppercase tracking-wider">Test IQ</h2>
          <p className="text-xs text-faint text-center mt-1">Overall testing health</p>
        </div>

        {/* Metric Cards */}
        <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard 
            title="Test Files" 
            value={totalTestFiles} 
            icon={FileCode} 
            colorClass="text-blue-400 bg-blue-500/10" 
          />
          <MetricCard 
            title="Test Suites" 
            value={totalSuites} 
            icon={Beaker} 
            colorClass="text-purple-400 bg-purple-500/10" 
          />
          <MetricCard 
            title="Test Cases" 
            value={totalCases} 
            icon={CheckCircle} 
            colorClass="text-jade bg-jade/10" 
          />
          <MetricCard 
            title="Test Smells" 
            value={totalSmells} 
            icon={AlertTriangle} 
            colorClass={totalSmells > 0 ? "text-coral bg-coral/10" : "text-dust bg-surface"} 
          />
        </div>
      </div>

      {/* Main Layout: Two Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Test Files & Smells */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-cream flex items-center gap-2">
              <Beaker className="w-5 h-5 text-dust" /> Test Analysis
            </h3>
            
            <div className="relative w-48 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dust" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface/50 border border-edge rounded-full py-1.5 pl-9 pr-4 text-sm text-cream placeholder:text-faint focus:outline-none focus:border-faint focus:ring-1 focus:ring-faint transition-all"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 min-h-[400px]">
            {sortedFiles.length > 0 ? (
              sortedFiles.map((file, idx) => (
                <TestFileItem 
                  key={file.path || idx}
                  file={file}
                  expanded={expandedFile === file.path}
                  onToggle={() => setExpandedFile(expandedFile === file.path ? null : file.path)}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-dust border border-dashed border-edge rounded-xl bg-surface/20">
                <FileCode className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">No test files match your search.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Untested Modules */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-cream flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-coral/80" /> Untested Modules
          </h3>
          
          <div className="bg-surface/40 backdrop-blur-sm border border-edge rounded-xl overflow-hidden flex flex-col h-full max-h-[600px]">
            <div className="p-4 border-b border-edge bg-surface/60">
              <p className="text-xs text-dust">
                Found <span className="font-bold text-cream">{untestedFiles.length}</span> source files without corresponding test coverage.
              </p>
            </div>
            
            <div className="overflow-y-auto flex-1 p-3 space-y-2 custom-scrollbar">
              {untestedFiles.length > 0 ? (
                untestedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-surface/50 border border-edge/50 hover:border-coral/30 transition-colors group">
                    <FileCode className="w-4 h-4 text-dust group-hover:text-coral/70 shrink-0 mt-0.5" />
                    <span className="text-sm text-cream font-mono break-all">{file}</span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-dust">
                  <CheckCircle className="w-8 h-8 mb-2 text-jade/50" />
                  <p className="text-sm text-center">All modules have tests!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestIQDashboard;
