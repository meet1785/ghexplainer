"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
}

export default function CodeBlock({ children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    // Extract text content from children if it's a string, or parse if array
    let text = "";
    if (typeof children === "string") {
      text = children;
    } else if (Array.isArray(children)) {
      text = children.map(c => typeof c === "string" ? c : "").join("");
    }
    
    if (text) {
      const success = await copyToClipboard(text);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  // If there's no className, it's likely an inline code block, not a pre>code block.
  // We only want to add the copy button to full code blocks (which get language-x classes).
  const isInline = !className?.includes("language-");

  if (isInline) {
    return <code className={className}>{children}</code>;
  }

  return (
    <div className="group relative">
      <code className={className}>{children}</code>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface/80 border border-edge/50 text-faint opacity-0 group-hover:opacity-100 hover:text-cream hover:bg-surface transition-all duration-200"
        title="Copy code"
      >
        {copied ? (
          <svg className="w-3.5 h-3.5 text-jade" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  );
}
