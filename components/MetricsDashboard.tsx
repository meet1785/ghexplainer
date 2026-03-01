"use client";

import { useMemo, useState } from "react";
import { computeProjectMetrics, type ProjectMetrics } from "@/lib/metrics";

/**
 * Code Metrics Dashboard
 *
 * Visual display of code quality metrics computed from analyzed files:
 * - Language breakdown (donut chart via CSS conic-gradient)
 * - Module size comparison (horizontal bars)
 * - Complexity distribution
 * - Top files by size & complexity
 * - Coupling score
 *
 * Demonstrates: static analysis, data visualization with pure CSS,
 * responsive charts, metric computation, progressive disclosure.
 */

interface MetricsDashboardProps {
  files: Array<{ path: string; content: string }>;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f0db4f",
  Python: "#3572A5",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  Ruby: "#CC342D",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  HTML: "#e34c26",
  SQL: "#e38c00",
  Shell: "#89e051",
  Docker: "#384d54",
  YAML: "#cb171e",
  Other: "#8e8e9e",
};

function MetricCard({ label, value, sub, color = "gold" }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colorClasses: Record<string, string> = {
    gold: "text-gold border-gold/20 bg-gold/5",
    jade: "text-jade border-jade/20 bg-jade/5",
    coral: "text-coral border-coral/20 bg-coral/5",
    azure: "text-azure border-azure/20 bg-azure/5",
  };

  return (
    <div className={`px-4 py-3 rounded-xl border ${colorClasses[color] ?? colorClasses.gold}`}>
      <p className="text-2xl font-bold font-mono">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-[11px] font-mono uppercase tracking-wider opacity-60 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] opacity-40 mt-0.5 font-body">{sub}</p>}
    </div>
  );
}

function BarChart({ items, maxValue }: { items: Array<{ label: string; value: number; color: string }>; maxValue: number }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-[11px] text-dust font-mono w-24 truncate shrink-0" title={item.label}>
            {item.label}
          </span>
          <div className="flex-1 h-5 bg-surface/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.max(2, (item.value / maxValue) * 100)}%`,
                backgroundColor: item.color,
                opacity: 0.7,
              }}
            />
          </div>
          <span className="text-[11px] text-faint font-mono w-12 text-right shrink-0">
            {item.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data, size = 120 }: { data: Array<{ label: string; value: number; color: string }>; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  let cumPercent = 0;
  const gradientStops = data
    .filter(d => d.value > 0)
    .map(d => {
      const start = cumPercent;
      cumPercent += (d.value / total) * 100;
      return `${d.color} ${start}% ${cumPercent}%`;
    })
    .join(", ");

  return (
    <div className="flex items-center gap-4">
      <div
        className="rounded-full shrink-0"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${gradientStops})`,
          mask: `radial-gradient(circle at center, transparent ${size * 0.35}px, black ${size * 0.35 + 1}px)`,
          WebkitMask: `radial-gradient(circle at center, transparent ${size * 0.35}px, black ${size * 0.35 + 1}px)`,
        }}
      />
      <div className="flex flex-col gap-1">
        {data.filter(d => d.value > 0).slice(0, 8).map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-[11px] text-dust font-mono">{d.label}</span>
            <span className="text-[10px] text-faint font-mono">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComplexityIndicator({ score }: { score: number }) {
  const level = score <= 5 ? "Low" : score <= 15 ? "Medium" : "High";
  const color = score <= 5 ? "#40c0a0" : score <= 15 ? "#f0a040" : "#e06070";
  const width = Math.min(100, (score / 25) * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-surface/60 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-mono" style={{ color }}>{level}</span>
    </div>
  );
}

export default function MetricsDashboard({ files }: MetricsDashboardProps) {
  const [expanded, setExpanded] = useState(false);

  const metrics: ProjectMetrics = useMemo(() => computeProjectMetrics(files), [files]);

  if (files.length === 0) return null;

  // Prepare language chart data
  const langData = Object.entries(metrics.languageBreakdown)
    .sort(([, a], [, b]) => b - a)
    .map(([lang, loc]) => ({
      label: lang,
      value: loc,
      color: LANG_COLORS[lang] ?? LANG_COLORS.Other,
    }));

  // Module bar data
  const moduleBarData = metrics.modules.slice(0, 8).map((m, i) => ({
    label: m.name,
    value: m.totalLoc,
    color: Object.values(LANG_COLORS)[i % Object.values(LANG_COLORS).length],
  }));
  const maxModuleLoc = Math.max(...metrics.modules.map(m => m.totalLoc), 1);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-jade/60 text-sm">▣</span>
          <h3 className="text-sm font-semibold text-cream">Code Metrics</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-azure/10 border border-azure/20 text-azure font-mono">
            {metrics.totalFiles} files analyzed
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] px-2 py-1 rounded border border-edge text-faint hover:text-cream font-mono transition-colors"
        >
          {expanded ? "Collapse" : "Details"}
        </button>
      </div>

      {/* Top-level stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Lines of Code" value={metrics.totalLoc} color="gold" />
        <MetricCard label="Functions" value={metrics.totalFunctions} color="jade" />
        <MetricCard label="Classes/Types" value={metrics.totalClasses} color="azure" />
        <MetricCard label="Avg Complexity" value={metrics.avgComplexity.toFixed(1)} sub={metrics.avgComplexity <= 5 ? "Low" : metrics.avgComplexity <= 15 ? "Medium" : "High"} color="coral" />
      </div>

      {/* Language breakdown + Module sizes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
        {/* Language donut */}
        <div className="p-4 rounded-xl bg-surface/40 border border-edge">
          <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-3">Language Breakdown</p>
          <DonutChart data={langData} />
        </div>

        {/* Module sizes */}
        <div className="p-4 rounded-xl bg-surface/40 border border-edge">
          <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-3">Module Sizes (LOC)</p>
          <BarChart items={moduleBarData} maxValue={maxModuleLoc} />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-4 mt-4 reveal" style={{ animationDuration: "0.3s" }}>
          {/* Distribution cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-surface/40 border border-edge">
              <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-2">Complexity Distribution</p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-jade font-mono">Low (≤5)</span>
                  <span className="text-faint font-mono">{metrics.complexityDistribution.low} files</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gold font-mono">Medium (6-15)</span>
                  <span className="text-faint font-mono">{metrics.complexityDistribution.medium} files</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-coral font-mono">High (&gt;15)</span>
                  <span className="text-faint font-mono">{metrics.complexityDistribution.high} files</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface/40 border border-edge">
              <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-2">File Size Distribution</p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-jade font-mono">Small (≤50 LOC)</span>
                  <span className="text-faint font-mono">{metrics.sizeDistribution.small} files</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gold font-mono">Medium (51-200)</span>
                  <span className="text-faint font-mono">{metrics.sizeDistribution.medium} files</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-coral font-mono">Large (&gt;200)</span>
                  <span className="text-faint font-mono">{metrics.sizeDistribution.large} files</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface/40 border border-edge">
              <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-2">Code Health</p>
              <div className="space-y-3 mt-3">
                <div>
                  <p className="text-[10px] text-faint font-mono mb-1">Coupling Score</p>
                  <ComplexityIndicator score={metrics.couplingScore * 100} />
                </div>
                <div>
                  <p className="text-[10px] text-faint font-mono mb-1">Avg File Complexity</p>
                  <ComplexityIndicator score={metrics.avgComplexity} />
                </div>
              </div>
            </div>
          </div>

          {/* Top files */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-surface/40 border border-edge">
              <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-2">Most Complex Files</p>
              <div className="space-y-1.5">
                {metrics.topComplexFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-dust font-mono truncate mr-2">{f.path}</span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono" style={{
                      color: f.complexity > 15 ? "#e06070" : f.complexity > 5 ? "#f0a040" : "#40c0a0",
                      backgroundColor: f.complexity > 15 ? "#e0607010" : f.complexity > 5 ? "#f0a04010" : "#40c0a010",
                    }}>
                      {f.complexity}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface/40 border border-edge">
              <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-2">Largest Files (LOC)</p>
              <div className="space-y-1.5">
                {metrics.topLargeFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-dust font-mono truncate mr-2">{f.path}</span>
                    <span className="shrink-0 text-faint font-mono">{f.loc.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
