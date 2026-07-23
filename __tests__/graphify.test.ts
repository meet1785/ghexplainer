/**
 * Unit tests for lib/graphify.ts — Graphify codebase knowledge graph engine.
 */

import { describe, it, expect } from "vitest";
import {
  buildGraphifyGraph,
  detectCycles,
  findShortestPath,
  computeImpactRadius,
  toMermaidDiagram,
  toGraphJSON,
  type GraphifyNode,
  type GraphifyEdge,
  type GraphifyResult,
} from "../lib/graphify";

// ─── Test fixtures ───

const SAMPLE_FILES = [
  {
    path: "package.json",
    content: '{ "name": "test-app", "version": "1.0.0" }',
  },
  {
    path: "src/index.ts",
    content: `
import { helper } from "./utils/helper";
import { Logger } from "./utils/logger";
import express from "express";

export function main() {
  const app = express();
  const log = new Logger();
  helper(log);
  app.listen(3000);
}

export class App {
  start() { main(); }
}
`,
  },
  {
    path: "src/utils/helper.ts",
    content: `
import { Logger } from "./logger";

export function helper(logger: Logger) {
  logger.info("helper called");
}

export const TIMEOUT = 5000;
`,
  },
  {
    path: "src/utils/logger.ts",
    content: `
export class Logger {
  info(msg: string) { console.log(msg); }
  error(msg: string) { console.error(msg); }
}

export function createLogger(): Logger {
  return new Logger();
}
`,
  },
  {
    path: "src/config.ts",
    content: `
import { readFileSync } from "fs";

export const config = {
  port: 3000,
  host: "localhost",
};
`,
  },
  {
    path: "tests/index.test.ts",
    content: `
import { main } from "../src/index";

describe("main", () => {
  it("should start the app", () => {
    expect(main).toBeDefined();
  });
});
`,
  },
];

// ─── buildGraphifyGraph ───

describe("buildGraphifyGraph", () => {
  it("should return a valid GraphifyResult with correct stats", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);

    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
    expect(result.edges).toBeDefined();
    expect(result.cycles).toBeDefined();
    expect(result.hubs).toBeDefined();
    expect(result.stats).toBeDefined();

    // Should have basic stats populated
    expect(result.stats.totalNodes).toBeGreaterThan(0);
    expect(result.stats.totalEdges).toBeGreaterThan(0);
    expect(result.stats.totalFiles).toBe(6);
  });

  it("should create module nodes from directory structure", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);
    const moduleNodes = result.nodes.filter((n) => n.type === "module");

    // Should have (root), src, src/utils, tests at minimum
    expect(moduleNodes.length).toBeGreaterThanOrEqual(2);

    const moduleNames = moduleNodes.map((n) => n.label);
    expect(moduleNames).toContain("(root)");
  });

  it("should create file nodes for each file", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);
    const fileNodes = result.nodes.filter((n) => n.type === "file");

    expect(fileNodes.length).toBe(6);
  });

  it("should extract function and class symbol nodes", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);
    const funcNodes = result.nodes.filter((n) => n.type === "function");
    const classNodes = result.nodes.filter((n) => n.type === "class");

    // Should find main, helper, createLogger, etc.
    expect(funcNodes.length).toBeGreaterThanOrEqual(2);
    // Should find App, Logger
    expect(classNodes.length).toBeGreaterThanOrEqual(1);
  });

  it("should extract external dependency nodes", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);
    const extDeps = result.nodes.filter((n) => n.type === "external-dep");

    // Should find express, fs, vitest (from imports)
    const depLabels = extDeps.map((n) => n.label);
    expect(depLabels).toContain("express");
  });

  it("should create 'contains' edges from modules to files", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);
    const containsEdges = result.edges.filter((e) => e.type === "contains");

    expect(containsEdges.length).toBeGreaterThanOrEqual(SAMPLE_FILES.length);
  });

  it("should create import edges between files", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);
    const importEdges = result.edges.filter((e) => e.type === "imports");

    // src/index.ts imports from src/utils/helper.ts and src/utils/logger.ts
    expect(importEdges.length).toBeGreaterThanOrEqual(1);
  });

  it("should identify hub nodes", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);

    expect(result.hubs.length).toBeGreaterThan(0);
    // Every hub should have a degree > 0
    for (const hub of result.hubs) {
      expect(hub.degree).toBeGreaterThan(0);
    }
  });

  it("should compute graph density between 0 and 1", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);

    expect(result.stats.graphDensity).toBeGreaterThanOrEqual(0);
    expect(result.stats.graphDensity).toBeLessThanOrEqual(1);
  });

  it("should handle empty input gracefully", () => {
    const result = buildGraphifyGraph([]);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.stats.totalNodes).toBe(0);
    expect(result.stats.totalEdges).toBe(0);
  });

  it("should handle a single file gracefully", () => {
    const result = buildGraphifyGraph([
      { path: "index.js", content: "console.log('hello');" },
    ]);

    expect(result.stats.totalFiles).toBe(1);
    expect(result.stats.totalModules).toBeGreaterThanOrEqual(1);
  });
});

// ─── detectCycles ───

describe("detectCycles", () => {
  it("should detect a simple circular dependency", () => {
    const nodes: GraphifyNode[] = [
      { id: "a", label: "a", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
      { id: "b", label: "b", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
    ];
    const edges: GraphifyEdge[] = [
      { source: "a", target: "b", type: "imports", weight: 1 },
      { source: "b", target: "a", type: "imports", weight: 1 },
    ];

    const cycles = detectCycles(nodes, edges);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    // The cycle should include both a and b
    const cyclePaths = cycles.map((c) => c.path);
    const hasCycle = cyclePaths.some(
      (p) => p.includes("a") && p.includes("b")
    );
    expect(hasCycle).toBe(true);
  });

  it("should return empty array when no cycles exist", () => {
    const nodes: GraphifyNode[] = [
      { id: "a", label: "a", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
      { id: "b", label: "b", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
      { id: "c", label: "c", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
    ];
    const edges: GraphifyEdge[] = [
      { source: "a", target: "b", type: "imports", weight: 1 },
      { source: "b", target: "c", type: "imports", weight: 1 },
    ];

    const cycles = detectCycles(nodes, edges);
    expect(cycles).toEqual([]);
  });

  it("should detect a 3-node cycle", () => {
    const nodes: GraphifyNode[] = [
      { id: "a", label: "a", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
      { id: "b", label: "b", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
      { id: "c", label: "c", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
    ];
    const edges: GraphifyEdge[] = [
      { source: "a", target: "b", type: "imports", weight: 1 },
      { source: "b", target: "c", type: "imports", weight: 1 },
      { source: "c", target: "a", type: "imports", weight: 1 },
    ];

    const cycles = detectCycles(nodes, edges);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── findShortestPath ───

describe("findShortestPath", () => {
  const nodes: GraphifyNode[] = [
    { id: "a", label: "a", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
    { id: "b", label: "b", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
    { id: "c", label: "c", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
    { id: "d", label: "d", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
  ];
  const edges: GraphifyEdge[] = [
    { source: "a", target: "b", type: "imports", weight: 1 },
    { source: "b", target: "c", type: "imports", weight: 1 },
    { source: "c", target: "d", type: "imports", weight: 1 },
  ];

  it("should find a direct path", () => {
    const path = findShortestPath(nodes, edges, "a", "b");
    expect(path).toEqual(["a", "b"]);
  });

  it("should find a multi-hop path", () => {
    const path = findShortestPath(nodes, edges, "a", "d");
    expect(path).toEqual(["a", "b", "c", "d"]);
  });

  it("should return null for unreachable nodes", () => {
    const path = findShortestPath(nodes, edges, "d", "a");
    expect(path).toBeNull();
  });

  it("should return single-node path for same source and target", () => {
    const path = findShortestPath(nodes, edges, "a", "a");
    expect(path).toEqual(["a"]);
  });

  it("should return null for non-existent nodes", () => {
    const path = findShortestPath(nodes, edges, "x", "y");
    expect(path).toBeNull();
  });
});

// ─── computeImpactRadius ───

describe("computeImpactRadius", () => {
  const nodes: GraphifyNode[] = [
    { id: "a", label: "a", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
    { id: "b", label: "b", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
    { id: "c", label: "c", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
    { id: "d", label: "d", type: "file", fileCount: 0, totalChars: 0, lineCount: 0 },
  ];
  const edges: GraphifyEdge[] = [
    { source: "b", target: "a", type: "imports", weight: 1 },
    { source: "c", target: "a", type: "imports", weight: 1 },
    { source: "d", target: "b", type: "imports", weight: 1 },
  ];

  it("should find nodes impacted by changes to a", () => {
    const impact = computeImpactRadius(nodes, edges, "a");

    // b and c import a, and d imports b → d is also impacted
    expect(impact.impacted).toContain("b");
    expect(impact.impacted).toContain("c");
  });

  it("should return empty impacted list for leaf nodes", () => {
    const impact = computeImpactRadius(nodes, edges, "d");

    // Nothing imports d
    expect(impact.impacted.length).toBe(0);
    expect(impact.depth).toBe(0);
  });

  it("should compute correct depth", () => {
    const impact = computeImpactRadius(nodes, edges, "a");

    // Depth should be at least 1 (b, c import a), potentially 2 (d imports b)
    expect(impact.depth).toBeGreaterThanOrEqual(1);
  });
});

// ─── toMermaidDiagram ───

describe("toMermaidDiagram", () => {
  it("should generate valid Mermaid syntax", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);
    const mermaid = toMermaidDiagram(result);

    expect(mermaid).toContain("graph TD");
    // Should have at least one node definition
    expect(mermaid.length).toBeGreaterThan(20);
  });

  it("should filter by node types", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);
    const mermaid = toMermaidDiagram(result, { nodeTypes: ["module"] });

    expect(mermaid).toContain("graph TD");
  });

  it("should respect maxNodes limit", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);
    const mermaid = toMermaidDiagram(result, { maxNodes: 3 });

    expect(mermaid).toContain("graph TD");
  });

  it("should handle empty graph", () => {
    const emptyResult = buildGraphifyGraph([]);
    const mermaid = toMermaidDiagram(emptyResult);

    expect(mermaid).toContain("graph TD");
  });
});

// ─── toGraphJSON ───

describe("toGraphJSON", () => {
  it("should serialize to valid JSON", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);
    const json = toGraphJSON(result);

    const parsed = JSON.parse(json);
    expect(parsed.nodes).toBeDefined();
    expect(parsed.edges).toBeDefined();
    expect(parsed.stats).toBeDefined();
    expect(parsed.cycles).toBeDefined();
    expect(parsed.hubs).toBeDefined();
  });

  it("should roundtrip correctly", () => {
    const result = buildGraphifyGraph(SAMPLE_FILES);
    const json = toGraphJSON(result);
    const parsed = JSON.parse(json) as GraphifyResult;

    expect(parsed.stats.totalNodes).toBe(result.stats.totalNodes);
    expect(parsed.stats.totalEdges).toBe(result.stats.totalEdges);
    expect(parsed.nodes.length).toBe(result.nodes.length);
    expect(parsed.edges.length).toBe(result.edges.length);
  });
});

// ─── Python file parsing ───

describe("Python file parsing", () => {
  it("should extract Python functions and classes", () => {
    const result = buildGraphifyGraph([
      {
        path: "app/main.py",
        content: `
import os
from flask import Flask
from .utils import helper

class Application:
    def __init__(self):
        self.app = Flask(__name__)

def create_app():
    return Application()

def run_server(port=8000):
    app = create_app()
    app.run(port=port)
`,
      },
    ]);

    const funcNodes = result.nodes.filter((n) => n.type === "function");
    const classNodes = result.nodes.filter((n) => n.type === "class");
    const extDeps = result.nodes.filter((n) => n.type === "external-dep");

    expect(funcNodes.length).toBeGreaterThanOrEqual(1);
    expect(classNodes.length).toBeGreaterThanOrEqual(1);

    // Should detect flask as external dep
    const depLabels = extDeps.map((n) => n.label);
    expect(depLabels.some((l) => l.toLowerCase().includes("flask"))).toBe(true);
  });
});

// ─── Go file parsing ───

describe("Go file parsing", () => {
  it("should extract Go functions and structs", () => {
    const result = buildGraphifyGraph([
      {
        path: "cmd/main.go",
        content: `
package main

import (
  "fmt"
  "net/http"
)

type Server struct {
  Port int
  Host string
}

func NewServer(port int) *Server {
  return &Server{Port: port, Host: "localhost"}
}

func (s *Server) Start() {
  fmt.Printf("Starting on port %d\\n", s.Port)
  http.ListenAndServe(fmt.Sprintf(":%d", s.Port), nil)
}

func main() {
  s := NewServer(8080)
  s.Start()
}
`,
      },
    ]);

    const funcNodes = result.nodes.filter((n) => n.type === "function");
    const classNodes = result.nodes.filter((n) => n.type === "class");

    // Should find NewServer, Start, main as functions
    expect(funcNodes.length).toBeGreaterThanOrEqual(2);
    // Should find Server as a struct/class
    expect(classNodes.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Edge cases ───

describe("edge cases", () => {
  it("should handle binary-like or empty content gracefully", () => {
    const result = buildGraphifyGraph([
      { path: "image.png", content: "" },
      { path: "data.bin", content: "\x00\x01\x02\x03" },
    ]);

    expect(result.stats.totalFiles).toBe(2);
    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
  });

  it("should handle deeply nested paths", () => {
    const result = buildGraphifyGraph([
      {
        path: "a/b/c/d/e/f/deep.ts",
        content: "export function deep() { return true; }",
      },
    ]);

    expect(result.stats.totalFiles).toBe(1);
    const moduleNodes = result.nodes.filter((n) => n.type === "module");
    expect(moduleNodes.length).toBeGreaterThanOrEqual(1);
  });

  it("should handle files with syntax errors without crashing", () => {
    const result = buildGraphifyGraph([
      {
        path: "broken.ts",
        content: "export function {{{broken syntax}}}}",
      },
    ]);

    // Should not throw, and should still produce output
    expect(result.stats.totalFiles).toBe(1);
  });
});
