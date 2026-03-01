/**
 * POST /api/chat
 *
 * Contextual follow-up chat about an analyzed repository.
 * Streams responses using NDJSON for real-time display.
 *
 * Body: { question: string, context: string, repoSlug: string }
 *
 * Demonstrates: streaming AI responses, context windowing,
 * conversation design, error handling.
 */

import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CHAT_SYSTEM_PROMPT = `You are an expert code reviewer and software architect. You have just analyzed a GitHub repository and generated a comprehensive technical document about it.

The user is now asking follow-up questions about this repository. Answer based ONLY on the analysis document provided as context. Be specific — reference file names, function names, and actual code patterns from the analysis.

Rules:
- Be concise but thorough. Aim for 100-300 words unless the question demands more.
- If the analysis doesn't contain enough info to answer, say so honestly.
- Use markdown formatting: code blocks, bullet lists, bold for emphasis.
- Reference specific sections from the analysis when relevant.
- If asked about improvements or suggestions, be constructive and specific.
- Never make up information not present in the analysis context.`;

function collectApiKeys(): string[] {
  const keys: string[] = [];
  const primary = process.env.GEMINI_API_KEY;
  if (primary) keys.push(primary);
  for (let i = 2; i <= 5; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k && !keys.includes(k)) keys.push(k);
  }
  return keys;
}

export async function POST(req: NextRequest) {
  let question: string, context: string, repoSlug: string;

  try {
    const body = await req.json();
    question = body?.question;
    context = body?.context;
    repoSlug = body?.repoSlug ?? "unknown";
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!question || typeof question !== "string") {
    return new Response(
      JSON.stringify({ error: "Missing required field: question" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!context || typeof context !== "string") {
    return new Response(
      JSON.stringify({ error: "Missing required field: context (analysis markdown)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const keys = collectApiKeys();
  if (keys.length === 0) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Truncate context to ~100K chars to stay within token limits
  const truncatedContext = context.slice(0, 100_000);

  const userPrompt = `## Repository: ${repoSlug}

## Analysis Document (for context):
${truncatedContext}

## User Question:
${question}

Answer the question based on the analysis above. Be specific and reference actual code/files.`;

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

      try {
        let response: string | null = null;

        for (const key of keys) {
          try {
            const genAI = new GoogleGenerativeAI(key);
            const model = genAI.getGenerativeModel({
              model: "gemini-2.5-flash-lite",
              systemInstruction: CHAT_SYSTEM_PROMPT,
            });

            send({ type: "start" });

            const result = await model.generateContentStream({
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 4096,
              },
            });

            let fullText = "";
            for await (const chunk of result.stream) {
              const text = chunk.text();
              if (text) {
                fullText += text;
                send({ type: "chunk", text });
              }
            }

            response = fullText;
            break; // Success, stop trying keys
          } catch (err) {
            const msg = (err as Error).message ?? "";
            if (msg.includes("429") || msg.includes("quota")) {
              console.log(`[Chat] Key rate limited, trying next...`);
              continue;
            }
            throw err;
          }
        }

        if (response) {
          send({ type: "done", text: response });
        } else {
          send({ type: "error", message: "All API keys exhausted. Please try again." });
        }
      } catch (e) {
        const message = (e as Error).message ?? "Chat failed";
        console.error("[/api/chat] Error:", message);
        send({ type: "error", message: `Chat failed: ${message}` });
      } finally {
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
    },
  });
}
