import { describe, it, expect } from 'vitest';
import { analyzeDeployFlow } from '../lib/deployflow';

describe('DeployFlow Engine', () => {
  it('detects GitHub Actions with tests and deploy', () => {
    const yaml = `
on: [push]
jobs:
  test:
    run: npm test
  deploy:
    run: npm run deploy
`;
    const report = analyzeDeployFlow([{ path: '.github/workflows/main.yml', content: yaml }]);
    expect(report.pipelines.length).toBe(1);
    expect(report.pipelines[0].hasTests).toBe(true);
    expect(report.pipelines[0].hasDeploy).toBe(true);
  });

  it('detects infrastructure files', () => {
    const report = analyzeDeployFlow([
      { path: 'Dockerfile', content: 'FROM node' },
      { path: 'main.tf', content: 'resource "aws_s3_bucket"' }
    ]);
    expect(report.infrastructure.hasDocker).toBe(true);
    expect(report.infrastructure.hasTerraform).toBe(true);
  });
});
