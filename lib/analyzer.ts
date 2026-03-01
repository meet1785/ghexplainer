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
import { analyzeWithGemini, analyzeWithGeminiStream } from "./gemini";
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
        case "batch":
          notify(
            `Generating batch ${progress.current}/${progress.total} — sections [${progress.sections?.join(", ") ?? ""}]…`
          );
          break;
        case "complete":
          notify(`Documentation complete (${progress.completedSections?.length ?? 0}/11 sections)`);
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

// ─── SSE / NDJSON streaming types ────────────────────────────

/**
 * Event types sent to the client during streaming analysis.
 */
export type StreamEvent =
  | { type: "progress"; step: string }
  | { type: "meta"; repoInfo: RepoInfo; filesAnalyzed: number; chunks: number; filePaths?: string[]; moduleChunks?: Array<{ module: string; files: Array<{ path: string; content: string }>; totalChars: number; dependencies: string[] }>; fileData?: Array<{ path: string; content: string }> }
  | { type: "partial"; markdown: string; phase: string; complete: boolean }
  | { type: "done"; markdown: string; durationMs: number; cached: boolean }
  | { type: "error"; message: string };

/**
 * Streaming pipeline: yields NDJSON events as analysis progresses.
 * The client always has something to display — partial results are sent
 * after each Gemini call completes.
 */
export async function* analyzeRepoStream(
  url: string,
  options: Omit<AnalysisOptions, "onProgress"> = {}
): AsyncGenerator<StreamEvent> {
  const start = Date.now();
  const { githubToken, geminiApiKey, noCache } = options;

  // Step 1: Parse URL
  yield { type: "progress", step: "Parsing repository URL…" };
  const { owner, repo } = parseGitHubUrl(url);
  const cacheKey = `${owner}/${repo}`;

  // Check cache
  if (!noCache) {
    const cached = analysisCache.get(cacheKey) as AnalysisResult | null;
    if (cached) {
      yield { type: "meta", repoInfo: cached.repoInfo, filesAnalyzed: cached.filesAnalyzed, chunks: cached.chunks };
      yield { type: "done", markdown: cached.markdown, durationMs: Date.now() - start, cached: true };
      return;
    }
  }

  // Step 2: Fetch repo metadata
  yield { type: "progress", step: `Fetching metadata for ${owner}/${repo}…` };
  const repoInfo = await fetchRepoInfo(owner, repo, githubToken);

  // Step 3: Fetch file tree
  yield { type: "progress", step: "Fetching file tree…" };
  const tree = await fetchRepoTree(owner, repo, repoInfo.defaultBranch, githubToken);

  // Step 4: Fetch files
  const readable = selectReadableFiles(tree);
  yield { type: "progress", step: `Reading ${readable.length} source files…` };
  const files: FileContent[] = await fetchSelectedFiles(owner, repo, readable, githubToken);

  // Step 5: Chunk
  yield { type: "progress", step: "Chunking code by module…" };
  const chunks: CodeChunk[] = chunkByModule(files);

  // Send metadata + file data for metrics/graph features
  const filePaths = tree.filter(f => f.type === "blob").map(f => f.path);
  const moduleChunks = chunks.map(c => ({
    module: c.module,
    files: c.files.map(f => ({ path: f.path, content: f.content })),
    totalChars: c.totalChars,
    dependencies: c.dependencies,
  }));
  yield {
    type: "meta",
    repoInfo,
    filesAnalyzed: files.length,
    chunks: chunks.length,
    filePaths,
    moduleChunks,
    fileData: files.map(f => ({ path: f.path, content: f.content })),
  };

  // Step 6: Stream Gemini analysis — yields partial markdown after each call
  let lastMarkdown = "";
  for await (const event of analyzeWithGeminiStream(
    { repoInfo, tree, files, chunks },
    geminiApiKey
  )) {
    if (event.type === "progress") {
      yield { type: "progress", step: event.step };
    } else if (event.type === "partial") {
      lastMarkdown = event.markdown;
      yield { type: "partial", markdown: event.markdown, phase: event.phase, complete: event.complete };
    }
  }

  // Cache result
  const result: AnalysisResult = {
    repoInfo,
    tree,
    filesAnalyzed: files.length,
    chunks: chunks.length,
    markdown: lastMarkdown,
    durationMs: Date.now() - start,
    cached: false,
  };
  analysisCache.set(cacheKey, result);

  yield { type: "done", markdown: lastMarkdown, durationMs: Date.now() - start, cached: false };
}
