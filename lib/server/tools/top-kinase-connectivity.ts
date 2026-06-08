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
        if (typeof obj.UniprotID === "string" && typeof obj.MappedGene === "string") {
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
  execute: async ({ count, resolution }: { count: number; resolution: "kinases" | "phosphosites" }) => {
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
      .map(([uniprotId, neighbors]) => ({ uniprotId, degree: neighbors.size, neighbors: Array.from(neighbors) }))
      .sort((a, b) => b.degree - a.degree || a.uniprotId.localeCompare(b.uniprotId))
      .slice(0, count);

    const labels = await fetchLabels(sorted.map((entry) => entry.uniprotId), resolution);

    const topKinases: ConnectivityEntry[] = sorted.map((entry) => ({
      uniprotId: entry.uniprotId,
      degree: entry.degree,
      neighbors: entry.neighbors,
      label: labels[entry.uniprotId] ?? entry.uniprotId,
    }));

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