import type { FileContent } from "./github";

export interface LicenseFinding {
  name: string;
  type: 'project' | 'dependency';
  license: string;
  risk: 'low' | 'medium' | 'high' | 'unknown';
  filePath: string;
}

export interface LicenseReport {
  projectLicense?: string;
  findings: LicenseFinding[];
  summary: {
    totalDependenciesScanned: number;
    highRiskCount: number;
    mediumRiskCount: number;
    unknownCount: number;
  };
  score: number; // 0-100
}

export function scanLicenses(files: FileContent[]): LicenseReport {
  const findings: LicenseFinding[] = [];
  let projectLicense = 'Unknown';
  let depsScanned = 0;

  const licenseRiskMap: Record<string, 'low' | 'medium' | 'high'> = {
    'MIT': 'low',
    'Apache-2.0': 'low',
    'BSD-2-Clause': 'low',
    'BSD-3-Clause': 'low',
    'ISC': 'low',
    'GPL-2.0': 'high',
    'GPL-3.0': 'high',
    'AGPL-3.0': 'high',
    'LGPL-2.1': 'medium',
    'LGPL-3.0': 'medium',
    'MPL-2.0': 'medium'
  };

  const getRisk = (lic: string): 'low' | 'medium' | 'high' | 'unknown' => {
    // Exact match
    if (licenseRiskMap[lic]) return licenseRiskMap[lic];
    // Contains match
    for (const [key, risk] of Object.entries(licenseRiskMap)) {
      if (lic.toUpperCase().includes(key.toUpperCase())) return risk;
    }
    return 'unknown';
  };

  for (const file of files) {
    // Check root license file
    if (file.path.toLowerCase() === 'license' || file.path.toLowerCase() === 'license.md') {
      const content = file.content.substring(0, 500);
      if (content.includes('MIT License')) projectLicense = 'MIT';
      else if (content.includes('Apache License')) projectLicense = 'Apache-2.0';
      else if (content.includes('GNU GENERAL PUBLIC LICENSE')) projectLicense = 'GPL-3.0';
    }

    // Node.js package.json
    if (file.path === 'package.json') {
      try {
        const pkg = JSON.parse(file.content);
        if (pkg.license) {
          projectLicense = typeof pkg.license === 'string' ? pkg.license : pkg.license.type || 'Unknown';
          findings.push({
            name: pkg.name || 'Project',
            type: 'project',
            license: projectLicense,
            risk: getRisk(projectLicense),
            filePath: file.path
          });
        }
      } catch (e) {
        // ignore parse error
      }
    }
  }

  const highCount = findings.filter(f => f.risk === 'high').length;
  const mediumCount = findings.filter(f => f.risk === 'medium').length;
  const unknownCount = findings.filter(f => f.risk === 'unknown').length;

  const deduction = (highCount * 10) + (mediumCount * 3) + (unknownCount * 1);
  const score = Math.max(0, 100 - deduction);

  return {
    projectLicense,
    findings,
    summary: {
      totalDependenciesScanned: depsScanned,
      highRiskCount: highCount,
      mediumRiskCount: mediumCount,
      unknownCount
    },
    score: Math.round(score)
  };
}
