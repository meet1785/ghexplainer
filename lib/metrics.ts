/**
 * Code Metrics computation engine.
 *
 * Performs static analysis on file contents to extract:
 * - Lines of code per module
 * - Function/class counts
 * - Import density (coupling indicator)
 * - File size distribution
 * - Language breakdown
 * - Complexity indicators
 *
 * Demonstrates: static analysis, algorithmic thinking,
 * regex-based code parsing, data aggregation.
 */

export interface FileMetrics {
  path: string;
  module: string;
  language: string;
  loc: number; // lines of code (non-empty, non-comment)
  totalLines: number;
  blankLines: number;
  commentLines: number;
  functionCount: number;
  classCount: number;
  importCount: number;
  exportCount: number;
  complexity: number; // cyclomatic complexity estimate
  sizeBytes: number;
}

export interface ModuleMetrics {
  name: string;
  fileCount: number;
  totalLoc: number;
  totalLines: number;
  avgComplexity: number;
  totalImports: number;
  totalExports: number;
  functionCount: number;
  classCount: number;
  languages: Record<string, number>;
  couplingScore: number; // imports / loc ratio
}

export interface ProjectMetrics {
  totalFiles: number;
  totalLoc: number;
  totalLines: number;
  avgFileSize: number;
  avgComplexity: number;
  totalFunctions: number;
  totalClasses: number;
  totalImports: number;
  languageBreakdown: Record<string, number>;
  modules: ModuleMetrics[];
  files: FileMetrics[];
  complexityDistribution: { low: number; medium: number; high: number };
  sizeDistribution: { small: number; medium: number; large: number };
  couplingScore: number;
  topComplexFiles: FileMetrics[];
  topLargeFiles: FileMetrics[];
  /** 0–100 overall code health score */
  healthScore: number;
  /** Score breakdown by dimension */
  scoreBreakdown: {
    complexity: number;   // 0–25
    coupling: number;     // 0–20
    fileSize: number;     // 0–15
    highComplexity: number; // 0–20
    documentation: number;  // 0–10
    modularity: number;     // 0–10
  };
  /** Estimated technical debt in hours */
  technicalDebtHours: number;
  /** Actionable improvement recommendations */
  recommendations: Array<{ severity: "high" | "medium" | "low"; message: string }>;
}

// ─── Language Detection ──────────────────────────────────────

const LANG_MAP: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java", ".kt": "Kotlin",
  ".swift": "Swift",
  ".rb": "Ruby",
  ".c": "C", ".h": "C",
  ".cpp": "C++", ".hpp": "C++",
  ".cs": "C#",
  ".css": "CSS", ".scss": "SCSS",
  ".html": "HTML",
  ".sql": "SQL",
  ".prisma": "Prisma",
  ".graphql": "GraphQL", ".gql": "GraphQL",
  ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell",
  ".yaml": "YAML", ".yml": "YAML",
  ".toml": "TOML",
};

function detectLanguage(path: string): string {
  const filename = path.split("/").pop() ?? "";
  if (filename === "Dockerfile") return "Docker";
  if (filename === "Makefile") return "Makefile";
  const ext = "." + filename.split(".").pop();
  return LANG_MAP[ext] ?? "Other";
}

// ─── Comment Detection ───────────────────────────────────────

function isComment(line: string, lang: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Single-line comments
  if (["TypeScript", "JavaScript", "Java", "C", "C++", "C#", "Go", "Rust", "Kotlin", "Swift", "CSS", "SCSS"].includes(lang)) {
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("*/")) return true;
  }
  if (["Python", "Ruby", "Shell"].includes(lang)) {
    if (trimmed.startsWith("#")) return true;
  }
  if (lang === "HTML") {
    if (trimmed.startsWith("<!--") || trimmed.startsWith("-->")) return true;
  }

  return false;
}

// ─── Complexity Estimation ───────────────────────────────────

function estimateComplexity(content: string, lang: string): number {
  let complexity = 1; // Base complexity

  const patterns: RegExp[] = [];

  if (["TypeScript", "JavaScript", "Java", "C", "C++", "C#", "Go", "Rust", "Kotlin", "Swift"].includes(lang)) {
    patterns.push(
      /\bif\s*\(/g,
      /\belse\s+if\b/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bswitch\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /\?\s*[^:]/g,     // ternary
      /&&|\|\|/g,        // logical operators
    );
  } else if (lang === "Python") {
    patterns.push(
      /\bif\s+/g,
      /\belif\s+/g,
      /\bfor\s+/g,
      /\bwhile\s+/g,
      /\bexcept\s*/g,
      /\band\b|\bor\b/g,
    );
  } else if (lang === "Go") {
    patterns.push(
      /\bif\s+/g,
      /\bfor\s+/g,
      /\bswitch\s+/g,
      /\bcase\s+/g,
      /\bselect\s*{/g,
    );
  }

  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) complexity += matches.length;
  }

  return complexity;
}

// ─── Function/Class Counting ─────────────────────────────────

function countFunctions(content: string, lang: string): number {
  let count = 0;
  const patterns: RegExp[] = [];

  if (["TypeScript", "JavaScript"].includes(lang)) {
    patterns.push(
      /\bfunction\s+\w+/g,
      /\bconst\s+\w+\s*=\s*(?:async\s+)?\(/g,
      /\b(?:async\s+)?(?:get|set|static)?\s*\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*{/g,
    );
  } else if (lang === "Python") {
    patterns.push(/\bdef\s+\w+/g);
  } else if (lang === "Go") {
    patterns.push(/\bfunc\s+/g);
  } else if (lang === "Rust") {
    patterns.push(/\bfn\s+\w+/g);
  } else if (["Java", "Kotlin", "C#", "Swift"].includes(lang)) {
    patterns.push(/\b(?:public|private|protected|internal|static)\s+(?:\w+\s+)+\w+\s*\(/g);
  }

  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  }

  return count;
}

function countClasses(content: string, lang: string): number {
  let count = 0;
  if (["TypeScript", "JavaScript", "Java", "Kotlin", "C#"].includes(lang)) {
    const matches = content.match(/\bclass\s+\w+/g);
    if (matches) count += matches.length;
  } else if (lang === "Python") {
    const matches = content.match(/\bclass\s+\w+/g);
    if (matches) count += matches.length;
  } else if (lang === "Rust") {
    const matches = content.match(/\b(?:struct|enum|trait|impl)\s+\w+/g);
    if (matches) count += matches.length;
  } else if (lang === "Go") {
    const matches = content.match(/\btype\s+\w+\s+struct/g);
    if (matches) count += matches.length;
  }
  return count;
}

function countImports(content: string): number {
  const patterns = [
    /\bimport\s+/g,
    /\brequire\s*\(/g,
    /\bfrom\s+["'][^"']+["']/g,
  ];
  let count = 0;
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  }
  // Deduplicate: import X from "Y" matches both import and from
  return Math.max(1, Math.ceil(count / 1.5));
}

function countExports(content: string): number {
  const matches = content.match(/\bexport\s+/g);
  return matches?.length ?? 0;
}

// ─── Main Analysis ───────────────────────────────────────────

function analyzeFile(path: string, content: string): FileMetrics {
  const lang = detectLanguage(path);
  const lines = content.split("\n");
  const totalLines = lines.length;
  const blankLines = lines.filter(l => !l.trim()).length;
  const commentLines = lines.filter(l => isComment(l, lang)).length;
  const loc = totalLines - blankLines - commentLines;

  return {
    path,
    module: getModule(path),
    language: lang,
    loc: Math.max(0, loc),
    totalLines,
    blankLines,
    commentLines,
    functionCount: countFunctions(content, lang),
    classCount: countClasses(content, lang),
    importCount: countImports(content),
    exportCount: countExports(content),
    complexity: estimateComplexity(content, lang),
    sizeBytes: new Blob([content]).size,
  };
}

function getModule(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 1) return "(root)";
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/");
}

// ─── Health Score Computation ────────────────────────────────

function computeScoreBreakdown(
  avgComplexity: number,
  couplingScore: number,
  sizeDistribution: { small: number; medium: number; large: number },
  complexityDistribution: { low: number; medium: number; high: number },
  totalFiles: number,
  moduleCount: number,
  files: FileMetrics[],
  totalLines: number,
): ProjectMetrics["scoreBreakdown"] {
  // 1. Complexity score: 25pts, penalty scales with avgComplexity
  const complexityPenalty = Math.min(25, ((Math.max(1, avgComplexity) - 1) / 24) * 25);

  // 2. Coupling score: 20pts, penalty scales with coupling ratio (>0.25 = bad)
  const couplingPenalty = Math.min(20, (couplingScore / 0.25) * 20);

  // 3. File size score: 15pts, penalty for large files
  const largeFileFraction = totalFiles > 0 ? sizeDistribution.large / totalFiles : 0;
  const fileSizePenalty = largeFileFraction * 15;

  // 4. High complexity files score: 20pts
  const highComplexFraction = totalFiles > 0 ? complexityDistribution.high / totalFiles : 0;
  const highComplexPenalty = highComplexFraction * 20;

  // 5. Documentation bonus: up to 10pts (ideal: 10–25% comment lines)
  const totalCommentLines = files.reduce((s, f) => s + f.commentLines, 0);
  const commentRatio = totalLines > 0 ? totalCommentLines / totalLines : 0;
  const docBonus = Math.max(0, (1 - Math.abs(commentRatio - 0.175) / 0.175)) * 10;

  // 6. Modularity bonus: up to 10pts (more modules relative to files = better separation)
  const modularityRatio = totalFiles > 0 ? Math.min(1, moduleCount / (totalFiles * 0.3)) : 0;
  const modularityBonus = modularityRatio * 10;

  return {
    complexity: Math.round((25 - complexityPenalty) * 10) / 10,
    coupling: Math.round((20 - couplingPenalty) * 10) / 10,
    fileSize: Math.round((15 - fileSizePenalty) * 10) / 10,
    highComplexity: Math.round((20 - highComplexPenalty) * 10) / 10,
    documentation: Math.round(docBonus * 10) / 10,
    modularity: Math.round(modularityBonus * 10) / 10,
  };
}

function computeTechnicalDebtHours(files: FileMetrics[]): number {
  let debtHours = 0;
  for (const f of files) {
    if (f.complexity > 15) {
      debtHours += 2 * (f.complexity - 15) + 5;
    } else if (f.complexity > 5) {
      debtHours += 0.5 * (f.complexity - 5);
    }
    if (f.loc > 200) {
      debtHours += (f.loc - 200) / 100;
    }
  }
  return Math.round(debtHours);
}

function buildRecommendations(
  avgComplexity: number,
  couplingScore: number,
  sizeDistribution: { small: number; medium: number; large: number },
  complexityDistribution: { low: number; medium: number; high: number },
  totalFiles: number,
  topComplexFiles: FileMetrics[],
  topLargeFiles: FileMetrics[],
): ProjectMetrics["recommendations"] {
  const recs: ProjectMetrics["recommendations"] = [];

  if (avgComplexity > 15) {
    recs.push({ severity: "high", message: `Average cyclomatic complexity is ${avgComplexity.toFixed(1)} — refactor complex logic into smaller functions.` });
  } else if (avgComplexity > 8) {
    recs.push({ severity: "medium", message: `Average complexity of ${avgComplexity.toFixed(1)} is moderate — consider breaking up long conditional chains.` });
  }

  if (couplingScore > 0.25) {
    recs.push({ severity: "high", message: "High coupling detected — modules import heavily from each other. Apply dependency inversion or create abstraction layers." });
  } else if (couplingScore > 0.15) {
    recs.push({ severity: "medium", message: "Moderate coupling detected — review import dependencies and consider extracting shared utilities." });
  }

  const largeFileFraction = totalFiles > 0 ? sizeDistribution.large / totalFiles : 0;
  if (largeFileFraction > 0.3) {
    const topFile = topLargeFiles[0];
    recs.push({ severity: "high", message: `${Math.round(largeFileFraction * 100)}% of files exceed 200 LOC. Split large files like "${topFile?.path}" into smaller modules.` });
  } else if (largeFileFraction > 0.15) {
    recs.push({ severity: "medium", message: `${Math.round(largeFileFraction * 100)}% of files are large (>200 LOC). Consider splitting them for better maintainability.` });
  }

  const highComplexFraction = totalFiles > 0 ? complexityDistribution.high / totalFiles : 0;
  if (highComplexFraction > 0.2 && topComplexFiles[0]) {
    recs.push({ severity: "high", message: `${complexityDistribution.high} files have high cyclomatic complexity. Start refactoring "${topComplexFiles[0].path}" (complexity: ${topComplexFiles[0].complexity}).` });
  }

  if (recs.length < 3) {
    recs.push({ severity: "low", message: "Add comprehensive unit tests — high complexity code is harder to test and more error-prone." });
  }
  if (recs.length < 4) {
    recs.push({ severity: "low", message: "Consider adding JSDoc/docstring comments to public APIs to improve maintainability." });
  }

  return recs.slice(0, 5);
}

export function computeProjectMetrics(
  files: Array<{ path: string; content: string }>
): ProjectMetrics {
  const fileMetrics = files.map(f => analyzeFile(f.path, f.content));

  // Module grouping
  const moduleMap = new Map<string, FileMetrics[]>();
  for (const fm of fileMetrics) {
    if (!moduleMap.has(fm.module)) moduleMap.set(fm.module, []);
    moduleMap.get(fm.module)!.push(fm);
  }

  const modules: ModuleMetrics[] = [...moduleMap.entries()].map(([name, mFiles]) => {
    const totalLoc = mFiles.reduce((s, f) => s + f.loc, 0);
    const totalImports = mFiles.reduce((s, f) => s + f.importCount, 0);
    const langs: Record<string, number> = {};
    for (const f of mFiles) {
      langs[f.language] = (langs[f.language] ?? 0) + f.loc;
    }

    return {
      name,
      fileCount: mFiles.length,
      totalLoc,
      totalLines: mFiles.reduce((s, f) => s + f.totalLines, 0),
      avgComplexity: mFiles.reduce((s, f) => s + f.complexity, 0) / mFiles.length,
      totalImports,
      totalExports: mFiles.reduce((s, f) => s + f.exportCount, 0),
      functionCount: mFiles.reduce((s, f) => s + f.functionCount, 0),
      classCount: mFiles.reduce((s, f) => s + f.classCount, 0),
      languages: langs,
      couplingScore: totalLoc > 0 ? totalImports / totalLoc : 0,
    };
  });

  // Project-level aggregation
  const totalLoc = fileMetrics.reduce((s, f) => s + f.loc, 0);
  const totalLines = fileMetrics.reduce((s, f) => s + f.totalLines, 0);
  const totalImports = fileMetrics.reduce((s, f) => s + f.importCount, 0);

  const languageBreakdown: Record<string, number> = {};
  for (const f of fileMetrics) {
    languageBreakdown[f.language] = (languageBreakdown[f.language] ?? 0) + f.loc;
  }

  // Distributions
  const complexityDist = { low: 0, medium: 0, high: 0 };
  const sizeDist = { small: 0, medium: 0, large: 0 };

  for (const f of fileMetrics) {
    if (f.complexity <= 5) complexityDist.low++;
    else if (f.complexity <= 15) complexityDist.medium++;
    else complexityDist.high++;

    if (f.loc <= 50) sizeDist.small++;
    else if (f.loc <= 200) sizeDist.medium++;
    else sizeDist.large++;
  }

  const couplingScore = totalLoc > 0 ? totalImports / totalLoc : 0;
  const topComplexFiles = [...fileMetrics].sort((a, b) => b.complexity - a.complexity).slice(0, 5);
  const topLargeFiles = [...fileMetrics].sort((a, b) => b.loc - a.loc).slice(0, 5);
  const avgComplexity = fileMetrics.length > 0
    ? fileMetrics.reduce((s, f) => s + f.complexity, 0) / fileMetrics.length
    : 0;

  const scoreBreakdown = computeScoreBreakdown(
    avgComplexity,
    couplingScore,
    sizeDist,
    complexityDist,
    fileMetrics.length,
    modules.length,
    fileMetrics,
    totalLines,
  );
  const healthScore = Math.max(0, Math.min(100, Math.round(
    scoreBreakdown.complexity +
    scoreBreakdown.coupling +
    scoreBreakdown.fileSize +
    scoreBreakdown.highComplexity +
    scoreBreakdown.documentation +
    scoreBreakdown.modularity,
  )));
  const technicalDebtHours = computeTechnicalDebtHours(fileMetrics);
  const recommendations = buildRecommendations(
    avgComplexity,
    couplingScore,
    sizeDist,
    complexityDist,
    fileMetrics.length,
    topComplexFiles,
    topLargeFiles,
  );

  return {
    totalFiles: fileMetrics.length,
    totalLoc,
    totalLines,
    avgFileSize: fileMetrics.length > 0 ? totalLoc / fileMetrics.length : 0,
    avgComplexity,
    totalFunctions: fileMetrics.reduce((s, f) => s + f.functionCount, 0),
    totalClasses: fileMetrics.reduce((s, f) => s + f.classCount, 0),
    totalImports,
    languageBreakdown,
    modules: modules.sort((a, b) => b.totalLoc - a.totalLoc),
    files: fileMetrics,
    complexityDistribution: complexityDist,
    sizeDistribution: sizeDist,
    couplingScore,
    topComplexFiles,
    topLargeFiles,
    healthScore,
    scoreBreakdown,
    technicalDebtHours,
    recommendations,
  };
}
