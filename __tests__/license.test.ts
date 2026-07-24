import { describe, it, expect } from 'vitest';
import { scanLicenses } from '../lib/license';

describe('LicenseCompliance Engine', () => {
  it('detects project license from LICENSE file', () => {
    const report = scanLicenses([{ path: 'LICENSE', content: 'MIT License\n...' }]);
    expect(report.projectLicense).toBe('MIT');
  });

  it('detects package.json license', () => {
    const pkg = JSON.stringify({ name: 'test', license: 'MIT' });
    const report = scanLicenses([{ path: 'package.json', content: pkg }]);
    expect(report.projectLicense).toBe('MIT');
    expect(report.findings[0].risk).toBe('low');
  });

  it('flags GPL as high risk', () => {
    const pkg = JSON.stringify({ name: 'test-gpl', license: 'GPL-3.0' });
    const report = scanLicenses([{ path: 'package.json', content: pkg }]);
    expect(report.findings[0].risk).toBe('high');
  });
});
