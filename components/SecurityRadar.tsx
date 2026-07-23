"use client";

import React, { useState, useMemo, useCallback } from 'react';
import type { SecurityReport, SecurityFinding, SeverityLevel, VulnerabilityCategory } from "@/lib/security";
import { toSecurityMarkdown, toSecurityJSON } from "@/lib/security";

interface SecurityRadarProps {
  report: SecurityReport;
}

const getSeverityColors = (severity: SeverityLevel) => {
  switch (severity) {
    case 'critical': return 'bg-coral/10 text-coral border-coral/30';
    case 'high': return 'bg-gold/10 text-gold border-gold/30';
    case 'medium': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
    case 'low': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    default: return 'bg-surface text-dust border-edge';
  }
};

const getGradeColors = (score: number) => {
  if (score >= 90) return 'text-jade border-jade/50 shadow-[0_0_15px_rgba(45,212,191,0.3)]';
  if (score >= 80) return 'text-jade border-jade/40 shadow-[0_0_15px_rgba(45,212,191,0.2)]';
  if (score >= 70) return 'text-gold border-gold/50 shadow-[0_0_15px_rgba(250,204,21,0.2)]';
  if (score >= 60) return 'text-orange-500 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.2)]';
  return 'text-coral border-coral/50 shadow-[0_0_15px_rgba(248,113,113,0.3)]';
};

const FindingItem = React.memo(({ finding, expanded, onToggle }: { finding: SecurityFinding, expanded: boolean, onToggle: () => void }) => {
  const sevColors = getSeverityColors(finding.severity);

  return (
    <div className={`border border-edge rounded-lg bg-surface/50 backdrop-blur-sm overflow-hidden transition-all duration-200 ${expanded ? 'shadow-md shadow-black/20' : 'hover:border-faint'}`}>
      <div 
        className="p-4 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
        onClick={onToggle}
      >
        <div className="flex items-start gap-3 flex-1">
          <span className={`px-2 py-1 text-xs font-semibold uppercase tracking-wider rounded-md border ${sevColors} mt-0.5`}>
            {finding.severity}
          </span>
          <div>
            <h4 className="text-cream font-medium text-base mb-1">{finding.title}</h4>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dust font-mono">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                {finding.filePath}:{finding.line}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-midnight border border-edge text-xs">
                {finding.ruleId}
              </span>
              {finding.cwe && (
                <span className="px-1.5 py-0.5 rounded bg-midnight border border-edge text-xs">
                  {finding.cwe}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-dust">
          <svg className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-edge pt-4 bg-midnight/30">
          <p className="text-dust text-sm mb-4">{finding.description}</p>
          
          {finding.snippet && (
            <div className="mb-4">
              <h5 className="text-xs font-semibold text-faint uppercase mb-2">Vulnerable Code</h5>
              <div className="bg-midnight border border-edge rounded-md p-3 overflow-x-auto">
                <pre className="text-sm font-mono text-coral/90">
                  <code>{finding.snippet}</code>
                </pre>
              </div>
            </div>
          )}

          <div className="mb-4">
            <h5 className="text-xs font-semibold text-faint uppercase mb-2">Remediation Guidance</h5>
            <p className="text-sm text-cream/90">{finding.remediation}</p>
          </div>

          {finding.snippet && (
            <div className="mb-2">
              <h5 className="text-xs font-semibold text-faint uppercase mb-2">Code Snippet</h5>
              <div className="bg-midnight border border-edge rounded-md p-3 overflow-x-auto relative group">
                <pre className="text-sm font-mono text-jade/90">
                  <code>{finding.snippet}</code>
                </pre>
                <button 
                  className="absolute top-2 right-2 p-1.5 bg-surface border border-edge rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-faint/10 text-dust hover:text-cream"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(finding.snippet!);
                  }}
                  title="Copy code snippet"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

FindingItem.displayName = 'FindingItem';

export const SecurityRadar: React.FC<SecurityRadarProps> = React.memo(({ report }) => {
  const [filterCategory, setFilterCategory] = useState<VulnerabilityCategory | 'all'>('all');
  const [filterSeverity, setFilterSeverity] = useState<SeverityLevel | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredFindings = useMemo(() => {
    return report.findings.filter(f => {
      const matchCat = filterCategory === 'all' || f.category === filterCategory;
      const matchSev = filterSeverity === 'all' || f.severity === filterSeverity;
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || 
                          f.title.toLowerCase().includes(q) || 
                          f.filePath.toLowerCase().includes(q) || 
                          f.ruleId.toLowerCase().includes(q);
      
      return matchCat && matchSev && matchSearch;
    }).sort((a, b) => {
      const sevMap: Record<SeverityLevel, number> = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1, 'info': 0 };
      return (sevMap[b.severity] || 0) - (sevMap[a.severity] || 0);
    });
  }, [report.findings, filterCategory, filterSeverity, searchQuery]);

  const handleExportMarkdown = useCallback(() => {
    try {
      const md = toSecurityMarkdown(report);
      navigator.clipboard.writeText(md);
      alert('Markdown report copied to clipboard');
    } catch(e) {
      console.error(e);
    }
  }, [report]);

  const handleExportJSON = useCallback(() => {
    try {
      const json = toSecurityJSON(report);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `security-report-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch(e) {
      console.error(e);
    }
  }, [report]);

  const gradeColors = getGradeColors(report.score);

  return (
    <div className="flex flex-col gap-6 bg-midnight text-cream p-4 md:p-6 rounded-xl border border-edge shadow-xl">
      {/* Header & Security Score Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 flex flex-col items-center justify-center p-6 bg-surface/40 rounded-xl border border-edge backdrop-blur-sm">
          <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center flex-col mb-4 ${gradeColors}`}>
            <span className="text-4xl font-bold">{report.score}</span>
            <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Grade {report.grade}</span>
          </div>
          <h2 className="text-lg font-medium text-cream text-center">Security Score</h2>
        </div>
        
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface/40 rounded-xl p-4 border border-edge flex flex-col justify-center">
            <span className="text-coral text-2xl font-bold mb-1">{report.summary.criticalCount}</span>
            <span className="text-xs text-dust uppercase font-semibold">Critical Risk</span>
          </div>
          <div className="bg-surface/40 rounded-xl p-4 border border-edge flex flex-col justify-center">
            <span className="text-gold text-2xl font-bold mb-1">{report.summary.highCount}</span>
            <span className="text-xs text-dust uppercase font-semibold">High Risk</span>
          </div>
          <div className="bg-surface/40 rounded-xl p-4 border border-edge flex flex-col justify-center">
            <span className="text-yellow-500 text-2xl font-bold mb-1">{report.summary.mediumCount}</span>
            <span className="text-xs text-dust uppercase font-semibold">Medium Risk</span>
          </div>
          <div className="bg-surface/40 rounded-xl p-4 border border-edge flex flex-col justify-center">
            <span className="text-blue-400 text-2xl font-bold mb-1">{report.summary.lowCount}</span>
            <span className="text-xs text-dust uppercase font-semibold">Low Risk</span>
          </div>
          
          <div className="col-span-2 bg-surface/40 rounded-xl p-4 border border-edge flex justify-between items-center">
            <div>
              <div className="text-cream text-lg font-semibold">{report.summary.scannedFilesCount}</div>
              <div className="text-xs text-dust uppercase font-semibold">Files Audited</div>
            </div>
            <div className="text-right">
              <div className="text-cream text-lg font-semibold">{report.summary.scannedLinesCount.toLocaleString()}</div>
              <div className="text-xs text-dust uppercase font-semibold">Lines Analyzed</div>
            </div>
          </div>
          
          <div className="col-span-2 bg-surface/40 rounded-xl p-4 border border-edge flex justify-between items-center">
            <div>
              <div className="text-cream text-sm font-medium">Audit Summary</div>
              <div className="text-xs text-dust">{report.summary.totalFindings} Finding(s) Detected</div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleExportMarkdown} className="px-3 py-1.5 bg-midnight border border-edge hover:border-faint rounded text-xs text-dust hover:text-cream transition-colors">
                Copy MD
              </button>
              <button onClick={handleExportJSON} className="px-3 py-1.5 bg-midnight border border-edge hover:border-faint rounded text-xs text-dust hover:text-cream transition-colors">
                Get JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search Controls */}
      <div className="flex flex-col gap-4 bg-surface/30 p-4 rounded-xl border border-edge">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="w-full md:w-auto flex-1">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dust" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input 
                type="text" 
                placeholder="Search findings by file, title, or rule ID..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-midnight/50 border border-edge rounded-lg py-2 pl-9 pr-4 text-sm text-cream focus:outline-none focus:border-faint focus:ring-1 focus:ring-faint transition-all"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-dust font-medium mr-1">Severity:</span>
            {(['all', 'critical', 'high', 'medium', 'low'] as const).map(sev => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors capitalize ${
                  filterSeverity === sev 
                    ? 'bg-faint/20 border-faint text-cream' 
                    : 'bg-midnight/50 border-edge text-dust hover:border-faint/50 hover:text-cream/80'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-dust font-medium mr-1">Category:</span>
          {(['all', 'secrets', 'injection', 'xss', 'crypto', 'error_handling', 'config', 'other'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat as VulnerabilityCategory | 'all')}
              className={`px-3 py-1 text-xs rounded border transition-colors capitalize ${
                filterCategory === cat 
                  ? 'bg-faint/20 border-faint text-cream' 
                  : 'bg-midnight/50 border-edge text-dust hover:border-faint/50 hover:text-cream/80'
              }`}
            >
              {cat.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Findings List */}
      <div className="flex flex-col gap-3 min-h-[300px]">
        {filteredFindings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-dust border border-dashed border-edge rounded-xl bg-surface/20">
            <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p>No findings matched your criteria.</p>
          </div>
        ) : (
          filteredFindings.map((finding) => (
            <FindingItem 
              key={finding.id} 
              finding={finding} 
              expanded={expandedId === finding.id}
              onToggle={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
            />
          ))
        )}
      </div>
    </div>
  );
});

SecurityRadar.displayName = 'SecurityRadar';

export default SecurityRadar;
