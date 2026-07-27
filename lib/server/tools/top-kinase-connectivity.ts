// Tool: getTopKinaseConnectivity — computes the most connected kinases in the KINEPIK network.

import { tool } from "ai";
import { z } from "zod";

const KINEPIK_API = "https://kinepik.org/api/0";

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function fetchAllSif(
  resolution: "kinases" | "phosphosites",
): Promise<string> {
  const url = `${KINEPIK_API}/sif/all?resolution=${resolution}`;
  const { signal, clear } = withTimeout(15000);
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`SIF all fetch returned ${res.status}`);
    return await res.text();
  } finally {
    clear();
  }
}

async function fetchLabels(
  ids: string[],
  resolution: "kinases" | "phosphosites",
): Promise<Record<string, string>> {
  const idsCsv = ids.join(",");
  const url = `${KINEPIK_API}/sif/attributes?kinases=${idsCsv}&resolution=${resolution}&type=IDs`;
  const { signal, clear } = withTimeout(10000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return {};
    const data = await res.json();
    const items: unknown[] = Array.isArray(data?.value)
      ? (data.value as unknown[])
      : Array.isArray(data)
        ? (data as unknown[])
        : [];
    const map: Record<string, string> = {};
    for (const item of items) {
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (
          typeof obj.UniprotID === "string" &&
          typeof obj.MappedGene === "string"
        ) {
          map[obj.UniprotID] = obj.MappedGene;
        }
        if (typeof obj.id === "string" && typeof obj.label === "string") {
          map[obj.id] = obj.label;
        }
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

interface ConnectivityEntry {
  uniprotId: string;
  degree: number;
  neighbors: string[];
  label: string;
  family: "AGC" | "CAMK" | "CK1" | "CMGC" | "STE" | "TK" | "TKL" | "OTHER";
}

const UNIPROT_GENE_FALLBACK: Record<string, string> = {
  P06493: "CDK1",
  P49841: "GSK3B",
  P24941: "CDK2",
  P17612: "PRKACA",
  P17252: "PRKCA",
  P12931: "SRC",
  Q16539: "MAPK14",
  P28482: "MAPK1",
  P68400: "H3C1",
  P31749: "AKT1",
  P31751: "AKT2",
  Q9Y243: "AKT3",
  P00533: "EGFR",
  P42345: "MTOR",
  P42336: "PIK3CA",
  O60674: "JAK2",
  P23458: "JAK1",
  P15056: "BRAF",
  P04049: "RAF1",
  Q02750: "MAP2K1",
  P27361: "MAPK3",
};

function resolveLabel(uniprotId: string, apiLabel?: string): string {
  if (apiLabel && apiLabel !== uniprotId) {
    return apiLabel;
  }
  return UNIPROT_GENE_FALLBACK[uniprotId] ?? (apiLabel || uniprotId);
}

function inferKinaseFamily(label: string): ConnectivityEntry["family"] {
  const upper = label.toUpperCase();

  if (
    /^(CDK|MAPK|ERK|JNK|GSK|CLK|DYRK)/.test(upper) ||
    upper.includes("MAPK")
  ) {
    return "CMGC";
  }

  if (
    /^(AKT|PKC|PKA|PKG|SGK|RSK|RPS6K|RPS6KA|P70S6K)/.test(upper) ||
    /^(PRKACA|PRKACB|PRKACG|PRKCA|PRKCB|PRKCG|PRKG1|PRKG2)$/.test(upper)
  ) {
    return "AGC";
  }

  if (
    /^(CAMK|DAPK|MARK|NUAK|SIK|AMPK|MLCK)/.test(upper) ||
    /^PRKAA[12]$/.test(upper)
  ) {
    return "CAMK";
  }

  if (/^(CSNK1|CK1)/.test(upper)) {
    return "CK1";
  }

  if (/^(MAP3K|MAP4K|MST|STE)/.test(upper)) {
    return "STE";
  }

  if (/^(RAF1|ARAF|BRAF|MLK|TAOK|LRRK)/.test(upper)) {
    return "TKL";
  }

  if (
    /^(EGFR|ERBB|FGFR|PDGFRA|PDGFRB|KDR|FLT|MET|AXL|ALK|RET|ROS1|INSR|IGF1R)/.test(
      upper,
    ) ||
    /^(SRC|YES1|FYN|LYN|LCK|ABL1|ABL2|JAK1|JAK2|JAK3|TYK2|SYK|BTK|CSK|TEC)/.test(
      upper,
    )
  ) {
    return "TK";
  }

  return "OTHER";
}

export const getTopKinaseConnectivityTool = tool({
  description:
    "Compute the most connected kinases in the KINEPIK interaction network using the SIF database. " +
    "Use this when the user asks for hub kinases, top connected kinases, or a ranked kinase degree table.",
  inputSchema: z.object({
    count: z
      .number()
      .min(1)
      .max(20)
      .default(10)
      .describe("How many top connected kinases to return."),
    resolution: z
      .enum(["kinases", "phosphosites"])
      .default("kinases")
      .describe(
        "Network resolution to use for connectivity counting. 'kinases' returns kinase-kinase degree; 'phosphosites' includes site-level connections.",
      ),
  }),
  execute: async ({
    count,
    resolution,
  }: {
    count: number;
    resolution: "kinases" | "phosphosites";
  }) => {
    const sifText = await fetchAllSif(resolution);
    const degreeMap: Record<string, Set<string>> = {};
    let edgeCount = 0;

    const lines = sifText.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 3) continue;
      const [sourceId, , targetId] = parts;
      if (!sourceId || !targetId) continue;
      edgeCount += 1;
      degreeMap[sourceId] = degreeMap[sourceId] ?? new Set();
      degreeMap[targetId] = degreeMap[targetId] ?? new Set();
      degreeMap[sourceId].add(targetId);
      degreeMap[targetId].add(sourceId);
    }

    const sorted = Object.entries(degreeMap)
      .map(([uniprotId, neighbors]) => ({
        uniprotId,
        degree: neighbors.size,
        neighbors: Array.from(neighbors),
      }))
      .sort(
        (a, b) => b.degree - a.degree || a.uniprotId.localeCompare(b.uniprotId),
      )
      .slice(0, count);

    const labels = await fetchLabels(
      sorted.map((entry) => entry.uniprotId),
      resolution,
    );

    const topKinases: ConnectivityEntry[] = sorted.map((entry) => {
      const label = resolveLabel(entry.uniprotId, labels[entry.uniprotId]);
      return {
        uniprotId: entry.uniprotId,
        degree: entry.degree,
        neighbors: entry.neighbors,
        label,
        family: inferKinaseFamily(label),
      };
    });

    return {
      count,
      resolution,
      nodeCount: Object.keys(degreeMap).length,
      edgeCount,
      topKinases,
      note: `Top ${count} most connected kinases by degree in the KINEPIK ${resolution} network.`,
    };
  },
});
