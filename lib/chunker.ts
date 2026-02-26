/**
 * Smart Code Chunking module.
 *
 * Implements the "Smart Code Chunking" layer from the architecture:
 * - Split By Module: groups files by directory/module
 * - Limit Tokens: enforces per-chunk and total token budgets
 * - Dependency Analysis: detects imports and sorts modules by dependency order
 */

import type { FileContent } from "./github";

export interface CodeChunk {
  /** Module/directory name (e.g. "src/utils", "lib", root files as "(root)") */
  module: string;
  /** Files in this chunk */
  files: FileContent[];
  /** Total character count of this chunk */
  totalChars: number;
  /** Detected internal dependencies (import targets within the repo) */
  dependencies: string[];
}

/**
 * Token budget per chunk — set large to minimize API calls.
 * Gemini 2.5 handles 1M input tokens (~4M chars), so 100K per chunk is fine.
 * With 200K total file budget, this typically yields 1-2 chunks.
 */
const MAX_CHUNK_CHARS = 100_000;
/** Max chunks — we aim for 1 call (single-pass) or 2 calls max */
const MAX_CHUNKS = 3;

/**
 * Detect import/require targets from file content.
 * Returns relative paths referenced in the code (internal deps).
 */
function extractImports(content: string): string[] {
  const imports: string[] = [];

  // ES module imports: import ... from "..."
  const esRegex = /(?:import|export)\s+.*?from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = esRegex.exec(content)) !== null) {
    if (match[1].startsWith(".")) imports.push(match[1]);
  }

  // CommonJS: require("...")
  const cjsRegex = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = cjsRegex.exec(content)) !== null) {
    if (match[1].startsWith(".")) imports.push(match[1]);
  }

  // Python: from . import ... or from .module import ...
  const pyRegex = /from\s+(\.[\w.]*)\s+import/g;
  while ((match = pyRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Go: import "github.com/..." (relative-ish detection)
  const goRegex = /import\s+(?:\w+\s+)?"([^"]+)"/g;
  while ((match = goRegex.exec(content)) !== null) {
    if (!match[1].startsWith("http") && match[1].includes("/")) {
      imports.push(match[1]);
    }
  }

  return imports;
}

/**
 * Resolve a file path to its module (top-level directory).
 * e.g. "src/utils/helpers.ts" → "src/utils"
 *      "package.json" → "(root)"
 */
function getModule(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 1) return "(root)";
  // Use up to 2 levels deep for grouping
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/");
}

/**
 * Group files into module-based chunks, respecting token limits.
 * Implements all three chunking strategies from the architecture.
 */
export function chunkByModule(files: FileContent[]): CodeChunk[] {
  // Step 1: Group files by module
  const moduleMap = new Map<string, FileContent[]>();
  for (const file of files) {
    const mod = getModule(file.path);
    if (!moduleMap.has(mod)) moduleMap.set(mod, []);
    moduleMap.get(mod)!.push(file);
  }

  // Step 2: Build initial chunks with dependency info
  const rawChunks: CodeChunk[] = [];
  for (const [mod, modFiles] of moduleMap) {
    const totalChars = modFiles.reduce((sum, f) => sum + f.content.length, 0);
    const allImports = modFiles.flatMap((f) => extractImports(f.content));
    const uniqueDeps = [...new Set(allImports)];

    // If a module exceeds budget, split it into sub-chunks
    if (totalChars > MAX_CHUNK_CHARS) {
      let currentFiles: FileContent[] = [];
      let currentChars = 0;
      let chunkIdx = 0;

      for (const file of modFiles) {
        if (currentChars + file.content.length > MAX_CHUNK_CHARS && currentFiles.length > 0) {
          rawChunks.push({
            module: `${mod} (part ${chunkIdx + 1})`,
            files: currentFiles,
            totalChars: currentChars,
            dependencies: uniqueDeps,
          });
          currentFiles = [];
          currentChars = 0;
          chunkIdx++;
        }
        currentFiles.push(file);
        currentChars += file.content.length;
      }
      if (currentFiles.length > 0) {
        rawChunks.push({
          module: chunkIdx > 0 ? `${mod} (part ${chunkIdx + 1})` : mod,
          files: currentFiles,
          totalChars: currentChars,
          dependencies: uniqueDeps,
        });
      }
    } else {
      rawChunks.push({
        module: mod,
        files: modFiles,
        totalChars: totalChars,
        dependencies: uniqueDeps,
      });
    }
  }

  // Step 3: Dependency-aware sorting
  // Modules with fewer dependencies come first (foundational modules)
  rawChunks.sort((a, b) => {
    // Root config/README always first
    if (a.module === "(root)") return -1;
    if (b.module === "(root)") return 1;
    // Then by dependency count ascending (leaf deps first)
    return a.dependencies.length - b.dependencies.length;
  });

  // Step 4: Limit total chunks
  return rawChunks.slice(0, MAX_CHUNKS);
}

/**
 * Build a text summary of the chunking result for the LLM.
 */
export function describeChunks(chunks: CodeChunk[]): string {
  const lines = [`## Code Modules (${chunks.length} chunks)\n`];
  for (const chunk of chunks) {
    lines.push(`### Module: ${chunk.module}`);
    lines.push(`Files: ${chunk.files.length} | Chars: ${chunk.totalChars.toLocaleString()}`);
    if (chunk.dependencies.length > 0) {
      lines.push(`Internal deps: ${chunk.dependencies.join(", ")}`);
    }
    lines.push(`File list: ${chunk.files.map((f) => f.path).join(", ")}`);
    lines.push("");
  }
  return lines.join("\n");
}
