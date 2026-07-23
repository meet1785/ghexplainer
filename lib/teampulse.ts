import type { RepoCommit, FileContent } from "./github";

export interface ContributorStats {
  name: string;
  email: string;
  commits: number;
  firstCommit: string;
  lastCommit: string;
}

export interface HotspotFile {
  path: string;
  complexityScore: number;
}

export interface TeamPulseReport {
  score: number; // 0-100 (Health of team dynamics)
  totalCommitsAnalyzed: number;
  contributors: ContributorStats[];
  busFactor: number;
  hotspots: HotspotFile[];
}

export function analyzeTeamPulse(commits: RepoCommit[], files: FileContent[]): TeamPulseReport {
  // 1. Analyze Contributors
  const contributorMap = new Map<string, ContributorStats>();
  
  commits.forEach(commit => {
    // Normalize by email to handle name changes, fallback to name
    const key = commit.authorEmail || commit.authorName;
    if (!contributorMap.has(key)) {
      contributorMap.set(key, {
        name: commit.authorName,
        email: commit.authorEmail,
        commits: 0,
        firstCommit: commit.date,
        lastCommit: commit.date,
      });
    }
    const stats = contributorMap.get(key)!;
    stats.commits++;
    
    // Update dates
    if (new Date(commit.date) < new Date(stats.firstCommit)) stats.firstCommit = commit.date;
    if (new Date(commit.date) > new Date(stats.lastCommit)) stats.lastCommit = commit.date;
  });

  const contributors = Array.from(contributorMap.values())
    .sort((a, b) => b.commits - a.commits);

  // 2. Calculate Bus Factor
  // The minimal number of developers that account for >50% of the commits.
  let busFactor = 0;
  let cumulativeCommits = 0;
  const targetCommits = commits.length / 2;
  
  for (const c of contributors) {
    busFactor++;
    cumulativeCommits += c.commits;
    if (cumulativeCommits >= targetCommits) break;
  }

  // 3. Find Hotspots via Heuristics 
  // Since we don't have per-file commit history easily accessible without cloning, 
  // we estimate hotspots based on file size, complexity (indentation), and type.
  const hotspots: HotspotFile[] = files
    .map(f => {
      let score = 0;
      const lines = f.content.split('\n');
      
      // Heuristic 1: File size
      if (lines.length > 500) score += 5;
      if (lines.length > 1000) score += 10;
      
      // Heuristic 2: Complexity (nested indentation)
      const maxIndent = Math.max(...lines.map(l => (l.match(/^\s+/) || [''])[0].length));
      if (maxIndent > 16) score += 5; // >4 levels of 4-space indent
      if (maxIndent > 24) score += 10;
      
      // Heuristic 3: Type of file
      if (f.path.includes("utils") || f.path.includes("helpers")) score += 2;
      
      return { path: f.path, complexityScore: score };
    })
    .filter(f => f.complexityScore > 0)
    .sort((a, b) => b.complexityScore - a.complexityScore)
    .slice(0, 10); // Top 10 hotspots

  // 4. Compute Health Score
  let score = 100;
  if (busFactor === 1 && contributors.length > 1) score -= 20; // High risk if 1 person does 50%+ work in a team
  if (busFactor <= 2 && contributors.length > 5) score -= 10;
  
  // Penalize for excessive hotspots
  if (hotspots.some(h => h.complexityScore >= 20)) score -= 15;

  return {
    score: Math.max(0, score),
    totalCommitsAnalyzed: commits.length,
    contributors,
    busFactor: contributors.length === 0 ? 0 : busFactor,
    hotspots
  };
}

export function toTeamPulseMarkdown(report: TeamPulseReport): string {
  let md = `# TeamPulse Analytics\n\n`;
  md += `**Team Health Score:** ${report.score} / 100\n`;
  md += `- **Bus Factor:** ${report.busFactor} (Number of key devs)\n`;
  md += `- **Total Contributors:** ${report.contributors.length}\n`;
  md += `- **Commits Analyzed:** ${report.totalCommitsAnalyzed}\n\n`;

  if (report.contributors.length > 0) {
    md += `## Top Contributors\n`;
    report.contributors.slice(0, 5).forEach(c => {
      md += `- **${c.name}**: ${c.commits} commits\n`;
    });
    md += `\n`;
  }

  if (report.hotspots.length > 0) {
    md += `## Code Hotspots (High Complexity/Churn Risk)\n`;
    report.hotspots.forEach(h => {
      md += `- \`${h.path}\` (Risk Score: ${h.complexityScore})\n`;
    });
  }

  return md;
}

export function toTeamPulseJSON(report: TeamPulseReport): string {
  return JSON.stringify(report, null, 2);
}
