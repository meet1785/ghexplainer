import type { FileContent } from "./github";

/**
 * Severity level for a security finding.
 */
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Category of a security vulnerability.
 */
export type VulnerabilityCategory =
  | 'secrets'
  | 'owasp-injection'
  | 'xss'
  | 'insecure-crypto'
  | 'unhandled-error'
  | 'hardcoded-credentials'
  | 'insecure-config'
  | 'dependency-risk';

/**
 * Represents a single security finding in the codebase.
 */
export interface SecurityFinding {
  id: string;
  filePath: string;
  line: number;
  column?: number;
  ruleId: string;
  title: string;
  description: string;
  category: VulnerabilityCategory;
  severity: SeverityLevel;
  snippet?: string;
  remediation: string;
  cwe?: string;
}

/**
 * Comprehensive security report generated after scanning.
 */
export interface SecurityReport {
  score: number; // 0 - 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  findings: SecurityFinding[];
  summary: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
    totalFindings: number;
    scannedFilesCount: number;
    scannedLinesCount: number;
  };
  categoryCounts: Record<VulnerabilityCategory, number>;
}

// Internal interface for regex rules
interface Rule {
  id: string;
  title: string;
  description: string;
  category: VulnerabilityCategory;
  severity: SeverityLevel;
  regex: RegExp;
  remediation: string;
  cwe?: string;
}

// Define the core scanning rules based on user requirements
const RULES: Rule[] = [
  {
    id: 'SEC-001',
    title: 'AWS Access Key Exposed',
    description: 'Found a potential AWS Access Key.',
    category: 'secrets',
    severity: 'critical',
    regex: /AKIA[0-9A-Z]{16}/,
    remediation: 'Revoke this access key immediately and use AWS IAM roles or a secrets manager.',
    cwe: 'CWE-798',
  },
  {
    id: 'SEC-002',
    title: 'Generic API Key / Secret',
    description: 'Found a hardcoded API key or secret.',
    category: 'secrets',
    severity: 'high',
    regex: /(?:api_key|apikey|secret_key|private_key|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i,
    remediation: 'Move secrets to environment variables or a secure vault.',
    cwe: 'CWE-798',
  },
  {
    id: 'SEC-003',
    title: 'JWT Token Exposed',
    description: 'Found a hardcoded JWT token.',
    category: 'secrets',
    severity: 'high',
    regex: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/,
    remediation: 'Remove hardcoded JWT tokens and manage sessions securely.',
    cwe: 'CWE-798',
  },
  {
    id: 'SEC-004',
    title: 'RSA/Private Key Exposed',
    description: 'Found a private cryptographic key.',
    category: 'secrets',
    severity: 'critical',
    regex: /-----BEGIN (?:RSA )?PRIVATE KEY-----/,
    remediation: 'Never store private keys in source code. Rotate the compromised key immediately.',
    cwe: 'CWE-320',
  },
  {
    id: 'SEC-005',
    title: 'GitHub Personal Access Token Exposed',
    description: 'Found a GitHub PAT.',
    category: 'secrets',
    severity: 'critical',
    regex: /ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}/,
    remediation: 'Revoke the GitHub token and use repository secrets instead.',
    cwe: 'CWE-798',
  },
  {
    id: 'SEC-006',
    title: 'Dangerous React HTML Assignment',
    description: 'Usage of dangerouslySetInnerHTML can lead to XSS.',
    category: 'xss',
    severity: 'medium',
    regex: /dangerouslySetInnerHTML/,
    remediation: 'Sanitize user input before using dangerouslySetInnerHTML, or use safer alternatives.',
    cwe: 'CWE-79',
  },
  {
    id: 'SEC-007',
    title: 'Code Execution',
    description: 'Usage of eval or new Function can lead to arbitrary code execution.',
    category: 'owasp-injection',
    severity: 'high',
    regex: /eval\(|new Function\(/,
    remediation: 'Avoid evaluating dynamic strings as code. Use safer alternatives like JSON.parse.',
    cwe: 'CWE-94',
  },
  {
    id: 'SEC-008',
    title: 'Insecure Randomness',
    description: 'Math.random is not cryptographically secure and should not be used for tokens.',
    category: 'insecure-crypto',
    severity: 'low',
    regex: /Math\.random\(\)/,
    remediation: 'Use crypto.getRandomValues() or a secure random generation library for tokens or secrets.',
    cwe: 'CWE-338',
  },
  {
    id: 'SEC-009',
    title: 'Hardcoded IP Address',
    description: 'Found a hardcoded IP address.',
    category: 'insecure-config',
    severity: 'info',
    regex: /\b(?:(?!127\.0\.0\.1|0\.0\.0\.0)[0-9]{1,3}\.){3}[0-9]{1,3}\b/,
    remediation: 'Use environment variables or configuration files for infrastructure addresses.',
    cwe: 'CWE-1104',
  },
  {
    id: 'SEC-010',
    title: 'Potential SQL Injection',
    description: 'Found potential dynamic string construction in SQL query.',
    category: 'owasp-injection',
    severity: 'high',
    regex: /SELECT\s+.*?\s+FROM\s+.*?\+|\`\$\{.*?\}\`/i,
    remediation: 'Use parameterized queries or an ORM to prevent SQL injection.',
    cwe: 'CWE-89',
  },
  {
    id: 'SEC-011',
    title: 'Python Code Execution',
    description: 'Usage of exec or eval in Python.',
    category: 'owasp-injection',
    severity: 'high',
    regex: /\b(?:exec|eval)\s*\(/,
    remediation: 'Avoid evaluating dynamic strings. Refactor logic to be deterministic.',
    cwe: 'CWE-94',
  },
  {
    id: 'SEC-012',
    title: 'Shell Command Execution',
    description: 'Executing shell commands potentially without sanitization.',
    category: 'owasp-injection',
    severity: 'medium',
    regex: /\b(?:exec|spawn|subprocess\.Popen)\s*\(/,
    remediation: 'Sanitize all user inputs before passing to shell commands, or avoid using shell execution.',
    cwe: 'CWE-78',
  }
];

/**
 * Audits a list of files for security vulnerabilities.
 * @param {FileContent[]} files - Array of files to scan.
 * @returns {SecurityReport} A detailed security report containing findings, score, and summary.
 */
export function auditRepositorySecurity(files: FileContent[]): SecurityReport {
  const findings: SecurityFinding[] = [];
  
  const summary = {
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    infoCount: 0,
    totalFindings: 0,
    scannedFilesCount: 0,
    scannedLinesCount: 0,
  };
  
  const categoryCounts: Record<VulnerabilityCategory, number> = {
    'secrets': 0,
    'owasp-injection': 0,
    'xss': 0,
    'insecure-crypto': 0,
    'unhandled-error': 0,
    'hardcoded-credentials': 0,
    'insecure-config': 0,
    'dependency-risk': 0,
  };

  for (const file of files) {
    if (!file.content || typeof file.content !== 'string') {
      continue;
    }
    
    // Skip likely binary files or minified bundles
    const isLikelyBinary = file.path && file.path.match(/\.(png|jpe?g|gif|svg|ico|eot|woff2?|ttf|pdf|zip|tar|gz|mp[34])$/i);
    const isMinifiedOrVendor = file.path && (file.path.includes('node_modules') || file.path.includes('.min.js'));
    
    if (isLikelyBinary || isMinifiedOrVendor) {
      continue;
    }

    summary.scannedFilesCount++;
    const lines = file.content.split(/\r?\n/);
    summary.scannedLinesCount += lines.length;

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      if (lineText.length > 2000) {
        // Skip excessively long lines to prevent ReDoS and performance issues
        continue;
      }

      for (const rule of RULES) {
        try {
          const match = rule.regex.exec(lineText);
          if (match) {
            findings.push({
              id: `${rule.id}-${Math.random().toString(36).substring(2, 9)}`,
              filePath: file.path || 'unknown',
              line: i + 1,
              column: match.index + 1,
              ruleId: rule.id,
              title: rule.title,
              description: rule.description,
              category: rule.category,
              severity: rule.severity,
              snippet: lineText.trim().substring(0, 200),
              remediation: rule.remediation,
              cwe: rule.cwe,
            });

            summary.totalFindings++;
            switch (rule.severity) {
              case 'critical': summary.criticalCount++; break;
              case 'high': summary.highCount++; break;
              case 'medium': summary.mediumCount++; break;
              case 'low': summary.lowCount++; break;
              case 'info': summary.infoCount++; break;
            }
            categoryCounts[rule.category]++;
          }
        } catch (error) {
          // Robustness against regex errors
          console.error(`Regex error for rule ${rule.id} on file ${file.path}:`, error);
        }
      }
    }
  }

  // Calculate score
  let score = 100;
  score -= summary.criticalCount * 15;
  score -= summary.highCount * 8;
  score -= summary.mediumCount * 3;
  score -= summary.lowCount * 1;
  score = Math.max(0, Math.min(100, score));

  // Determine grade
  let grade: SecurityReport['grade'];
  if (score >= 95) grade = 'A+';
  else if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 55) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  return {
    score,
    grade,
    findings,
    summary,
    categoryCounts,
  };
}

/**
 * Converts a security report to markdown format.
 * @param {SecurityReport} report - The security report.
 * @returns {string} Markdown representation of the report.
 */
export function toSecurityMarkdown(report: SecurityReport): string {
  let markdown = `# Security Audit Report\n\n`;
  
  markdown += `## Overall Status\n`;
  markdown += `- **Score:** ${report.score} / 100\n`;
  markdown += `- **Grade:** ${report.grade}\n`;
  markdown += `- **Files Scanned:** ${report.summary.scannedFilesCount}\n`;
  markdown += `- **Lines Scanned:** ${report.summary.scannedLinesCount}\n`;
  markdown += `- **Total Findings:** ${report.summary.totalFindings}\n\n`;

  markdown += `### Severity Breakdown\n`;
  markdown += `- Critical: ${report.summary.criticalCount}\n`;
  markdown += `- High: ${report.summary.highCount}\n`;
  markdown += `- Medium: ${report.summary.mediumCount}\n`;
  markdown += `- Low: ${report.summary.lowCount}\n`;
  markdown += `- Info: ${report.summary.infoCount}\n\n`;

  markdown += `## Findings\n`;

  if (report.findings.length === 0) {
    markdown += `\n*No security findings detected. Great job!*\n`;
  } else {
    for (const finding of report.findings) {
      markdown += `\n### [${finding.severity.toUpperCase()}] ${finding.title} (${finding.ruleId})\n`;
      markdown += `- **File:** \`${finding.filePath}:${finding.line}\`\n`;
      markdown += `- **Category:** ${finding.category}\n`;
      markdown += `- **Description:** ${finding.description}\n`;
      markdown += `- **Remediation:** ${finding.remediation}\n`;
      if (finding.cwe) {
        markdown += `- **CWE:** ${finding.cwe}\n`;
      }
      markdown += `- **Snippet:**\n\`\`\`typescript\n${finding.snippet}\n\`\`\`\n`;
    }
  }

  return markdown;
}

/**
 * Converts a security report to a JSON string.
 * @param {SecurityReport} report - The security report.
 * @returns {string} JSON representation of the report.
 */
export function toSecurityJSON(report: SecurityReport): string {
  return JSON.stringify(report, null, 2);
}
