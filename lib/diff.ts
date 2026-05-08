/**
 * GitHub PR diff utilities.
 *
 * Provides pure functions for:
 * - Parsing GitHub pull-request URLs into their constituent parts.
 * - Summarising the set of changed files in a PR.
 * - Building a human-readable diff context string suitable for LLM prompts.
 *
 * Network calls (fetchPRInfo / fetchPRFiles) live in github.ts; this module
 * is intentionally side-effect-free so it is fully testable without mocks.
 */

import type { PRInfo, PRFile } from "./github";

// ─── URL parsing ─────────────────────────────────────────────

export interface ParsedPRUrl {
  owner: string;
  repo: string;
  prNumber: number;
}

/**
 * Parse a GitHub pull-request URL and extract the owner, repo, and PR number.
 *
 * Accepted formats:
 * - `https://github.com/owner/repo/pull/123`
 * - `https://github.com/owner/repo/pull/123/files`
 * - `github.com/owner/repo/pull/123` (no protocol)
 *
 * @returns The parsed result, or `null` if the URL is not a recognisable PR URL.
 *
 * @example
 *   parsePRUrl("https://github.com/vercel/next.js/pull/42")
 *   // → { owner: "vercel", repo: "next.js", prNumber: 42 }
 *
 *   parsePRUrl("https://github.com/owner/repo")
 *   // → null
 */
export function parsePRUrl(url: string): ParsedPRUrl | null {
  const input = url.trim();
  if (!input) return null;

  // Normalise optional missing protocol so URL() can parse it
  let normalized = input;
  if (/^github\.com\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;

  // Expect path segments: /<owner>/<repo>/pull/<number>[/...]
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 4) return null;
  if (segments[2]?.toLowerCase() !== "pull") return null;

  const owner = segments[0];
  const repo = segments[1];
  const prNumber = parseInt(segments[3], 10);

  if (!owner || !repo || !Number.isInteger(prNumber) || prNumber <= 0) return null;

  return { owner, repo, prNumber };
}

// ─── Change summary ───────────────────────────────────────────

export interface PRChangeSummary {
  /** Files added in this PR */
  added: number;
  /** Files modified in this PR */
  modified: number;
  /** Files removed in this PR */
  removed: number;
  /** Files renamed in this PR */
  renamed: number;
  /** Total lines added across all files */
  totalAdditions: number;
  /** Total lines deleted across all files */
  totalDeletions: number;
  /** Up to 10 most-changed files, sorted by total diff size */
  topChangedFiles: PRFile[];
}

/**
 * Summarise the changed files in a pull request.
 *
 * @param files - Array of PR files as returned by `fetchPRFiles`.
 * @returns A structured summary with counts and the top changed files.
 *
 * @example
 *   summarizePRChanges([
 *     { filename: "src/app.ts", status: "modified", additions: 10, deletions: 5 },
 *     { filename: "src/new.ts", status: "added",    additions: 50, deletions: 0 },
 *   ])
 *   // → { added: 1, modified: 1, removed: 0, renamed: 0, totalAdditions: 60, ... }
 */
export function summarizePRChanges(files: PRFile[]): PRChangeSummary {
  let added = 0;
  let modified = 0;
  let removed = 0;
  let renamed = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const f of files) {
    switch (f.status) {
      case "added":    added++;    break;
      case "removed":  removed++;  break;
      case "renamed":  renamed++;  break;
      default:         modified++; break;  // "modified" | "copied" | "changed" | "unchanged"
    }
    totalAdditions += f.additions;
    totalDeletions += f.deletions;
  }

  const topChangedFiles = [...files]
    .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))
    .slice(0, 10);

  return { added, modified, removed, renamed, totalAdditions, totalDeletions, topChangedFiles };
}

// ─── LLM context builder ─────────────────────────────────────

/**
 * Build a compact, human-readable context string from PR metadata and its
 * changed files.  Intended for inclusion in an LLM prompt.
 *
 * Patch content is included for each file where available, capped to
 * `MAX_PATCH_CHARS` per file so the total context stays within token limits.
 *
 * @param prInfo - PR metadata (title, description, state, etc.).
 * @param files  - Changed files with optional patch text.
 * @returns A Markdown-formatted string summarising the PR diff.
 */
export function buildPRDiffContext(prInfo: PRInfo, files: PRFile[]): string {
  const MAX_PATCH_CHARS = 3000;
  const summary = summarizePRChanges(files);

  const lines: string[] = [
    `## Pull Request #${prInfo.number}: ${prInfo.title}`,
    "",
    `**State:** ${prInfo.state}  `,
    `**Author:** ${prInfo.user}  `,
    `**Base ← Head:** \`${prInfo.baseRef}\` ← \`${prInfo.headRef}\`  `,
    `**Created:** ${prInfo.createdAt ? prInfo.createdAt.slice(0, 10) : "unknown"}`,
    "",
  ];

  if (prInfo.body?.trim()) {
    lines.push("### Description", "", prInfo.body.trim(), "");
  }

  lines.push(
    "### Change Statistics",
    "",
    `- Files changed: **${files.length}** (+${summary.added} added, ~${summary.modified} modified, -${summary.removed} removed, ↪${summary.renamed} renamed)`,
    `- Lines: **+${summary.totalAdditions}** / **-${summary.totalDeletions}**`,
    "",
    "### Changed Files",
    "",
  );

  for (const f of files) {
    const statusIcon = { added: "✚", removed: "✖", renamed: "↪", modified: "~", copied: "⊕", changed: "~", unchanged: "=" }[f.status] ?? "~";
    lines.push(`#### ${statusIcon} \`${f.filename}\` (+${f.additions} / -${f.deletions})`);

    if (f.patch) {
      const patch = f.patch.length > MAX_PATCH_CHARS
        ? f.patch.slice(0, MAX_PATCH_CHARS) + "\n… (patch truncated)"
        : f.patch;
      lines.push("```diff", patch, "```");
    }
    lines.push("");
  }

  return lines.join("\n");
}
