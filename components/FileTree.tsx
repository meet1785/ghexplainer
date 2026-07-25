"use client";

import { useState } from "react";
import { type TreeNode } from "@/lib/tree-builder";

interface FileTreeProps {
  nodes: TreeNode[];
}

function FileTreeNode({ node, level = 0 }: { node: TreeNode; level?: number }) {
  // Default directories to collapsed unless they are at the root level (0)
  const [isOpen, setIsOpen] = useState(level === 0);

  const isDir = node.type === "directory";

  return (
    <div className="font-mono text-sm">
      <div
        className={`flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-surface/50 transition-colors cursor-default ${
          isDir ? "cursor-pointer text-dust hover:text-cream" : "text-cream-dim"
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => isDir && setIsOpen(!isOpen)}
      >
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {isDir ? (
            isOpen ? (
              <svg className="w-3 h-3 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-3 h-3 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )
          ) : (
            <svg className="w-3 h-3 text-azure/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          )}
        </span>
        <span className="w-4 h-4 flex items-center justify-center shrink-0 mr-1">
          {isDir ? (
            <svg className="w-3.5 h-3.5 text-gold/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          ) : null}
        </span>
        <span className="truncate">{node.name}</span>
      </div>

      {isDir && isOpen && node.children && (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({ nodes }: FileTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-faint">
        <svg className="w-8 h-8 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p>No file tree data available.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto py-4">
      <div className="bg-surface/30 border border-edge rounded-xl p-4 overflow-x-auto">
        {nodes.map((node) => (
          <FileTreeNode key={node.path} node={node} />
        ))}
      </div>
    </div>
  );
}
