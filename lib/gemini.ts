/**
 * Google Gemini API client — Multi-pass LLM Processing.
 *
 * Implements the architecture's LLM Processing layer:
 * 1. Chunk Analysis: analyze each code module independently
 * 2. Cross-Module Reasoning: identify interactions between modules
 * 3. Insight Aggregation: synthesize into final structured documentation
 *
 * Falls back to single-pass for small repos (≤ 1 chunk).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { RepoInfo, TreeFile, FileContent } from "./github";
import type { CodeChunk } from "./chunker";
import { describeChunks } from "./chunker";

/**
 * Model fallback chain — ordered by quality & free-tier availability:
 *
 * | Model               | Output  | Free RPM | Free RPD  | Notes                          |
 * |---------------------|---------|----------|-----------|--------------------------------|
 * | gemini-2.5-flash    | 65,536  | 10       | 500       | Best quality, thinking model   |
 * | gemini-2.5-flash-lite| 65,536  | 30       | 1,500     | Fastest 2.5, highest free RPM  |
 * | gemini-2.0-flash    | 8,192   | 15       | 1,500     | Legacy fallback                |
 *
 * Strategy: Use 2.5-flash-lite for per-chunk calls (high RPM),
 *           2.5-flash for synthesis (best quality). Auto-fallback on 429.
 */
const MODELS = {
  primary:   "gemini-2.5-flash",       // Best quality for final synthesis
  fast:      "gemini-2.5-flash-lite",  // Highest free RPM for chunk analysis
  fallback:  "gemini-2.0-flash",       // Legacy fallback
} as const;

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 3000;

// Minimum delay between API calls to avoid bursting the per-minute limit
// flash-lite: 30 RPM → space calls ~2s apart
const INTER_REQUEST_DELAY_MS = 2000;
let lastRequestTime = 0;

// Per-Gemini-call timeout (prevents one hung call from eating the whole budget)
const PER_CALL_TIMEOUT_MS = 30_000;

// ─── System Prompts for each analysis pass ───────────────────

const CHUNK_ANALYSIS_PROMPT = `You are a senior software architect. Analyze this code module concisely.

Cover: purpose, key exports/functions, data flow, dependencies, design decisions, issues.
Reference specific file/function names. No generic filler. Be brief but precise.`;

// Cross-module reasoning is now integrated into FINAL_SYNTHESIS_PROMPT (saves 1 API call)

const FINAL_SYNTHESIS_PROMPT = `You are a senior software architect and technical writer.

Given repo metadata, file tree, and per-module analyses:
1. Reason about cross-module interactions, data flow, dependency graph.
2. Synthesize into structured technical documentation.

Rules: Only claim what's supported by the analyses. Skip boilerplate. Be specific to THIS repo.

Output these sections (be thorough but concise):

# 1. Repository Overview
What it does, who it's for, mental model.

# 2. High-Level Architecture
Architectural style, major components, data flow, external deps.

# 3. Folder & Module Breakdown
Purpose and key files per major folder.

# 4. Core Functional Flow
Entry points, main execution path, step-by-step typical flow.

# 5. APIs & Interfaces
Key APIs: name, inputs, outputs, error handling.

# 6. Key Business Logic
Where real logic lives, important algorithms, non-obvious decisions.

# 7. Configuration & Environment
Env vars, config files, build deps.

# 8. Testing Strategy
Test types present (or absence thereof), coverage gaps.

# 9. Strengths, Weaknesses & Trade-offs
What's done well, limitations, what to improve.

# 10. Interview & Evaluation Notes
Key questions, standout points, red flags.

# 11. Quick Start Mental Map
10 key things to remember — bullet list.

Technical, direct, no fluff.`;

// Single-pass prompt (used for small repos that fit in one call)
const SINGLE_PASS_PROMPT = FINAL_SYNTHESIS_PROMPT;

export interface GeminiAnalysisInput {
  repoInfo: RepoInfo;
  tree: TreeFile[];
  files: FileContent[];
  chunks?: CodeChunk[];
}

export interface AnalysisProgress {
  phase: "chunk-analysis" | "cross-module" | "synthesis" | "single-pass";
  current?: number;
  total?: number;
  module?: string;
}

// ─── Helper: call Gemini ─────────────────────────────────────

/**
 * Rate-limit-aware delay: ensures minimum gap between consecutive API calls.
 */
async function rateLimitDelay(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < INTER_REQUEST_DELAY_MS) {
    await new Promise((r) => setTimeout(r, INTER_REQUEST_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Parse retry delay from error message if the API provides one.
 * Falls back to exponential backoff.
 */
function getRetryDelay(errorMsg: string, attempt: number): number {
  // Google often returns: "Please retry in 56.8s"
  const match = errorMsg.match(/retry in ([\d.]+)s/i);
  if (match) {
    return Math.ceil(parseFloat(match[1]) * 1000) + 500; // Add 500ms buffer
  }
  // Exponential backoff: 3s, 6s, 12s, 24s
  return BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
}

/**
 * Call Gemini with automatic model fallback, multi-key rotation, and per-call timeout.
 *
 * @param apiKeys - one or more API keys (tries next key on 429)
 * @param modelPreference - which model tier to prefer: "primary" (quality), "fast" (RPM)
 */
async function callGemini(
  apiKeys: string | string[],
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 8192,
  modelPreference: "primary" | "fast" = "primary"
): Promise<string> {
  const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];

  // Build ordered fallback chain based on preference
  const modelChain = modelPreference === "fast"
    ? [MODELS.fast, MODELS.primary, MODELS.fallback]
    : [MODELS.primary, MODELS.fast, MODELS.fallback];

  for (const key of keys) {
    const genAI = new GoogleGenerativeAI(key);

    for (const modelName of modelChain) {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          await rateLimitDelay();

          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemPrompt,
          });

          // Clamp maxTokens to model capability
          const effectiveMax = modelName.startsWith("gemini-2.5") ? maxTokens : Math.min(maxTokens, 8192);

          // Per-call timeout to prevent one hung request from eating the entire budget
          const callPromise = model.generateContent({
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: effectiveMax,
            },
          });

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Gemini call timed out")), PER_CALL_TIMEOUT_MS)
          );

          const result = await Promise.race([callPromise, timeoutPromise]);

          const text = result.response.text();
          if (!text) throw new Error("Gemini returned an empty response.");
          return text;
        } catch (err) {
          const msg = (err as Error).message ?? "";
          const isRateLimit = msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
          const isTimeout = msg.includes("timed out");
          const isServerError = msg.includes("500") || msg.includes("503");
          const isRetryable = isRateLimit || isServerError || isTimeout;
          const isLastAttempt = attempt === MAX_RETRIES;

          if (isRetryable && !isLastAttempt) {
            const delay = isTimeout ? 1000 : getRetryDelay(msg, attempt);
            console.log(`[Gemini] ${modelName} attempt ${attempt + 1} failed (${isRateLimit ? '429' : isTimeout ? 'timeout' : '5xx'}), retrying in ${(delay/1000).toFixed(1)}s...`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          if (isRateLimit) {
            // Exhausted retries for this model on this key — try next model, then next key
            console.log(`[Gemini] ${modelName} key ${keys.indexOf(key) + 1}/${keys.length} exhausted, trying next...`);
            break;
          }

          if (isRetryable) {
            console.log(`[Gemini] ${modelName} exhausted ${MAX_RETRIES + 1} attempts, trying next model...`);
            break;
          }

          // Non-retryable error (bad request, auth, etc.)
          throw err;
        }
      }
    }
  }

  throw new Error(
    "All Gemini models and API keys exhausted after retries. " +
    "Please wait a few minutes or add more API keys (GEMINI_API_KEY_2, GEMINI_API_KEY_3)."
  );
}

// ─── Build prompts ───────────────────────────────────────────

/**
 * Collect all available Gemini API keys from env.
 * Supports: GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...
 */
function collectApiKeys(explicit?: string): string[] {
  const keys: string[] = [];
  if (explicit) keys.push(explicit);
  const primary = process.env.GEMINI_API_KEY;
  if (primary && !keys.includes(primary)) keys.push(primary);
  // Check numbered keys
  for (let i = 2; i <= 5; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k && !keys.includes(k)) keys.push(k);
  }
  return keys;
}

/**
 * Build compact repo context. Full tree only for synthesis; chunk prompts get slim version.
 */
function buildRepoContext(input: GeminiAnalysisInput, includeTree = true): string {
  const { repoInfo, tree } = input;
  let ctx = `## ${repoInfo.owner}/${repoInfo.repo}
${repoInfo.description || "(none)"} | ${repoInfo.language || "?"} | ⭐${repoInfo.stars}`;
  if (includeTree && tree.length > 0) {
    // Compact tree: files only (no folders), max 150 entries
    const fileList = tree.filter(f => f.type === "blob").slice(0, 150).map(f => f.path).join("\n");
    ctx += `\n\nFile tree (${tree.filter(f => f.type === "blob").length} files):\n\`\`\`\n${fileList}\n\`\`\``;
  }
  return ctx;
}

function buildChunkPrompt(repoContext: string, chunk: CodeChunk): string {
  // Compact file output — no heavy separators, saves tokens
  const filesText = chunk.files
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n");

  return `${repoContext}\n\nModule: ${chunk.module} (${chunk.files.length} files, ${chunk.totalChars.toLocaleString()} chars)\nDeps: ${chunk.dependencies.join(", ") || "none"}\n\n${filesText}\n\nAnalyze this module.`;
}

function buildSinglePassPrompt(input: GeminiAnalysisInput): string {
  const repoContext = buildRepoContext(input, true);
  const filesText = input.files
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n");

  return `${repoContext}\n\n## Source (${input.files.length} files)\n\n${filesText}

---
Produce the full structured technical documentation.`;
}

// ─── Backend document formatter (no API calls) ──────────────

/**
 * Format chunk analyses into a structured document WITHOUT calling the API.
 * Used as:
 * 1. Progressive partial display during streaming
 * 2. Fallback if final synthesis fails
 */
export function formatChunkAnalyses(
  repoInfo: { owner: string; repo: string; description?: string | null; language?: string | null; stars: number },
  chunkAnalyses: string[],
  totalChunks: number,
  completedChunks: number,
  isFinal = false
): string {
  const header = isFinal
    ? `# ${repoInfo.owner}/${repoInfo.repo} — Analysis Report\n\n` +
      `> ${repoInfo.description || "No description"} | ${repoInfo.language || "Unknown language"} | ⭐ ${repoInfo.stars.toLocaleString()}\n\n` +
      `**${completedChunks} modules analyzed** — backend-formatted summary (synthesis pass was skipped to save API calls)\n\n---\n`
    : `# ${repoInfo.owner}/${repoInfo.repo} — Analysis in Progress\n\n` +
      `> ${repoInfo.description || "No description"} | ${repoInfo.language || "Unknown language"} | ⭐ ${repoInfo.stars.toLocaleString()}\n\n` +
      `**${completedChunks} of ${totalChunks} modules analyzed** — results update as each module completes.\n\n---\n`;

  return header + "\n\n" + chunkAnalyses.join("\n\n---\n\n");
}

// ─── Multi-pass analysis ─────────────────────────────────────

/**
 * Run multi-pass Gemini analysis (optimized: 2 passes instead of 3):
 * Pass 1: Analyze each chunk independently (N calls, fast model)
 * Pass 2: Combined cross-module reasoning + final synthesis (1 call, primary model)
 *
 * Total API calls: N+1 (was N+2)
 */
export async function analyzeWithGemini(
  input: GeminiAnalysisInput,
  apiKey?: string,
  onProgress?: (p: AnalysisProgress) => void
): Promise<string> {
  const keys = collectApiKeys(apiKey);
  if (keys.length === 0) {
    throw new Error("GEMINI_API_KEY is not set. Please add it to your .env.local file.");
  }

  const chunks = input.chunks;

  // ── Small repo: single pass ──
  if (!chunks || chunks.length <= 1) {
    onProgress?.({ phase: "single-pass" });
    return callGemini(keys, SINGLE_PASS_PROMPT, buildSinglePassPrompt(input));
  }

  // ── Large repo: multi-pass (optimized: N+1 calls) ──
  // Chunk prompts get slim context (no tree) → saves ~2k tokens/call
  const slimContext = buildRepoContext(input, false);

  // Pass 1: Chunk Analysis (N calls, fast model, 2048 tokens max)
  const chunkAnalyses: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    onProgress?.({
      phase: "chunk-analysis",
      current: i + 1,
      total: chunks.length,
      module: chunk.module,
    });
    const analysis = await callGemini(
      keys,
      CHUNK_ANALYSIS_PROMPT,
      buildChunkPrompt(slimContext, chunk),
      2048,
      "fast"
    );
    chunkAnalyses.push(`### Module: ${chunk.module}\n\n${analysis}`);
  }

  // Pass 2: Combined cross-module reasoning + synthesis (1 call, primary, 10k tokens)
  onProgress?.({ phase: "synthesis" });
  const fullContext = buildRepoContext(input, true);
  const chunkSummary = describeChunks(chunks);
  const synthesisPrompt = `${fullContext}\n\n${chunkSummary}\n\n## Per-Module Analyses\n\n${chunkAnalyses.join("\n\n---\n\n")}\n\nSynthesize into the final structured documentation.`;

  return callGemini(keys, FINAL_SYNTHESIS_PROMPT, synthesisPrompt, 10240, "primary");
}

// ─── Streaming analysis (yields partial results) ─────────────

export type GeminiStreamEvent =
  | { type: "progress"; step: string }
  | { type: "partial"; markdown: string; phase: string; complete: boolean };

/**
 * Streaming multi-pass analysis — yields partial markdown after each phase.
 * The client receives something displayable after every Gemini call,
 * so even if the connection drops, the user has useful output.
 */
export async function* analyzeWithGeminiStream(
  input: GeminiAnalysisInput,
  apiKey?: string
): AsyncGenerator<GeminiStreamEvent> {
  const keys = collectApiKeys(apiKey);
  if (keys.length === 0) {
    throw new Error("GEMINI_API_KEY is not set. Please add it to your .env.local file.");
  }

  const chunks = input.chunks;

  // ── Small repo: single pass ──
  if (!chunks || chunks.length <= 1) {
    yield { type: "progress", step: "Generating documentation (single-pass)…" };
    const markdown = await callGemini(keys, SINGLE_PASS_PROMPT, buildSinglePassPrompt(input));
    yield { type: "partial", markdown, phase: "complete", complete: true };
    return;
  }

  // ── Large repo: multi-pass with partial yields (N+1 calls) ──
  const slimContext = buildRepoContext(input, false);

  const repoInfo = {
    owner: input.repoInfo.owner,
    repo: input.repoInfo.repo,
    description: input.repoInfo.description,
    language: input.repoInfo.language,
    stars: input.repoInfo.stars,
  };

  // Pass 1: Chunk Analysis — yield partial markdown after each chunk
  const chunkAnalyses: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    yield {
      type: "progress",
      step: `Analyzing module ${i + 1}/${chunks.length}: ${chunk.module}…`,
    };

    const analysis = await callGemini(
      keys,
      CHUNK_ANALYSIS_PROMPT,
      buildChunkPrompt(slimContext, chunk),
      2048,
      "fast"
    );
    chunkAnalyses.push(`### Module: ${chunk.module}\n\n${analysis}`);

    yield {
      type: "partial",
      markdown: formatChunkAnalyses(repoInfo, chunkAnalyses, chunks.length, i + 1, false),
      phase: `chunk-${i + 1}/${chunks.length}`,
      complete: false,
    };
  }

  // Pass 2: Synthesis (1 call, primary model)
  yield { type: "progress", step: "Synthesizing final documentation…" };
  const fullContext = buildRepoContext(input, true);
  const chunkSummary = describeChunks(chunks);
  const synthesisPrompt = `${fullContext}\n\n${chunkSummary}\n\n## Per-Module Analyses\n\n${chunkAnalyses.join("\n\n---\n\n")}\n\nSynthesize into the final structured documentation.`;

  let finalMarkdown: string;
  try {
    finalMarkdown = await callGemini(keys, FINAL_SYNTHESIS_PROMPT, synthesisPrompt, 10240, "primary");
  } catch (err) {
    console.error("[ghexplainer] Synthesis call failed, using backend formatter:", err);
    finalMarkdown = formatChunkAnalyses(repoInfo, chunkAnalyses, chunks.length, chunks.length, true);
  }

  yield {
    type: "partial",
    markdown: finalMarkdown,
    phase: "complete",
    complete: true,
  };
}
