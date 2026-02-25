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
// Free tier: ~10-30 RPM → space calls ~6s apart for safety
const INTER_REQUEST_DELAY_MS = 6000;
let lastRequestTime = 0;

// ─── System Prompts for each analysis pass ───────────────────

const CHUNK_ANALYSIS_PROMPT = `You are a senior software architect analyzing a single code module.

Given the repository context and one module's source files, produce a concise analysis covering:
- Module purpose and responsibility
- Key classes/functions/exports
- Internal data flow
- External dependencies used
- Non-obvious design decisions
- Potential issues or smells

Be precise. Reference specific file names and function names. Do NOT pad with generic explanations.`;

// Cross-module reasoning is now integrated into FINAL_SYNTHESIS_PROMPT (saves 1 API call)

const FINAL_SYNTHESIS_PROMPT = `You are a senior software architect and technical writer specializing in understanding unfamiliar codebases quickly and deeply.

You have been given:
1. Repository metadata
2. Full file tree
3. Per-module analyses

Your task:
- FIRST, perform cross-module reasoning: identify how modules interact, the main data flow, shared patterns, coupling, and the dependency graph.
- THEN, synthesize everything into deep, structured, long-form technical documentation.

CRITICAL RULES:
- Do NOT guess or hallucinate. Only make claims supported by the provided analyses.
- If something is unclear, state: "This cannot be confirmed from the repository."
- Be exhaustive on main components. Skip trivial boilerplate.
- Avoid textbook definitions. Explain THIS repo, not concepts in general.
- Write for: software engineering candidates, interviewers, and new developers.

OUTPUT FORMAT — Use exactly these sections:

# 1. Repository Overview
- What this project does
- Who it is for
- Real-world use case
- One-paragraph mental model

# 2. High-Level Architecture
- Architectural style
- Major components and interactions
- Data flow overview (request → processing → response)
- External dependencies and services

# 3. Folder & Module Breakdown
For each major folder: purpose, key files, responsibility, why it exists.

# 4. Core Functional Flow
- Main execution path
- Entry points
- How the system starts and operates
- Step-by-step flow for a typical use case

# 5. APIs & Interfaces
For each API/interface: name, inputs, outputs, internal flow, error handling.

# 6. Key Business Logic
- Where the "real logic" lives
- Important algorithms or rules
- Non-obvious design decisions and why they likely exist

# 7. Configuration & Environment
- Environment variables
- Config files
- Build/runtime dependencies
- How behavior changes per environment

# 8. Testing Strategy
- Types of tests (if present)
- Coverage and gaps
- How tests reflect system design
- If no tests: state that explicitly

# 9. Strengths, Weaknesses & Trade-offs
- What the repo does well
- Design limitations
- Scalability/maintainability concerns
- What you would improve as a senior engineer

# 10. Interview & Evaluation Notes
- What an interviewer might ask about this repo
- What a candidate should explain confidently
- Red flags or standout points

# 11. Quick Start Mental Map
"If you remember only 10 things about this repo, remember these:" — bullet list.

Write with the clarity of a senior engineer explaining at a whiteboard. Technical, direct, no fluff.`;

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
 * Call Gemini with automatic model fallback and rate-limit retry.
 *
 * @param modelPreference - which model tier to prefer: "primary" (quality), "fast" (RPM)
 */
async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 16384,
  modelPreference: "primary" | "fast" = "primary"
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Build ordered fallback chain based on preference
  const modelChain = modelPreference === "fast"
    ? [MODELS.fast, MODELS.primary, MODELS.fallback]
    : [MODELS.primary, MODELS.fast, MODELS.fallback];

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

        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: effectiveMax,
          },
        });

        const text = result.response.text();
        if (!text) throw new Error("Gemini returned an empty response.");
        return text;
      } catch (err) {
        const msg = (err as Error).message ?? "";
        const isRateLimit = msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
        const isServerError = msg.includes("500") || msg.includes("503");
        const isRetryable = isRateLimit || isServerError;
        const isLastAttempt = attempt === MAX_RETRIES;

        if (isRetryable && !isLastAttempt) {
          const delay = getRetryDelay(msg, attempt);
          console.log(`[Gemini] ${modelName} attempt ${attempt + 1} failed (${isRateLimit ? '429' : '5xx'}), retrying in ${(delay/1000).toFixed(1)}s...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (isRetryable) {
          // Exhausted retries for this model — try next in chain
          console.log(`[Gemini] ${modelName} exhausted ${MAX_RETRIES + 1} attempts, trying next model...`);
          break;
        }

        // Non-retryable error (bad request, auth, etc.)
        throw err;
      }
    }
  }

  throw new Error(
    "All Gemini models exhausted after retries. The free-tier quota may be fully used. " +
    "Please wait a few minutes or upgrade to a paid plan."
  );
}

// ─── Build prompts ───────────────────────────────────────────

function buildRepoContext(input: GeminiAnalysisInput): string {
  const { repoInfo, tree } = input;
  const treeText = tree
    .map((f) => `${f.type === "tree" ? "📁" : "📄"} ${f.path}`)
    .join("\n");

  return `## Repository: ${repoInfo.owner}/${repoInfo.repo}
**Description:** ${repoInfo.description || "(none)"}
**Primary Language:** ${repoInfo.language || "unknown"}
**Stars:** ${repoInfo.stars}
**Topics:** ${repoInfo.topics.join(", ") || "(none)"}
**Created:** ${repoInfo.createdAt}
**Last Updated:** ${repoInfo.updatedAt}
**Default Branch:** ${repoInfo.defaultBranch}

## Full File Tree (${tree.length} entries)
\`\`\`
${treeText}
\`\`\``;
}

function buildChunkPrompt(repoContext: string, chunk: CodeChunk): string {
  const filesText = chunk.files
    .map((f) => `\n${"=".repeat(50)}\nFILE: ${f.path}\n${"=".repeat(50)}\n${f.content}`)
    .join("\n");

  return `${repoContext}

---

## Module: ${chunk.module}
Files: ${chunk.files.length} | Chars: ${chunk.totalChars.toLocaleString()}
Dependencies: ${chunk.dependencies.join(", ") || "(none)"}

${filesText}

---
Analyze this module thoroughly.`;
}

function buildSinglePassPrompt(input: GeminiAnalysisInput): string {
  const repoContext = buildRepoContext(input);
  const filesText = input.files
    .map((f) => `\n${"=".repeat(50)}\nFILE: ${f.path}\n${"=".repeat(50)}\n${f.content}`)
    .join("\n");

  return `${repoContext}

---

## File Contents (${input.files.length} files)

${filesText}

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
  const key = apiKey ?? process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set. Please add it to your .env.local file.");
  }

  const chunks = input.chunks;

  // ── Small repo: single pass ──
  if (!chunks || chunks.length <= 1) {
    onProgress?.({ phase: "single-pass" });
    return callGemini(key, SINGLE_PASS_PROMPT, buildSinglePassPrompt(input));
  }

  // ── Large repo: multi-pass (optimized: N+1 calls) ──
  const repoContext = buildRepoContext(input);

  // Pass 1: Chunk Analysis (N calls, fast model)
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
      key,
      CHUNK_ANALYSIS_PROMPT,
      buildChunkPrompt(repoContext, chunk),
      4096,
      "fast"  // Use high-RPM model for per-chunk analysis
    );
    chunkAnalyses.push(`### Module: ${chunk.module}\n\n${analysis}`);
  }

  // Pass 2: Combined cross-module reasoning + final synthesis (1 call, primary model)
  // This saves 1 API call vs the old 3-pass approach
  onProgress?.({ phase: "synthesis" });
  const chunkSummary = describeChunks(chunks);
  const synthesisPrompt = `${repoContext}

---

${chunkSummary}

---

## Per-Module Analyses

${chunkAnalyses.join("\n\n---\n\n")}

---
First perform cross-module reasoning (how modules interact, main data flow, dependency graph), then synthesize everything into the final structured documentation following the output format exactly.`;

  return callGemini(key, FINAL_SYNTHESIS_PROMPT, synthesisPrompt, 16384, "primary");
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
  const key = apiKey ?? process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set. Please add it to your .env.local file.");
  }

  const chunks = input.chunks;

  // ── Small repo: single pass ──
  if (!chunks || chunks.length <= 1) {
    yield { type: "progress", step: "Generating documentation (single-pass)…" };
    const markdown = await callGemini(key, SINGLE_PASS_PROMPT, buildSinglePassPrompt(input));
    yield { type: "partial", markdown, phase: "complete", complete: true };
    return;
  }

  // ── Large repo: multi-pass with partial yields (optimized: N+1 calls) ──
  const repoContext = buildRepoContext(input);

  // Extract repo info for formatChunkAnalyses
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
      key,
      CHUNK_ANALYSIS_PROMPT,
      buildChunkPrompt(repoContext, chunk),
      4096,
      "fast"
    );
    chunkAnalyses.push(`### Module: ${chunk.module}\n\n${analysis}`);

    // Yield professional partial markdown using backend formatter (no API call)
    yield {
      type: "partial",
      markdown: formatChunkAnalyses(repoInfo, chunkAnalyses, chunks.length, i + 1, false),
      phase: `chunk-${i + 1}/${chunks.length}`,
      complete: false,
    };
  }

  // Pass 2: Combined cross-module reasoning + final synthesis (1 call, primary model)
  yield { type: "progress", step: "Synthesizing final documentation…" };
  const chunkSummary = describeChunks(chunks);
  const synthesisPrompt = `${repoContext}

---

${chunkSummary}

---

## Per-Module Analyses

${chunkAnalyses.join("\n\n---\n\n")}

---
First perform cross-module reasoning (how modules interact, main data flow, dependency graph), then synthesize everything into the final structured documentation following the output format exactly.`;

  let finalMarkdown: string;
  try {
    finalMarkdown = await callGemini(key, FINAL_SYNTHESIS_PROMPT, synthesisPrompt, 16384, "primary");
  } catch (err) {
    // If synthesis fails (rate limit, timeout), fall back to backend-formatted output
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
