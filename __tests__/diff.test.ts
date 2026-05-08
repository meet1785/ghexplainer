/**
 * Tests for the GitHub PR diff utilities.
 *
 * Validates: PR URL parsing, change summarisation, and diff context building.
 * All functions are pure — no network calls needed.
 */

import { describe, it, expect } from "vitest";
import {
  parsePRUrl,
  summarizePRChanges,
  buildPRDiffContext,
  type ParsedPRUrl,
} from "@/lib/diff";
import type { PRInfo, PRFile } from "@/lib/github";

// ─── Fixtures ─────────────────────────────────────────────────

const BASE_PR_INFO: PRInfo = {
  number: 42,
  title: "Fix authentication bug",
  body: "Resolves the login issue reported in #40.",
  state: "open",
  additions: 30,
  deletions: 10,
  changedFiles: 3,
  user: "octocat",
  createdAt: "2024-01-15T10:00:00Z",
  mergedAt: null,
  headRef: "fix/auth-bug",
  baseRef: "main",
};

function makeFile(overrides: Partial<PRFile> = {}): PRFile {
  return {
    filename: "src/auth.ts",
    status: "modified",
    additions: 10,
    deletions: 5,
    ...overrides,
  };
}

// ─── parsePRUrl ───────────────────────────────────────────────

describe("parsePRUrl", () => {
  it("should parse a standard PR URL", () => {
    const result = parsePRUrl("https://github.com/vercel/next.js/pull/42");
    expect(result).toEqual<ParsedPRUrl>({ owner: "vercel", repo: "next.js", prNumber: 42 });
  });

  it("should parse a PR URL with /files suffix", () => {
    const result = parsePRUrl("https://github.com/owner/repo/pull/100/files");
    expect(result).toEqual<ParsedPRUrl>({ owner: "owner", repo: "repo", prNumber: 100 });
  });

  it("should parse a PR URL without protocol (github.com/...)", () => {
    const result = parsePRUrl("github.com/owner/repo/pull/7");
    expect(result).toEqual<ParsedPRUrl>({ owner: "owner", repo: "repo", prNumber: 7 });
  });

  it("should parse a PR URL with www prefix", () => {
    const result = parsePRUrl("https://www.github.com/owner/repo/pull/5");
    expect(result).toEqual<ParsedPRUrl>({ owner: "owner", repo: "repo", prNumber: 5 });
  });

  it("should trim whitespace before parsing", () => {
    const result = parsePRUrl("  https://github.com/owner/repo/pull/3  ");
    expect(result?.prNumber).toBe(3);
  });

  it("should return null for a plain repo URL (no /pull/)", () => {
    expect(parsePRUrl("https://github.com/owner/repo")).toBeNull();
  });

  it("should return null for a tree/blob URL", () => {
    expect(parsePRUrl("https://github.com/owner/repo/tree/main/src")).toBeNull();
  });

  it("should return null for a non-GitHub URL", () => {
    expect(parsePRUrl("https://gitlab.com/owner/repo/pull/1")).toBeNull();
  });

  it("should return null for an empty string", () => {
    expect(parsePRUrl("")).toBeNull();
  });

  it("should return null for a random non-URL string", () => {
    expect(parsePRUrl("not-a-url")).toBeNull();
  });

  it("should return null for PR number 0", () => {
    expect(parsePRUrl("https://github.com/owner/repo/pull/0")).toBeNull();
  });

  it("should return null for non-numeric PR number", () => {
    expect(parsePRUrl("https://github.com/owner/repo/pull/abc")).toBeNull();
  });

  it("should handle large PR numbers", () => {
    const result = parsePRUrl("https://github.com/owner/repo/pull/99999");
    expect(result?.prNumber).toBe(99999);
  });
});

// ─── summarizePRChanges ───────────────────────────────────────

describe("summarizePRChanges", () => {
  it("should count added, modified, removed, and renamed files", () => {
    const files: PRFile[] = [
      makeFile({ status: "added",    additions: 50, deletions: 0 }),
      makeFile({ filename: "b.ts", status: "modified",  additions: 10, deletions: 5 }),
      makeFile({ filename: "c.ts", status: "removed",   additions: 0,  deletions: 30 }),
      makeFile({ filename: "d.ts", status: "renamed",   additions: 2,  deletions: 1 }),
    ];
    const summary = summarizePRChanges(files);
    expect(summary.added).toBe(1);
    expect(summary.modified).toBe(1);
    expect(summary.removed).toBe(1);
    expect(summary.renamed).toBe(1);
  });

  it("should sum total additions and deletions", () => {
    const files: PRFile[] = [
      makeFile({ additions: 10, deletions: 3 }),
      makeFile({ filename: "b.ts", additions: 20, deletions: 7 }),
    ];
    const summary = summarizePRChanges(files);
    expect(summary.totalAdditions).toBe(30);
    expect(summary.totalDeletions).toBe(10);
  });

  it("should return zeroes for an empty file list", () => {
    const summary = summarizePRChanges([]);
    expect(summary.added).toBe(0);
    expect(summary.modified).toBe(0);
    expect(summary.removed).toBe(0);
    expect(summary.renamed).toBe(0);
    expect(summary.totalAdditions).toBe(0);
    expect(summary.totalDeletions).toBe(0);
    expect(summary.topChangedFiles).toHaveLength(0);
  });

  it("should include top changed files sorted by total diff size", () => {
    const files: PRFile[] = [
      makeFile({ filename: "small.ts", additions: 1,  deletions: 1 }),
      makeFile({ filename: "large.ts", additions: 100, deletions: 50 }),
      makeFile({ filename: "mid.ts",   additions: 20,  deletions: 5 }),
    ];
    const summary = summarizePRChanges(files);
    expect(summary.topChangedFiles[0].filename).toBe("large.ts");
    expect(summary.topChangedFiles[1].filename).toBe("mid.ts");
    expect(summary.topChangedFiles[2].filename).toBe("small.ts");
  });

  it("should cap topChangedFiles at 10", () => {
    const files = Array.from({ length: 15 }, (_, i) =>
      makeFile({ filename: `file${i}.ts`, additions: i, deletions: 0 })
    );
    const summary = summarizePRChanges(files);
    expect(summary.topChangedFiles).toHaveLength(10);
  });

  it("should treat 'copied' and 'changed' statuses as modified", () => {
    const files: PRFile[] = [
      makeFile({ status: "copied" }),
      makeFile({ filename: "b.ts", status: "changed" }),
    ];
    const summary = summarizePRChanges(files);
    expect(summary.modified).toBe(2);
  });
});

// ─── buildPRDiffContext ───────────────────────────────────────

describe("buildPRDiffContext", () => {
  it("should include the PR number and title", () => {
    const ctx = buildPRDiffContext(BASE_PR_INFO, [makeFile()]);
    expect(ctx).toContain("Pull Request #42");
    expect(ctx).toContain("Fix authentication bug");
  });

  it("should include the PR description when present", () => {
    const ctx = buildPRDiffContext(BASE_PR_INFO, [makeFile()]);
    expect(ctx).toContain("Resolves the login issue");
  });

  it("should include base and head branch names", () => {
    const ctx = buildPRDiffContext(BASE_PR_INFO, [makeFile()]);
    expect(ctx).toContain("main");
    expect(ctx).toContain("fix/auth-bug");
  });

  it("should include change statistics", () => {
    const ctx = buildPRDiffContext(BASE_PR_INFO, [
      makeFile({ additions: 10, deletions: 5 }),
    ]);
    expect(ctx).toContain("+10");
    expect(ctx).toContain("-5");
  });

  it("should include filenames for each changed file", () => {
    const ctx = buildPRDiffContext(BASE_PR_INFO, [
      makeFile({ filename: "src/auth.ts" }),
      makeFile({ filename: "src/user.ts" }),
    ]);
    expect(ctx).toContain("src/auth.ts");
    expect(ctx).toContain("src/user.ts");
  });

  it("should include patch content when present", () => {
    const ctx = buildPRDiffContext(BASE_PR_INFO, [
      makeFile({ patch: "@@ -1,3 +1,4 @@\n+const x = 1;" }),
    ]);
    expect(ctx).toContain("@@ -1,3 +1,4 @@");
    expect(ctx).toContain("const x = 1");
  });

  it("should truncate very long patch content", () => {
    const longPatch = "+" + "x".repeat(5000);
    const ctx = buildPRDiffContext(BASE_PR_INFO, [makeFile({ patch: longPatch })]);
    expect(ctx).toContain("truncated");
    // The patch should be capped, not the full 5000 chars included verbatim
    expect(ctx.length).toBeLessThan(longPatch.length + 2000);
  });

  it("should not include a Description section when body is empty", () => {
    const prNoBody: PRInfo = { ...BASE_PR_INFO, body: "" };
    const ctx = buildPRDiffContext(prNoBody, [makeFile()]);
    expect(ctx).not.toContain("### Description");
  });

  it("should handle a PR with no changed files", () => {
    expect(() => buildPRDiffContext(BASE_PR_INFO, [])).not.toThrow();
    const ctx = buildPRDiffContext(BASE_PR_INFO, []);
    expect(ctx).toContain("Files changed: **0**");
  });

  it("should mark merged PRs correctly", () => {
    const merged: PRInfo = { ...BASE_PR_INFO, state: "merged", mergedAt: "2024-02-01T00:00:00Z" };
    const ctx = buildPRDiffContext(merged, []);
    expect(ctx).toContain("merged");
  });
});
