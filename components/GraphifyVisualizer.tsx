"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import type { GraphifyResult, GraphifyNode, GraphifyEdge, DependencyCycle } from "@/lib/graphify";
import { findShortestPath, computeImpactRadius, toMermaidDiagram, toGraphJSON } from "@/lib/graphify";

interface GraphifyVisualizerProps {
  graphData: GraphifyResult;
}

// ─── Constants & Colors ────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  module: "#f0a040", // gold
  file: "#70b0f0", // azure
  function: "#40c0a0", // jade
  class: "#c080e0", // violet
  "external-dep": "#8e8e9e", // gray
};

const REPULSION = 4000;
const ATTRACTION = 0.003;
const DAMPING = 0.85;
const CENTER_GRAVITY = 0.015;
const MIN_DISTANCE = 50;

interface SimNode extends GraphifyNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  radius: number;
  isHub: boolean;
  inCycle: boolean;
}

interface SimEdge extends GraphifyEdge {
  sourceNode?: SimNode;
  targetNode?: SimNode;
}

// ─── Simulation ────────────────────────────────────────────────

function simulate(nodes: SimNode[], edges: SimEdge[], width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;

  // Repulsion
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

  // Attraction
  for (const edge of edges) {
    const a = edge.sourceNode;
    const b = edge.targetNode;
    if (!a || !b) continue;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = ATTRACTION * dist * (edge.weight || 1);
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (a.fx == null) { a.vx += fx; a.vy += fy; }
    if (b.fx == null) { b.vx -= fx; b.vy -= fy; }
  }

  // Center gravity & physics step
  for (const node of nodes) {
    if (node.fx != null) {
      node.x = node.fx;
      node.y = node.fy!;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx += (cx - node.x) * CENTER_GRAVITY;
    node.vy += (cy - node.y) * CENTER_GRAVITY;
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    node.x += node.vx;
    node.y += node.vy;
    
    // Bounds
    node.x = Math.max(20, Math.min(width - 20, node.x));
    node.y = Math.max(20, Math.min(height - 20, node.y));
  }
}

// ─── Component ───────────────────────────────────────────────

function GraphifyVisualizer({ graphData }: GraphifyVisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isExpanded, setIsExpanded] = useState(false);
  
  // State: Filters & Search
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  
  // State: Selection & Hover
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<SimEdge | null>(null);
  
  // State: Viewport
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  
  // State: Interaction
  const [dragging, setDragging] = useState<string | null>(null);
  const [, forceRender] = useState(0);
  const animRef = useRef<number>(0);
  
  // State: Insights Panel
  const [showInsights, setShowInsights] = useState(false);
  const [pathSource, setPathSource] = useState("");
  const [pathTarget, setPathTarget] = useState("");
  const [computedPath, setComputedPath] = useState<string[] | null>(null);

  // ─── Data Preparation ───
  
  const cycleNodeIds = useMemo(() => {
    const set = new Set<string>();
    graphData.cycles.forEach(c => c.path.forEach(id => set.add(id)));
    return set;
  }, [graphData.cycles]);

  const hubNodeIds = useMemo(() => {
    return new Set(graphData.hubs.map(h => h.nodeId));
  }, [graphData.hubs]);

  const { filteredNodes, filteredEdges } = useMemo(() => {
    let fn = graphData.nodes;
    if (activeFilter !== "All") {
      const typeMap: Record<string, string[]> = {
        "Modules": ["module"],
        "Files": ["file"],
        "Symbols": ["function", "class"],
        "Dependencies": ["external-dep"]
      };
      const allowed = typeMap[activeFilter] || [];
      fn = fn.filter(n => allowed.includes(n.type));
    }
    
    const nodeIds = new Set(fn.map(n => n.id));
    const fe = graphData.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    return { filteredNodes: fn, filteredEdges: fe };
  }, [graphData, activeFilter]);

  const simNodesRef = useRef<SimNode[]>([]);
  const simEdgesRef = useRef<SimEdge[]>([]);

  useEffect(() => {
    // Initialize simulation nodes
    simNodesRef.current = filteredNodes.map(n => {
      const existing = simNodesRef.current.find(en => en.id === n.id);
      let r = 10;
      if (n.type === 'module') r = Math.min(30, 15 + (n.fileCount || 0) * 2);
      else if (n.type === 'file') r = Math.min(20, 10 + (n.totalChars || 0) / 1000);
      else if (n.type === 'function' || n.type === 'class') r = 8;
      else r = 6;
      
      return {
        ...n,
        x: existing?.x ?? (Math.random() * dimensions.width * 0.8 + dimensions.width * 0.1),
        y: existing?.y ?? (Math.random() * dimensions.height * 0.8 + dimensions.height * 0.1),
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        fx: existing?.fx,
        fy: existing?.fy,
        radius: r,
        isHub: hubNodeIds.has(n.id),
        inCycle: cycleNodeIds.has(n.id)
      };
    });
    
    // Initialize edges with references
    const nodeMap = new Map(simNodesRef.current.map(n => [n.id, n]));
    simEdgesRef.current = filteredEdges.map(e => ({
      ...e,
      sourceNode: nodeMap.get(e.source),
      targetNode: nodeMap.get(e.target)
    })).filter(e => e.sourceNode && e.targetNode);
    
  }, [filteredNodes, filteredEdges, hubNodeIds, cycleNodeIds, dimensions.width, dimensions.height]);

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: isExpanded ? Math.max(800, window.innerHeight * 0.8) : 600,
        });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [isExpanded]);

  // Simulation Loop
  useEffect(() => {
    let running = true;
    let frame = 0;
    const tick = () => {
      if (!running) return;
      simulate(simNodesRef.current, simEdgesRef.current, dimensions.width, dimensions.height);
      frame++;
      if (frame < 200 || frame % 2 === 0) {
        forceRender(f => f + 1);
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [dimensions]);

  // ─── Handlers ───
  
  const handlePointerDown = useCallback((nodeId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(nodeId);
    setSelectedNodeId(nodeId);
    const node = simNodesRef.current.find(n => n.id === nodeId);
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
      const node = simNodesRef.current.find(n => n.id === dragging);
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
      const node = simNodesRef.current.find(n => n.id === dragging);
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
      setSelectedNodeId(null);
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.1, Math.min(5, z - e.deltaY * 0.001)));
  }, []);

  const handleExport = (format: 'json' | 'mermaid') => {
    if (format === 'json') {
      const json = toGraphJSON(graphData);
      navigator.clipboard.writeText(json);
      alert("JSON copied to clipboard!");
    } else {
      const md = toMermaidDiagram(graphData);
      navigator.clipboard.writeText(md);
      alert("Mermaid diagram copied to clipboard!");
    }
  };

  const handleFindPath = () => {
    if (pathSource && pathTarget) {
      const path = findShortestPath(graphData.nodes, graphData.edges, pathSource, pathTarget);
      setComputedPath(path);
    }
  };

  // ─── Render Helpers ───

  const selectedNode = useMemo(() => {
    return selectedNodeId ? graphData.nodes.find(n => n.id === selectedNodeId) : null;
  }, [selectedNodeId, graphData.nodes]);

  const impactRadius = useMemo(() => {
    if (!selectedNodeId) return { impacted: [], depth: 0 };
    return computeImpactRadius(graphData.nodes, graphData.edges, selectedNodeId);
  }, [selectedNodeId, graphData]);

  // Determine which nodes/edges are active (highlighted)
  const activeNodes = new Set<string>();
  const activeEdges = new Set<SimEdge>();
  
  if (hoveredNodeId) {
    activeNodes.add(hoveredNodeId);
    simEdgesRef.current.forEach(e => {
      if (e.source === hoveredNodeId || e.target === hoveredNodeId) {
        activeEdges.add(e);
        activeNodes.add(e.source);
        activeNodes.add(e.target);
      }
    });
  } else if (selectedNodeId) {
    activeNodes.add(selectedNodeId);
    simEdgesRef.current.forEach(e => {
      if (e.source === selectedNodeId || e.target === selectedNodeId) {
        activeEdges.add(e);
        activeNodes.add(e.source);
        activeNodes.add(e.target);
      }
    });
  } else if (computedPath && computedPath.length > 0) {
    computedPath.forEach(id => activeNodes.add(id));
    for (let i = 0; i < computedPath.length - 1; i++) {
      const s = computedPath[i];
      const t = computedPath[i+1];
      const e = simEdgesRef.current.find(edge => edge.source === s && edge.target === t);
      if (e) activeEdges.add(e);
    }
  }

  const isDimmed = (nodeId: string) => {
    if (searchQuery && !nodeId.toLowerCase().includes(searchQuery.toLowerCase())) return true;
    if (activeNodes.size > 0 && !activeNodes.has(nodeId)) return true;
    return false;
  };

  const renderNodeShape = (node: SimNode, isHovered: boolean, isSelected: boolean) => {
    const c = TYPE_COLORS[node.type] || TYPE_COLORS.module;
    const r = node.radius;
    const dim = isDimmed(node.id);
    const strokeW = isSelected || isHovered ? 2.5 : 1.5;
    const opacity = dim ? 0.2 : 1;
    
    // Pulse animation for hubs
    const hubPulse = node.isHub && !dim ? (
      <circle r={r + 8} fill="none" stroke={c} strokeWidth="1" opacity="0.5">
        <animate attributeName="r" values={`${r+2};${r+12};${r+2}`} dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
      </circle>
    ) : null;

    // Dashed ring for cycle nodes
    const cycleRing = node.inCycle && !dim ? (
      <circle r={r + 4} fill="none" stroke="#e06070" strokeWidth="1.5" strokeDasharray="3 3">
         <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="10s" repeatCount="indefinite" />
      </circle>
    ) : null;

    const baseProps = {
      fill: isHovered || isSelected ? c : `${c}20`,
      stroke: node.inCycle ? "#e06070" : c,
      strokeWidth: strokeW,
      opacity
    };

    let shape;
    switch (node.type) {
      case 'function':
        shape = <rect x={-r} y={-r} width={r*2} height={r*2} transform="rotate(45)" {...baseProps} />;
        break;
      case 'class':
        shape = (
          <g opacity={opacity}>
            <polygon points={`0,${-r} ${r*0.866},${-r*0.5} ${r*0.866},${r*0.5} 0,${r} ${-r*0.866},${r*0.5} ${-r*0.866},${-r*0.5}`} 
              fill={baseProps.fill} stroke={baseProps.stroke} strokeWidth={strokeW} />
          </g>
        );
        break;
      case 'external-dep':
        shape = <circle r={r} {...baseProps} strokeDasharray="4 4" fill={`${c}10`} />;
        break;
      case 'module':
      case 'file':
      default:
        shape = <circle r={r} {...baseProps} />;
    }

    return (
      <g>
        {hubPulse}
        {cycleRing}
        {shape}
      </g>
    );
  };

  return (
    <div className="w-full flex flex-col font-body bg-midnight text-cream rounded-xl border border-edge overflow-hidden relative shadow-lg">
      
      {/* ─── 1. Stats Summary Bar ─── */}
      <div className="flex flex-wrap items-center justify-between p-3 border-b border-edge bg-surface/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-gold/80">◈</span>
            <span className="font-semibold text-sm">Graphify Visualizer</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded-full bg-jade/10 text-jade border border-jade/20">
              {graphData.stats.totalNodes} Nodes
            </span>
            <span className="px-2 py-0.5 rounded-full bg-azure/10 text-azure border border-azure/20">
              {graphData.stats.totalEdges} Edges
            </span>
            <span className="px-2 py-0.5 rounded-full bg-coral/10 text-coral border border-coral/20">
              {graphData.cycles.length} Cycles
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-mono text-faint">
          <span>Density: {(graphData.stats.graphDensity * 100).toFixed(1)}%</span>
          <span>Avg Deg: {graphData.stats.avgDegree.toFixed(1)}</span>
        </div>
      </div>

      {/* ─── 2. Controls Bar ─── */}
      <div className="flex flex-wrap items-center justify-between p-2 border-b border-edge bg-surface/30">
        <div className="flex items-center gap-2">
          {["All", "Modules", "Files", "Symbols", "Dependencies"].map(f => (
            <button key={f} 
              onClick={() => setActiveFilter(f)}
              className={`text-[11px] px-2.5 py-1 rounded-md font-mono transition-colors ${
                activeFilter === f ? 'bg-edge text-cream' : 'text-faint hover:text-dust hover:bg-surface'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="text" 
            placeholder="Search nodes..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-midnight border border-edge rounded px-2 py-1 text-[11px] font-mono text-cream focus:outline-none focus:border-gold"
          />
          <div className="h-4 w-px bg-edge" />
          <button onClick={() => { setZoom(1); setPan({x:0, y:0}); }} className="text-[11px] text-faint hover:text-cream px-2">Reset View</button>
          <button onClick={() => setIsExpanded(!isExpanded)} className="text-[11px] text-faint hover:text-cream px-2">
            {isExpanded ? "Collapse" : "Expand"}
          </button>
          <div className="relative group">
            <button className="text-[11px] text-faint hover:text-cream px-2 py-1 border border-edge rounded bg-surface/50">
              Export ▾
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-surface border border-edge rounded shadow-xl z-50 min-w-[120px]">
              <button onClick={() => handleExport('json')} className="w-full text-left px-3 py-2 text-[11px] hover:bg-edge transition-colors">As JSON</button>
              <button onClick={() => handleExport('mermaid')} className="w-full text-left px-3 py-2 text-[11px] hover:bg-edge transition-colors">As Mermaid</button>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden" style={{ height: isExpanded ? 'calc(100vh - 200px)' : '600px', minHeight: '600px' }}>
        
        {/* ─── 3. Force-Directed Canvas ─── */}
        <div ref={containerRef} className="flex-1 relative bg-midnight/80">
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            className={`w-full h-full ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onPointerDown={handleBgPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
          >
            <rect width="100%" height="100%" fill="transparent" />
            
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {simEdgesRef.current.map((edge, i) => {
                if (!edge.sourceNode || !edge.targetNode) return null;
                const isActive = activeEdges.has(edge);
                const isDimmedEdge = activeNodes.size > 0 && !isActive;
                
                let strokeColor = "#3a3f4b"; // default
                let dashArray;
                if (edge.type === 'imports' || edge.type === 'depends-on') strokeColor = "#4a5568";
                if (edge.type === 'contains') { strokeColor = "#2d3748"; dashArray = "2 4"; }
                
                if (isActive) strokeColor = "#f0a040";

                return (
                  <g key={`e-${i}`}>
                    <line
                      x1={edge.sourceNode.x} y1={edge.sourceNode.y}
                      x2={edge.targetNode.x} y2={edge.targetNode.y}
                      stroke={strokeColor}
                      strokeWidth={isActive ? 2 : 1}
                      strokeOpacity={isDimmedEdge ? 0.1 : isActive ? 0.8 : 0.4}
                      strokeDasharray={dashArray}
                      onMouseEnter={() => setHoveredEdge(edge)}
                      onMouseLeave={() => setHoveredEdge(null)}
                      className="cursor-pointer transition-all duration-300"
                    />
                    {/* Invisible thicker line for easier hover */}
                    <line
                      x1={edge.sourceNode.x} y1={edge.sourceNode.y}
                      x2={edge.targetNode.x} y2={edge.targetNode.y}
                      stroke="transparent"
                      strokeWidth="10"
                      onMouseEnter={() => setHoveredEdge(edge)}
                      onMouseLeave={() => setHoveredEdge(null)}
                      className="cursor-pointer"
                    />
                  </g>
                );
              })}

              {/* Edge Particles (Active only) */}
              {Array.from(activeEdges).map((edge, i) => {
                 if (!edge.sourceNode || !edge.targetNode) return null;
                 return (
                   <circle key={`p-${i}`} r="2.5" fill="#f0a040" opacity="0.9">
                     <animateMotion dur="1s" repeatCount="indefinite" path={`M${edge.sourceNode.x},${edge.sourceNode.y} L${edge.targetNode.x},${edge.targetNode.y}`} />
                   </circle>
                 );
              })}

              {/* Nodes */}
              {simNodesRef.current.map(node => {
                const isSelected = selectedNodeId === node.id;
                const isHovered = hoveredNodeId === node.id;
                const dim = isDimmed(node.id);
                
                return (
                  <g key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    onPointerDown={(e) => handlePointerDown(node.id, e)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    className="cursor-pointer transition-opacity duration-300"
                    style={{ zIndex: isSelected || isHovered ? 10 : 1 }}
                  >
                    {renderNodeShape(node, isHovered, isSelected)}
                    
                    {/* Label */}
                    {(!dim || isHovered) && (
                      <text
                        y={node.radius + 12}
                        textAnchor="middle"
                        fill={isHovered || isSelected ? "#e8e4d9" : "#8e8e9e"}
                        fontSize={10}
                        fontFamily="sans-serif"
                        pointerEvents="none"
                        className="transition-colors duration-300"
                      >
                        {node.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Tooltip for Edge Hover */}
          {hoveredEdge && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-surface/90 backdrop-blur border border-edge rounded-full text-[11px] font-mono text-dust pointer-events-none z-20">
              {hoveredEdge.sourceNode?.label} <span className="text-gold">→ {hoveredEdge.type} →</span> {hoveredEdge.targetNode?.label}
              {hoveredEdge.weight > 1 && ` (${hoveredEdge.weight})`}
            </div>
          )}

          {/* ─── 6. Legend Overlay ─── */}
          <div className="absolute bottom-4 left-4 p-3 bg-surface/80 backdrop-blur-md border border-edge rounded-lg shadow-xl text-[10px] font-mono space-y-2 pointer-events-none">
            <p className="text-cream font-bold mb-1 border-b border-edge/50 pb-1">Legend</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {Object.entries(TYPE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }}></span>
                  <span className="text-dust capitalize">{type}</span>
                </div>
              ))}
            </div>
            <div className="pt-1 mt-1 border-t border-edge/50 space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border border-coral border-dashed inline-block" />
                <span className="text-dust">Cycle Node</span>
              </div>
              <div className="flex items-center gap-2">
                 <span className="w-3 h-3 rounded-full border border-gold inline-block animate-pulse" />
                 <span className="text-dust">Hub Node</span>
              </div>
            </div>
          </div>

          {/* Toggle Insights Button */}
          <button 
            onClick={() => setShowInsights(!showInsights)}
            className="absolute bottom-4 right-4 px-3 py-1.5 bg-surface/80 backdrop-blur border border-edge rounded-full text-xs font-mono text-faint hover:text-cream transition-colors z-20"
          >
            {showInsights ? "Hide Insights" : "Show Insights"}
          </button>
        </div>

        {/* ─── 4. Node Inspector Panel ─── */}
        <div className={`absolute top-0 right-0 w-80 h-full bg-surface/95 backdrop-blur-md border-l border-edge transform transition-transform duration-300 overflow-y-auto ${
          selectedNodeId ? 'translate-x-0' : 'translate-x-full'
        }`}>
          {selectedNode && (
            <div className="p-4 flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded font-mono"
                  style={{ backgroundColor: `${TYPE_COLORS[selectedNode.type]}20`, color: TYPE_COLORS[selectedNode.type] }}>
                  {selectedNode.type}
                </span>
                <button onClick={() => setSelectedNodeId(null)} className="text-faint hover:text-coral text-lg leading-none">×</button>
              </div>
              
              <h2 className="text-lg font-bold text-cream break-all mb-1">{selectedNode.label}</h2>
              {selectedNode.parent && <p className="text-xs text-dust mb-4 font-mono">in {selectedNode.parent}</p>}
              
              <div className="grid grid-cols-2 gap-2 mb-6">
                <div className="bg-midnight/50 p-2 rounded border border-edge">
                  <p className="text-[10px] text-faint uppercase font-mono mb-0.5">Lines</p>
                  <p className="text-sm font-mono text-cream">{selectedNode.lineCount?.toLocaleString() || '-'}</p>
                </div>
                <div className="bg-midnight/50 p-2 rounded border border-edge">
                  <p className="text-[10px] text-faint uppercase font-mono mb-0.5">Size (chars)</p>
                  <p className="text-sm font-mono text-cream">{selectedNode.totalChars?.toLocaleString() || '-'}</p>
                </div>
              </div>

              {selectedNode.preview && (
                <div className="mb-6">
                  <p className="text-[10px] uppercase text-faint font-mono mb-2">Code Preview</p>
                  <pre className="text-[10px] font-mono text-dust bg-midnight/80 p-3 rounded-lg overflow-x-auto border border-edge max-h-40 overflow-y-auto">
                    {selectedNode.preview}
                  </pre>
                </div>
              )}

              <div className="mb-4 flex-1">
                <p className="text-[10px] uppercase text-faint font-mono mb-2">Connections</p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-dust mb-1 border-b border-edge pb-1">Incoming ({graphData.edges.filter(e => e.target === selectedNode.id).length})</p>
                    <ul className="text-[10px] font-mono space-y-1 max-h-24 overflow-y-auto pr-1">
                      {graphData.edges.filter(e => e.target === selectedNode.id).slice(0,10).map((e,i) => (
                         <li key={i} className="truncate text-faint hover:text-cream cursor-pointer transition-colors"
                             onClick={() => setSelectedNodeId(e.source)}>
                           ← {graphData.nodes.find(n => n.id === e.source)?.label} <span className="opacity-50">({e.type})</span>
                         </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs text-dust mb-1 border-b border-edge pb-1">Outgoing ({graphData.edges.filter(e => e.source === selectedNode.id).length})</p>
                    <ul className="text-[10px] font-mono space-y-1 max-h-24 overflow-y-auto pr-1">
                       {graphData.edges.filter(e => e.source === selectedNode.id).slice(0,10).map((e,i) => (
                         <li key={i} className="truncate text-faint hover:text-cream cursor-pointer transition-colors"
                             onClick={() => setSelectedNodeId(e.target)}>
                           → {graphData.nodes.find(n => n.id === e.target)?.label} <span className="opacity-50">({e.type})</span>
                         </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="mt-auto pt-4 border-t border-edge">
                 <p className="text-[10px] uppercase text-faint font-mono mb-1">Impact Radius</p>
                 <p className="text-xs text-dust">
                   {impactRadius.impacted.length} downstream node(s) across depth {impactRadius.depth} affected.
                 </p>
               </div>
            </div>
          )}
        </div>

      </div>

      {/* ─── 5. Insights Panel (Bottom) ─── */}
      <div className={`border-t border-edge bg-surface/90 backdrop-blur-sm transition-all duration-300 overflow-hidden ${showInsights ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0 border-transparent'}`}>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto h-full">
          
          {/* Cycles */}
          <div>
            <h3 className="text-xs font-bold text-coral uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-coral inline-block"></span>
              Dependency Cycles ({graphData.cycles.length})
            </h3>
            {graphData.cycles.length === 0 ? (
              <p className="text-[11px] text-dust italic">No cycles detected. Excellent!</p>
            ) : (
              <ul className="space-y-3 max-h-40 overflow-y-auto pr-2">
                {graphData.cycles.map((c, i) => (
                  <li key={i} className="bg-midnight/50 p-2 rounded border border-coral/20">
                    <p className="text-[10px] text-faint mb-1">Length: {c.length}</p>
                    <div className="text-[10px] font-mono text-dust break-words leading-tight">
                       {c.path.map(id => graphData.nodes.find(n=>n.id===id)?.label || id).join(" ➔ ")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Hubs */}
          <div>
             <h3 className="text-xs font-bold text-gold uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gold inline-block"></span>
              Top Hubs
            </h3>
            <ul className="space-y-2 max-h-40 overflow-y-auto pr-2">
              {graphData.hubs.slice(0, 5).map((h, i) => {
                 const n = graphData.nodes.find(node => node.id === h.nodeId);
                 return (
                   <li key={i} className="flex items-center justify-between bg-midnight/50 p-2 rounded border border-gold/20 cursor-pointer hover:bg-midnight transition-colors"
                       onClick={() => { setSelectedNodeId(h.nodeId); setZoom(1.5); }}>
                     <span className="text-[11px] font-mono text-dust truncate mr-2" title={n?.label}>{n?.label}</span>
                     <span className="text-[10px] text-gold font-bold bg-gold/10 px-1.5 py-0.5 rounded shrink-0">{h.degree} deg</span>
                   </li>
                 );
              })}
            </ul>
          </div>

          {/* Path Finder */}
          <div>
            <h3 className="text-xs font-bold text-azure uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-azure inline-block"></span>
              Path Finder
            </h3>
            <div className="space-y-2 bg-midnight/50 p-3 rounded border border-azure/20">
              <select className="w-full bg-midnight border border-edge rounded px-2 py-1 text-[10px] font-mono text-dust focus:outline-none"
                      value={pathSource} onChange={e => setPathSource(e.target.value)}>
                <option value="">Select Source Node...</option>
                {graphData.nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
              <select className="w-full bg-midnight border border-edge rounded px-2 py-1 text-[10px] font-mono text-dust focus:outline-none"
                      value={pathTarget} onChange={e => setPathTarget(e.target.value)}>
                <option value="">Select Target Node...</option>
                {graphData.nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
              <button 
                onClick={handleFindPath}
                disabled={!pathSource || !pathTarget}
                className="w-full py-1.5 bg-azure/10 text-azure hover:bg-azure/20 disabled:opacity-50 disabled:cursor-not-allowed border border-azure/30 rounded text-[10px] uppercase font-bold transition-colors"
              >
                Find Shortest Path
              </button>
              
              {computedPath && (
                <div className="mt-2 pt-2 border-t border-edge">
                  {computedPath.length > 0 ? (
                    <p className="text-[10px] font-mono text-jade">Path found! ({computedPath.length - 1} hops). Highlighted in graph.</p>
                  ) : (
                    <p className="text-[10px] font-mono text-coral">No path exists between these nodes.</p>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default memo(GraphifyVisualizer);
