import { tool } from "ai";
import { z } from "zod";

const KINEPIK_API = "https://kinepik.org/api/0";

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

interface KinaseInfo {
  uniprotId: string;
  name?: string;
}

interface KseaRow {
  uniprotId: string;
  name: string;
  zScore: number;
  pValue: number;
  n: number;
  meanFCKinase?: number;
  sites?: string[];
}

async function fetchAllKinaseInfo(): Promise<KinaseInfo[]> {
  const url = `${KINEPIK_API}/kinases/all`;
  const { signal, clear } = withTimeout(15000);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
    if (!res.ok) throw new Error(`/kinases/all returned ${res.status}`);
    const data = await res.json();
    const items: unknown[] = Array.isArray(data?.value)
      ? (data.value as unknown[])
      : Array.isArray(data)
        ? (data as unknown[])
        : [];
    return items
      .map((item) => {
        if (typeof item !== "object" || item === null) return null;
        const raw = item as Record<string, unknown>;
        const uniprotId = String(raw.SourceUniprotID ?? raw.uniprot_id ?? raw.uniprotId ?? raw.UniprotID ?? "").trim();
        const name = String(raw.UniprotName ?? raw.gene_name ?? raw.name ?? "").trim();
        return uniprotId ? { uniprotId, name } : null;
      })
      .filter((item): item is KinaseInfo => item !== null);
  } finally {
    clear();
  }
}

function parseKseaResponse(data: unknown, perturbation: string): KseaRow[] {
  const rows: KseaRow[] = [];
  const entries: unknown[] = Array.isArray((data as any)?.value)
    ? (data as any).value
    : Array.isArray(data)
      ? (data as any)
      : [];

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    for (const [id, content] of Object.entries(entry as Record<string, unknown>)) {
      if (typeof content !== "object" || content === null) continue;
      const pertData = (content as Record<string, unknown>)[perturbation];
      if (typeof pertData !== "object" || pertData === null) continue;
      const n = (pertData as Record<string, unknown>).n;
      if (typeof n !== "number" || n === 0) continue;
      const zScore = (pertData as Record<string, unknown>).WeightedZ_score ?? (pertData as Record<string, unknown>).z_score;
      if (typeof zScore !== "number" || Number.isNaN(zScore)) continue;
      const pValue = (pertData as Record<string, unknown>).p_value;
      rows.push({
        uniprotId: id,
        name: id,
        zScore,
        pValue: typeof pValue === "number" ? pValue : 1,
        n,
        meanFCKinase: typeof (pertData as Record<string, unknown>).MeanFCKinase === "number"
          ? (pertData as Record<string, unknown>).MeanFCKinase
          : undefined,
        sites: Array.isArray((pertData as Record<string, unknown>).Phosphosites)
          ? ((pertData as Record<string, unknown>).Phosphosites as unknown[]).filter(
              (x): x is string => typeof x === "string",
            )
          : undefined,
      });
    }
  }

  return rows;
}

async function fetchKseaChunk(
  kinaseIds: string[],
  perturbation: string,
  cellLine: string,
): Promise<KseaRow[]> {
  if (kinaseIds.length === 0) return [];
  const ids = kinaseIds.join(",");
  const url =
    `${KINEPIK_API}/perturbation/KSEA?kinase_ids=${ids}` +
    `&perturbations=${encodeURIComponent(perturbation)}` +
    `&cell_line=${encodeURIComponent(cellLine)}` +
    `&weighted=true&autophosphorylation=exclude&phosphosite_confidence=1`;
  const { signal, clear } = withTimeout(15000);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
    if (!res.ok) return [];
    const data = await res.json();
    return parseKseaResponse(data, perturbation);
  } finally {
    clear();
  }
}

function sortRows(rows: KseaRow[], mode: "absolute" | "activated" | "inhibited") {
  const filtered = rows.filter((row) => {
    if (mode === "activated") return row.zScore > 0;
    if (mode === "inhibited") return row.zScore < 0;
    return true;
  });

  return filtered.sort((a, b) => {
    const primary =
      mode === "activated"
        ? b.zScore - a.zScore
        : mode === "inhibited"
          ? a.zScore - b.zScore
          : Math.abs(b.zScore) - Math.abs(a.zScore);
    if (Math.abs(primary) > 1e-6) return primary;
    if (b.n !== a.n) return b.n - a.n;
    return a.pValue - b.pValue;
  });
}

export const topAffectedKinasesTool = tool({
  description:
    "Rank kinases by KSEA effect for a perturbation and cell line using KINEPIK. " +
    "This tool scans available kinase KSEA profiles server-side and returns a true top-N ranking.",
  inputSchema: z.object({
    perturbation: z
      .string()
      .min(1)
      .describe("Perturbation/drug name to rank (e.g. AZD3759)."),
    cellLine: z
      .enum(["MCF7", "NTERA2", "HL60"])
      .default("MCF7")
      .describe("Experimental cell line for the KSEA ranking."),
    topN: z
      .number()
      .min(1)
      .max(50)
      .default(10)
      .describe("Number of top kinases to return."),
    mode: z
      .enum(["absolute", "activated", "inhibited"])
      .default("absolute")
      .describe(
        "Ranking mode: absolute=largest |z| first; activated=positive z-scores first; inhibited=negative z-scores first.",
      ),
    maxScan: z
      .number()
      .min(10)
      .max(1000)
      .optional()
      .describe(
        "Optional upper bound on how many kinases to scan. If omitted, scans all available KINEPIK kinases.",
      ),
    concurrency: z
      .number()
      .min(1)
      .max(8)
      .default(3)
      .describe("Number of parallel KSEA requests to run when scanning kinase batches."),
  }),
  execute: async ({
    perturbation,
    cellLine = "MCF7",
    topN,
    mode,
    maxScan,
    concurrency,
  }: {
    perturbation: string;
    cellLine: "MCF7" | "NTERA2" | "HL60";
    topN: number;
    mode: "absolute" | "activated" | "inhibited";
    maxScan?: number;
    concurrency: number;
  }) => {
    const kinases = await fetchAllKinaseInfo();
    const kinaseIds = kinases.map((item) => item.uniprotId);
    const scanIds = typeof maxScan === "number" ? kinaseIds.slice(0, maxScan) : kinaseIds;

    const chunkSize = 25;
    const chunks: string[][] = [];
    for (let i = 0; i < scanIds.length; i += chunkSize) {
      chunks.push(scanIds.slice(i, i + chunkSize));
    }

    const results: KseaRow[] = [];
    const active = new Set<number>();
    let current = 0;
    const errors: string[] = [];

    async function worker() {
      while (current < chunks.length) {
        const index = current;
        current += 1;
        const batch = chunks[index];
        try {
          const rows = await fetchKseaChunk(batch, perturbation, cellLine);
          results.push(...rows);
        } catch (err) {
          errors.push(
            `Batch ${index + 1}/${chunks.length} failed: ${(err as Error).message}`,
          );
        }
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, () => worker());
    await Promise.all(workers);

    const merged: Record<string, KseaRow> = {};
    for (const row of results) {
      const existing = merged[row.uniprotId];
      if (!existing || Math.abs(row.zScore) > Math.abs(existing.zScore)) {
        merged[row.uniprotId] = row;
      }
    }

    const sorted = sortRows(Object.values(merged), mode);
    const top = sorted.slice(0, topN).map((row) => ({
      ...row,
      name: kinases.find((k) => k.uniprotId === row.uniprotId)?.name ?? row.name,
    }));

    return {
      perturbation,
      cellLine,
      mode,
      scannedKinases: scanIds.length,
      totalFound: sorted.length,
      topKinases: top,
      summary: top
        .map(
          (row) =>
            `${row.name} (${row.uniprotId}): z=${row.zScore.toFixed(3)}, p=${row.pValue.toFixed(3)}, n=${row.n}`,
        )
        .join("\n"),
      note:
        errors.length > 0
          ? `Completed scan with ${errors.length} batch error(s): ${errors.join("; ")}`
          : `Scanned ${scanIds.length} kinases and returned the top ${top.length} by ${mode} KSEA ranking.`,
    };
  },
});
