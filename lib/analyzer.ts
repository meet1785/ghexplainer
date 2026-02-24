/**
 * Analysis orchestrator.
 *
 * Implements the full pipeline from the architecture diagram:
 * User Input → Repo Fetch & Analyze → Smart Code Chunking →
 * LLM Processing (multi-pass) → Documentation Builder → Output
 *
 * Also wires in: Cache Storage, multi-format export.
 */

import {
  parseGitHubUrl,
  fetchRepoInfo,
  fetchRepoTree,
  selectReadableFiles,
  fetchSelectedFiles,
  type RepoInfo,
  type TreeFile,
  type FileContent,
} from "./github";
import { chunkByModule, type CodeChunk } from "./chunker";
import { analyzeWithGemini } from "./gemini";
import { analysisCache } from "./cache";

export interface AnalysisResult {
  repoInfo: RepoInfo;
  tree: TreeFile[];
  filesAnalyzed: number;
  chunks: number;
  markdown: string;
  durationMs: number;
  cached: boolean;
}

export interface AnalysisOptions {
  /** GitHub personal access token (optional, increases rate limit from 60→5000 req/h) */
  githubToken?: string;
  /** Gemini API key */
  geminiApiKey?: string;
  /** Progress callback – called as steps complete */
  onProgress?: (step: string) => void;
  /** Skip cache and force re-analysis */
  noCache?: boolean;
}

/**
 * Full pipeline: URL → deep repo documentation.
 */
export async function analyzeRepo(
  url: string,
  options: AnalysisOptions = {}
): Promise<AnalysisResult> {
  const start = Date.now();
  const { githubToken, geminiApiKey, onProgress, noCache } = options;
  const notify = (msg: string) => onProgress?.(msg);

  // Step 1: Parse URL
  notify("Parsing repository URL…");
  const { owner, repo } = parseGitHubUrl(url);
  const cacheKey = `${owner}/${repo}`;

  // Step 1.5: Check cache
  if (!noCache) {
    const cached = analysisCache.get(cacheKey) as AnalysisResult | null;
    if (cached) {
      notify("Returning cached analysis…");
      return { ...cached, cached: true, durationMs: Date.now() - start };
    }
  }

  // Step 2: Fetch repo metadata
  notify(`Fetching metadata for ${owner}/${repo}…`);
  const repoInfo = await fetchRepoInfo(owner, repo, githubToken);

  // Step 3: Fetch file tree
  notify("Fetching file tree…");
  const tree = await fetchRepoTree(
    owner,
    repo,
    repoInfo.defaultBranch,
    githubToken
  );

  // Step 4: Select and fetch readable files
  const readable = selectReadableFiles(tree);
  notify(`Reading ${readable.length} source files (budget: ~120k chars)…`);
  const files: FileContent[] = await fetchSelectedFiles(
    owner,
    repo,
    readable,
    githubToken
  );

  // Step 5: Smart Code Chunking
  notify("Chunking code by module…");
  const chunks: CodeChunk[] = chunkByModule(files);
  notify(`Created ${chunks.length} module chunks`);

  // Step 6: Multi-pass Gemini analysis
  notify(
    `Sending ${chunks.length} chunks to Gemini for analysis… (this may take 20–60 seconds)`
  );
  const markdown = await analyzeWithGemini(
    { repoInfo, tree, files, chunks },
    geminiApiKey,
    (progress) => {
      switch (progress.phase) {
        case "chunk-analysis":
          notify(
            `Analyzing module ${progress.current}/${progress.total}: ${progress.module}…`
          );
          break;
        case "cross-module":
          notify("Cross-module reasoning…");
          break;
        case "synthesis":
          notify("Synthesizing final documentation…");
          break;
        case "single-pass":
          notify("Generating documentation (single-pass)…");
          break;
      }
    }
  );

  const result: AnalysisResult = {
    repoInfo,
    tree,
    filesAnalyzed: files.length,
    chunks: chunks.length,
    markdown,
    durationMs: Date.now() - start,
    cached: false,
  };

  // Step 8: Cache the result
  analysisCache.set(cacheKey, result);

  return result;
}
