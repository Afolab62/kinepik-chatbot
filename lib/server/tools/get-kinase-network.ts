// Tool: getKinaseNetwork — fetches SIF-format kinase interaction network from the KINEPIK API.
// Returns structured node/edge data for Cytoscape.js visualisation.

import { tool } from "ai";
import { z } from "zod";

const KINEPIK_API = "https://kinepik.org/api/0";

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export interface NetworkNode {
  id: string;
  label: string;
  type: "kinase" | "phosphosite" | "protein";
}

export interface NetworkEdge {
  source: string;
  target: string;
  interaction: string;
}

export interface NetworkData {
  title: string;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  kinaseIds: string[];
  resolution: "kinases" | "phosphosites";
  nodeCount: number;
  edgeCount: number;
}

/** Parse plain-text SIF lines into nodes and edges.
 *  SIF format: `sourceId <tab> interaction <tab> targetId`
 *  Lines starting with # are comments; blank lines are skipped.
 */
function parseSif(
  sifText: string,
  resolution: "kinases" | "phosphosites",
  idToLabel: Record<string, string>,
  kinaseIdSet: Set<string>,
): { nodes: NetworkNode[]; edges: NetworkEdge[] } {
  const nodeMap = new Map<string, NetworkNode>();
  const edges: NetworkEdge[] = [];

  const lines = sifText.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    // KINEPIK SIF API uses space-separated columns, not tabs
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    const [sourceId, interaction, targetId] = parts;
    if (!sourceId || !targetId) continue;

    // Classify source
    if (!nodeMap.has(sourceId)) {
      nodeMap.set(sourceId, {
        id: sourceId,
        label: idToLabel[sourceId] ?? sourceId,
        type: kinaseIdSet.has(sourceId) ? "kinase" : "protein",
      });
    }

    // Classify target
    if (!nodeMap.has(targetId)) {
      const isPhosphosite =
        resolution === "phosphosites" &&
        /\([A-Za-z]\d+\)$/.test(targetId); // e.g. EGFR(Y1068)
      const isKinase = kinaseIdSet.has(targetId);
      nodeMap.set(targetId, {
        id: targetId,
        label: idToLabel[targetId] ?? targetId,
        type: isPhosphosite ? "phosphosite" : isKinase ? "kinase" : "protein",
      });
    }

    edges.push({ source: sourceId, target: targetId, interaction: interaction ?? "interacts-with" });
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

async function fetchSif(
  kinaseIds: string[],
  resolution: "kinases" | "phosphosites",
): Promise<string> {
  // KINEPIK expects literal commas — do NOT use encodeURIComponent on the joined list
  const ids = kinaseIds.join(",");
  const url = `${KINEPIK_API}/sif/specific?kinase_ids=${ids}&resolution=${resolution}`;
  const { signal, clear } = withTimeout(15000);
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`SIF API returned ${res.status}`);
    return await res.text();
  } finally {
    clear();
  }
}

async function fetchAttributes(
  kinaseIds: string[],
  resolution: "kinases" | "phosphosites",
): Promise<Record<string, string>> {
  // KINEPIK expects literal commas — do NOT encode the ID list
  const ids = kinaseIds.join(",");
  const url =
    `${KINEPIK_API}/sif/attributes?kinases=${ids}&resolution=${resolution}&type=IDs`;
  const { signal, clear } = withTimeout(10000);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
    if (!res.ok) return {};
    const data = await res.json();
    // Response is an array of objects: [{id: "P00533", label: "EGFR"}, ...]
    // or it could be a different shape — try both common shapes
    const map: Record<string, string> = {};
    const items: unknown[] = Array.isArray(data?.value)
      ? (data.value as unknown[])
      : Array.isArray(data)
        ? (data as unknown[])
        : [];
    for (const item of items) {
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        // Shape 1: { UniprotID: "P00533", MappedGene: "EGFR" }
        if (typeof obj.UniprotID === "string" && typeof obj.MappedGene === "string") {
          map[obj.UniprotID] = obj.MappedGene;
        }
        // Shape 2: { id: "P00533", label: "EGFR" }
        if (typeof obj.id === "string" && typeof obj.label === "string") {
          map[obj.id] = obj.label as string;
        }
        // Shape 3: keys are the UniProt IDs mapping to gene name
        for (const [k, v] of Object.entries(obj)) {
          if (k !== "id" && k !== "label" && typeof v === "string") {
            map[k] = v;
          }
        }
      }
    }
    return map;
  } catch {
    return {};
  } finally {
    clear();
  }
}

export const getKinaseNetworkTool = tool({
  description:
    "Fetch a kinase-protein interaction network from the KINEPIK database and return it for visualisation as an interactive Cytoscape network diagram. " +
    "Use this when the user asks to visualise, show, or display a protein kinase network, pathway, or interaction graph. " +
    "You MUST provide UniProt IDs for the kinases of interest. " +
    "Use resolution='kinases' for kinase-kinase networks (cleaner, fewer nodes) and resolution='phosphosites' to include individual phosphorylation sites.",
  inputSchema: z.object({
    uniprotIds: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe(
        "UniProt IDs of kinases to include in the network (e.g. [\"P00533\", \"P42345\"]). Required.",
      ),
    resolution: z
      .enum(["kinases", "phosphosites"])
      .default("kinases")
      .describe(
        "Network resolution: 'kinases' shows kinase-kinase interactions (recommended for overview); " +
          "'phosphosites' includes individual phosphorylation sites as nodes.",
      ),
    title: z
      .string()
      .optional()
      .describe(
        "Human-readable title for the network panel (e.g. 'EGFR signalling network'). Defaults to a generated title.",
      ),
  }),
  execute: async ({
    uniprotIds,
    resolution = "kinases",
    title,
  }: {
    uniprotIds: string[];
    resolution?: "kinases" | "phosphosites";
    title?: string;
  }): Promise<{ networkData: NetworkData; error?: string }> => {
    const errors: string[] = [];

    let sifText = "";
    try {
      sifText = await fetchSif(uniprotIds, resolution);
    } catch (err) {
      errors.push(`SIF fetch failed: ${(err as Error).message}`);
    }

    let idToLabel: Record<string, string> = {};
    try {
      idToLabel = await fetchAttributes(uniprotIds, resolution);
    } catch {
      // Attributes are optional — fall back to raw IDs as labels
    }

    const { nodes: allNodes, edges: allEdges } = parseSif(
      sifText,
      resolution,
      idToLabel,
      new Set(uniprotIds),
    );

    // Cap the graph handed to the client — very dense phosphosite networks can
    // reach thousands of nodes/edges, which freezes the Cytoscape cose layout
    // in the browser. Truncate and tell the model/user rather than crashing.
    const MAX_NODES = 250;
    const MAX_EDGES = 500;
    const truncated = allNodes.length > MAX_NODES || allEdges.length > MAX_EDGES;
    const nodes = allNodes.slice(0, MAX_NODES);
    const keptIds = new Set(nodes.map((n) => n.id));
    const edges = allEdges
      .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
      .slice(0, MAX_EDGES);

    if (truncated) {
      errors.push(
        `Network truncated to ${nodes.length} nodes / ${edges.length} edges (full result had ${allNodes.length} nodes / ${allEdges.length} edges) to keep the visualisation responsive. Narrow the kinase set or use resolution='kinases' for a smaller graph.`,
      );
    }

    const networkTitle =
      title ??
      (uniprotIds.length === 1
        ? `${idToLabel[uniprotIds[0]] ?? uniprotIds[0]} network`
        : `Kinase network (${uniprotIds.slice(0, 3).map((id) => idToLabel[id] ?? id).join(", ")}${uniprotIds.length > 3 ? "…" : ""})`);

    const networkData: NetworkData = {
      title: networkTitle,
      nodes,
      edges,
      kinaseIds: uniprotIds,
      resolution,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    };

    return {
      networkData,
      ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
    };
  },
});
