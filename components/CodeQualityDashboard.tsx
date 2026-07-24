"use client";

import React, { useMemo } from "react";
import type { CodeQualityReport } from "@/lib/codequality";
import { AlertTriangle, Info, CheckCircle, Activity, Code2, Layers } from "lucide-react";

export function CodeQualityDashboard({ report }: { report: CodeQualityReport }) {
  const getGradeColor = (score: number) => {
    if (score >= 90) return "text-jade bg-jade/10 border-jade/20";
    if (score >= 70) return "text-gold bg-gold/10 border-gold/20";
    return "text-coral bg-coral/10 border-coral/20";
  };

  const getGrade = (score: number) => {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  };

  const highSeverity = report.smells.filter((s) => s.severity === "high");
  const mediumSeverity = report.smells.filter((s) => s.severity === "medium");

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in fade-in">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Score Card */}
        <div className="p-5 rounded-2xl bg-surface border border-edge flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-faint" />
            <h3 className="text-xs font-mono text-faint uppercase tracking-wider">Quality Score</h3>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-extrabold text-cream">{report.score}</span>
            <span className={`text-lg font-bold px-3 py-1 rounded-lg border ${getGradeColor(report.score)}`}>
              {getGrade(report.score)}
            </span>
          </div>
        </div>

        {/* Smells Stats */}
        <div className="p-5 rounded-2xl bg-surface border border-edge flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-faint" />
            <h3 className="text-xs font-mono text-faint uppercase tracking-wider">Code Smells</h3>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-dust">High Severity</span>
              <span className="text-coral font-bold">{report.summary.highSeverityCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-dust">Medium Severity</span>
              <span className="text-gold font-bold">{report.summary.mediumSeverityCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-dust">Low Severity</span>
              <span className="text-faint font-bold">{report.summary.lowSeverityCount}</span>
            </div>
          </div>
        </div>

        {/* Files Scanned */}
        <div className="p-5 rounded-2xl bg-surface border border-edge flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <Code2 className="w-4 h-4 text-faint" />
            <h3 className="text-xs font-mono text-faint uppercase tracking-wider">Files Scanned</h3>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-extrabold text-cream">{report.summary.totalFilesScanned}</span>
          </div>
        </div>
      </div>

      {/* Worst Offenders */}
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-bold text-cream">Code Smells Identified</h3>
        {report.smells.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-edge/50 flex flex-col items-center justify-center text-center">
            <CheckCircle className="w-8 h-8 text-jade/50 mb-3" />
            <p className="text-dust">No major code smells detected! Code is looking clean.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {[...highSeverity, ...mediumSeverity].map((smell, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-surface border border-edge flex flex-col gap-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {smell.severity === "high" ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-coral/10 text-coral border border-coral/20">High</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gold/10 text-gold border border-gold/20">Med</span>
                    )}
                    <span className="text-sm font-semibold text-cream">{smell.type === 'long-function' ? 'Long Function' : smell.type === 'deep-nesting' ? 'Deep Nesting' : 'Complex Logic'}</span>
                  </div>
                  <span className="text-xs font-mono text-faint bg-midnight px-2 py-1 rounded">{smell.filePath}:{smell.line}</span>
                </div>
                <p className="text-sm text-dust font-body">{smell.description}</p>
                {smell.snippet && (
                  <pre className="mt-2 p-3 rounded-lg bg-midnight border border-edge/50 text-xs font-mono text-faint overflow-x-auto">
                    {smell.snippet}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
