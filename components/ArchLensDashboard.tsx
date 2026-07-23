"use client";

import React, { useState, useMemo } from "react";
import { Layers, Package, Shield, Search, Box, ChevronDown, ChevronRight, Server } from "lucide-react";
import type { ArchLensReport, Dependency } from "@/lib/archlens";

interface ArchLensDashboardProps {
  report: ArchLensReport;
}

const TechBadge = ({ name }: { name: string }) => {
  const getBadgeStyle = (tech: string) => {
    switch (tech) {
      case "React": return "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
      case "TypeScript": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      case "Tailwind CSS": return "text-teal-400 bg-teal-500/10 border-teal-500/20";
      case "Docker": return "text-sky-400 bg-sky-500/10 border-sky-500/20";
      case "Kubernetes": return "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";
      case "Go": return "text-cyan-300 bg-cyan-400/10 border-cyan-400/20";
      case "Python": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      default: return "text-faint bg-surface/50 border-edge";
    }
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getBadgeStyle(name)}`}>
      {name}
    </span>
  );
};

export const ArchLensDashboard: React.FC<ArchLensDashboardProps> = ({ report }) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDeps = useMemo(() => {
    if (!searchQuery) return report.dependencies;
    return report.dependencies.filter(d => 
      d.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [report.dependencies, searchQuery]);

  const sortedDeps = useMemo(() => {
    return [...filteredDeps].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredDeps]);

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      {/* Header Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-surface/60 backdrop-blur-sm border border-edge rounded-2xl p-6 flex flex-col justify-center">
          <h2 className="text-sm font-semibold text-cream uppercase tracking-wider mb-2">Tech Stack</h2>
          <div className="flex flex-wrap gap-2">
            {report.techStack.length > 0 ? (
              report.techStack.map(tech => <TechBadge key={tech} name={tech} />)
            ) : (
              <span className="text-dust text-sm">No specific tech stack detected</span>
            )}
          </div>
        </div>
        
        <div className="bg-surface/60 backdrop-blur-sm border border-edge rounded-2xl p-6 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-1">Total Dependencies</p>
            <p className="text-2xl font-bold text-cream font-mono">{report.totalDependencies}</p>
          </div>
        </div>

        <div className="bg-surface/60 backdrop-blur-sm border border-edge rounded-2xl p-6 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-jade/10 text-jade">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-1">Arch Score</p>
            <p className="text-2xl font-bold text-cream font-mono">{report.score}/100</p>
          </div>
        </div>
      </div>

      {/* Dependency List */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-cream flex items-center gap-2">
            <Layers className="w-5 h-5 text-dust" /> Dependency Ledger
          </h3>
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dust" />
            <input
              type="text"
              placeholder="Search dependencies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface/50 border border-edge rounded-full py-1.5 pl-9 pr-4 text-sm text-cream placeholder:text-faint focus:outline-none focus:border-faint focus:ring-1 focus:ring-faint transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedDeps.map((dep, idx) => (
            <div key={`${dep.name}-${idx}`} className="bg-surface/40 border border-edge rounded-xl p-4 flex items-center justify-between group hover:border-faint/40 transition-colors">
              <div className="flex items-center gap-3 truncate">
                <Box className="w-5 h-5 text-dust shrink-0 group-hover:text-blue-400 transition-colors" />
                <div className="truncate">
                  <p className="text-cream text-sm font-medium truncate">{dep.name}</p>
                  <p className="text-xs text-faint font-mono mt-0.5 truncate">{dep.version}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                <span className="text-[10px] uppercase tracking-wider font-mono text-dust bg-midnight px-2 py-0.5 rounded border border-edge/50">
                  {dep.ecosystem}
                </span>
                <span className={`text-[9px] uppercase tracking-wider font-bold ${dep.type === 'production' ? 'text-jade' : 'text-faint'}`}>
                  {dep.type}
                </span>
              </div>
            </div>
          ))}
          {sortedDeps.length === 0 && (
            <div className="col-span-full py-12 text-center text-dust bg-surface/20 border border-dashed border-edge rounded-xl">
              No dependencies match your search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArchLensDashboard;
