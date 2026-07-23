"use client";

import React, { useState, useMemo } from "react";
import { Webhook, Search, FileCode, Server } from "lucide-react";
import type { RouteMapReport, ApiRoute } from "@/lib/routemap";

interface RouteMapDashboardProps {
  report: RouteMapReport;
}

const getMethodColor = (method: string) => {
  switch (method) {
    case "GET": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    case "POST": return "text-jade bg-jade/10 border-jade/20";
    case "PUT": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
    case "DELETE": return "text-coral bg-coral/10 border-coral/20";
    case "PATCH": return "text-orange-400 bg-orange-500/10 border-orange-500/20";
    default: return "text-dust bg-surface/50 border-edge";
  }
};

export const RouteMapDashboard: React.FC<RouteMapDashboardProps> = ({ report }) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRoutes = useMemo(() => {
    if (!searchQuery) return report.routes;
    const q = searchQuery.toLowerCase();
    return report.routes.filter(r => 
      r.path.toLowerCase().includes(q) || r.method.toLowerCase().includes(q)
    );
  }, [report.routes, searchQuery]);

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-surface/60 backdrop-blur-sm border border-edge rounded-2xl p-6 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400">
            <Webhook className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-1">Total Endpoints</p>
            <p className="text-2xl font-bold text-cream font-mono">{report.totalRoutes}</p>
          </div>
        </div>

        <div className="lg:col-span-2 bg-surface/60 backdrop-blur-sm border border-edge rounded-2xl p-6 flex flex-col justify-center">
          <h2 className="text-sm font-semibold text-cream uppercase tracking-wider mb-2">Detected Frameworks</h2>
          <div className="flex flex-wrap gap-2">
            {report.frameworks.length > 0 ? (
              report.frameworks.map(fw => (
                <span key={fw} className="px-3 py-1 rounded-full text-xs font-medium border text-indigo-400 bg-indigo-500/10 border-indigo-500/20">
                  {fw}
                </span>
              ))
            ) : (
              <span className="text-dust text-sm">No API frameworks detected</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-cream flex items-center gap-2">
            <Server className="w-5 h-5 text-dust" /> Discovered APIs
          </h3>
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dust" />
            <input
              type="text"
              placeholder="Search endpoints..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface/50 border border-edge rounded-full py-1.5 pl-9 pr-4 text-sm text-cream placeholder:text-faint focus:outline-none focus:border-faint focus:ring-1 focus:ring-faint transition-all"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {filteredRoutes.map((route, idx) => (
            <div key={`${route.method}-${route.path}-${idx}`} className="bg-surface/40 border border-edge rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-faint/40 transition-colors">
              <div className="flex items-center gap-4 truncate">
                <span className={`w-16 text-center px-2 py-1 rounded border text-[10px] font-mono uppercase tracking-wider font-bold shrink-0 ${getMethodColor(route.method)}`}>
                  {route.method}
                </span>
                <span className="text-cream text-sm font-mono truncate">{route.path}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0 sm:ml-auto">
                <span className="text-[10px] uppercase tracking-wider font-mono text-dust bg-midnight px-2 py-0.5 rounded border border-edge/50">
                  {route.framework}
                </span>
                <div className="flex items-center gap-1.5 text-xs text-faint">
                  <FileCode className="w-3.5 h-3.5" />
                  <span className="font-mono truncate max-w-[150px] sm:max-w-[200px]" title={route.file}>{route.file.split('/').pop()}</span>
                  <span className="font-mono text-dust">:{route.line}</span>
                </div>
              </div>
            </div>
          ))}
          {filteredRoutes.length === 0 && (
            <div className="py-12 text-center text-dust bg-surface/20 border border-dashed border-edge rounded-xl">
              No API routes match your search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RouteMapDashboard;
