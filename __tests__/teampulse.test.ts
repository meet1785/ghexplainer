import { analyzeTeamPulse } from '../lib/teampulse';
import type { RepoCommit, FileContent } from '../lib/github';

describe('TeamPulse', () => {
  it('calculates bus factor and top contributors', () => {
    const commits: RepoCommit[] = [
      { sha: '1', authorName: 'Alice', authorEmail: 'alice@test.com', date: '2023-01-01', message: 'init' },
      { sha: '2', authorName: 'Alice', authorEmail: 'alice@test.com', date: '2023-01-02', message: 'feat' },
      { sha: '3', authorName: 'Alice', authorEmail: 'alice@test.com', date: '2023-01-03', message: 'fix' },
      { sha: '4', authorName: 'Bob', authorEmail: 'bob@test.com', date: '2023-01-04', message: 'docs' },
    ];
    
    const files: FileContent[] = [
      { path: 'main.ts', content: 'console.log("hello");\n'.repeat(600) } // 600 lines
    ];

    const report = analyzeTeamPulse(commits, files);
    
    expect(report.totalCommitsAnalyzed).toBe(4);
    expect(report.contributors).toHaveLength(2);
    expect(report.contributors[0].name).toBe('Alice');
    expect(report.contributors[0].commits).toBe(3);
    
    // Alice has 75% of commits, so bus factor is 1
    expect(report.busFactor).toBe(1);
    
    // Main.ts is a hotspot due to size
    expect(report.hotspots).toHaveLength(1);
    expect(report.hotspots[0].path).toBe('main.ts');
  });
});
