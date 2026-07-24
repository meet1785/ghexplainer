import type { FileContent } from "./github";

export interface CodeSmell {
  id: string;
  filePath: string;
  line: number;
  type: 'long-function' | 'deep-nesting' | 'complex-logic';
  description: string;
  severity: 'high' | 'medium' | 'low';
  snippet?: string;
}

export interface CodeQualityReport {
  score: number; // 0-100
  smells: CodeSmell[];
  summary: {
    totalFilesScanned: number;
    highSeverityCount: number;
    mediumSeverityCount: number;
    lowSeverityCount: number;
  };
}

export function analyzeCodeQuality(files: FileContent[]): CodeQualityReport {
  const smells: CodeSmell[] = [];
  let totalFilesScanned = 0;

  for (const file of files) {
    // Only scan code files
    if (!/\.(js|jsx|ts|tsx|py|go|java|rs|c|cpp)$/.test(file.path)) continue;
    
    totalFilesScanned++;
    const lines = file.content.split('\n');
    let functionStartLine = -1;
    let currentIndent = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Basic nesting detection via indentation (assuming 2 or 4 spaces)
      const indentMatch = line.match(/^(\s+)/);
      if (indentMatch) {
        const spaces = indentMatch[1].length;
        if (spaces >= 16) { // 4 levels of 4-space indent, or 8 levels of 2-space
          smells.push({
            id: `nesting-${file.path}-${i}`,
            filePath: file.path,
            line: i + 1,
            type: 'deep-nesting',
            description: 'Deeply nested code detected. Consider refactoring or early returns.',
            severity: 'medium',
            snippet: trimmed.substring(0, 100)
          });
        }
      }

      // Basic function length detection
      if (trimmed.match(/^(function|def|func|class|const.*?=>|let.*?=>|public|private)\b/)) {
        if (functionStartLine !== -1) {
          const length = i - functionStartLine;
          if (length > 60) {
            smells.push({
              id: `long-fn-${file.path}-${functionStartLine}`,
              filePath: file.path,
              line: functionStartLine + 1,
              type: 'long-function',
              description: `Function exceeds 60 lines (Length: ${length} lines). Consider breaking it down.`,
              severity: length > 120 ? 'high' : 'medium'
            });
          }
        }
        functionStartLine = i;
      }
    }
    
    // Check the last function in the file
    if (functionStartLine !== -1) {
      const length = lines.length - functionStartLine;
      if (length > 60) {
        smells.push({
          id: `long-fn-${file.path}-${functionStartLine}`,
          filePath: file.path,
          line: functionStartLine + 1,
          type: 'long-function',
          description: `Function exceeds 60 lines (Length: ${length} lines). Consider breaking it down.`,
          severity: length > 120 ? 'high' : 'medium'
        });
      }
    }
  }

  // Calculate score
  const highCount = smells.filter(s => s.severity === 'high').length;
  const mediumCount = smells.filter(s => s.severity === 'medium').length;
  const lowCount = smells.filter(s => s.severity === 'low').length;
  
  const deduction = (highCount * 5) + (mediumCount * 2) + (lowCount * 0.5);
  const score = Math.max(0, 100 - deduction);

  return {
    score: Math.round(score),
    smells,
    summary: {
      totalFilesScanned,
      highSeverityCount: highCount,
      mediumSeverityCount: mediumCount,
      lowSeverityCount: lowCount
    }
  };
}
