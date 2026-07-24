"use client";

import React from "react";
import type { LicenseReport } from "@/lib/license";
import { Scale, AlertTriangle, ShieldCheck, HelpCircle } from "lucide-react";

export function LicenseDashboard({ report }: { report: LicenseReport }) {
  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-jade bg-jade/10 border-jade/20";
    if (score >= 70) return "text-gold bg-gold/10 border-gold/20";
    return "text-coral bg-coral/10 border-coral/20";
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in fade-in">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Compliance Score */}
        <div className="p-5 rounded-2xl bg-surface border border-edge flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-faint" />
            <h3 className="text-xs font-mono text-faint uppercase tracking-wider">Compliance Score</h3>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-extrabold text-cream">{report.score}</span>
            <span className={`text-xs font-bold px-2 py-1 rounded-md border ${getScoreColor(report.score)}`}>
              / 100
            </span>
          </div>
        </div>

        {/* Project License */}
        <div className="p-5 rounded-2xl bg-surface border border-edge flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-4 h-4 text-faint" />
            <h3 className="text-xs font-mono text-faint uppercase tracking-wider">Project License</h3>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-xl font-bold text-cream">{report.projectLicense || "Unknown"}</span>
          </div>
        </div>

        {/* Risk Stats */}
        <div className="p-5 rounded-2xl bg-surface border border-edge flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-faint" />
            <h3 className="text-xs font-mono text-faint uppercase tracking-wider">Risk Levels</h3>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-dust">High Risk (e.g. GPL)</span>
              <span className={report.summary.highRiskCount > 0 ? "text-coral font-bold" : "text-faint"}>{report.summary.highRiskCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-dust">Medium Risk</span>
              <span className={report.summary.mediumRiskCount > 0 ? "text-gold font-bold" : "text-faint"}>{report.summary.mediumRiskCount}</span>
            </div>
          </div>
        </div>

        {/* Unknown Licenses */}
        <div className="p-5 rounded-2xl bg-surface border border-edge flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle className="w-4 h-4 text-faint" />
            <h3 className="text-xs font-mono text-faint uppercase tracking-wider">Unknown Licenses</h3>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-extrabold text-cream">{report.summary.unknownCount}</span>
          </div>
        </div>
      </div>

      {/* Findings */}
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-bold text-cream">License Findings</h3>
        {report.findings.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-edge/50 flex flex-col items-center justify-center text-center">
            <ShieldCheck className="w-8 h-8 text-jade/50 mb-3" />
            <p className="text-dust">No dependencies with identifiable licenses found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.findings.sort((a, b) => a.risk === 'high' ? -1 : 1).map((finding, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-surface border border-edge flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-cream">{finding.name}</span>
                  <span className="text-xs text-dust font-mono">{finding.filePath}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-faint">{finding.license}</span>
                  {finding.risk === 'high' && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-coral/10 text-coral border border-coral/20">High</span>}
                  {finding.risk === 'medium' && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gold/10 text-gold border border-gold/20">Med</span>}
                  {finding.risk === 'low' && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-jade/10 text-jade border border-jade/20">Low</span>}
                  {finding.risk === 'unknown' && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface border border-edge text-dust">Unk</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
