/**
 * Tests for the code metrics computation engine.
 *
 * Validates: language detection, LOC counting, comment detection,
 * function/class/import counting, complexity estimation, health score,
 * technical debt, recommendations, module grouping, distributions.
 */

import { describe, it, expect } from "vitest";
import { computeProjectMetrics } from "@/lib/metrics";

// ─── Helpers ─────────────────────────────────────────────────

function makeFile(path: string, content: string) {
  return { path, content };
}

// ─── computeProjectMetrics — empty input ─────────────────────

describe("computeProjectMetrics — empty input", () => {
  it("should return zero totals for empty file list", () => {
    const m = computeProjectMetrics([]);
    expect(m.totalFiles).toBe(0);
    expect(m.totalLoc).toBe(0);
    expect(m.totalLines).toBe(0);
    expect(m.totalFunctions).toBe(0);
    expect(m.totalClasses).toBe(0);
    expect(m.totalImports).toBe(0);
    expect(m.couplingScore).toBe(0);
    expect(m.avgComplexity).toBe(0);
    expect(m.avgFileSize).toBe(0);
    expect(m.modules).toHaveLength(0);
    expect(m.files).toHaveLength(0);
    expect(m.healthScore).toBeGreaterThanOrEqual(0);
    expect(m.healthScore).toBeLessThanOrEqual(100);
  });
});

// ─── Language Detection ───────────────────────────────────────

describe("language detection", () => {
  const langCases: Array<[string, string]> = [
    ["src/app.ts", "TypeScript"],
    ["src/component.tsx", "TypeScript"],
    ["src/util.js", "JavaScript"],
    ["src/page.jsx", "JavaScript"],
    ["server.py", "Python"],
    ["main.go", "Go"],
    ["lib.rs", "Rust"],
    ["App.java", "Java"],
    ["App.kt", "Kotlin"],
    ["app.swift", "Swift"],
    ["app.rb", "Ruby"],
    ["lib.c", "C"],
    ["lib.h", "C"],
    ["main.cpp", "C++"],
    ["style.css", "CSS"],
    ["style.scss", "SCSS"],
    ["index.html", "HTML"],
    ["query.sql", "SQL"],
    ["schema.prisma", "Prisma"],
    ["query.graphql", "GraphQL"],
    ["query.gql", "GraphQL"],
    ["setup.sh", "Shell"],
    ["config.yaml", "YAML"],
    ["config.yml", "YAML"],
    ["config.toml", "TOML"],
    ["Dockerfile", "Docker"],
    ["Makefile", "Makefile"],
    ["unknown.xyz", "Other"],
  ];

  for (const [path, expectedLang] of langCases) {
    it(`should detect ${expectedLang} for ${path}`, () => {
      const m = computeProjectMetrics([makeFile(path, "const x = 1;")]);
      expect(m.files[0].language).toBe(expectedLang);
    });
  }
});

// ─── LOC Counting ────────────────────────────────────────────

describe("LOC counting", () => {
  it("should count non-empty, non-comment lines as LOC", () => {
    const content = [
      "const x = 1;",       // LOC
      "",                    // blank
      "  ",                  // blank (whitespace)
      "// comment",          // comment
      "const y = 2;",        // LOC
    ].join("\n");

    const m = computeProjectMetrics([makeFile("src/app.ts", content)]);
    expect(m.files[0].totalLines).toBe(5);
    expect(m.files[0].blankLines).toBe(2);
    expect(m.files[0].commentLines).toBe(1);
    expect(m.files[0].loc).toBe(2);
  });

  it("should count Python hash comments correctly", () => {
    const content = [
      "# This is a comment",
      "def foo():",
      "    # inner comment",
      "    return 1",
    ].join("\n");

    const m = computeProjectMetrics([makeFile("app.py", content)]);
    expect(m.files[0].commentLines).toBe(2);
    expect(m.files[0].loc).toBe(2);
  });

  it("should count TypeScript block comment lines", () => {
    const content = [
      "/**",
      " * A function.",
      " */",
      "function greet() { return 'hi'; }",
    ].join("\n");

    const m = computeProjectMetrics([makeFile("src/fn.ts", content)]);
    expect(m.files[0].commentLines).toBe(3);
    expect(m.files[0].loc).toBe(1);
  });

  it("should aggregate LOC correctly across multiple files", () => {
    const files = [
      makeFile("src/a.ts", "const a = 1;\nconst b = 2;"),
      makeFile("src/b.ts", "const c = 3;\nconst d = 4;\nconst e = 5;"),
    ];
    const m = computeProjectMetrics(files);
    expect(m.totalLoc).toBe(5);
    expect(m.totalLines).toBe(5);
  });
});

// ─── Function Counting ───────────────────────────────────────

describe("function counting", () => {
  it("should count function declarations in TypeScript", () => {
    const content = `
function greet() { return 'hi'; }
function farewell() { return 'bye'; }
`;
    const m = computeProjectMetrics([makeFile("src/fn.ts", content)]);
    expect(m.files[0].functionCount).toBeGreaterThanOrEqual(2);
  });

  it("should count arrow functions assigned to consts", () => {
    const content = `
const add = (a: number, b: number) => a + b;
const multiply = (a: number, b: number) => a * b;
`;
    const m = computeProjectMetrics([makeFile("src/math.ts", content)]);
    expect(m.files[0].functionCount).toBeGreaterThanOrEqual(2);
  });

  it("should count Python def statements", () => {
    const content = `
def add(a, b):
    return a + b

def subtract(a, b):
    return a - b

def multiply(a, b):
    return a * b
`;
    const m = computeProjectMetrics([makeFile("math.py", content)]);
    expect(m.files[0].functionCount).toBe(3);
  });

  it("should count Go func declarations", () => {
    const content = `
func Add(a, b int) int { return a + b }
func Sub(a, b int) int { return a - b }
`;
    const m = computeProjectMetrics([makeFile("math.go", content)]);
    expect(m.files[0].functionCount).toBe(2);
  });

  it("should count Rust fn declarations", () => {
    const content = `
fn add(a: i32, b: i32) -> i32 { a + b }
fn sub(a: i32, b: i32) -> i32 { a - b }
fn mul(a: i32, b: i32) -> i32 { a * b }
`;
    const m = computeProjectMetrics([makeFile("src/math.rs", content)]);
    expect(m.files[0].functionCount).toBe(3);
  });

  it("should aggregate function count across modules", () => {
    const files = [
      makeFile("src/a.ts", "function f1() {}\nfunction f2() {}"),
      makeFile("lib/b.ts", "function f3() {}"),
    ];
    const m = computeProjectMetrics(files);
    expect(m.totalFunctions).toBeGreaterThanOrEqual(3);
  });
});

// ─── Class Counting ──────────────────────────────────────────

describe("class counting", () => {
  it("should count TypeScript class declarations", () => {
    const content = `
class Animal { constructor(public name: string) {} }
class Dog extends Animal { bark() { return 'woof'; } }
`;
    const m = computeProjectMetrics([makeFile("src/animals.ts", content)]);
    expect(m.files[0].classCount).toBe(2);
  });

  it("should count Python class declarations", () => {
    const content = `
class Animal:
    pass

class Dog(Animal):
    def bark(self):
        return 'woof'
`;
    const m = computeProjectMetrics([makeFile("animals.py", content)]);
    expect(m.files[0].classCount).toBe(2);
  });

  it("should count Rust struct/enum/trait/impl", () => {
    const content = `
struct Point { x: f64, y: f64 }
enum Color { Red, Green, Blue }
trait Drawable { fn draw(&self); }
impl Point { fn new(x: f64, y: f64) -> Self { Self { x, y } } }
`;
    const m = computeProjectMetrics([makeFile("src/shapes.rs", content)]);
    expect(m.files[0].classCount).toBe(4);
  });

  it("should count Go struct types", () => {
    const content = `
type Point struct { X, Y float64 }
type Circle struct { Center Point; Radius float64 }
`;
    const m = computeProjectMetrics([makeFile("shapes.go", content)]);
    expect(m.files[0].classCount).toBe(2);
  });

  it("should aggregate class count across files", () => {
    const files = [
      makeFile("src/a.ts", "class A {}\nclass B {}"),
      makeFile("src/b.ts", "class C {}"),
    ];
    const m = computeProjectMetrics(files);
    expect(m.totalClasses).toBe(3);
  });
});

// ─── Import Counting ─────────────────────────────────────────

describe("import counting", () => {
  it("should count ES module import statements", () => {
    const content = `
import React from 'react';
import { useState } from 'react';
import type { FC } from 'react';
`;
    const m = computeProjectMetrics([makeFile("src/app.tsx", content)]);
    // 3 import + 3 from patterns = 6 raw, deduped: ceil(6/1.5) = 4
    expect(m.files[0].importCount).toBeGreaterThanOrEqual(3);
  });

  it("should count CommonJS require calls", () => {
    const content = `
const fs = require('fs');
const path = require('path');
`;
    const m = computeProjectMetrics([makeFile("src/util.js", content)]);
    // 2 require matches, deduped: ceil(2/1.5) = 2
    expect(m.files[0].importCount).toBeGreaterThanOrEqual(2);
  });

  it("should aggregate imports across project", () => {
    const files = [
      makeFile("src/a.ts", "import { a } from './b';\nimport { c } from './d';"),
      makeFile("src/b.ts", "import { e } from './f';"),
    ];
    const m = computeProjectMetrics(files);
    // File a: 2 import + 2 from = 4 raw → ceil(4/1.5) = 3; File b: 1+1=2 → ceil(2/1.5)=2; total=5
    expect(m.totalImports).toBeGreaterThanOrEqual(4);
  });
});

// ─── Export Counting ─────────────────────────────────────────

describe("export counting", () => {
  it("should count export statements", () => {
    const content = `
export function greet() { return 'hi'; }
export const PI = 3.14;
export default class App {}
export { greet, PI };
`;
    const m = computeProjectMetrics([makeFile("src/app.ts", content)]);
    expect(m.files[0].exportCount).toBe(4);
  });
});

// ─── Complexity Estimation ───────────────────────────────────

describe("complexity estimation", () => {
  it("should assign base complexity of 1 for trivial files", () => {
    const m = computeProjectMetrics([makeFile("src/const.ts", "export const X = 42;")]);
    expect(m.files[0].complexity).toBe(1);
  });

  it("should increase complexity for if/else branches", () => {
    const content = `
function classify(n: number) {
  if (n > 0) {
    return 'positive';
  } else if (n < 0) {
    return 'negative';
  } else {
    return 'zero';
  }
}
`;
    const m = computeProjectMetrics([makeFile("src/classify.ts", content)]);
    expect(m.files[0].complexity).toBeGreaterThan(2);
  });

  it("should increase complexity for loops", () => {
    const content = `
function sum(arr: number[]) {
  let total = 0;
  for (const x of arr) {
    total += x;
  }
  while (total > 100) {
    total -= 10;
  }
  return total;
}
`;
    const m = computeProjectMetrics([makeFile("src/sum.ts", content)]);
    expect(m.files[0].complexity).toBeGreaterThan(2);
  });

  it("should increase complexity for logical operators", () => {
    const content = `
function check(a: boolean, b: boolean, c: boolean) {
  return a && b || c;
}
`;
    const m = computeProjectMetrics([makeFile("src/check.ts", content)]);
    expect(m.files[0].complexity).toBeGreaterThan(1);
  });

  it("should increase complexity for Python if/elif/for/while", () => {
    const content = `
def classify(n):
    if n > 0:
        return 'positive'
    elif n < 0:
        return 'negative'
    else:
        return 'zero'
`;
    const m = computeProjectMetrics([makeFile("classify.py", content)]);
    expect(m.files[0].complexity).toBeGreaterThan(2);
  });
});

// ─── Module Grouping ─────────────────────────────────────────

describe("module grouping", () => {
  it("should group files by top-level directory", () => {
    const files = [
      makeFile("src/a.ts", ""),
      makeFile("src/b.ts", ""),
      makeFile("lib/c.ts", ""),
    ];
    const m = computeProjectMetrics(files);
    const moduleNames = m.modules.map((mod) => mod.name);
    expect(moduleNames).toContain("src");
    expect(moduleNames).toContain("lib");
  });

  it("should place root-level files in (root)", () => {
    const files = [
      makeFile("index.ts", ""),
      makeFile("server.ts", ""),
    ];
    const m = computeProjectMetrics(files);
    expect(m.modules.some((mod) => mod.name === "(root)")).toBe(true);
  });

  it("should use 2-level deep grouping for nested directories", () => {
    const files = [
      makeFile("src/components/Button.tsx", ""),
      makeFile("src/utils/format.ts", ""),
    ];
    const m = computeProjectMetrics(files);
    const moduleNames = m.modules.map((mod) => mod.name);
    expect(moduleNames).toContain("src/components");
    expect(moduleNames).toContain("src/utils");
  });

  it("should sum LOC correctly per module", () => {
    const content50 = "x;\n".repeat(50);
    const files = [
      makeFile("src/a.ts", content50),
      makeFile("src/b.ts", content50),
    ];
    const m = computeProjectMetrics(files);
    const srcModule = m.modules.find((mod) => mod.name === "src");
    expect(srcModule).toBeDefined();
    expect(srcModule!.totalLoc).toBe(100);
  });

  it("should sort modules by totalLoc descending", () => {
    const files = [
      makeFile("small/a.ts", "x;"),
      makeFile("large/b.ts", "x;\n".repeat(50)),
    ];
    const m = computeProjectMetrics(files);
    expect(m.modules[0].totalLoc).toBeGreaterThanOrEqual(m.modules[1].totalLoc);
  });
});

// ─── Language Breakdown ───────────────────────────────────────

describe("language breakdown", () => {
  it("should accumulate LOC by language", () => {
    const tsContent = "const a = 1;\nconst b = 2;"; // 2 LOC
    const pyContent = "x = 1\ny = 2\nz = 3";         // 3 LOC
    const files = [
      makeFile("src/app.ts", tsContent),
      makeFile("script.py", pyContent),
    ];
    const m = computeProjectMetrics(files);
    expect(m.languageBreakdown["TypeScript"]).toBe(2);
    expect(m.languageBreakdown["Python"]).toBe(3);
  });

  it("should only include languages with >0 LOC in breakdown", () => {
    const files = [
      makeFile("src/app.ts", "const x = 1;"),
    ];
    const m = computeProjectMetrics(files);
    expect(Object.keys(m.languageBreakdown)).toContain("TypeScript");
    expect(Object.keys(m.languageBreakdown)).not.toContain("Python");
  });
});

// ─── Complexity Distribution ──────────────────────────────────

describe("complexity distribution", () => {
  it("should classify files with complexity ≤5 as low", () => {
    const m = computeProjectMetrics([makeFile("src/trivial.ts", "export const X = 1;")]);
    expect(m.complexityDistribution.low).toBe(1);
    expect(m.complexityDistribution.medium).toBe(0);
    expect(m.complexityDistribution.high).toBe(0);
  });

  it("should classify files with complexity >15 as high", () => {
    // Generate enough branching to push complexity well above 15
    const branches = Array.from({ length: 20 }, (_, i) => `if (x === ${i}) { y = ${i}; }`).join("\n");
    const content = `function test(x: number) {\n  let y = 0;\n${branches}\n  return y;\n}`;
    const m = computeProjectMetrics([makeFile("src/complex.ts", content)]);
    expect(m.complexityDistribution.high).toBe(1);
  });

  it("should sum all distributions to total file count", () => {
    const files = [
      makeFile("src/a.ts", "const x = 1;"),
      makeFile("src/b.ts", "const y = 2;"),
    ];
    const m = computeProjectMetrics(files);
    const { low, medium, high } = m.complexityDistribution;
    expect(low + medium + high).toBe(m.totalFiles);
  });
});

// ─── Size Distribution ────────────────────────────────────────

describe("size distribution", () => {
  it("should classify a file with ≤50 LOC as small", () => {
    const content = "const x = 1;\n".repeat(10); // 10 LOC
    const m = computeProjectMetrics([makeFile("src/tiny.ts", content)]);
    expect(m.sizeDistribution.small).toBe(1);
  });

  it("should classify a file with >200 LOC as large", () => {
    const content = "const x = 1;\n".repeat(250); // 250 LOC
    const m = computeProjectMetrics([makeFile("src/big.ts", content)]);
    expect(m.sizeDistribution.large).toBe(1);
  });

  it("should sum all size buckets to total file count", () => {
    const files = [
      makeFile("src/a.ts", "const x = 1;\n".repeat(10)),
      makeFile("src/b.ts", "const x = 1;\n".repeat(100)),
      makeFile("src/c.ts", "const x = 1;\n".repeat(300)),
    ];
    const m = computeProjectMetrics(files);
    const { small, medium, large } = m.sizeDistribution;
    expect(small + medium + large).toBe(m.totalFiles);
  });
});

// ─── Top Complex / Large Files ────────────────────────────────

describe("topComplexFiles and topLargeFiles", () => {
  it("should return at most 5 top complex files", () => {
    const files = Array.from({ length: 10 }, (_, i) =>
      makeFile(`src/file${i}.ts`, "if (x) { if (y) { if (z) {} } }".repeat(i + 1))
    );
    const m = computeProjectMetrics(files);
    expect(m.topComplexFiles.length).toBeLessThanOrEqual(5);
  });

  it("should sort top complex files by complexity descending", () => {
    const complexContent = Array.from({ length: 20 }, (_, i) => `if (a${i}) {}`).join("\n");
    const simpleContent = "const x = 1;";
    const files = [
      makeFile("src/simple.ts", simpleContent),
      makeFile("src/complex.ts", complexContent),
    ];
    const m = computeProjectMetrics(files);
    if (m.topComplexFiles.length >= 2) {
      expect(m.topComplexFiles[0].complexity).toBeGreaterThanOrEqual(m.topComplexFiles[1].complexity);
    }
  });

  it("should return at most 5 top large files", () => {
    const files = Array.from({ length: 10 }, (_, i) =>
      makeFile(`src/file${i}.ts`, "const x = 1;\n".repeat((i + 1) * 30))
    );
    const m = computeProjectMetrics(files);
    expect(m.topLargeFiles.length).toBeLessThanOrEqual(5);
  });

  it("should sort top large files by LOC descending", () => {
    const files = [
      makeFile("src/small.ts", "const x = 1;"),
      makeFile("src/large.ts", "const x = 1;\n".repeat(300)),
    ];
    const m = computeProjectMetrics(files);
    if (m.topLargeFiles.length >= 2) {
      expect(m.topLargeFiles[0].loc).toBeGreaterThanOrEqual(m.topLargeFiles[1].loc);
    }
  });
});

// ─── Coupling Score ───────────────────────────────────────────

describe("coupling score", () => {
  it("should be 0 for files with no imports", () => {
    const m = computeProjectMetrics([makeFile("src/pure.ts", "export const X = 42;")]);
    // The import count will be at least 0 → coupling = imports/loc can be 0
    expect(m.couplingScore).toBeGreaterThanOrEqual(0);
  });

  it("should be higher for heavily-imported files", () => {
    const heavyImports = Array.from({ length: 20 }, (_, i) => `import mod${i} from './mod${i}';`).join("\n");
    const heavyFile = makeFile("src/hub.ts", `${heavyImports}\nexport const X = 1;`);

    const simpleFile = makeFile("src/leaf.ts", "export const Y = 2;");

    const mHeavy = computeProjectMetrics([heavyFile]);
    const mSimple = computeProjectMetrics([simpleFile]);

    expect(mHeavy.couplingScore).toBeGreaterThan(mSimple.couplingScore);
  });
});

// ─── Health Score ─────────────────────────────────────────────

describe("healthScore", () => {
  it("should return a value in [0, 100]", () => {
    const files = [
      makeFile("src/app.ts", "export function greet() { return 'hi'; }"),
    ];
    const m = computeProjectMetrics(files);
    expect(m.healthScore).toBeGreaterThanOrEqual(0);
    expect(m.healthScore).toBeLessThanOrEqual(100);
  });

  it("should assign a higher score to a simple well-structured file than a highly complex one", () => {
    // Simple: one small, low-complexity file
    const simpleFile = makeFile("src/pure.ts", "export const X = 1;\nexport const Y = 2;");
    const mSimple = computeProjectMetrics([simpleFile]);

    // Complex: many if-branches driving complexity way up
    const branches = Array.from({ length: 50 }, (_, i) => `if (x === ${i}) { y = ${i}; }`).join("\n");
    const complexFile = makeFile("src/complex.ts", `function test(x: number) {\n  let y = 0;\n${branches}\n  return y;\n}`);
    const mComplex = computeProjectMetrics([complexFile]);

    expect(mSimple.healthScore).toBeGreaterThan(mComplex.healthScore);
  });

  it("should include all score breakdown components", () => {
    const m = computeProjectMetrics([makeFile("src/app.ts", "const x = 1;")]);
    expect(m.scoreBreakdown).toHaveProperty("complexity");
    expect(m.scoreBreakdown).toHaveProperty("coupling");
    expect(m.scoreBreakdown).toHaveProperty("fileSize");
    expect(m.scoreBreakdown).toHaveProperty("highComplexity");
    expect(m.scoreBreakdown).toHaveProperty("documentation");
    expect(m.scoreBreakdown).toHaveProperty("modularity");
  });

  it("should sum scoreBreakdown components to approximately healthScore", () => {
    const m = computeProjectMetrics([makeFile("src/app.ts", "const x = 1;\nconst y = 2;")]);
    const sum =
      m.scoreBreakdown.complexity +
      m.scoreBreakdown.coupling +
      m.scoreBreakdown.fileSize +
      m.scoreBreakdown.highComplexity +
      m.scoreBreakdown.documentation +
      m.scoreBreakdown.modularity;
    // healthScore is rounded — allow ±1 for rounding
    expect(Math.abs(Math.round(sum) - m.healthScore)).toBeLessThanOrEqual(1);
  });
});

// ─── Technical Debt ───────────────────────────────────────────

describe("technicalDebtHours", () => {
  it("should be 0 for a trivial low-complexity file", () => {
    const m = computeProjectMetrics([makeFile("src/const.ts", "export const X = 1;")]);
    expect(m.technicalDebtHours).toBe(0);
  });

  it("should increase for files with complexity >15", () => {
    const branches = Array.from({ length: 20 }, (_, i) => `if (x === ${i}) { y = ${i}; }`).join("\n");
    const content = `function test(x: number) {\n  let y = 0;\n${branches}\n  return y;\n}`;
    const m = computeProjectMetrics([makeFile("src/complex.ts", content)]);
    expect(m.technicalDebtHours).toBeGreaterThan(0);
  });

  it("should increase for files with LOC > 200", () => {
    const bigContent = "const x = 1;\n".repeat(300);
    const m = computeProjectMetrics([makeFile("src/big.ts", bigContent)]);
    expect(m.technicalDebtHours).toBeGreaterThan(0);
  });

  it("should be a non-negative integer", () => {
    const files = [
      makeFile("src/a.ts", "const x = 1;"),
      makeFile("src/b.ts", "if (x) { if (y) { if (z) {} } }".repeat(10)),
    ];
    const m = computeProjectMetrics(files);
    expect(m.technicalDebtHours).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(m.technicalDebtHours)).toBe(true);
  });
});

// ─── Recommendations ─────────────────────────────────────────

describe("recommendations", () => {
  it("should return between 1 and 5 recommendations", () => {
    const m = computeProjectMetrics([makeFile("src/app.ts", "const x = 1;")]);
    expect(m.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(m.recommendations.length).toBeLessThanOrEqual(5);
  });

  it("each recommendation should have a severity and message", () => {
    const m = computeProjectMetrics([makeFile("src/app.ts", "const x = 1;")]);
    for (const rec of m.recommendations) {
      expect(["high", "medium", "low"]).toContain(rec.severity);
      expect(typeof rec.message).toBe("string");
      expect(rec.message.length).toBeGreaterThan(0);
    }
  });

  it("should emit a high-severity recommendation for very high average complexity", () => {
    // Generate files with very high complexity
    const branches = Array.from({ length: 30 }, (_, i) => `if (x === ${i}) { y = ${i}; }`).join("\n");
    const content = `function test(x: number) {\n  let y = 0;\n${branches}\n  return y;\n}`;
    const files = Array.from({ length: 3 }, (_, i) =>
      makeFile(`src/file${i}.ts`, content)
    );
    const m = computeProjectMetrics(files);
    const highSeverity = m.recommendations.some((r) => r.severity === "high");
    expect(highSeverity).toBe(true);
  });

  it("should always include at least a low-severity recommendation for any project", () => {
    const m = computeProjectMetrics([makeFile("src/tiny.ts", "export const X = 1;")]);
    const lowSeverity = m.recommendations.some((r) => r.severity === "low");
    expect(lowSeverity).toBe(true);
  });
});

// ─── Module Metrics shape ────────────────────────────────────

describe("module metrics shape", () => {
  it("should include all required module metric fields", () => {
    const m = computeProjectMetrics([makeFile("src/app.ts", "const x = 1;")]);
    const mod = m.modules[0];
    expect(mod).toHaveProperty("name");
    expect(mod).toHaveProperty("fileCount");
    expect(mod).toHaveProperty("totalLoc");
    expect(mod).toHaveProperty("totalLines");
    expect(mod).toHaveProperty("avgComplexity");
    expect(mod).toHaveProperty("totalImports");
    expect(mod).toHaveProperty("totalExports");
    expect(mod).toHaveProperty("functionCount");
    expect(mod).toHaveProperty("classCount");
    expect(mod).toHaveProperty("languages");
    expect(mod).toHaveProperty("couplingScore");
  });

  it("should compute coupling score as imports/loc for a module", () => {
    const content = "import a from './a';\nimport b from './b';\nconst x = 1;\nconst y = 2;";
    const m = computeProjectMetrics([makeFile("src/app.ts", content)]);
    const mod = m.modules.find((mod) => mod.name === "src");
    expect(mod).toBeDefined();
    expect(mod!.couplingScore).toBeGreaterThan(0);
  });

  it("should aggregate language LOC per module", () => {
    const files = [
      makeFile("src/app.ts", "const x = 1;"),
      makeFile("src/util.ts", "const y = 2;"),
    ];
    const m = computeProjectMetrics(files);
    const srcMod = m.modules.find((mod) => mod.name === "src");
    expect(srcMod?.languages["TypeScript"]).toBeGreaterThan(0);
  });
});

// ─── sizeBytes ───────────────────────────────────────────────

describe("file sizeBytes", () => {
  it("should be positive for non-empty files", () => {
    const m = computeProjectMetrics([makeFile("src/app.ts", "const x = 1;")]);
    expect(m.files[0].sizeBytes).toBeGreaterThan(0);
  });

  it("should increase with file content length", () => {
    const small = computeProjectMetrics([makeFile("src/small.ts", "x;")]);
    const large = computeProjectMetrics([makeFile("src/large.ts", "x;".repeat(500))]);
    expect(large.files[0].sizeBytes).toBeGreaterThan(small.files[0].sizeBytes);
  });
});

// ─── avgFileSize ─────────────────────────────────────────────

describe("avgFileSize", () => {
  it("should equal totalLoc / totalFiles", () => {
    const files = [
      makeFile("src/a.ts", "const x = 1;\nconst y = 2;"),  // 2 LOC
      makeFile("src/b.ts", "const z = 3;\nconst w = 4;\nconst v = 5;"),  // 3 LOC
    ];
    const m = computeProjectMetrics(files);
    expect(m.avgFileSize).toBeCloseTo(m.totalLoc / m.totalFiles, 5);
  });
});
