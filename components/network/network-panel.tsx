"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { motion, AnimatePresence } from "framer-motion";
import { X, ZoomIn, ZoomOut, Maximize2, RotateCcw, Download, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NetworkData } from "@/lib/server/tools/get-kinase-network";

interface NetworkPanelProps {
  networkData: NetworkData | null;
  isOpen: boolean;
  onClose: () => void;
}

// Hardcoded colours — Cytoscape's style engine cannot resolve CSS custom properties.
// These approximate the app's light-theme palette:
//   accent  = oklch(0.42 0.18 255) ≈ #3255cc (blue)
//   bg      = oklch(0.98 0.002 75) ≈ #faf9f7 (off-white)
//   muted   = oklch(0.92 0.01 75)  ≈ #ede9e4
//   border  = oklch(0.88 0.01 75)  ≈ #e2ddd8
//   fg      = oklch(0.25 0.01 60)  ≈ #3d3b38
const CY_COLORS = {
  kinase:     { bg: "#3255cc", border: "#2646b8", text: "#ffffff" },
  protein:    { bg: "#ede9e4", border: "#c5bfb8", text: "#3d3b38" },
  phosphosite:{ bg: "#f59e0b", border: "#d97706", text: "#ffffff" },
  edge:       "#c5bfb8",
  canvasBg:   "#ffffff",
} as const;

function buildElements(data: NetworkData): ElementDefinition[] {
  const elements: ElementDefinition[] = [];

  for (const node of data.nodes) {
    elements.push({
      data: {
        id: node.id,
        label: node.label,
        nodeType: node.type,
      },
      classes: node.type,
    });
  }

  for (let i = 0; i < data.edges.length; i++) {
    const edge = data.edges[i];
    elements.push({
      data: {
        id: `e${i}`,
        source: edge.source,
        target: edge.target,
        interaction: edge.interaction,
      },
    });
  }

  return elements;
}

export function NetworkPanel({ networkData, isOpen, onClose }: NetworkPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    label: string;
    type: string;
    degree: number;
  } | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const initCytoscape = useCallback(() => {
    if (!containerRef.current || !networkData) return;

    // Destroy existing instance
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    setIsRendering(true);
    setSelectedNode(null);

    const elements = buildElements(networkData);

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // --- Kinase nodes ---
        {
          selector: "node.kinase",
          style: {
            "background-color": CY_COLORS.kinase.bg,
            "border-color": CY_COLORS.kinase.border,
            "border-width": 2,
            color: CY_COLORS.kinase.text,
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 10,
            "font-weight": "bold",
            width: 60,
            height: 60,
            shape: "ellipse",
            "text-wrap": "wrap",
            "text-max-width": "52",
          },
        },
        // --- Protein nodes (non-kinase) ---
        {
          selector: "node.protein",
          style: {
            "background-color": CY_COLORS.protein.bg,
            "border-color": CY_COLORS.protein.border,
            "border-width": 1.5,
            color: CY_COLORS.protein.text,
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 9,
            width: 48,
            height: 48,
            shape: "ellipse",
            "text-wrap": "wrap",
            "text-max-width": "42",
          },
        },
        // --- Phosphosite nodes ---
        {
          selector: "node.phosphosite",
          style: {
            "background-color": CY_COLORS.phosphosite.bg,
            "border-color": CY_COLORS.phosphosite.border,
            "border-width": 1.5,
            color: CY_COLORS.phosphosite.text,
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 7,
            width: 34,
            height: 20,
            shape: "round-rectangle",
            "text-wrap": "wrap",
            "text-max-width": "30",
          },
        },
        // --- Edges ---
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": CY_COLORS.edge,
            "target-arrow-color": CY_COLORS.edge,
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: 0.8,
          },
        },
        // --- Selected states ---
        {
          selector: "node:selected",
          style: {
            "border-width": 3,
            "border-color": "#f59e0b",
          },
        },
        {
          selector: "edge:selected",
          style: {
            width: 2.5,
            "line-color": "#f59e0b",
            "target-arrow-color": "#f59e0b",
            opacity: 1,
          },
        },
        {
          selector: ".highlighted",
          style: { opacity: 1 },
        },
        {
          selector: ".faded",
          style: { opacity: 0.12 },
        },
      ],
      // Large graphs make the physics-based "cose" layout very expensive —
      // drop iteration count sharply above a node threshold so a big/unexpected
      // graph degrades gracefully instead of freezing the tab.
      layout: {
        name: "cose",
        animate: false,
        randomize: false,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 80,
        edgeElasticity: () => 100,
        gravity: 80,
        numIter: elements.length > 150 ? 200 : 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
      } as cytoscape.LayoutOptions,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });

    // Node click — highlight neighbourhood
    cy.on("tap", "node", (evt) => {
      const node = evt.target;
      const neighbourhood = node.closedNeighborhood();
      const rest = cy.elements().not(neighbourhood);

      cy.elements().removeClass("highlighted faded");
      neighbourhood.addClass("highlighted");
      rest.addClass("faded");

      setSelectedNode({
        id: node.id(),
        label: node.data("label"),
        type: node.data("nodeType"),
        degree: node.degree(false),
      });
    });

    // Click on background — reset highlight
    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass("highlighted faded");
        setSelectedNode(null);
      }
    });

    cyRef.current = cy;

    // Fit after short delay to ensure container is sized
    setTimeout(() => {
      cy.fit(undefined, 40);
      setIsRendering(false);
    }, 200);
  }, [networkData]);

  // Re-initialise whenever data changes and panel is open
  useEffect(() => {
    if (isOpen && networkData) {
      initCytoscape();
    }
    return () => {
      if (!isOpen && cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [isOpen, networkData, initCytoscape]);

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.75);
  const handleFit = () => cyRef.current?.fit(undefined, 40);
  const handleReset = () => {
    cyRef.current?.elements().removeClass("highlighted faded");
    setSelectedNode(null);
    cyRef.current?.fit(undefined, 40);
  };

  const handleExportPng = () => {
    if (!cyRef.current) return;
    const png = cyRef.current.png({ full: true, scale: 2, bg: CY_COLORS.canvasBg });
    const a = document.createElement("a");
    a.href = png;
    a.download = `${networkData?.title ?? "network"}.png`;
    a.click();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 30 }}
          className="fixed top-0 right-0 h-full w-130 max-w-[95vw] z-50 flex flex-col bg-background border-l border-border shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Share2 className="w-4 h-4 text-accent shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {networkData?.title ?? "Network"}
                </p>
                {networkData && (
                  <p className="text-[11px] text-muted-foreground">
                    {networkData.nodeCount} nodes · {networkData.edgeCount} edges ·{" "}
                    {networkData.resolution === "kinases" ? "kinase–kinase" : "kinase–phosphosite"}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 p-1.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors ml-2"
              aria-label="Close network panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0 bg-muted/40">
            <ToolbarButton onClick={handleZoomIn} title="Zoom in">
              <ZoomIn className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={handleZoomOut} title="Zoom out">
              <ZoomOut className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={handleFit} title="Fit to view">
              <Maximize2 className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton onClick={handleReset} title="Reset selection">
              <RotateCcw className="w-3.5 h-3.5" />
            </ToolbarButton>
            <div className="flex-1" />
            <ToolbarButton onClick={handleExportPng} title="Export PNG">
              <Download className="w-3.5 h-3.5" />
            </ToolbarButton>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-2 border-b border-border shrink-0">
            <LegendDot color={CY_COLORS.kinase.bg} label="Kinase" />
            <LegendDot color={CY_COLORS.protein.border} label="Protein" />
            {networkData?.resolution === "phosphosites" && (
              <LegendDot color={CY_COLORS.phosphosite.bg} label="Phosphosite" shape="rect" />
            )}
          </div>

          {/* Cytoscape canvas */}
          <div className="flex-1 relative overflow-hidden">
            {isRendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground">Building network…</p>
                </div>
              </div>
            )}
            <div ref={containerRef} className="w-full h-full" />
          </div>

          {/* Selected node info */}
          <AnimatePresence>
            {selectedNode && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="shrink-0 border-t border-border bg-muted/30 px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full mt-1.5 shrink-0",
                      selectedNode.type === "kinase"
                        ? "bg-accent"
                        : selectedNode.type === "phosphosite"
                          ? "bg-amber-500"
                          : "bg-stone-400",
                    )}
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{selectedNode.label}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {selectedNode.type} · {selectedNode.degree} connection
                      {selectedNode.degree !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5 font-mono">
                      {selectedNode.id}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty state */}
          {networkData && networkData.nodeCount === 0 && !isRendering && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted-foreground text-center px-8">
                No interaction data returned for these kinases.
                <br />
                Try a different set of UniProt IDs or{" "}
                <span className="text-accent">resolution=phosphosites</span>.
              </p>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
    </button>
  );
}

function LegendDot({
  color,
  label,
  shape = "circle",
}: {
  color: string;
  label: string;
  shape?: "circle" | "rect";
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn("w-3 h-3 shrink-0", shape === "rect" ? "rounded-sm" : "rounded-full")}
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
