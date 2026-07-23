/**
 * Unit tests for lib/security.ts — Security Radar SAST Audit Engine.
 */

import { describe, it, expect } from "vitest";
import {
  auditRepositorySecurity,
  toSecurityMarkdown,
  toSecurityJSON,
  type SecurityReport,
} from "../lib/security";

const VULNERABLE_FILES = [
  {
    path: "src/config/aws.ts",
    content: `
export const AWS_CONFIG = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};
`,
  },
  {
    path: "src/api/user.ts",
    content: `
import { db } from "../db";

export function getUser(id: string) {
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  return db.query(query);
}

export function renderUserBio(bio: string) {
  document.getElementById("bio").dangerouslySetInnerHTML = { __html: bio };
}

export function runDynamicCode(code: string) {
  eval(code);
}
`,
  },
  {
    path: "src/crypto/token.ts",
    content: `
export function generateSessionToken() {
  return Math.random().toString(36).substring(2);
}
`,
  },
  {
    path: "server.py",
    content: `
import os
import subprocess

def execute_cmd(user_input):
    exec("print('hello')")
    subprocess.Popen(user_input, shell=True)
`,
  },
];

const CLEAN_FILES = [
  {
    path: "src/math.ts",
    content: `
export function add(a: number, b: number): number {
  return a + b;
}
`,
  },
  {
    path: "src/logger.ts",
    content: `
export class Logger {
  log(msg: string) {
    console.log(msg);
  }
}
`,
  },
];

describe("auditRepositorySecurity", () => {
  it("should detect secrets, AWS keys, code injection, and XSS risks", () => {
    const report = auditRepositorySecurity(VULNERABLE_FILES);

    expect(report).toBeDefined();
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);

    // Should find AWS key
    const awsFinding = report.findings.find((f) => f.ruleId === "SEC-001");
    expect(awsFinding).toBeDefined();
    expect(awsFinding?.severity).toBe("critical");

    // Should find eval() / code injection
    const evalFinding = report.findings.find((f) => f.ruleId === "SEC-007");
    expect(evalFinding).toBeDefined();
    expect(evalFinding?.severity).toBe("high");

    // Should find SQL string concatenation
    const sqlFinding = report.findings.find((f) => f.ruleId === "SEC-010");
    expect(sqlFinding).toBeDefined();

    // Should find dangerouslySetInnerHTML
    const xssFinding = report.findings.find((f) => f.ruleId === "SEC-006");
    expect(xssFinding).toBeDefined();
  });

  it("should assign grade A+ to clean codebases", () => {
    const report = auditRepositorySecurity(CLEAN_FILES);

    expect(report.score).toBe(100);
    expect(report.grade).toBe("A+");
    expect(report.findings.length).toBe(0);
    expect(report.summary.criticalCount).toBe(0);
    expect(report.summary.highCount).toBe(0);
  });

  it("should calculate correct summary statistics", () => {
    const report = auditRepositorySecurity(VULNERABLE_FILES);

    expect(report.summary.scannedFilesCount).toBe(4);
    expect(report.summary.scannedLinesCount).toBeGreaterThan(0);
    expect(report.summary.totalFindings).toBe(report.findings.length);
  });

  it("should handle empty array gracefully", () => {
    const report = auditRepositorySecurity([]);

    expect(report.score).toBe(100);
    expect(report.grade).toBe("A+");
    expect(report.findings).toEqual([]);
    expect(report.summary.scannedFilesCount).toBe(0);
  });
});

describe("toSecurityMarkdown", () => {
  it("should generate structured Markdown report", () => {
    const report = auditRepositorySecurity(VULNERABLE_FILES);
    const md = toSecurityMarkdown(report);

    expect(md).toContain("# Security Audit Report");
    expect(md).toContain("Grade");
    expect(md).toContain("Findings");
  });
});

describe("toSecurityJSON", () => {
  it("should serialize report to valid JSON string", () => {
    const report = auditRepositorySecurity(VULNERABLE_FILES);
    const jsonStr = toSecurityJSON(report);

    const parsed = JSON.parse(jsonStr) as SecurityReport;
    expect(parsed.score).toBe(report.score);
    expect(parsed.grade).toBe(report.grade);
    expect(parsed.findings.length).toBe(report.findings.length);
  });
});
