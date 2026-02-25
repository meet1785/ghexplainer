/**
 * POST /api/analyze
 * Body: { url: string }
 * Returns: { markdown, html, repoInfo, filesAnalyzed, chunks, durationMs, cached }
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzeRepo } from "@/lib/analyzer";
import { parseGitHubUrl } from "@/lib/github";

export const maxDuration = 180; // Vercel: allow up to 180s for AI response

export async function POST(req: NextRequest) {
  let url: string;
  try {
    const body = await req.json();
    url = body?.url;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!url || typeof url !== "string") {
    return NextResponse.json(
      { error: "Missing required field: url" },
      { status: 400 }
    );
  }

  // Validate URL format before hitting GitHub
  try {
    parseGitHubUrl(url);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 }
    );
  }

  try {
    const result = await analyzeRepo(url, {
      githubToken: process.env.GITHUB_TOKEN,
      geminiApiKey: process.env.GEMINI_API_KEY,
    });

    return NextResponse.json({
      markdown: result.markdown,
      repoInfo: result.repoInfo,
      filesAnalyzed: result.filesAnalyzed,
      chunks: result.chunks,
      durationMs: result.durationMs,
      cached: result.cached,
    });
  } catch (e) {
    const message = (e as Error).message ?? "Unknown error";
    console.error("[/api/analyze] Error:", message);

    // Differentiate client vs server errors
    if (
      message.includes("Invalid GitHub URL") ||
      message.includes("404") ||
      message.includes("GEMINI_API_KEY")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (message.includes("429") || message.includes("quota") || message.includes("exhausted")) {
      return NextResponse.json(
        { error: "Gemini API rate limit reached. Please wait 1-2 minutes and try again. Free tier allows ~10 requests/minute." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: `Analysis failed: ${message}` },
      { status: 500 }
    );
  }
}

// Force dynamic rendering (avoid static optimization timeout)
export const dynamic = "force-dynamic";
