#!/usr/bin/env node
/**
 * ghexplainer CLI
 * Usage: npx tsx cli/index.ts <github-url> [options]
 */

import { Command } from "commander";
import { analyzeRepo } from "../lib/analyzer";
import { buildGraphifyGraph, toMermaidDiagram, toGraphJSON } from "../lib/graphify";
import { auditRepositorySecurity, toSecurityMarkdown, toSecurityJSON } from "../lib/security";
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
  .option("--no-cache", "Bypass in-memory cache and force a fresh analysis")
  .option("-g, --graphify [format]", "Export Graphify knowledge graph (mermaid or json, default: mermaid)")
  .option("-s, --security [format]", "Export Security Radar audit report (markdown or json, default: markdown)")
  .action(async (url: string, opts: { output?: string; githubToken?: string; geminiKey?: string; noCache?: boolean; graphify?: string | boolean; security?: string | boolean }) => {
    console.log("\n🔍 ghexplainer — analyzing:", url);
    console.log("─".repeat(60));

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

      if (opts.output) {
        const outPath = path.resolve(opts.output);
        fs.writeFileSync(outPath, result.markdown, "utf-8");
        console.log(`📄 Markdown saved to: ${outPath}\n`);
      } else {
        // Print to stdout
        console.log(result.markdown);
      }

      // Graphify export
      if (opts.graphify) {
        const graphData = result.graphifyData ?? buildGraphifyGraph(
          // Re-build if not available (shouldn't happen but fallback)
          [] // Files are not stored in result, so we rely on pipeline
        );

        if (graphData && graphData.nodes.length > 0) {
          const format = typeof opts.graphify === "string" ? opts.graphify : "mermaid";
          console.log("\n" + "─".repeat(60));
          console.log(`📈 Graphify Knowledge Graph (${graphData.stats.totalNodes} nodes, ${graphData.stats.totalEdges} edges)`);
          console.log("─".repeat(60) + "\n");

          if (format === "json") {
            const jsonOutput = toGraphJSON(graphData);
            if (opts.output) {
              const jsonPath = opts.output.replace(/\.md$/, "") + "-graphify.json";
              fs.writeFileSync(path.resolve(jsonPath), jsonOutput, "utf-8");
              console.log(`📄 Graphify JSON saved to: ${path.resolve(jsonPath)}\n`);
            } else {
              console.log(jsonOutput);
            }
          } else {
            const mermaidOutput = toMermaidDiagram(graphData);
            if (opts.output) {
              const mermaidPath = opts.output.replace(/\.md$/, "") + "-graphify.md";
              const mermaidContent = "# Graphify Knowledge Graph\n\n```mermaid\n" + mermaidOutput + "\n```\n";
              fs.writeFileSync(path.resolve(mermaidPath), mermaidContent, "utf-8");
              console.log(`📄 Graphify Mermaid saved to: ${path.resolve(mermaidPath)}\n`);
            } else {
              console.log("```mermaid");
              console.log(mermaidOutput);
              console.log("```");
            }
          }

          // Print summary stats
          console.log(`\n📊 Stats: ${graphData.stats.totalModules} modules, ${graphData.stats.totalFiles} files, ${graphData.stats.totalSymbols} symbols, ${graphData.stats.totalExternalDeps} external deps`);
          if (graphData.cycles.length > 0) {
            console.log(`⚠️  ${graphData.cycles.length} dependency cycle(s) detected`);
          }
          if (graphData.hubs.length > 0) {
            console.log(`🎯 Hub modules: ${graphData.hubs.map(h => `${h.nodeId} (${h.degree} connections)`).join(", ")}`);
          }
        }
      }

      // Security Audit export
      if (opts.security) {
        const secReport = result.securityReport;
        if (secReport) {
          const format = typeof opts.security === "string" ? opts.security : "markdown";
          console.log("\n" + "─".repeat(60));
          console.log(`🔒 Security Radar Audit — Grade: ${secReport.grade} (${secReport.score}/100)`);
          console.log(`Summary: ${secReport.summary.criticalCount} Critical, ${secReport.summary.highCount} High, ${secReport.summary.mediumCount} Medium, ${secReport.summary.lowCount} Low`);
          console.log("─".repeat(60) + "\n");

          if (format === "json") {
            const jsonOutput = toSecurityJSON(secReport);
            if (opts.output) {
              const jsonPath = opts.output.replace(/\.md$/, "") + "-security.json";
              fs.writeFileSync(path.resolve(jsonPath), jsonOutput, "utf-8");
              console.log(`📄 Security JSON saved to: ${path.resolve(jsonPath)}\n`);
            } else {
              console.log(jsonOutput);
            }
          } else {
            const mdOutput = toSecurityMarkdown(secReport);
            if (opts.output) {
              const mdPath = opts.output.replace(/\.md$/, "") + "-security.md";
              fs.writeFileSync(path.resolve(mdPath), mdOutput, "utf-8");
              console.log(`📄 Security Markdown saved to: ${path.resolve(mdPath)}\n`);
            } else {
              console.log(mdOutput);
            }
          }
        }
      }
    } catch (e) {
      console.error("\n❌ Error:", (e as Error).message);
      process.exit(1);
    }
  });

program.parse();
