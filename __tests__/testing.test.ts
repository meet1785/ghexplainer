import { analyzeTestingHealth } from "../lib/testing";
import type { FileContent } from "../lib/github";

describe("TestIQ Static Analysis Engine", () => {
  it("should correctly identify test files and calculate scores", () => {
    const files: FileContent[] = [
      {
        path: "src/utils.ts",
        content: "export function add(a: number, b: number) { return a + b; }",
      },
      {
        path: "src/utils.test.ts",
        content: `
          import { add } from "./utils";
          describe("utils", () => {
            it("should add", () => {
              expect(add(1, 2)).toBe(3);
            });
            it.skip("should fail", () => {
              expect(add(1, 2)).toBe(4);
            });
            it("should have a smell", () => {
              // expect(true).toBe(true);
            });
          });
        `,
      },
      {
        path: "src/api.ts",
        content: "export function fetch() {}",
      },
    ];

    const report = analyzeTestingHealth(files);

    expect(report.totalTestFiles).toBe(1);
    expect(report.totalSuites).toBe(1);
    expect(report.totalCases).toBe(3);
    
    // 1 skipped test smell + 1 commented assertion smell = 2 smells
    expect(report.totalSmells).toBe(2);
    
    // api.ts is untested
    expect(report.untestedSourceFiles).toEqual(["src/api.ts"]);
    
    // Score calculation: 100 - (1 * 10) - (2 * 2) = 100 - 10 - 4 = 86
    expect(report.score).toBe(86);
  });

  it("should handle empty test files or files with zero cases", () => {
    const files: FileContent[] = [
      {
        path: "src/math.ts",
        content: "export function sub(a, b) { return a - b; }",
      },
      {
        path: "src/math.test.ts",
        content: "// just comments, no tests",
      }
    ];

    const report = analyzeTestingHealth(files);
    expect(report.totalCases).toBe(0);
    // Score is capped at 50 if cases are 0
    expect(report.score).toBeLessThanOrEqual(50);
  });
});
