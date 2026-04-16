/**
 * Tests for GitHub URL parsing and file selection logic.
 *
 * Validates: URL parsing, file filtering, extension detection.
 * Only tests pure functions (no network calls).
 */

import { describe, it, expect } from "vitest";
import { parseGitHubTarget, parseGitHubUrl, selectReadableFiles, type TreeFile } from "@/lib/github";

describe("parseGitHubUrl", () => {
  it("should parse standard HTTPS URL", () => {
    const result = parseGitHubUrl("https://github.com/vercel/next.js");
    expect(result).toEqual({ owner: "vercel", repo: "next.js" });
  });

  it("should parse URL with .git suffix", () => {
    const result = parseGitHubUrl("https://github.com/facebook/react.git");
    expect(result).toEqual({ owner: "facebook", repo: "react" });
  });

  it("should parse URL with trailing slash", () => {
    const result = parseGitHubUrl("https://github.com/expressjs/express/");
    expect(result).toEqual({ owner: "expressjs", repo: "express" });
  });

  it("should parse URL with sub-paths", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo/tree/main/src");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("should parse URL without protocol", () => {
    const result = parseGitHubUrl("github.com/pallets/flask");
    expect(result).toEqual({ owner: "pallets", repo: "flask" });
  });

  it("should parse owner/repo shorthand", () => {
    const result = parseGitHubUrl("pallets/flask");
    expect(result).toEqual({ owner: "pallets", repo: "flask" });
  });

  it("should parse SSH URL", () => {
    const result = parseGitHubUrl("git@github.com:facebook/react.git");
    expect(result).toEqual({ owner: "facebook", repo: "react" });
  });

  it("should parse ssh:// URL", () => {
    const result = parseGitHubUrl("ssh://git@github.com/vercel/next.js");
    expect(result).toEqual({ owner: "vercel", repo: "next.js" });
  });

  it("should strip query/hash from URL", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo?tab=readme-ov-file")).toEqual({
      owner: "owner",
      repo: "repo",
    });
    expect(parseGitHubUrl("https://github.com/owner/repo#readme")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("should handle www prefix", () => {
    const result = parseGitHubUrl("https://www.github.com/owner/repo");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("should handle leading/trailing whitespace", () => {
    const result = parseGitHubUrl("  https://github.com/owner/repo  ");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("should throw for invalid URLs", () => {
    expect(() => parseGitHubUrl("https://gitlab.com/owner/repo")).toThrow("Invalid GitHub URL");
    expect(() => parseGitHubUrl("not-a-url")).toThrow("Invalid GitHub URL");
    expect(() => parseGitHubUrl("")).toThrow("Invalid GitHub URL");
    expect(() => parseGitHubUrl("-owner/repo")).toThrow("Invalid GitHub URL");
    expect(() => parseGitHubUrl("owner/repo!")).toThrow("Invalid GitHub URL");
    expect(() => parseGitHubUrl("owner-/repo")).toThrow("Invalid GitHub URL");
    expect(() => parseGitHubUrl("owner/.repo")).toThrow("Invalid GitHub URL");
    expect(() => parseGitHubUrl(`${"a".repeat(40)}/repo`)).toThrow("Invalid GitHub URL");
  });

  it("should throw for URLs missing repo", () => {
    expect(() => parseGitHubUrl("https://github.com/")).toThrow();
    expect(() => parseGitHubUrl("https://github.com/owner-only")).toThrow();
  });
});

describe("parseGitHubTarget", () => {
  it("should extract ref from tree URLs", () => {
    const result = parseGitHubTarget("https://github.com/owner/repo/tree/develop/src/app");
    expect(result).toEqual({ owner: "owner", repo: "repo", ref: "develop" });
  });

  it("should extract ref from blob URLs", () => {
    const result = parseGitHubTarget("https://github.com/owner/repo/blob/release-1.2.0/README.md");
    expect(result).toEqual({ owner: "owner", repo: "repo", ref: "release-1.2.0" });
  });

  it("should use query ref when provided", () => {
    const result = parseGitHubTarget("https://github.com/owner/repo?ref=feature%2Fbeta");
    expect(result).toEqual({ owner: "owner", repo: "repo", ref: "feature/beta" });
  });
});

describe("selectReadableFiles", () => {
  function makeTree(paths: string[]): TreeFile[] {
    return paths.map((path) => ({ path, type: "blob" as const, size: 1000 }));
  }

  it("should include source code files", () => {
    const tree = makeTree([
      "src/index.ts",
      "src/utils.ts",
      "lib/main.py",
      "app/server.go",
    ]);
    const selected = selectReadableFiles(tree);
    expect(selected.map((f) => f.path)).toEqual([
      "src/index.ts",
      "src/utils.ts",
      "lib/main.py",
      "app/server.go",
    ]);
  });

  it("should exclude node_modules", () => {
    const tree = makeTree(["node_modules/lodash/index.js", "src/app.ts"]);
    const selected = selectReadableFiles(tree);
    expect(selected.map((f) => f.path)).toEqual(["src/app.ts"]);
  });

  it("should exclude test files", () => {
    const tree = makeTree([
      "src/app.ts",
      "src/app.test.ts",
      "src/app.spec.ts",
      "test/helper.ts",
      "__tests__/unit.ts",
    ]);
    const selected = selectReadableFiles(tree);
    expect(selected.map((f) => f.path)).toEqual(["src/app.ts"]);
  });

  it("should exclude lock files and configs", () => {
    const tree = makeTree([
      "package-lock.json",
      "yarn.lock",
      ".eslintrc.json",
      "tsconfig.json",
      "src/index.ts",
    ]);
    const selected = selectReadableFiles(tree);
    expect(selected.map((f) => f.path)).toEqual(["src/index.ts"]);
  });

  it("should exclude markdown/text documentation", () => {
    const tree = makeTree([
      "README.md",
      "docs/guide.md",
      "CHANGELOG.md",
      "src/code.ts",
    ]);
    const selected = selectReadableFiles(tree);
    expect(selected.map((f) => f.path)).toEqual(["src/code.ts"]);
  });

  it("should exclude tree items (directories)", () => {
    const tree: TreeFile[] = [
      { path: "src", type: "tree" },
      { path: "src/index.ts", type: "blob", size: 100 },
    ];
    const selected = selectReadableFiles(tree);
    expect(selected.map((f) => f.path)).toEqual(["src/index.ts"]);
  });

  it("should exclude generated/minified files", () => {
    const tree = makeTree([
      "dist/bundle.min.js",
      "styles.min.css",
      "proto.pb.ts",
      "src/real.ts",
    ]);
    const selected = selectReadableFiles(tree);
    expect(selected.map((f) => f.path)).toEqual(["src/real.ts"]);
  });

  it("should exclude seed/fixture data files", () => {
    const tree = makeTree([
      "seed-history.ts",
      "seed-data.js",
      "src/app.ts",
    ]);
    const selected = selectReadableFiles(tree);
    expect(selected.map((f) => f.path)).toEqual(["src/app.ts"]);
  });

  it("should include Dockerfile and Makefile", () => {
    const tree = makeTree(["Dockerfile", "Makefile", "src/main.go"]);
    const selected = selectReadableFiles(tree);
    expect(selected.map((f) => f.path).sort()).toEqual(
      ["Dockerfile", "Makefile", "src/main.go"].sort()
    );
  });

  it("should include CSS and HTML files", () => {
    const tree = makeTree(["app/globals.css", "templates/index.html", "src/app.ts"]);
    const selected = selectReadableFiles(tree);
    expect(selected.length).toBe(3);
  });
});
