import { auditArchLens } from '../lib/archlens';
import type { FileContent } from '../lib/github';

describe('ArchLens', () => {
  it('detects dependencies from package.json', () => {
    const files: FileContent[] = [
      {
        path: 'package.json',
        content: JSON.stringify({
          dependencies: { react: '^18.0.0', next: '14.0.0' },
          devDependencies: { typescript: '5.0.0' }
        })
      }
    ];

    const report = auditArchLens(files);
    expect(report.totalDependencies).toBe(3);
    expect(report.dependencies.find(d => d.name === 'react')?.type).toBe('production');
    expect(report.dependencies.find(d => d.name === 'typescript')?.type).toBe('development');
    expect(report.techStack).toContain('React');
    expect(report.techStack).toContain('TypeScript');
  });

  it('detects dependencies from requirements.txt', () => {
    const files: FileContent[] = [
      {
        path: 'requirements.txt',
        content: `flask==2.0.1\nrequests>=2.25.1\n`
      }
    ];

    const report = auditArchLens(files);
    expect(report.totalDependencies).toBe(2);
    expect(report.dependencies.find(d => d.name === 'flask')).toBeDefined();
    expect(report.techStack).toContain('Flask');
  });
});
