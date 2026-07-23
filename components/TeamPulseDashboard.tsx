"use client";

import React from "react";
import { Users, Activity, Target, Flame, GitCommit, Bus } from "lucide-react";
import type { TeamPulseReport } from "@/lib/teampulse";

interface TeamPulseDashboardProps {
  report: TeamPulseReport;
}

const getScoreColor = (score: number) => {
  if (score > 80) return "text-jade border-jade/50";
  if (score >= 60) return "text-gold border-gold/50";
  return "text-coral border-coral/50";
};

const getScoreBg = (score: number) => {
  if (score > 80) return "bg-jade/10";
  if (score >= 60) return "bg-gold/10";
  return "bg-coral/10";
};

export const TeamPulseDashboard: React.FC<TeamPulseDashboardProps> = ({ report }) => {
  const scoreColor = getScoreColor(report.score);
  const scoreBg = getScoreBg(report.score);

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      {/* Header Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-surface/60 backdrop-blur-sm border border-edge rounded-2xl p-6 flex items-center justify-between col-span-1 md:col-span-2">
          <div className="flex items-center gap-4">
            <div className={`relative w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center ${scoreColor} ${scoreBg}`}>
              <span className="text-2xl font-black font-mono">{report.score}</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-cream">Team Health</h2>
              <p className="text-sm text-dust">Based on bus factor and code hotspots</p>
            </div>
          </div>
        </div>
        
        <div className="bg-surface/60 backdrop-blur-sm border border-edge rounded-2xl p-6 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-orange-500/10 text-orange-400">
            <Bus className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-1">Bus Factor</p>
            <p className="text-2xl font-bold text-cream font-mono">{report.busFactor}</p>
          </div>
        </div>

        <div className="bg-surface/60 backdrop-blur-sm border border-edge rounded-2xl p-6 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint font-mono mb-1">Contributors</p>
            <p className="text-2xl font-bold text-cream font-mono">{report.contributors.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contributors List */}
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-cream flex items-center gap-2">
            <GitCommit className="w-5 h-5 text-dust" /> Top Contributors
          </h3>
          <div className="bg-surface/40 border border-edge rounded-xl overflow-hidden">
            {report.contributors.length > 0 ? (
              report.contributors.slice(0, 10).map((c, idx) => (
                <div key={idx} className="p-4 border-b border-edge/50 last:border-0 flex items-center justify-between hover:bg-surface/60 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-cream">{c.name}</span>
                    <span className="text-xs text-faint font-mono">{c.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-dust font-mono">
                    <span className="font-bold text-cream">{c.commits}</span> commits
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-dust">No commit data available.</div>
            )}
          </div>
        </div>

        {/* Hotspots */}
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-cream flex items-center gap-2">
            <Flame className="w-5 h-5 text-coral/80" /> Code Hotspots
          </h3>
          <div className="bg-surface/40 border border-edge rounded-xl overflow-hidden">
            {report.hotspots.length > 0 ? (
              report.hotspots.map((h, idx) => (
                <div key={idx} className="p-4 border-b border-edge/50 last:border-0 flex items-center justify-between hover:bg-surface/60 transition-colors group">
                  <span className="text-sm text-cream font-mono truncate max-w-[70%] group-hover:text-coral transition-colors">{h.path}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-mono text-dust">Risk</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${h.complexityScore > 10 ? 'bg-coral/20 text-coral' : 'bg-gold/20 text-gold'}`}>
                      {h.complexityScore}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-dust flex flex-col items-center gap-2">
                <Target className="w-8 h-8 text-jade/50 mb-2" />
                <p>No high-risk hotspots detected!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamPulseDashboard;
