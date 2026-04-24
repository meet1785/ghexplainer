#!/usr/bin/env node
/**
 * ghexplainer CLI
 * Usage: npx tsx cli/index.ts <github-url> [options]
 */

import { Command } from "commander";
import { analyzeRepo } from "../lib/analyzer";
import { markdownToHtml, markdownToJson } from "../lib/export";
import { getSection } from "../lib/sections";
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
  .option("-o, --output <file>", "Save the output to a file")
  .option("--github-token <token>", "GitHub personal access token (increases rate limit)")
  .option("--gemini-key <key>", "Google Gemini API key (overrides GEMINI_API_KEY env var)")
  .option("--no-cache", "Bypass in-memory cache and force a fresh analysis")
  .option("--section <number>", "Print only a specific section by number (1-11)")
  .option("--format <format>", "Output format: markdown (default), json, html")
  .action(async (url: string, opts: {
    output?: string;
    githubToken?: string;
    geminiKey?: string;
    noCache?: boolean;
    section?: string;
    format?: string;
  }) => {
    console.log("\n🔍 ghexplainer — analyzing:", url);
    console.log("─".repeat(60));

    // Validate --section
    let sectionId: number | null = null;
    if (opts.section !== undefined) {
      sectionId = parseInt(opts.section, 10);
      if (isNaN(sectionId) || sectionId < 1 || sectionId > 11) {
        console.error("❌ --section must be a number between 1 and 11.");
        process.exit(1);
      }
    }

    // Validate --format
    const validFormats = ["markdown", "json", "html"] as const;
    type OutputFormat = typeof validFormats[number];
    const format: OutputFormat = (() => {
      if (!opts.format) return "markdown";
      const f = opts.format.toLowerCase() as OutputFormat;
      if (validFormats.includes(f)) return f;
      console.error(`❌ --format must be one of: ${validFormats.join(", ")}`);
      process.exit(1);
    })();

    try {
      const result = await analyzeRepo(url, {
        githubToken: opts.githubToken,
        geminiApiKey: opts.geminiKey,
        noCache: Boolean(opts.noCache),
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

      const repoSlug = `${result.repoInfo.owner}/${result.repoInfo.repo}`;

      // Build the output string
      let output: string;
      if (sectionId !== null) {
        // --section: extract a single section from the markdown
        const section = getSection(result.markdown, sectionId);
        if (!section) {
          console.error(`❌ Section ${sectionId} was not found in the analysis output.`);
          process.exit(1);
        }
        if (format === "json") {
          output = JSON.stringify({ repoName: repoSlug, section }, null, 2);
        } else if (format === "html") {
          const sectionMd = `# ${section.id}. ${section.title}\n\n${section.content}`;
          output = markdownToHtml(sectionMd, repoSlug);
        } else {
          output = `# ${section.id}. ${section.title}\n\n${section.content}`;
        }
      } else {
        // Full analysis
        if (format === "json") {
          output = JSON.stringify(markdownToJson(result.markdown, repoSlug), null, 2);
        } else if (format === "html") {
          output = markdownToHtml(result.markdown, repoSlug);
        } else {
          output = result.markdown;
        }
      }

      if (opts.output) {
        const outPath = path.resolve(opts.output);
        fs.writeFileSync(outPath, output, "utf-8");
        const label = format === "json" ? "JSON" : format === "html" ? "HTML" : "Markdown";
        console.log(`📄 ${label} saved to: ${outPath}\n`);
      } else {
        // Print to stdout
        console.log(output);
      }
    } catch (e) {
      console.error("\n❌ Error:", (e as Error).message);
      process.exit(1);
    }
  });

program.parse();
