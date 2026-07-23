import type { FileContent } from "./github";

export interface TestSmell {
  type: 'skipped-test' | 'commented-assertion' | 'sleep-in-test' | 'conditional-logic' | 'no-assertions';
  line: number;
  snippet: string;
}

export interface TestFileAnalysis {
  path: string;
  sourceFilePath?: string;
  suitesCount: number;
  casesCount: number;
  smells: TestSmell[];
}

export interface TestIQReport {
  score: number; // 0 - 100
  totalTestFiles: number;
  totalSuites: number;
  totalCases: number;
  totalSmells: number;
  untestedSourceFiles: string[]; // Source files without a matching test file
  testFiles: TestFileAnalysis[];
}

/**
 * Checks if a filename looks like a test file.
 */
function isTestFile(path: string): boolean {
  return /\.(test|spec)\.[jt]sx?$|_test\.go$|test_.*\.py$/.test(path);
}

/**
 * Checks if a filename looks like a source code file.
 */
function isSourceFile(path: string): boolean {
  if (isTestFile(path)) return false;
  return /\.(ts|js|jsx|tsx|go|py|java|c|cpp|cs|rb|php)$/.test(path);
}

/**
 * Extracts the base name for matching source and test files.
 * e.g., 'utils.ts' -> 'utils', 'utils_test.go' -> 'utils', 'test_utils.py' -> 'utils'
 */
function getBaseName(path: string): string {
  const parts = path.split('/');
  const filename = parts[parts.length - 1];
  return filename
    .replace(/\.(test|spec)\.[jt]sx?$/, '')
    .replace(/_test\.go$/, '')
    .replace(/^test_/, '')
    .replace(/\.[^/.]+$/, ''); // remove extension
}

/**
 * Analyzes the testing health of a project by inspecting its files.
 * @param files The array of files to analyze.
 * @returns The generated TestIQReport.
 */
export function analyzeTestingHealth(files: FileContent[]): TestIQReport {
  const testFiles = files.filter(f => isTestFile(f.path));
  const sourceFiles = files.filter(f => isSourceFile(f.path));

  const testFileAnalyses: TestFileAnalysis[] = [];
  let totalSuites = 0;
  let totalCases = 0;
  let totalSmells = 0;

  for (const file of testFiles) {
    let suitesCount = 0;
    let casesCount = 0;
    const smells: TestSmell[] = [];

    const lines = file.content.split('\n');
    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Suites
      if (/describe\(|suite\(|class Test/.test(line)) {
        suitesCount++;
      }

      // Cases
      if (/\bit\b|\btest\b|func Test|def test_/.test(line)) {
        casesCount++;
      }

      // Smells
      if (/\.skip\(|xit\(|xtest\(/.test(line)) {
        smells.push({ type: 'skipped-test', line: lineNum, snippet: line.trim() });
      }
      if (/setTimeout\(|sleep\(/.test(line)) {
        smells.push({ type: 'sleep-in-test', line: lineNum, snippet: line.trim() });
      }
      if (/\/\/\s*expect\(|\/\/\s*assert/.test(line)) {
        smells.push({ type: 'commented-assertion', line: lineNum, snippet: line.trim() });
      }
      if (/if\s*\(/.test(line)) {
        smells.push({ type: 'conditional-logic', line: lineNum, snippet: line.trim() });
      }
    });

    // Roughly check for no-assertions if cases exist but no assertions are present
    if (casesCount > 0 && !/expect\(|assert/.test(file.content)) {
       smells.push({ type: 'no-assertions', line: 1, snippet: 'No assertions found in file' });
    }

    totalSuites += suitesCount;
    totalCases += casesCount;
    totalSmells += smells.length;

    testFileAnalyses.push({
      path: file.path,
      suitesCount,
      casesCount,
      smells
    });
  }

  // Find untested source files
  const testBaseNames = new Set(testFiles.map(f => getBaseName(f.path)));
  const untestedSourceFiles = sourceFiles
    .filter(f => !testBaseNames.has(getBaseName(f.path)))
    .map(f => f.path);

  // Calculate score
  let score = 100;
  score -= untestedSourceFiles.length * 10;
  score -= totalSmells * 2;

  if (score < 0) score = 0;
  if (totalCases === 0 && score > 50) score = 50;

  return {
    score,
    totalTestFiles: testFiles.length,
    totalSuites,
    totalCases,
    totalSmells,
    untestedSourceFiles,
    testFiles: testFileAnalyses
  };
}

/**
 * Converts a TestIQReport into a Markdown string.
 * @param report The TestIQReport.
 * @returns The markdown representation of the report.
 */
export function toTestIQMarkdown(report: TestIQReport): string {
  let md = `# TestIQ Report\n\n`;
  md += `**Score:** ${report.score} / 100\n`;
  md += `- **Test Files:** ${report.totalTestFiles}\n`;
  md += `- **Test Suites:** ${report.totalSuites}\n`;
  md += `- **Test Cases:** ${report.totalCases}\n`;
  md += `- **Test Smells:** ${report.totalSmells}\n`;
  
  if (report.untestedSourceFiles.length > 0) {
    md += `\n## Untested Source Files (${report.untestedSourceFiles.length})\n`;
    report.untestedSourceFiles.forEach(f => {
      md += `- \`${f}\`\n`;
    });
  }

  if (report.testFiles.length > 0) {
    md += `\n## Test File Analysis\n`;
    report.testFiles.forEach(tf => {
      md += `### \`${tf.path}\`\n`;
      md += `- Suites: ${tf.suitesCount}\n`;
      md += `- Cases: ${tf.casesCount}\n`;
      if (tf.smells.length > 0) {
        md += `- **Smells (${tf.smells.length}):**\n`;
        tf.smells.forEach(s => {
          md += `  - [Line ${s.line}] \`${s.type}\`: \`${s.snippet}\`\n`;
        });
      }
    });
  }

  return md;
}

/**
 * Converts a TestIQReport into a JSON string.
 * @param report The TestIQReport.
 * @returns The JSON representation of the report.
 */
export function toTestIQJSON(report: TestIQReport): string {
  return JSON.stringify(report, null, 2);
}
