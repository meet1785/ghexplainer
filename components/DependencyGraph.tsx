"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

/**
 * Interactive Force-Directed Dependency Graph
 *
 * Renders module relationships as a physics-simulated graph:
 * - Nodes = modules/directories
 * - Edges = import relationships
 * - Force simulation: repulsion between nodes, spring attraction on edges
 * - Draggable nodes, zoomable/pannable canvas
 *
 * Demonstrates: graph algorithms, physics simulation, SVG rendering,
 * pointer event handling, animation frames, responsive design.
 */

interface GraphNode {
  id: string;
  label: string;
  fileCount: number;
  totalChars: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null; // fixed position for dragging
  fy?: number | null;
  color: string;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number; // number of imports
}

interface DependencyGraphProps {
  /** Raw markdown to extract module names from section 3 */
  markdown: string;
  /** File tree paths */
  filePaths?: string[];
  /** Module/chunk info from analysis */
  modules?: Array<{
    module: string;
    files: Array<{ path: string; content: string }>;
    totalChars: number;
    dependencies: string[];
  }>;
}

// ─── Color palette for modules ───────────────────────────────
const MODULE_COLORS = [
  "#f0a040", // gold
  "#40c0a0", // jade
  "#e06070", // coral
  "#70b0f0", // azure
  "#c080e0", // violet
  "#60d0d0", // teal
  "#f0d060", // yellow
  "#e08060", // orange
  "#80d080", // green
  "#9090e0", // indigo
];

// ─── Graph from file paths ───────────────────────────────────

function buildGraphFromPaths(filePaths: string[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const moduleMap = new Map<string, { files: string[]; imports: Set<string> }>();

  for (const fp of filePaths) {
    const parts = fp.split("/");
    const mod = parts.length <= 1 ? "(root)" : parts.slice(0, Math.min(2, parts.length - 1)).join("/");
    if (!moduleMap.has(mod)) moduleMap.set(mod, { files: [], imports: new Set() });
    moduleMap.get(mod)!.files.push(fp);
  }

  // Infer edges: modules that share directory prefixes likely depend on each other
  const mods = [...moduleMap.keys()];
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (let i = 0; i < mods.length; i++) {
    for (let j = i + 1; j < mods.length; j++) {
      const a = mods[i], b = mods[j];
      // Connect modules with shared parent directory
      const partsA = a.split("/");
      const partsB = b.split("/");
      if (partsA[0] === partsB[0] && partsA[0] !== "(root)") {
        const key = [a, b].sort().join("|");
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ source: a, target: b, weight: 1 });
        }
      }
    }
  }

  // Also connect (root) to top-level modules
  if (moduleMap.has("(root)")) {
    for (const mod of mods) {
      if (mod !== "(root)" && !mod.includes("/")) {
        edges.push({ source: "(root)", target: mod, weight: 2 });
      }
    }
  }

  const nodes: GraphNode[] = mods.map((mod, i) => ({
    id: mod,
    label: mod,
    fileCount: moduleMap.get(mod)!.files.length,
    totalChars: 0,
    x: 300 + Math.cos((i / mods.length) * Math.PI * 2) * 150,
    y: 200 + Math.sin((i / mods.length) * Math.PI * 2) * 150,
    vx: 0,
    vy: 0,
    color: MODULE_COLORS[i % MODULE_COLORS.length],
  }));

  return { nodes, edges };
}

function buildGraphFromModules(modules: NonNullable<DependencyGraphProps["modules"]>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();
  const modNames = modules.map(m => m.module);

  for (const mod of modules) {
    for (const dep of mod.dependencies) {
      // Match dependency to a module
      for (const target of modNames) {
        if (target === mod.module) continue;
        if (dep.includes(target) || target.includes(dep.replace(/^\.\//, "").split("/")[0])) {
          const key = [mod.module, target].sort().join("|");
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ source: mod.module, target, weight: 1 });
          }
        }
      }
    }
  }

  const nodes: GraphNode[] = modules.map((mod, i) => ({
    id: mod.module,
    label: mod.module,
    fileCount: mod.files.length,
    totalChars: mod.totalChars,
    x: 300 + Math.cos((i / modules.length) * Math.PI * 2) * 150,
    y: 200 + Math.sin((i / modules.length) * Math.PI * 2) * 150,
    vx: 0,
    vy: 0,
    color: MODULE_COLORS[i % MODULE_COLORS.length],
  }));

  return { nodes, edges };
}

// ─── Force Simulation ────────────────────────────────────────

const REPULSION = 3000;
const ATTRACTION = 0.005;
const DAMPING = 0.85;
const CENTER_GRAVITY = 0.01;
const MIN_DISTANCE = 60;

function simulate(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;

  // Repulsion (Coulomb's law)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MIN_DISTANCE) dist = MIN_DISTANCE;
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (a.fx == null) { a.vx -= fx; a.vy -= fy; }
      if (b.fx == null) { b.vx += fx; b.vy += fy; }
    }
  }

  // Attraction (Hooke's law)
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = ATTRACTION * dist * edge.weight;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (a.fx == null) { a.vx += fx; a.vy += fy; }
    if (b.fx == null) { b.vx -= fx; b.vy -= fy; }
  }

  // Center gravity
  for (const node of nodes) {
    if (node.fx != null) continue;
    node.vx += (cx - node.x) * CENTER_GRAVITY;
    node.vy += (cy - node.y) * CENTER_GRAVITY;
  }

  // Apply velocities with damping
  for (const node of nodes) {
    if (node.fx != null) {
      node.x = node.fx;
      node.y = node.fy!;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    node.x += node.vx;
    node.y += node.vy;
    // Boundary clamping
    node.x = Math.max(40, Math.min(width - 40, node.x));
    node.y = Math.max(40, Math.min(height - 40, node.y));
  }
}

// ─── Component ───────────────────────────────────────────────

function DependencyGraph({ markdown, filePaths, modules }: DependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const [, forceRender] = useState(0);
  const animRef = useRef<number>(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const [isExpanded, setIsExpanded] = useState(false);

  // Build graph data
  const graphData = useMemo(() => {
    if (modules && modules.length > 0) {
      return buildGraphFromModules(modules);
    }
    if (filePaths && filePaths.length > 0) {
      return buildGraphFromPaths(filePaths);
    }
    // Extract module names from markdown section 3
    const modRegex = /###\s+(?:Module:\s*)?(.+)/g;
    const paths: string[] = [];
    let m;
    while ((m = modRegex.exec(markdown)) !== null) {
      paths.push(m[1].trim());
    }
    if (paths.length > 0) {
      return buildGraphFromPaths(paths);
    }
    return { nodes: [], edges: [] };
  }, [markdown, filePaths, modules]);

  // Compute per-node degree (connectivity)
  const nodeDegreeMap = useMemo(() => {
    const deg = new Map<string, number>();
    for (const edge of graphData.edges) {
      deg.set(edge.source, (deg.get(edge.source) ?? 0) + 1);
      deg.set(edge.target, (deg.get(edge.target) ?? 0) + 1);
    }
    return deg;
  }, [graphData]);

  // Modularity score: ratio of internal edges to possible edges — 0 (star) to 1 (fully connected mesh)
  const modularityScore = useMemo(() => {
    const n = graphData.nodes.length;
    if (n < 2) return 1;
    const maxEdges = (n * (n - 1)) / 2;
    const actualEdges = graphData.edges.length;
    // Spread (many sparse modules) = high score; dense hub = low score
    const densityPenalty = actualEdges / maxEdges;
    return Math.max(0, Math.min(1, 1 - densityPenalty));
  }, [graphData]);

  // Initialize nodes/edges
  useEffect(() => {
    nodesRef.current = graphData.nodes.map(n => ({ ...n }));
    edgesRef.current = [...graphData.edges];
  }, [graphData]);

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: isExpanded ? 500 : 400,
        });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [isExpanded]);

  // Physics simulation loop
  useEffect(() => {
    let running = true;
    let frame = 0;
    const tick = () => {
      if (!running) return;
      simulate(nodesRef.current, edgesRef.current, dimensions.width, dimensions.height);
      frame++;
      // Slow down updates after settling
      if (frame < 300 || frame % 3 === 0) {
        forceRender(f => f + 1);
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [dimensions]);

  // Drag handlers
  const handlePointerDown = useCallback((nodeId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(nodeId);
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragging) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      const node = nodesRef.current.find(n => n.id === dragging);
      if (node) {
        node.fx = x;
        node.fy = y;
        node.x = x;
        node.y = y;
      }
    } else if (isPanning.current) {
      setPan(p => ({
        x: p.x + e.movementX,
        y: p.y + e.movementY,
      }));
    }
  }, [dragging, zoom, pan]);

  const handlePointerUp = useCallback(() => {
    if (dragging) {
      const node = nodesRef.current.find(n => n.id === dragging);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      setDragging(null);
    }
    isPanning.current = false;
  }, [dragging]);

  const handleBgPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === "rect") {
      isPanning.current = true;
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.3, Math.min(3, z - e.deltaY * 0.001)));
  }, []);

  if (graphData.nodes.length === 0) return null;

  const nodes = nodesRef.current;
  const edges = edgesRef.current;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-gold/60 text-sm">◈</span>
          <h3 className="text-sm font-semibold text-cream">Module Dependency Graph</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-jade/10 border border-jade/20 text-jade font-mono">
            {nodes.length} modules · {edges.length} links
          </span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-mono"
            style={{
              color: modularityScore >= 0.6 ? "#40c0a0" : modularityScore >= 0.3 ? "#f0a040" : "#e06070",
              backgroundColor: modularityScore >= 0.6 ? "#40c0a010" : modularityScore >= 0.3 ? "#f0a04010" : "#e0607010",
              border: `1px solid ${modularityScore >= 0.6 ? "#40c0a040" : modularityScore >= 0.3 ? "#f0a04040" : "#e0607040"}`,
            }}
            title="Modularity score: how well-separated the modules are (higher = better)"
          >
            modularity {(modularityScore * 100).toFixed(0)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(1)}
            className="text-[10px] px-2 py-1 rounded border border-edge text-faint hover:text-cream font-mono transition-colors"
          >
            Reset
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[10px] px-2 py-1 rounded border border-edge text-faint hover:text-cream font-mono transition-colors"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {/* Graph */}
      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden border border-edge bg-midnight/80"
        style={{ height: isExpanded ? 500 : 400 }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="cursor-grab active:cursor-grabbing"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerDown={handleBgPointerDown}
          onWheel={handleWheel}
        >
          {/* Background */}
          <rect width="100%" height="100%" fill="transparent" />

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            {edges.map((edge, i) => {
              const source = nodeMap.get(edge.source);
              const target = nodeMap.get(edge.target);
              if (!source || !target) return null;
              const isHighlighted = hoveredNode === edge.source || hoveredNode === edge.target;
              return (
                <line
                  key={`edge-${i}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={isHighlighted ? "#f0a040" : "#24272f"}
                  strokeWidth={isHighlighted ? 2 : 1}
                  strokeOpacity={isHighlighted ? 0.8 : 0.4}
                  strokeDasharray={edge.weight > 1 ? undefined : "4 4"}
                />
              );
            })}

            {/* Animated edge particles for hovered node */}
            {hoveredNode && edges
              .filter(e => e.source === hoveredNode || e.target === hoveredNode)
              .map((edge, i) => {
                const source = nodeMap.get(edge.source);
                const target = nodeMap.get(edge.target);
                if (!source || !target) return null;
                return (
                  <circle key={`particle-${i}`} r="2" fill="#f0a040" opacity="0.8">
                    <animateMotion
                      dur="1.5s"
                      repeatCount="indefinite"
                      path={`M${source.x},${source.y} L${target.x},${target.y}`}
                    />
                  </circle>
                );
              })}

            {/* Nodes */}
            {nodes.map((node) => {
              const radius = Math.max(16, Math.min(35, 12 + node.fileCount * 3));
              const isHovered = hoveredNode === node.id;
              const isConnected = hoveredNode
                ? edges.some(e =>
                    (e.source === hoveredNode && e.target === node.id) ||
                    (e.target === hoveredNode && e.source === node.id)
                  )
                : false;
              const dimmed = hoveredNode && !isHovered && !isConnected;
              const degree = nodeDegreeMap.get(node.id) ?? 0;
              const maxDegree = Math.max(...[...nodeDegreeMap.values()], 1);
              // Critical node: top 20% by degree and at least 3 connections
              const isCritical = degree >= 3 && degree / maxDegree >= 0.6;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  onPointerDown={(e) => handlePointerDown(node.id, e)}
                  onPointerEnter={() => setHoveredNode(node.id)}
                  onPointerLeave={() => setHoveredNode(null)}
                  className="cursor-pointer"
                  style={{ opacity: dimmed ? 0.2 : 1, transition: "opacity 0.3s" }}
                >
                  {/* Critical node ring */}
                  {isCritical && !isHovered && (
                    <circle
                      r={radius + 5}
                      fill="none"
                      stroke="#e06070"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      opacity={0.6}
                    >
                      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Glow */}
                  {isHovered && (
                    <circle r={radius + 8} fill={node.color} opacity={0.15}>
                      <animate attributeName="r" values={`${radius + 6};${radius + 12};${radius + 6}`} dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Main circle */}
                  <circle
                    r={radius}
                    fill={isHovered ? node.color : `${node.color}20`}
                    stroke={isCritical ? "#e06070" : node.color}
                    strokeWidth={isHovered ? 2.5 : isCritical ? 2 : 1.5}
                  />

                  {/* File count badge */}
                  <text
                    y={-2}
                    textAnchor="middle"
                    fill={isHovered ? "#08090d" : node.color}
                    fontSize={11}
                    fontWeight="bold"
                    fontFamily="monospace"
                    pointerEvents="none"
                  >
                    {node.fileCount}
                  </text>

                  {/* Label */}
                  <text
                    y={radius + 14}
                    textAnchor="middle"
                    fill={isHovered ? "#e8e4d9" : "#8e8e9e"}
                    fontSize={10}
                    fontFamily="sans-serif"
                    pointerEvents="none"
                  >
                    {node.label.length > 18 ? node.label.slice(0, 16) + "…" : node.label}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Zoom indicator */}
          <text x={dimensions.width - 10} y={dimensions.height - 10} textAnchor="end" fill="#4a4a5c" fontSize={10} fontFamily="monospace">
            {(zoom * 100).toFixed(0)}%
          </text>
        </svg>

        {/* Tooltip */}
        {hoveredNode && (() => {
          const node = nodeMap.get(hoveredNode);
          if (!node) return null;
          const connections = edges.filter(e => e.source === hoveredNode || e.target === hoveredNode).length;
          const degree = nodeDegreeMap.get(hoveredNode) ?? 0;
          const maxDegree = Math.max(...[...nodeDegreeMap.values()], 1);
          const isCritical = degree >= 3 && degree / maxDegree >= 0.6;
          return (
            <div className="absolute top-3 left-3 px-3 py-2 rounded-lg bg-surface/95 border border-edge backdrop-blur-sm text-xs pointer-events-none">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-mono font-semibold text-cream">{node.label}</p>
                {isCritical && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-coral/10 text-coral border border-coral/20">
                    CRITICAL
                  </span>
                )}
              </div>
              <p className="text-faint mt-0.5">{node.fileCount} files · {connections} connections</p>
              {node.totalChars > 0 && (
                <p className="text-faint">{(node.totalChars / 1000).toFixed(1)}K chars</p>
              )}
            </div>
          );
        })()}

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex items-center gap-3 text-[10px] text-faint font-mono">
          <span>Drag nodes · Scroll to zoom · Hover to highlight</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full border border-coral/60" style={{ borderStyle: "dashed" }} />
            Critical hub
          </span>
        </div>
      </div>
    </div>
  );
}

// memoize to avoid re-render when props unchanged
export default React.memo(DependencyGraph);
