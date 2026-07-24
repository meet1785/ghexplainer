"use client";

import React from "react";
import type { DeployFlowReport } from "@/lib/deployflow";
import { Rocket, Server, GitBranch, PlayCircle, CheckCircle } from "lucide-react";

export function DeployFlowDashboard({ report }: { report: DeployFlowReport }) {
  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'github-actions': return <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" className="w-5 h-5 invert opacity-70" alt="GitHub" />;
      case 'gitlab-ci': return <span className="font-bold text-orange-500">GL</span>;
      default: return <Server className="w-5 h-5 text-faint" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in fade-in">
      {/* Infrastructure Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`p-4 rounded-xl border flex items-center justify-between ${report.infrastructure.hasDocker ? 'bg-jade/5 border-jade/20' : 'bg-surface border-edge'}`}>
          <div className="flex items-center gap-3">
            <Server className={`w-5 h-5 ${report.infrastructure.hasDocker ? 'text-jade' : 'text-faint'}`} />
            <span className="text-sm font-semibold text-cream">Docker</span>
          </div>
          {report.infrastructure.hasDocker ? <CheckCircle className="w-4 h-4 text-jade" /> : <span className="text-xs text-dust">Not Detected</span>}
        </div>
        <div className={`p-4 rounded-xl border flex items-center justify-between ${report.infrastructure.hasTerraform ? 'bg-jade/5 border-jade/20' : 'bg-surface border-edge'}`}>
          <div className="flex items-center gap-3">
            <Layers className={`w-5 h-5 ${report.infrastructure.hasTerraform ? 'text-jade' : 'text-faint'}`} />
            <span className="text-sm font-semibold text-cream">Terraform</span>
          </div>
          {report.infrastructure.hasTerraform ? <CheckCircle className="w-4 h-4 text-jade" /> : <span className="text-xs text-dust">Not Detected</span>}
        </div>
        <div className={`p-4 rounded-xl border flex items-center justify-between ${report.infrastructure.hasK8s ? 'bg-jade/5 border-jade/20' : 'bg-surface border-edge'}`}>
          <div className="flex items-center gap-3">
            <Box className={`w-5 h-5 ${report.infrastructure.hasK8s ? 'text-jade' : 'text-faint'}`} />
            <span className="text-sm font-semibold text-cream">Kubernetes</span>
          </div>
          {report.infrastructure.hasK8s ? <CheckCircle className="w-4 h-4 text-jade" /> : <span className="text-xs text-dust">Not Detected</span>}
        </div>
      </div>

      {/* Pipelines */}
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-bold text-cream flex items-center gap-2">
          <Rocket className="w-5 h-5 text-gold" />
          CI/CD Pipelines ({report.pipelines.length})
        </h3>
        {report.pipelines.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-edge/50 flex flex-col items-center justify-center text-center">
            <Rocket className="w-8 h-8 text-faint mb-3" />
            <p className="text-dust">No standard CI/CD pipelines detected.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {report.pipelines.map((pipeline, idx) => (
              <div key={idx} className="p-5 rounded-2xl bg-surface border border-edge flex flex-col md:flex-row gap-6 md:items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-midnight rounded-xl border border-edge/50">
                    {getProviderIcon(pipeline.provider)}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-cream capitalize">{pipeline.provider.replace('-', ' ')}</span>
                    <span className="text-xs text-dust font-mono">{pipeline.filePath}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  {/* Triggers */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-mono text-faint">Triggers</span>
                    <div className="flex items-center gap-2">
                      {pipeline.triggers.map((t, i) => (
                        <span key={i} className="flex items-center gap-1 text-xs bg-midnight px-2 py-1 rounded text-dust">
                          {t.event === 'pull_request' ? <GitBranch className="w-3 h-3" /> : <PlayCircle className="w-3 h-3" />}
                          {t.event}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Stages */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-mono text-faint">Stages Detected</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded font-semibold ${pipeline.hasTests ? 'bg-jade/10 text-jade' : 'bg-surface text-dust border border-edge'}`}>Test</span>
                      <span className={`text-xs px-2 py-1 rounded font-semibold ${pipeline.hasDeploy ? 'bg-gold/10 text-gold' : 'bg-surface text-dust border border-edge'}`}>Deploy</span>
                    </div>
                  </div>

                  {/* Jobs Count */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-mono text-faint">Jobs</span>
                    <span className="text-sm font-bold text-cream px-2">{pipeline.jobsCount}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Missing icons mock
const Layers = ({ className }: any) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>;
const Box = ({ className }: any) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
