/**
 * Tests for the smart code chunking module.
 *
 * Validates: module grouping, dependency extraction,
 * chunk splitting, dependency-aware sorting, budget limits.
 */

import { describe, it, expect } from "vitest";
import { chunkByModule, describeChunks, type CodeChunk } from "@/lib/chunker";
import type { FileContent } from "@/lib/github";

describe("chunkByModule", () => {
  function makeFile(path: string, content: string = "const x = 1;"): FileContent {
    return { path, content };
  }

  it("should group files by top-level directory", () => {
    const files = [
      makeFile("src/index.ts"),
      makeFile("src/utils.ts"),
      makeFile("lib/helpers.ts"),
    ];
    const chunks = chunkByModule(files);
    const moduleNames = chunks.map((c) => c.module);
    expect(moduleNames).toContain("src");
    expect(moduleNames).toContain("lib");
  });

  it("should group root files under (root)", () => {
    const files = [
      makeFile("package.json", '{"name": "test"}'),
      makeFile("index.ts", "export {};"),
    ];
    const chunks = chunkByModule(files);
    expect(chunks.some((c) => c.module === "(root)")).toBe(true);
  });

  it("should use 2-level deep grouping", () => {
    const files = [
      makeFile("src/components/Button.tsx", "export function Button() {}"),
      makeFile("src/components/Input.tsx", "export function Input() {}"),
      makeFile("src/utils/format.ts", "export function format() {}"),
    ];
    const chunks = chunkByModule(files);
    const moduleNames = chunks.map((c) => c.module);
    expect(moduleNames).toContain("src/components");
    expect(moduleNames).toContain("src/utils");
  });

  it("should detect ES module imports as dependencies", () => {
    const files = [
      makeFile("src/app.ts", 'import { helper } from "./utils";'),
      makeFile("src/utils.ts", 'export function helper() { return 1; }'),
    ];
    const chunks = chunkByModule(files);
    const srcChunk = chunks.find((c) => c.module === "src");
    expect(srcChunk).toBeDefined();
    expect(srcChunk!.dependencies.length).toBeGreaterThan(0);
    expect(srcChunk!.dependencies).toContain("./utils");
  });

  it("should detect CommonJS require as dependencies", () => {
    const files = [
      makeFile("src/server.js", 'const db = require("./database");'),
    ];
    const chunks = chunkByModule(files);
    const srcChunk = chunks.find((c) => c.module === "src");
    expect(srcChunk!.dependencies).toContain("./database");
  });

  it("should calculate total character count per chunk", () => {
    const content = "x".repeat(100);
    const files = [
      makeFile("src/a.ts", content),
      makeFile("src/b.ts", content),
    ];
    const chunks = chunkByModule(files);
    const srcChunk = chunks.find((c) => c.module === "src");
    expect(srcChunk!.totalChars).toBe(200);
  });

  it("should sort (root) module first", () => {
    const files = [
      makeFile("src/app.ts", 'import { x } from "./lib"; import { y } from "./utils";'),
      makeFile("package.json", '{"name": "test"}'),
      makeFile("lib/utils.ts", "export const x = 1;"),
    ];
    const chunks = chunkByModule(files);
    expect(chunks[0].module).toBe("(root)");
  });

  it("should limit to MAX_CHUNKS (3)", () => {
    const files = [
      makeFile("a/file.ts"),
      makeFile("b/file.ts"),
      makeFile("c/file.ts"),
      makeFile("d/file.ts"),
      makeFile("e/file.ts"),
    ];
    const chunks = chunkByModule(files);
    expect(chunks.length).toBeLessThanOrEqual(3);
  });

  it("should handle empty input", () => {
    const chunks = chunkByModule([]);
    expect(chunks).toEqual([]);
  });
});

describe("describeChunks", () => {
  it("should produce a readable summary", () => {
    const chunks: CodeChunk[] = [
      {
        module: "src",
        files: [
          { path: "src/index.ts", content: "// code" },
          { path: "src/utils.ts", content: "// more" },
        ],
        totalChars: 1234,
        dependencies: ["./lib"],
      },
    ];
    const desc = describeChunks(chunks);
    expect(desc).toContain("## Code Modules (1 chunks)");
    expect(desc).toContain("### Module: src");
    expect(desc).toContain("Files: 2");
    expect(desc).toContain("Internal deps: ./lib");
    expect(desc).toContain("src/index.ts");
  });

  it("should handle chunks with no dependencies", () => {
    const chunks: CodeChunk[] = [
      {
        module: "(root)",
        files: [{ path: "index.ts", content: "" }],
        totalChars: 0,
        dependencies: [],
      },
    ];
    const desc = describeChunks(chunks);
    expect(desc).not.toContain("Internal deps:");
  });
});
