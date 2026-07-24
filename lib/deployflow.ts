import type { FileContent } from "./github";

export interface CICDStep {
  name: string;
  uses?: string;
  run?: string;
}

export interface PipelineTrigger {
  event: string;
  branches?: string[];
}

export interface DeployFlowReport {
  pipelines: {
    provider: 'github-actions' | 'gitlab-ci' | 'docker' | 'unknown';
    filePath: string;
    triggers: PipelineTrigger[];
    jobsCount: number;
    hasTests: boolean;
    hasDeploy: boolean;
  }[];
  infrastructure: {
    hasDocker: boolean;
    hasTerraform: boolean;
    hasK8s: boolean;
  };
  score: number;
}

export function analyzeDeployFlow(files: FileContent[]): DeployFlowReport {
  const report: DeployFlowReport = {
    pipelines: [],
    infrastructure: {
      hasDocker: false,
      hasTerraform: false,
      hasK8s: false
    },
    score: 0
  };

  for (const file of files) {
    const path = file.path.toLowerCase();

    // Infrastructure checks
    if (path.includes('dockerfile') || path.includes('docker-compose')) report.infrastructure.hasDocker = true;
    if (path.endsWith('.tf')) report.infrastructure.hasTerraform = true;
    if (path.includes('k8s') || path.includes('kubernetes')) report.infrastructure.hasK8s = true;

    // GitHub Actions
    if (path.startsWith('.github/workflows/') && (path.endsWith('.yml') || path.endsWith('.yaml'))) {
      const content = file.content.toLowerCase();
      
      const triggers: PipelineTrigger[] = [];
      if (content.includes('on: [push]')) triggers.push({ event: 'push' });
      if (content.includes('pull_request:')) triggers.push({ event: 'pull_request' });

      report.pipelines.push({
        provider: 'github-actions',
        filePath: file.path,
        triggers,
        jobsCount: (content.match(/jobs:/g) || []).length,
        hasTests: content.includes('test') || content.includes('npm run test') || content.includes('pytest'),
        hasDeploy: content.includes('deploy') || content.includes('publish')
      });
    }

    // GitLab CI
    if (path === '.gitlab-ci.yml') {
      const content = file.content.toLowerCase();
      report.pipelines.push({
        provider: 'gitlab-ci',
        filePath: file.path,
        triggers: [{ event: 'push' }],
        jobsCount: (content.match(/^[a-z0-9_-]+:/gm) || []).length, // rough estimate
        hasTests: content.includes('test'),
        hasDeploy: content.includes('deploy')
      });
    }
  }

  // Calculate score
  let score = 0;
  if (report.pipelines.length > 0) score += 40;
  if (report.pipelines.some(p => p.hasTests)) score += 20;
  if (report.pipelines.some(p => p.hasDeploy)) score += 20;
  if (report.infrastructure.hasDocker) score += 20;

  report.score = score;
  return report;
}
