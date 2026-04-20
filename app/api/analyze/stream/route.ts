/**
 * GET /api/analyze/stream?url=<github-url>&noCache=<0|1>
 *
 * NDJSON streaming endpoint for long-running analysis.
 * Sends one JSON object per line as events happen, plus heartbeat
 * pings every 10s to keep the connection alive through proxies.
 *
 * Event types (one JSON per line):
 * - { type: "heartbeat" }                               — keep-alive ping
 * - { type: "progress", step }                           — pipeline status
 * - { type: "meta", repoInfo, filesAnalyzed, chunks }    — repo metadata
 * - { type: "partial", markdown, phase, complete }        — displayable result
 * - { type: "done", markdown, durationMs, cached }        — analysis complete
 * - { type: "error", message }                            — fatal error
 */

import { NextRequest } from "next/server";
import { analyzeRepoStream } from "@/lib/analyzer";
import { parseGitHubUrl } from "@/lib/github";
import { streamLimiter, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { parseBooleanFlag } from "@/lib/options";

export const maxDuration = 300; // 5 minutes for long analyses
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Rate limiting — protect expensive Gemini API calls
  const clientIp = getClientIp(req);
  const rateResult = streamLimiter.check(clientIp);
  if (!rateResult.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait before analyzing another repository." }),
      { status: 429, headers: { "Content-Type": "application/json", ...rateLimitHeaders(rateResult) } }
    );
  }

  const url = req.nextUrl.searchParams.get("url");
  const noCache = parseBooleanFlag(req.nextUrl.searchParams.get("noCache"));

  if (!url) {
    return new Response(
      JSON.stringify({ error: "Missing required query param: url" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate URL format before starting stream
  try {
    parseGitHubUrl(url);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Create a ReadableStream with NDJSON format + heartbeat
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      function send(data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        } catch {
          closed = true;
        }
      }

      // Heartbeat every 10s to prevent proxy/CDN timeouts
      const heartbeat = setInterval(() => {
        send({ type: "heartbeat" });
      }, 10_000);

      try {
        const generator = analyzeRepoStream(url, {
          githubToken: process.env.GITHUB_TOKEN,
          geminiApiKey: process.env.GEMINI_API_KEY,
          noCache,
        });

        for await (const event of generator) {
          send(event);
        }
      } catch (e) {
        const message = (e as Error).message ?? "Unknown error";
        console.error("[/api/analyze/stream] Error:", message);

        if (message.includes("429") || message.includes("quota") || message.includes("exhausted")) {
          send({
            type: "error",
            message: "Gemini API rate limit reached. Please wait 1-2 minutes and try again.",
          });
        } else {
          send({
            type: "error",
            message: `Analysis failed: ${message}`,
          });
        }
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          try { controller.close(); } catch { /* already closed */ }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
