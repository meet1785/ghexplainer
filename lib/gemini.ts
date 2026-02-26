/**
 * Google Gemini API client — Sequential Section-Batch Processing.
 *
 * Architecture:
 * 1. Split 11 documentation sections into 3 planned batches
 * 2. Generate each batch sequentially with full code context
 * 3. After each batch, parse which sections were generated
 * 4. Final batch picks up any missed sections from earlier batches
 * 5. Merge all sections in order (1-11) for final output
 *
 * This ensures ALL 11 sections are reliably generated without
 * output truncation — each batch only needs ~1000-1500 words.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { RepoInfo, TreeFile, FileContent } from "./github";
import type { CodeChunk } from "./chunker";

// ─── Model Configuration ─────────────────────────────────────

/**
 * Model routing — based on Google AI Studio rate limits:
 *
 * | Model                | RPM | TPM    | Strategy                |
 * |----------------------|-----|--------|-------------------------|
 * | gemini-2.5-flash-lite| 10  | 250K   | Batches 1 & 3 (high RPM)|
 * | gemini-2.5-flash     |  5  | 250K   | Batch 2 (best quality)  |
 *
 * Alternating models across batches minimizes rate-limit waits.
 */
const MODELS = {
  primary:   "gemini-2.5-flash",
  fast:      "gemini-2.5-flash-lite",
  fallback:  "gemini-2.5-flash-lite",
} as const;

const MAX_RETRIES = 1;
const BASE_RETRY_DELAY_MS = 4000;

const MODEL_RPM: Record<string, number> = {
  "gemini-2.5-flash": 5,
  "gemini-2.5-flash-lite": 10,
  "gemini-2.0-flash": 15,
};

const modelLastRequest = new Map<string, number>();
let lastRequestTime = 0;

function getModelDelay(modelName: string): number {
  const rpm = MODEL_RPM[modelName] ?? 10;
  return Math.ceil((60_000 / rpm) * 1.2);
}

const PER_CALL_TIMEOUT_MS = 120_000;

/** Delay between batches to let rate limits cool off (ms) */
const INTER_BATCH_DELAY_MS = 20_000;

let globalRequestCount = 0;   // Successful API calls
let globalAttemptCount = 0;   // All attempts (including 429s)
const MAX_REQUESTS_PER_ANALYSIS = 12;  // Max successful calls
const MAX_ATTEMPTS_PER_ANALYSIS = 45;  // Max total attempts (3 keys × 2 models × retries + waits)

/** Track which key index + model last succeeded, so we try it first next batch */
let lastSuccessfulKeyIdx = -1;
let lastSuccessfulModel = ""

// ─── Section Definitions ─────────────────────────────────────

interface SectionDef {
  id: number;
  title: string;
  description: string;
}

const SECTION_DEFS: SectionDef[] = [
  { id: 1, title: "Repository Overview", description: "What the project does, target users, core value proposition. Key technologies used." },
  { id: 2, title: "Architecture & Design", description: "Architectural style, component diagram in text, how major pieces connect. Name the backbone files." },
  { id: 3, title: "Module Breakdown", description: "For EVERY significant module/directory: purpose, key files, exports, relations to other modules. Use bullet lists." },
  { id: 4, title: "Core Execution Flow", description: "Trace the main user-facing flow(s) end-to-end: entry point → routing → business logic → data → response. Name every function." },
  { id: 5, title: "API Surface", description: "All public APIs/endpoints/CLI commands: method, path/name, inputs, outputs, error handling. Use bullet lists — NO tables." },
  { id: 6, title: "Key Business Logic", description: "Most important algorithms, state machines, or decision trees. WHERE they live (file:function) and WHAT they do." },
  { id: 7, title: "Data Flow & State Management", description: "How data moves end-to-end. Caching, persistence, transformations, external services, state lifecycle." },
  { id: 8, title: "Configuration & Environment", description: "Required env vars, config files, build/deploy requirements. What breaks if misconfigured." },
  { id: 9, title: "Dependencies & Tech Stack", description: "Key external libraries and WHY they are used. Runtime requirements. Version constraints." },
  { id: 10, title: "Strengths & Weaknesses", description: "What is well-engineered vs. what needs improvement. Be specific and constructive — reference actual code." },
  { id: 11, title: "Quick Reference", description: "12-15 bullet points: the most important things to understand about this codebase. Include file paths." },
];

/** Planned section batches — 3 primary API calls + 1 optional cleanup */
const SECTION_BATCHES: number[][] = [
  [1, 2, 3, 4],   // Batch 1: Overview + Architecture + Modules + Flow
  [5, 6, 7, 8],   // Batch 2: API + Logic + Data + Config
  [9, 10, 11],    // Batch 3: Stack + Quality + Reference
  [],              // Batch 4: Cleanup — dynamically filled with missing/incomplete
];

/** Model per batch — alternating to minimize rate limit waits */
const BATCH_MODEL_STRATEGY: Array<"fast" | "primary"> = ["fast", "primary", "fast", "primary"];

// ─── System Prompt ───────────────────────────────────────────

const BATCH_SYSTEM_PROMPT = `You are a senior software architect writing specific sections of a comprehensive technical document about a code repository.

You will be told exactly which sections to generate. Write ONLY the requested sections — nothing else.

Critical rules:
- Write ONLY the sections specified in the task. Do NOT write any other sections.
- ONLY state what the code evidence supports. No speculation or generic filler.
- Reference SPECIFIC files, functions, variable names from the source code.
- If a section has no relevant info from the code, write "Not applicable for this codebase." under its header.
- Each section should be DETAILED and ELABORATIVE — aim for 500-1200 words per section depending on complexity.
- Provide thorough explanations with code examples, file references, and technical depth.
- Include code snippets, function signatures, and concrete examples where relevant.
- You MUST complete ALL requested sections within your output.
- Use the exact header format: # N. Section Title
- Start immediately with the first section header. No preamble or introduction.
- Use bullet lists and numbered lists for structured content. Do NOT use markdown tables.

Write with technical depth and thoroughness. Every claim must reference actual code. Be comprehensive — cover edge cases, design decisions, and implementation details.`;

// ─── Types ───────────────────────────────────────────────────

export interface GeminiAnalysisInput {
  repoInfo: RepoInfo;
  tree: TreeFile[];
  files: FileContent[];
  chunks?: CodeChunk[];
}

export interface AnalysisProgress {
  phase: "batch" | "complete";
  current?: number;
  total?: number;
  sections?: number[];
  completedSections?: number[];
}

// ─── Rate Limit Helpers ──────────────────────────────────────

async function rateLimitDelay(modelName: string): Promise<void> {
  const now = Date.now();
  const minDelay = getModelDelay(modelName);
  const lastForModel = modelLastRequest.get(modelName) ?? 0;
  const elapsed = now - lastForModel;
  if (elapsed < minDelay) {
    const wait = minDelay - elapsed;
    console.log(`[Gemini] Rate limit: waiting ${(wait / 1000).toFixed(1)}s for ${modelName} (${MODEL_RPM[modelName]} RPM)`);
    await new Promise((r) => setTimeout(r, wait));
  }
  const t = Date.now();
  modelLastRequest.set(modelName, t);
  lastRequestTime = t;
}

function getRetryDelay(errorMsg: string, attempt: number): number {
  const match = errorMsg.match(/retry in ([\d.]+)s/i);
  if (match) {
    return Math.ceil(parseFloat(match[1]) * 1000) + 500;
  }
  return BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
}

export function resetRequestCounter() {
  globalRequestCount = 0;
  globalAttemptCount = 0;
  lastSuccessfulKeyIdx = -1;
  lastSuccessfulModel = "";
}

// ─── Core Gemini API Call ────────────────────────────────────

async function callGemini(
  apiKeys: string | string[],
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 8192,
  modelPreference: "primary" | "fast" = "primary"
): Promise<string> {
  const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];

  if (globalAttemptCount >= MAX_ATTEMPTS_PER_ANALYSIS) {
    throw new Error(
      `Circuit breaker: ${globalAttemptCount} API attempts made in this analysis. ` +
      "Stopping to avoid overloading the API. Please try again later."
    );
  }

  const modelChain = modelPreference === "fast"
    ? [MODELS.fast, MODELS.primary]
    : [MODELS.primary, MODELS.fast];
  const uniqueModels = [...new Set(modelChain)];

  // Reorder keys so the last successful key is tried first
  const orderedKeys = [...keys];
  if (lastSuccessfulKeyIdx >= 0 && lastSuccessfulKeyIdx < keys.length) {
    const [successKey] = orderedKeys.splice(lastSuccessfulKeyIdx, 1);
    orderedKeys.unshift(successKey);
  }

  // Also reorder models if we have a last successful model
  const orderedModels = [...uniqueModels];
  if (lastSuccessfulModel && orderedModels.includes(lastSuccessfulModel as typeof orderedModels[number])) {
    const idx = orderedModels.indexOf(lastSuccessfulModel as typeof orderedModels[number]);
    if (idx > 0) {
      const [m] = orderedModels.splice(idx, 1);
      orderedModels.unshift(m);
    }
  }

  let lastError: Error | null = null;
  let all429 = true; // Track if all failures were 429s

  for (const key of orderedKeys) {
    const genAI = new GoogleGenerativeAI(key);

    for (const modelName of orderedModels) {

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (globalAttemptCount >= MAX_ATTEMPTS_PER_ANALYSIS) {
            throw new Error("Circuit breaker: too many API attempts in this analysis.");
          }

          await rateLimitDelay(modelName);
          globalAttemptCount++;

          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemPrompt,
          });

          const effectiveMax = modelName.startsWith("gemini-2.5")
            ? maxTokens
            : Math.min(maxTokens, 8192);

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
          globalRequestCount++;
          lastSuccessfulKeyIdx = keys.indexOf(key);
          lastSuccessfulModel = modelName;
          all429 = false;
          console.log(`[Gemini] ✓ ${modelName} (key ${keys.indexOf(key) + 1}) | reqs: ${globalRequestCount}, attempts: ${globalAttemptCount}`);
          return text;
        } catch (err) {
          lastError = err as Error;
          const msg = (err as Error).message ?? "";
          const isRateLimit = msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
          const isTimeout = msg.includes("timed out");
          const isServerError = msg.includes("500") || msg.includes("503");

          if (isRateLimit) {
            // 429 may be per-model — try next model on same key before giving up on key
            console.log(`[Gemini] 429 on key ${keys.indexOf(key) + 1}/${keys.length} (${modelName}), trying next model`);
            break; // break retry loop, try next model
          }
          all429 = false;

          if ((isTimeout || isServerError) && attempt < MAX_RETRIES) {
            const delay = isTimeout ? 2000 : getRetryDelay(msg, attempt);
            console.log(`[Gemini] ${modelName} ${isTimeout ? "timeout" : "5xx"}, retry ${attempt + 1} in ${(delay / 1000).toFixed(1)}s`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          if (isTimeout || isServerError) {
            console.log(`[Gemini] ${modelName} failed after ${attempt + 1} attempts, trying next model`);
            break;
          }

          throw err;
        }
      }
    }
  }

  // If ALL failures were 429 rate limits, wait and retry once more
  if (all429 && globalAttemptCount < MAX_ATTEMPTS_PER_ANALYSIS) {
    const waitTime = 30_000; // 30s cooldown
    console.log(`[Gemini] All keys/models hit 429. Waiting ${waitTime / 1000}s and retrying...`);
    await new Promise(r => setTimeout(r, waitTime));

    // Retry with the last successful key first, or key[0]
    const retryKeyIdx = lastSuccessfulKeyIdx >= 0 ? lastSuccessfulKeyIdx : 0;
    const retryKey = keys[retryKeyIdx];
    const retryModel = orderedModels[0];
    const genAI = new GoogleGenerativeAI(retryKey);

    try {
      await rateLimitDelay(retryModel);
      globalAttemptCount++;

      const model = genAI.getGenerativeModel({
        model: retryModel,
        systemInstruction: systemPrompt,
      });

      const result = await Promise.race([
        model.generateContent({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini call timed out")), PER_CALL_TIMEOUT_MS)
        ),
      ]);

      const text = result.response.text();
      if (text) {
        globalRequestCount++;
        lastSuccessfulKeyIdx = retryKeyIdx;
        lastSuccessfulModel = retryModel;
        console.log(`[Gemini] ✓ ${retryModel} (key ${retryKeyIdx + 1}) after 429-cooldown | reqs: ${globalRequestCount}`);
        return text;
      }
    } catch (retryErr) {
      console.error(`[Gemini] Post-cooldown retry also failed:`, retryErr);
    }
  }

  throw new Error(
    lastError?.message ??
    "All Gemini models and API keys exhausted. Please wait a few minutes and try again."
  );
}

// ─── Prompt Building ─────────────────────────────────────────

function collectApiKeys(explicit?: string): string[] {
  const keys: string[] = [];
  if (explicit) keys.push(explicit);
  const primary = process.env.GEMINI_API_KEY;
  if (primary && !keys.includes(primary)) keys.push(primary);
  for (let i = 2; i <= 5; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k && !keys.includes(k)) keys.push(k);
  }
  return keys;
}

function buildRepoContext(input: GeminiAnalysisInput, includeTree = true): string {
  const { repoInfo, tree } = input;
  let ctx = `## ${repoInfo.owner}/${repoInfo.repo}\n${repoInfo.description || "(none)"} | ${repoInfo.language || "?"} | ⭐${repoInfo.stars}`;
  if (includeTree && tree.length > 0) {
    const fileList = tree.filter(f => f.type === "blob").slice(0, 200).map(f => f.path).join("\n");
    ctx += `\n\nFile tree (${tree.filter(f => f.type === "blob").length} files):\n\`\`\`\n${fileList}\n\`\`\``;
  }
  return ctx;
}

/**
 * Build organized source code context — groups files by module.
 */
function buildCodeContext(input: GeminiAnalysisInput): string {
  const moduleMap = new Map<string, typeof input.files>();
  for (const file of input.files) {
    const parts = file.path.split("/");
    const mod = parts.length <= 1 ? "(root)" : parts.slice(0, Math.min(2, parts.length - 1)).join("/");
    if (!moduleMap.has(mod)) moduleMap.set(mod, []);
    moduleMap.get(mod)!.push(file);
  }

  const codeSections: string[] = [];
  for (const [mod, files] of moduleMap) {
    const fileTexts = files.map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");
    codeSections.push(`\n### Module: ${mod} (${files.length} files)\n\n${fileTexts}`);
  }

  const totalChars = input.files.reduce((s, f) => s + f.content.length, 0);
  return `## Complete Source Code (${input.files.length} files, ${(totalChars / 1000).toFixed(0)}K chars, ${moduleMap.size} modules)\n${codeSections.join("\n\n---\n")}`;
}

/**
 * Build prompt for a specific batch of sections.
 * Includes full code context + previously generated sections for cross-referencing.
 */
function buildBatchPrompt(
  input: GeminiAnalysisInput,
  sectionIds: number[],
  previousMarkdown?: string
): string {
  const repoContext = buildRepoContext(input, true);
  const codeContext = buildCodeContext(input);

  const requestedSections = sectionIds
    .map(id => {
      const def = SECTION_DEFS.find(s => s.id === id)!;
      return `# ${def.id}. ${def.title}\n${def.description}`;
    })
    .join("\n\n");

  let prompt = `${repoContext}\n\n${codeContext}\n\n---\n\n`;

  if (previousMarkdown) {
    prompt += `## Previously Generated Sections (for cross-referencing ONLY — do NOT repeat)\n\n${previousMarkdown}\n\n---\n\n`;
  }

  prompt += `## YOUR TASK: Generate ONLY these sections\n\n${requestedSections}\n\n`;
  prompt += `IMPORTANT: You MUST generate ALL ${sectionIds.length} sections listed above. Do not skip any.\n`;
  prompt += `If a section is not applicable, write "Not applicable for this codebase." under its header.\n`;
  prompt += `Start immediately with "# ${sectionIds[0]}." — no introductory text.`;

  return prompt;
}

// ─── Section Parsing & Merging ───────────────────────────────

/**
 * Parse which section numbers (1-11) are present in markdown.
 */
function parseSectionNumbers(markdown: string): Set<number> {
  const found = new Set<number>();
  const regex = /^#\s+(\d+)\.\s/gm;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const num = parseInt(match[1]);
    if (num >= 1 && num <= 11) found.add(num);
  }
  return found;
}

/**
 * Extract a single section from markdown (from # N. header to next # M. or end).
 */
function extractSection(markdown: string, sectionNum: number): string | null {
  const pattern = new RegExp(`^(#\\s+${sectionNum}\\.\\s+.+)`, "m");
  const headerMatch = pattern.exec(markdown);
  if (!headerMatch) return null;

  const startIdx = headerMatch.index;
  const afterHeader = markdown.slice(startIdx + headerMatch[0].length);
  const nextSection = /^#\s+\d+\.\s+/m.exec(afterHeader);

  return nextSection
    ? markdown.slice(startIdx, startIdx + headerMatch[0].length + nextSection.index).trimEnd()
    : markdown.slice(startIdx).trimEnd();
}

/**
 * Check if a section appears truncated or incomplete.
 * Returns true if the section looks valid and complete.
 */
function isSectionComplete(sectionText: string, sectionNum: number): boolean {
  if (!sectionText) return false;

  // Extract just the body (after the header line)
  const lines = sectionText.split("\n");
  const bodyLines = lines.slice(1).filter(l => l.trim().length > 0);
  const bodyText = bodyLines.join("\n");
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

  // Very short sections are likely truncated (unless it's a "Not applicable" section)
  if (wordCount < 30 && !bodyText.toLowerCase().includes("not applicable")) {
    console.log(`[Gemini] Section ${sectionNum} too short (${wordCount} words) — marking incomplete`);
    return false;
  }

  // Check if section ends abruptly mid-sentence (ends with words but no punctuation)
  const lastContentLine = bodyLines[bodyLines.length - 1]?.trim() ?? "";
  if (lastContentLine.length > 20 &&
      !lastContentLine.endsWith(".") &&
      !lastContentLine.endsWith(":") &&
      !lastContentLine.endsWith("`") &&
      !lastContentLine.endsWith("|") &&
      !lastContentLine.endsWith(">") &&
      !lastContentLine.endsWith(")") &&
      !lastContentLine.endsWith("-") &&
      !lastContentLine.startsWith("*") &&
      !lastContentLine.startsWith("-") &&
      lastContentLine.match(/[a-zA-Z]$/)) {
    console.log(`[Gemini] Section ${sectionNum} appears truncated (ends mid-sentence: "...${lastContentLine.slice(-40)}")`);
    return false;
  }

  return true;
}

/**
 * Merge multiple batch outputs into a single ordered document.
 * Sections are deduplicated (first occurrence wins) and ordered 1-11.
 */
function mergeSections(batchOutputs: string[]): string {
  const sectionMap = new Map<number, string>();

  for (const output of batchOutputs) {
    for (let i = 1; i <= 11; i++) {
      const section = extractSection(output, i);
      if (!section) continue;

      const existing = sectionMap.get(i);
      if (!existing) {
        // No previous version — take this one
        sectionMap.set(i, section);
      } else if (!isSectionComplete(existing, i) && isSectionComplete(section, i)) {
        // Replace truncated version with a complete one
        console.log(`[Gemini] Replacing truncated section ${i} with complete version`);
        sectionMap.set(i, section);
      }
      // Otherwise keep the first (complete) occurrence
    }
  }

  const ordered: string[] = [];
  for (let i = 1; i <= 11; i++) {
    if (sectionMap.has(i)) ordered.push(sectionMap.get(i)!);
  }

  return ordered.join("\n\n");
}

// ─── Analysis Engine ─────────────────────────────────────────

/**
 * Run 3-batch sequential Gemini analysis.
 *
 * Each batch generates 3-4 sections with full code context.
 * After each batch we check completeness — the final batch
 * picks up any sections missed by earlier ones.
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

  resetRequestCounter();
  const totalChars = input.files.reduce((s, f) => s + f.content.length, 0);
  console.log(`[Gemini] Starting analysis: ${input.files.length} files, ${(totalChars / 1000).toFixed(0)}K chars, up to ${SECTION_BATCHES.length} batches`);

  const batchOutputs: string[] = [];
  const completedSections = new Set<number>();
  const sectionAttempts = new Map<number, number>(); // Track attempts per section

  for (let batchIdx = 0; batchIdx < SECTION_BATCHES.length; batchIdx++) {
    const planned = SECTION_BATCHES[batchIdx];
    const needed = planned.filter(s => !completedSections.has(s));

    // On last batch (cleanup), add any missing/incomplete sections
    if (batchIdx === SECTION_BATCHES.length - 1) {
      for (let i = 1; i <= 11; i++) {
        if (!completedSections.has(i) && !needed.includes(i)) {
          // Only re-request if attempted < 2 times
          const attempts = sectionAttempts.get(i) ?? 0;
          if (attempts < 2) {
            needed.push(i);
          } else {
            // Accept whatever we have after 2 attempts
            console.log(`[Gemini] Section ${i} attempted ${attempts} times — accepting as-is`);
            completedSections.add(i);
          }
        }
      }
    }

    if (needed.length === 0) {
      console.log(`[Gemini] Batch ${batchIdx + 1}: all sections already complete, skipping`);
      continue;
    }

    // Track attempt counts
    for (const s of needed) {
      sectionAttempts.set(s, (sectionAttempts.get(s) ?? 0) + 1);
    }

    onProgress?.({
      phase: "batch",
      current: batchIdx + 1,
      total: SECTION_BATCHES.length,
      sections: needed,
      completedSections: [...completedSections],
    });

    const modelPref = BATCH_MODEL_STRATEGY[batchIdx] ?? "primary";
    const previousMarkdown = batchOutputs.length > 0 ? mergeSections(batchOutputs) : undefined;
    const prompt = buildBatchPrompt(input, needed, previousMarkdown);

    console.log(`[Gemini] Batch ${batchIdx + 1}/${SECTION_BATCHES.length}: sections [${needed.join(", ")}] via ${modelPref}`);

    // Inter-batch delay to let rate limits cool off
    if (batchIdx > 0) {
      console.log(`[Gemini] Inter-batch cooldown: ${INTER_BATCH_DELAY_MS / 1000}s`);
      await new Promise(r => setTimeout(r, INTER_BATCH_DELAY_MS));
    }

    const result = await callGemini(keys, BATCH_SYSTEM_PROMPT, prompt, 40000, modelPref);
    batchOutputs.push(result);

    const newSections = parseSectionNumbers(result);
    // Validate each section for completeness before marking done
    for (const secNum of newSections) {
      const secText = extractSection(result, secNum);
      if (secText && isSectionComplete(secText, secNum)) {
        completedSections.add(secNum);
      } else {
        // Accept after 2 attempts even if incomplete
        const attempts = sectionAttempts.get(secNum) ?? 0;
        if (attempts >= 2) {
          console.log(`[Gemini] Section ${secNum} incomplete but attempted ${attempts} times — accepting`);
          completedSections.add(secNum);
        } else {
          console.log(`[Gemini] Section ${secNum} found but incomplete — will re-request`);
        }
      }
    }
    console.log(`[Gemini] Batch ${batchIdx + 1} done: got [${[...newSections].join(", ")}], valid: ${completedSections.size}/11`);

    if (completedSections.size === 11) {
      console.log(`[Gemini] All 11 sections covered after batch ${batchIdx + 1}`);
      break;
    }
  }

  const finalMarkdown = mergeSections(batchOutputs);
  console.log(`[Gemini] Analysis complete: ${completedSections.size}/11 sections, ${globalRequestCount} API calls`);
  onProgress?.({ phase: "complete", completedSections: [...completedSections] });
  return finalMarkdown;
}

// ─── Streaming Analysis ──────────────────────────────────────

export type GeminiStreamEvent =
  | { type: "progress"; step: string }
  | { type: "partial"; markdown: string; phase: string; complete: boolean; sectionsComplete?: number };

/**
 * Streaming analysis — yields partial results after each batch.
 * Client sees sections appear progressively (4 → 8 → 11).
 */
export async function* analyzeWithGeminiStream(
  input: GeminiAnalysisInput,
  apiKey?: string
): AsyncGenerator<GeminiStreamEvent> {
  const keys = collectApiKeys(apiKey);
  if (keys.length === 0) {
    throw new Error("GEMINI_API_KEY is not set. Please add it to your .env.local file.");
  }

  resetRequestCounter();
  const totalChars = input.files.reduce((s, f) => s + f.content.length, 0);

  yield {
    type: "progress",
    step: `Starting analysis (${input.files.length} files, ${(totalChars / 1000).toFixed(0)}K chars)…`,
  };

  const batchOutputs: string[] = [];
  const completedSections = new Set<number>();

  for (let batchIdx = 0; batchIdx < SECTION_BATCHES.length; batchIdx++) {
    const planned = SECTION_BATCHES[batchIdx];
    const needed = planned.filter(s => !completedSections.has(s));

    if (batchIdx === SECTION_BATCHES.length - 1) {
      for (let i = 1; i <= 11; i++) {
        if (!completedSections.has(i) && !needed.includes(i)) {
          needed.push(i);
        }
      }
    }

    if (needed.length === 0) continue;

    const sectionNames = needed.map(id => SECTION_DEFS.find(s => s.id === id)!.title).join(", ");
    yield {
      type: "progress",
      step: `Generating batch ${batchIdx + 1}/${SECTION_BATCHES.length}: ${sectionNames}…`,
    };

    const modelPref = BATCH_MODEL_STRATEGY[batchIdx] ?? "primary";
    const previousMarkdown = batchOutputs.length > 0 ? mergeSections(batchOutputs) : undefined;
    const prompt = buildBatchPrompt(input, needed, previousMarkdown);

    // Inter-batch delay to let rate limits cool off
    if (batchIdx > 0) {
      console.log(`[Gemini] Inter-batch cooldown: ${INTER_BATCH_DELAY_MS / 1000}s`);
      yield { type: "progress", step: `Cooling down before batch ${batchIdx + 1} (${INTER_BATCH_DELAY_MS / 1000}s)…` };
      await new Promise(r => setTimeout(r, INTER_BATCH_DELAY_MS));
    }

    try {
      const result = await callGemini(keys, BATCH_SYSTEM_PROMPT, prompt, 40000, modelPref);
      batchOutputs.push(result);
    } catch (err) {
      console.error(`[Gemini] Batch ${batchIdx + 1} failed:`, err);
      if (batchOutputs.length > 0) {
        const fallbackMd = mergeSections(batchOutputs);
        yield {
          type: "partial",
          markdown: fallbackMd,
          phase: "partial-error",
          complete: false,
          sectionsComplete: completedSections.size,
        };
      }
      throw err;
    }

    const latestOutput = batchOutputs[batchOutputs.length - 1];
    const newSections = parseSectionNumbers(latestOutput);
    // Validate each section for completeness before marking done
    for (const secNum of newSections) {
      const secText = extractSection(latestOutput, secNum);
      if (secText && isSectionComplete(secText, secNum)) {
        completedSections.add(secNum);
      } else {
        console.log(`[Gemini] Section ${secNum} found but incomplete — will re-request`);
      }
    }

    const accumulatedMarkdown = mergeSections(batchOutputs);
    const isComplete = completedSections.size === 11 || batchIdx === SECTION_BATCHES.length - 1;

    yield {
      type: "partial",
      markdown: accumulatedMarkdown,
      phase: isComplete ? "complete" : `batch-${batchIdx + 1}`,
      complete: isComplete,
      sectionsComplete: completedSections.size,
    };

    if (completedSections.size === 11) break;
  }
}
