import type { FileContent } from "./github";

// ─── Types ───

export interface GraphifyNode {
  id: string;
  label: string;
  type: 'module' | 'file' | 'function' | 'class' | 'external-dep';
  /** Parent module id */
  parent?: string;
  /** Number of files in this node (for modules) */
  fileCount: number;
  /** Total characters */
  totalChars: number;
  /** Lines of code */
  lineCount: number;
  /** Code preview snippet (first ~200 chars for files) */
  preview?: string;
}

export interface GraphifyEdge {
  source: string;
  target: string;
  type: 'imports' | 'exports' | 'contains' | 'calls' | 'depends-on';
  weight: number;
}

export interface DependencyCycle {
  path: string[];
  length: number;
}

export interface GraphifyResult {
  nodes: GraphifyNode[];
  edges: GraphifyEdge[];
  cycles: DependencyCycle[];
  hubs: Array<{ nodeId: string; degree: number }>;
  stats: {
    totalNodes: number;
    totalEdges: number;
    totalFiles: number;
    totalModules: number;
    totalSymbols: number;
    totalExternalDeps: number;
    avgDegree: number;
    maxDegree: number;
    graphDensity: number;
  };
}

// ─── Helper Regexes for Naive Parsing ───

const TS_JS_IMPORT_REGEX = /import\s+(?:.*?\s+from\s+)?['"](.*?)['"]/g;
const TS_JS_REQUIRE_REGEX = /require\(['"](.*?)['"]\)/g;
const TS_JS_EXPORT_FUNC_CLASS = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class)\s+([a-zA-Z_$][0-9a-zA-Z_$]*)/g;
const TS_JS_EXPORT_CONST = /export\s+const\s+([a-zA-Z_$][0-9a-zA-Z_$]*)\s*=/g;
const TS_JS_CLASS_DECL = /class\s+([a-zA-Z_$][0-9a-zA-Z_$]*)/g;
const TS_JS_FUNC_DECL = /function\s+([a-zA-Z_$][0-9a-zA-Z_$]*)/g;

const PY_IMPORT_REGEX = /^import\s+([a-zA-Z0-9_., ]+)/gm;
const PY_FROM_IMPORT_REGEX = /^from\s+([a-zA-Z0-9_.]+)\s+import/gm;
const PY_DEF_REGEX = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
const PY_CLASS_REGEX = /class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[:\(]/g;

const GO_IMPORT_SINGLE = /import\s+"(.*?)"/g;
const GO_FUNC_REGEX = /func\s+(?:\(.*?\)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
const GO_STRUCT_REGEX = /type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+struct/g;

const JAVA_CLASS_REGEX = /(?:public|protected|private|abstract)?\s*(?:class|interface)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
const JAVA_METHOD_REGEX = /(?:public|protected|private)\s+(?:static\s+)?(?:final\s+)?(?:[a-zA-Z0-9_<>]+\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
const JAVA_IMPORT_REGEX = /import\s+(?:static\s+)?([a-zA-Z0-9_.]+);/g;

function getExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function getModulePath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  if (parts.length <= 1) return '(root)';
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/');
}

function isRelative(importPath: string): boolean {
  return importPath.startsWith('.') || importPath.startsWith('/');
}

// ─── Main Graph Builders ───

/**
 * Builds a comprehensive knowledge graph from an array of file contents.
 * @param files The array of FileContent objects to parse.
 * @returns The resulting graph containing nodes, edges, cycles, hubs, and statistics.
 */
export function buildGraphifyGraph(files: FileContent[]): GraphifyResult {
  const nodes: Map<string, GraphifyNode> = new Map();
  const edges: GraphifyEdge[] = [];
  const addEdge = (source: string, target: string, type: GraphifyEdge['type']) => {
    edges.push({ source, target, type, weight: 1 });
  };

  const modules: Map<string, { fileCount: number; charCount: number; lineCount: number }> = new Map();

  // First pass: create modules and files
  for (const file of files) {
    try {
      const ext = getExtension(file.path);
      const modPath = getModulePath(file.path);
      const lines = file.content.split(/\r?\n/);
      
      if (!modules.has(modPath)) {
        modules.set(modPath, { fileCount: 0, charCount: 0, lineCount: 0 });
      }
      const modData = modules.get(modPath)!;
      modData.fileCount++;
      modData.charCount += file.content.length;
      modData.lineCount += lines.length;

      nodes.set(file.path, {
        id: file.path,
        label: file.path.split(/[/\\]/).pop() || file.path,
        type: 'file',
        parent: modPath,
        fileCount: 1,
        totalChars: file.content.length,
        lineCount: lines.length,
        preview: file.content.substring(0, 200)
      });
      addEdge(modPath, file.path, 'contains');

      // Parse symbols and dependencies
      if (['ts', 'js', 'jsx', 'tsx'].includes(ext)) {
        // Imports
        let match;
        while ((match = TS_JS_IMPORT_REGEX.exec(file.content)) !== null) {
          const imp = match[1];
          if (isRelative(imp)) {
            // naive relative, try to link to file - would need proper path resolution but keeping it simple
            addEdge(file.path, imp, 'imports');
          } else {
            const extNodeId = `ext:${imp}`;
            if (!nodes.has(extNodeId)) {
              nodes.set(extNodeId, { id: extNodeId, label: imp, type: 'external-dep', fileCount: 0, totalChars: 0, lineCount: 0 });
            }
            addEdge(file.path, extNodeId, 'depends-on');
          }
        }
        while ((match = TS_JS_REQUIRE_REGEX.exec(file.content)) !== null) {
          const imp = match[1];
          if (!isRelative(imp)) {
            const extNodeId = `ext:${imp}`;
            if (!nodes.has(extNodeId)) {
              nodes.set(extNodeId, { id: extNodeId, label: imp, type: 'external-dep', fileCount: 0, totalChars: 0, lineCount: 0 });
            }
            addEdge(file.path, extNodeId, 'depends-on');
          }
        }
        
        // Classes and Functions
        while ((match = TS_JS_CLASS_DECL.exec(file.content)) !== null) {
          const symId = `${file.path}#${match[1]}`;
          nodes.set(symId, { id: symId, label: match[1], type: 'class', parent: file.path, fileCount: 0, totalChars: 0, lineCount: 0 });
          addEdge(file.path, symId, 'exports');
        }
        while ((match = TS_JS_FUNC_DECL.exec(file.content)) !== null) {
          const symId = `${file.path}#${match[1]}`;
          nodes.set(symId, { id: symId, label: match[1], type: 'function', parent: file.path, fileCount: 0, totalChars: 0, lineCount: 0 });
          addEdge(file.path, symId, 'exports');
        }
      } else if (['py'].includes(ext)) {
        let match;
        while ((match = PY_IMPORT_REGEX.exec(file.content)) !== null) {
          const deps = match[1].split(',').map(d => d.trim());
          for (const d of deps) {
            const extNodeId = `ext:${d}`;
            if (!nodes.has(extNodeId)) {
              nodes.set(extNodeId, { id: extNodeId, label: d, type: 'external-dep', fileCount: 0, totalChars: 0, lineCount: 0 });
            }
            addEdge(file.path, extNodeId, 'depends-on');
          }
        }
        while ((match = PY_FROM_IMPORT_REGEX.exec(file.content)) !== null) {
           const d = match[1];
           const extNodeId = `ext:${d}`;
           if (!nodes.has(extNodeId)) {
             nodes.set(extNodeId, { id: extNodeId, label: d, type: 'external-dep', fileCount: 0, totalChars: 0, lineCount: 0 });
           }
           addEdge(file.path, extNodeId, 'depends-on');
        }
        while ((match = PY_DEF_REGEX.exec(file.content)) !== null) {
          const symId = `${file.path}#${match[1]}`;
          nodes.set(symId, { id: symId, label: match[1], type: 'function', parent: file.path, fileCount: 0, totalChars: 0, lineCount: 0 });
          addEdge(file.path, symId, 'exports');
        }
        while ((match = PY_CLASS_REGEX.exec(file.content)) !== null) {
          const symId = `${file.path}#${match[1]}`;
          nodes.set(symId, { id: symId, label: match[1], type: 'class', parent: file.path, fileCount: 0, totalChars: 0, lineCount: 0 });
          addEdge(file.path, symId, 'exports');
        }
      } else if (['go'].includes(ext)) {
        let match;
        while ((match = GO_IMPORT_SINGLE.exec(file.content)) !== null) {
          const imp = match[1];
          const extNodeId = `ext:${imp}`;
          if (!nodes.has(extNodeId)) {
            nodes.set(extNodeId, { id: extNodeId, label: imp, type: 'external-dep', fileCount: 0, totalChars: 0, lineCount: 0 });
          }
          addEdge(file.path, extNodeId, 'depends-on');
        }
        while ((match = GO_FUNC_REGEX.exec(file.content)) !== null) {
          const symId = `${file.path}#${match[1]}`;
          nodes.set(symId, { id: symId, label: match[1], type: 'function', parent: file.path, fileCount: 0, totalChars: 0, lineCount: 0 });
          addEdge(file.path, symId, 'exports');
        }
        while ((match = GO_STRUCT_REGEX.exec(file.content)) !== null) {
          const symId = `${file.path}#${match[1]}`;
          nodes.set(symId, { id: symId, label: match[1], type: 'class', parent: file.path, fileCount: 0, totalChars: 0, lineCount: 0 });
          addEdge(file.path, symId, 'exports');
        }
      } else if (['java', 'kt'].includes(ext)) {
         let match;
         while ((match = JAVA_IMPORT_REGEX.exec(file.content)) !== null) {
           const imp = match[1];
           const extNodeId = `ext:${imp}`;
           if (!nodes.has(extNodeId)) {
             nodes.set(extNodeId, { id: extNodeId, label: imp, type: 'external-dep', fileCount: 0, totalChars: 0, lineCount: 0 });
           }
           addEdge(file.path, extNodeId, 'depends-on');
         }
         while ((match = JAVA_CLASS_REGEX.exec(file.content)) !== null) {
           const symId = `${file.path}#${match[1]}`;
           nodes.set(symId, { id: symId, label: match[1], type: 'class', parent: file.path, fileCount: 0, totalChars: 0, lineCount: 0 });
           addEdge(file.path, symId, 'exports');
         }
         while ((match = JAVA_METHOD_REGEX.exec(file.content)) !== null) {
           const symId = `${file.path}#${match[1]}`;
           if (!nodes.has(symId)) {
             nodes.set(symId, { id: symId, label: match[1], type: 'function', parent: file.path, fileCount: 0, totalChars: 0, lineCount: 0 });
             addEdge(file.path, symId, 'exports');
           }
         }
      }
    } catch (e) {
      console.warn(`Failed to parse file: ${file.path}`, e);
    }
  }

  // Create module nodes
  for (const [modPath, stats] of modules.entries()) {
    nodes.set(modPath, {
      id: modPath,
      label: modPath,
      type: 'module',
      fileCount: stats.fileCount,
      totalChars: stats.charCount,
      lineCount: stats.lineCount,
    });
  }

  const nodesArr = Array.from(nodes.values());

  // Degrees
  const degrees = new Map<string, number>();
  nodesArr.forEach(n => degrees.set(n.id, 0));
  edges.forEach(e => {
    if (degrees.has(e.source)) degrees.set(e.source, degrees.get(e.source)! + 1);
    if (degrees.has(e.target)) degrees.set(e.target, degrees.get(e.target)! + 1);
  });

  const hubs = nodesArr
    .map(n => ({ nodeId: n.id, degree: degrees.get(n.id) || 0 }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 5);

  const totalDegrees = Array.from(degrees.values()).reduce((a, b) => a + b, 0);
  const avgDegree = nodesArr.length > 0 ? totalDegrees / nodesArr.length : 0;
  const maxDegree = hubs.length > 0 ? hubs[0].degree : 0;
  const graphDensity = nodesArr.length > 1 ? edges.length / (nodesArr.length * (nodesArr.length - 1)) : 0;

  const cycles = detectCycles(nodesArr, edges);

  const stats = {
    totalNodes: nodesArr.length,
    totalEdges: edges.length,
    totalFiles: nodesArr.filter(n => n.type === 'file').length,
    totalModules: nodesArr.filter(n => n.type === 'module').length,
    totalSymbols: nodesArr.filter(n => n.type === 'function' || n.type === 'class').length,
    totalExternalDeps: nodesArr.filter(n => n.type === 'external-dep').length,
    avgDegree,
    maxDegree,
    graphDensity,
  };

  return {
    nodes: nodesArr,
    edges,
    cycles,
    hubs,
    stats,
  };
}

// ─── Analysis Algorithms ───

/**
 * Detects dependency cycles in the graph using DFS on import edges.
 * @param nodes The graph nodes.
 * @param edges The graph edges.
 * @returns Array of unique dependency cycles.
 */
export function detectCycles(nodes: GraphifyNode[], edges: GraphifyEdge[]): DependencyCycle[] {
  const importEdges = edges.filter(e => e.type === 'imports');
  const adj = new Map<string, string[]>();
  nodes.forEach(n => adj.set(n.id, []));
  importEdges.forEach(e => {
    if (adj.has(e.source)) {
      adj.get(e.source)!.push(e.target);
    }
  });

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string) {
    if (cycles.length >= 10) return;
    
    visited.add(nodeId);
    recStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adj.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        const cyclePath = path.slice(cycleStart);
        cyclePath.push(neighbor);
        
        // Normalize and dedup
        const cycleStr = cyclePath.slice(0, -1).sort().join('->');
        if (!cycles.some(c => c.slice(0, -1).sort().join('->') === cycleStr)) {
          cycles.push(cyclePath);
        }
      }
      if (cycles.length >= 10) return;
    }

    recStack.delete(nodeId);
    path.pop();
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
    if (cycles.length >= 10) break;
  }

  return cycles.map(c => ({ path: c, length: c.length - 1 }));
}

/**
 * Finds the shortest path between two nodes using BFS.
 * @param nodes The graph nodes.
 * @param edges The graph edges.
 * @param sourceId The starting node ID.
 * @param targetId The target node ID.
 * @returns The path as an array of IDs, or null if unreachable.
 */
export function findShortestPath(nodes: GraphifyNode[], edges: GraphifyEdge[], sourceId: string, targetId: string): string[] | null {
  const adj = new Map<string, string[]>();
  nodes.forEach(n => adj.set(n.id, []));
  edges.forEach(e => {
    if (adj.has(e.source)) adj.get(e.source)!.push(e.target);
  });

  if (!adj.has(sourceId) || !adj.has(targetId)) return null;
  if (sourceId === targetId) return [sourceId];

  const queue: string[] = [sourceId];
  const visited = new Set<string>([sourceId]);
  const parent = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === targetId) {
      const path: string[] = [];
      let curr = targetId;
      while (curr !== sourceId) {
        path.push(curr);
        curr = parent.get(curr)!;
      }
      path.push(sourceId);
      return path.reverse();
    }

    for (const neighbor of adj.get(current) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  return null;
}

/**
 * Computes the impact radius of a node (nodes that depend on it directly or indirectly).
 * @param nodes The graph nodes.
 * @param edges The graph edges.
 * @param nodeId The target node ID.
 * @returns Object with impacted node IDs and max depth.
 */
export function computeImpactRadius(nodes: GraphifyNode[], edges: GraphifyEdge[], nodeId: string): { impacted: string[]; depth: number } {
  // Build reverse adjacency list (target -> source)
  const revAdj = new Map<string, string[]>();
  nodes.forEach(n => revAdj.set(n.id, []));
  edges.forEach(e => {
    if (revAdj.has(e.target)) revAdj.get(e.target)!.push(e.source);
  });

  if (!revAdj.has(nodeId)) return { impacted: [], depth: 0 };

  const impacted = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];
  let maxDepth = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    maxDepth = Math.max(maxDepth, current.depth);

    for (const neighbor of revAdj.get(current.id) || []) {
      if (!impacted.has(neighbor) && neighbor !== nodeId) {
        impacted.add(neighbor);
        queue.push({ id: neighbor, depth: current.depth + 1 });
      }
    }
  }

  return { impacted: Array.from(impacted), depth: maxDepth };
}

// ─── Export & Visualization Formats ───

/**
 * Converts a graph result into a Mermaid flowchart string.
 * @param result The Graphify result.
 * @param options Rendering options.
 * @returns Mermaid flowchart diagram.
 */
export function toMermaidDiagram(
  result: GraphifyResult, 
  options?: { maxNodes?: number; nodeTypes?: GraphifyNode['type'][] }
): string {
  const maxNodes = options?.maxNodes || 30;
  const types = new Set(options?.nodeTypes || ['module', 'file', 'function', 'class', 'external-dep']);

  // Filter nodes
  let filteredNodes = result.nodes.filter(n => types.has(n.type));
  if (filteredNodes.length > maxNodes) {
    // Keep hubs and essential files if truncating
    const hubIds = new Set(result.hubs.map(h => h.nodeId));
    const sorted = [...filteredNodes].sort((a, b) => {
      const aHub = hubIds.has(a.id) ? 1 : 0;
      const bHub = hubIds.has(b.id) ? 1 : 0;
      return bHub - aHub;
    });
    filteredNodes = sorted.slice(0, maxNodes);
  }

  const nodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = result.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  let mermaid = 'graph TD\n';

  const cleanLabel = (s: string) => s.replace(/[^a-zA-Z0-9_\-]/g, '_');

  for (const node of filteredNodes) {
    const id = cleanLabel(node.id);
    const label = node.label.replace(/["()]/g, '');
    
    switch (node.type) {
      case 'module':
        mermaid += `  ${id}[${label}]\n`;
        break;
      case 'file':
        mermaid += `  ${id}(([${label}]))\n`;
        break;
      case 'function':
        mermaid += `  ${id}{${label}}\n`;
        break;
      case 'class':
        mermaid += `  ${id}[[${label}]]\n`;
        break;
      case 'external-dep':
        mermaid += `  ${id}>${label}]\n`;
        break;
    }
  }

  for (const edge of filteredEdges) {
    const source = cleanLabel(edge.source);
    const target = cleanLabel(edge.target);
    
    let link = '-->';
    if (edge.type === 'contains') link = '==>';
    else if (edge.type === 'depends-on') link = '-.->';
    else if (edge.type === 'exports') link = '---';
    
    mermaid += `  ${source} ${link}|${edge.type}| ${target}\n`;
  }

  return mermaid;
}

/**
 * Serializes the graph to JSON format.
 * @param result The Graphify result.
 * @returns A formatted JSON string.
 */
export function toGraphJSON(result: GraphifyResult): string {
  return JSON.stringify(result, null, 2);
}
