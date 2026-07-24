import { describe, it, expect } from 'vitest';
import { analyzeCodeQuality } from '../lib/codequality';

describe('CodeQuality Engine', () => {
  it('detects long functions', () => {
    const longFn = `function myLongFn() {\n` + `  console.log("hello");\n`.repeat(65) + `}`;
    const report = analyzeCodeQuality([{ path: 'test.ts', content: longFn }]);
    expect(report.smells.length).toBeGreaterThan(0);
    expect(report.smells[0].type).toBe('long-function');
  });

  it('detects deep nesting', () => {
    const nested = `
function test() {
  if (true) {
    if (true) {
      if (true) {
        if (true) {
          if (true) {
            if (true) {
                console.log("too deep");
            }
          }
        }
      }
    }
  }
}`;
    const report = analyzeCodeQuality([{ path: 'test.ts', content: nested }]);
    expect(report.smells.some(s => s.type === 'deep-nesting')).toBe(true);
  });
});
