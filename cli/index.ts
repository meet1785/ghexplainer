#!/usr/bin/env node
/**
 * ghexplainer CLI
 * Usage: npx tsx cli/index.ts <github-url> [options]
 */

import { Command } from "commander";
import { analyzeRepo } from "../lib/analyzer";
import * as fs from "fs";
import * as path from "path";

// Load .env.local if running locally (Next.js doesn't auto-load for CLI)
function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnvLocal();

const program = new Command();

program
  .name("ghexplainer")
  .description("Deep AI-powered analysis of any public GitHub repository.")
  .version("1.0.0")
  .argument("<url>", "GitHub repository input (e.g. https://github.com/owner/repo or owner/repo)")
  .option("-o, --output <file>", "Save the markdown output to a file")
  .option("--github-token <token>", "GitHub personal access token (increases rate limit)")
  .option("--gemini-key <key>", "Google Gemini API key (overrides GEMINI_API_KEY env var)")
  .action(async (url: string, opts: { output?: string; githubToken?: string; geminiKey?: string }) => {
    console.log("\n🔍 ghexplainer — analyzing:", url);
    console.log("─".repeat(60));

    try {
      const result = await analyzeRepo(url, {
        githubToken: opts.githubToken,
        geminiApiKey: opts.geminiKey,
        onProgress: (step) => {
          process.stdout.write(`  ⏳ ${step}\n`);
        },
      });

      console.log("\n" + "─".repeat(60));
      console.log(
        `✅ Done! ${result.filesAnalyzed} files analyzed across ${result.chunks} chunks in ${(result.durationMs / 1000).toFixed(1)}s`
      );
      if (result.cached) console.log("⚡ (served from cache)");
      console.log("─".repeat(60) + "\n");

      if (opts.output) {
        const outPath = path.resolve(opts.output);
        fs.writeFileSync(outPath, result.markdown, "utf-8");
        console.log(`📄 Markdown saved to: ${outPath}\n`);
      } else {
        // Print to stdout
        console.log(result.markdown);
      }
    } catch (e) {
      console.error("\n❌ Error:", (e as Error).message);
      process.exit(1);
    }
  });

program.parse();
