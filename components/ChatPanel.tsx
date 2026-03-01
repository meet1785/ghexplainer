"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * AI Follow-up Chat Panel
 *
 * After analysis completes, users can ask contextual questions
 * about the analyzed repository. Streams responses in real-time.
 *
 * Demonstrates: streaming fetch, NDJSON parsing, conversation state,
 * auto-scroll, markdown rendering, keyboard shortcuts.
 */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  streaming?: boolean;
}

interface ChatPanelProps {
  /** The analysis markdown for context */
  analysisMarkdown: string;
  /** Repo slug for display */
  repoSlug: string;
  /** Whether the chat panel is visible */
  isOpen: boolean;
  /** Toggle panel */
  onToggle: () => void;
}

const QUICK_QUESTIONS = [
  "What are the most critical files to understand first?",
  "How would you improve the architecture?",
  "What are the potential security concerns?",
  "Explain the main data flow in simple terms",
  "What design patterns are used?",
];

export default function ChatPanel({ analysisMarkdown, repoSlug, isOpen, onToggle }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isStreaming) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question.trim(),
      timestamp: Date.now(),
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      streaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          context: analysisMarkdown,
          repoSlug,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        let errorMsg: string;
        try { errorMsg = JSON.parse(text).error; } catch { errorMsg = `HTTP ${res.status}`; }
        throw new Error(errorMsg);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let event;
          try { event = JSON.parse(trimmed); } catch { continue; }

          if (event.type === "chunk") {
            fullText += event.text;
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: fullText }
                  : m
              )
            );
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      // Mark as done
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, streaming: false, content: fullText || "No response generated." }
            : m
        )
      );
    } catch (e) {
      const msg = (e as Error).message;
      if (msg?.includes("aborted")) return;

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, streaming: false, content: `**Error:** ${msg}` }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, analysisMarkdown, repoSlug]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-gold to-coral text-midnight font-bold text-sm shadow-lg shadow-gold/20 hover:shadow-gold/40 transition-all duration-300 hover:scale-105"
        title="Ask about this repo (Cmd+J)"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        Ask AI
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-50 w-full sm:w-[440px] h-[600px] sm:h-[550px] sm:bottom-6 sm:right-6 flex flex-col rounded-t-2xl sm:rounded-2xl bg-midnight border border-edge shadow-2xl shadow-black/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface/80 border-b border-edge shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-jade animate-pulse" />
          <h3 className="font-semibold text-sm text-cream">Ask about {repoSlug}</h3>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-edge text-faint font-mono">
            AI Chat
          </span>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-surface text-faint hover:text-cream transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-cream-dim">Ask anything about this repo</p>
              <p className="text-xs text-faint mt-1 font-body">
                The AI has full context of the analysis
              </p>
            </div>

            {/* Quick questions */}
            <div className="flex flex-wrap gap-1.5 justify-center mt-2">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-surface/60 border border-edge text-dust hover:text-cream hover:border-gold/30 transition-all duration-300 text-left font-body"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-gold/10 border border-gold/20 text-cream"
                  : "bg-surface/60 border border-edge text-cream-dim"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose-chat">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content || (msg.streaming ? "Thinking…" : "")}
                  </ReactMarkdown>
                  {msg.streaming && msg.content && (
                    <span className="inline-block w-1.5 h-4 bg-gold/60 animate-pulse ml-0.5 align-middle" />
                  )}
                </div>
              ) : (
                <p className="font-body">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 px-3 py-3 border-t border-edge bg-surface/40">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the architecture, code patterns, improvements…"
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-xl border border-edge bg-midnight/80 text-cream text-sm px-3 py-2.5 placeholder-faint focus:outline-none focus:ring-1 focus:ring-gold/30 focus:border-gold/30 disabled:opacity-50 font-body"
            style={{ maxHeight: 120 }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="shrink-0 p-2.5 rounded-xl bg-gold text-midnight disabled:bg-faint disabled:cursor-not-allowed transition-colors hover:bg-gold-bright"
          >
            {isStreaming ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-[10px] text-faint mt-1.5 text-center font-mono">
          Enter to send · Shift+Enter for new line · Responses are AI-generated
        </p>
      </form>
    </div>
  );
}
