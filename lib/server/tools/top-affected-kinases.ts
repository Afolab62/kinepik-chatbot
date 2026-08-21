import { tool } from "ai";
import { z } from "zod";
import { resolvePerturbationName } from "./perturbation-catalog";

const KINEPIK_API = "https://kinepik.org/api/0";
const KINEPIK_LOG_REQUESTS = process.env.KINEPIK_LOG_REQUESTS === "true";

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

interface KinaseInfo {
  uniprotId: string;
  name: string;
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

export function parseKinepikJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Some KINEPIK payloads include non-JSON numeric tokens such as NaN or Infinity.
    const normalized = raw
      .replace(/\b-?Infinity\b/g, "null")
      .replace(/\bNaN\b/g, "null");
    return JSON.parse(normalized);
  }
}

// Hard ceiling keeps a single batch attempt well under typical serverless
// function limits, even if KINEPIK is slow — prevents "show all kinases"
// style requests from hanging the whole chat request for minutes.
function timeoutForBatchSize(kinaseCount: number, attempt: number): number {
  const base = 8000 + kinaseCount * 3000;
  const multiplier = attempt === 1 ? 1 : 1.2;
  return Math.min(30000, Math.floor(base * multiplier));
}

async function fetchAllKinaseInfo(): Promise<KinaseInfo[]> {
  // Curated list of well-characterized human kinases used for robust ranking scans.
  // IDs are UniProt accessions and avoid non-kinase placeholders.
  const curatedKinases = [
    // ERBB / receptor tyrosine kinases
    { uniprotId: "P00533", name: "EGFR" },
    { uniprotId: "P04626", name: "ERBB2" },
    { uniprotId: "P21860", name: "ERBB3" },
    { uniprotId: "Q15303", name: "ERBB4" },
    { uniprotId: "Q9UM73", name: "ALK" },
    { uniprotId: "P08581", name: "MET" },

    // SRC family and related
    { uniprotId: "P12931", name: "SRC" },
    { uniprotId: "P07947", name: "YES1" },
    { uniprotId: "P08631", name: "HCK" },

    // FAK and related
    { uniprotId: "Q05397", name: "PTK2" },
    { uniprotId: "Q14289", name: "PTK2B" },

    // PI3K / AKT / mTOR
    { uniprotId: "P42336", name: "PIK3CA" },
    { uniprotId: "P42338", name: "PIK3CB" },
    { uniprotId: "O00329", name: "PIK3CD" },
    { uniprotId: "P31749", name: "AKT1" },
    { uniprotId: "P31751", name: "AKT2" },
    { uniprotId: "Q9Y243", name: "AKT3" },
    { uniprotId: "P42345", name: "MTOR" },
    { uniprotId: "P49815", name: "TSC2" },
    { uniprotId: "P60484", name: "PTEN" },

    // MAPK / CMGC
    { uniprotId: "P28482", name: "MAPK1" },
    { uniprotId: "P27361", name: "MAPK3" },
    { uniprotId: "Q02750", name: "MAP2K1" },
    { uniprotId: "P36507", name: "MAP2K2" },
    { uniprotId: "Q16539", name: "MAPK14" },
    { uniprotId: "P45983", name: "MAPK8" },

    // AGC and metabolic signaling
    { uniprotId: "P17252", name: "PRKCA" },
    { uniprotId: "Q15418", name: "RPS6KA1" },
    { uniprotId: "P23443", name: "RPS6KB1" },
    { uniprotId: "P49841", name: "GSK3B" },
    { uniprotId: "Q13131", name: "PRKAA1" },
    { uniprotId: "Q15831", name: "STK11" },

    // JAK family
    { uniprotId: "P23458", name: "JAK1" },
    { uniprotId: "O60674", name: "JAK2" },
    { uniprotId: "P29597", name: "TYK2" },

    // RAF / cell-cycle
    { uniprotId: "P53778", name: "BRAF" },
    { uniprotId: "P04049", name: "RAF1" },
    { uniprotId: "P10398", name: "ARAF" },
    { uniprotId: "P11802", name: "CDK4" },
    { uniprotId: "P06493", name: "CDK1" },
    { uniprotId: "P24941", name: "CDK2" },
    { uniprotId: "O14757", name: "CHEK1" },
    { uniprotId: "O96017", name: "CHEK2" },
  ];

  return curatedKinases;
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
    for (const [id, content] of Object.entries(
      entry as Record<string, unknown>,
    )) {
      if (typeof content !== "object" || content === null) continue;
      const pertData = (content as Record<string, unknown>)[perturbation];
      if (typeof pertData !== "object" || pertData === null) continue;
      const n = (pertData as Record<string, unknown>).n;
      if (typeof n !== "number" || n === 0) continue;
      const zScore =
        (pertData as Record<string, unknown>).WeightedZ_score ??
        (pertData as Record<string, unknown>).z_score;
      if (typeof zScore !== "number" || Number.isNaN(zScore)) continue;
      const pValue = (pertData as Record<string, unknown>).p_value;
      rows.push({
        uniprotId: id,
        name: id,
        zScore,
        pValue: typeof pValue === "number" ? pValue : 1,
        n,
        meanFCKinase:
          typeof (pertData as Record<string, unknown>).MeanFCKinase === "number"
            ? ((pertData as Record<string, unknown>).MeanFCKinase as number)
            : undefined,
        sites: Array.isArray((pertData as Record<string, unknown>).Phosphosites)
          ? (
              (pertData as Record<string, unknown>).Phosphosites as unknown[]
            ).filter((x): x is string => typeof x === "string")
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
  const buildUrl = () =>
    `${KINEPIK_API}/perturbation/KSEA?kinase_ids=${ids}` +
    `&perturbations=${encodeURIComponent(perturbation)}` +
    `&cell_line=${encodeURIComponent(cellLine)}` +
    `&weighted=true&autophosphorylation=exclude&phosphosite_confidence=1`;

  // Retry once on timeout/abort: KINEPIK can intermittently be slow for large batches.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const url = buildUrl();
    const { signal, clear } = withTimeout(
      timeoutForBatchSize(kinaseIds.length, attempt),
    );
    try {
      if (KINEPIK_LOG_REQUESTS) {
        console.log(
          `[kinepik-request] tool=getTopAffectedKinases attempt=${attempt} url=${url}`,
        );
      }

      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal,
      });
      if (!res.ok) return [];
      const text = await res.text();
      const data = parseKinepikJson(text);
      return parseKseaResponse(data, perturbation);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAbort =
        message.includes("aborted") ||
        message.includes("AbortError") ||
        message.includes("This operation was aborted");
      if (!isAbort || attempt === 2) {
        throw err;
      }
    } finally {
      clear();
    }
  }

  return [];
}

async function fetchKseaChunkRobust(
  kinaseIds: string[],
  perturbation: string,
  cellLine: string,
): Promise<KseaRow[]> {
  if (kinaseIds.length === 0) return [];

  try {
    return await fetchKseaChunk(kinaseIds, perturbation, cellLine);
  } catch {
    // If a larger batch fails (timeout or malformed payload), split and retry.
    if (kinaseIds.length <= 1) {
      return [];
    }

    const mid = Math.floor(kinaseIds.length / 2);
    const left = kinaseIds.slice(0, mid);
    const right = kinaseIds.slice(mid);

    const [leftRows, rightRows] = await Promise.all([
      fetchKseaChunkRobust(left, perturbation, cellLine),
      fetchKseaChunkRobust(right, perturbation, cellLine),
    ]);
    return [...leftRows, ...rightRows];
  }
}

function sortRows(
  rows: KseaRow[],
  mode: "absolute" | "activated" | "inhibited",
) {
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
      .describe(
        "Number of parallel KSEA requests to run when scanning kinase batches.",
      ),
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
    const resolution = resolvePerturbationName(perturbation);
    if (!resolution.matched || !resolution.resolvedName) {
      return {
        perturbation,
        cellLine,
        mode,
        scannedKinases: 0,
        totalFound: 0,
        topKinases: [],
        summary: `No ranking was run because ${perturbation} is not in the local KINEPIK perturbation catalogue.`,
        note:
          resolution.suggestions.length > 0
            ? `Use an exact perturbation name from listPerturbations. Closest matches: ${resolution.suggestions.join(", ")}.`
            : "Use an exact perturbation name from listPerturbations before requesting a ranking.",
      };
    }

    const resolvedPerturbation = resolution.resolvedName;
    const kinases = await fetchAllKinaseInfo();
    const kinaseIds = kinases.map((item) => item.uniprotId);
    // Hard cap regardless of requested maxScan — an unbounded scan (e.g. a user
    // asking to "show all kinases") can fan out into dozens of slow upstream
    // KSEA requests and hang the whole chat response.
    const HARD_MAX_SCAN = 30;
    const requestedScan =
      typeof maxScan === "number" ? maxScan : kinaseIds.length;
    const scanIds = kinaseIds.slice(0, Math.min(requestedScan, HARD_MAX_SCAN));

    // Smaller batches plus adaptive timeout reduce abort risk on KINEPIK's KSEA endpoint.
    const chunkSize = 8;
    const chunks: string[][] = [];
    for (let i = 0; i < scanIds.length; i += chunkSize) {
      chunks.push(scanIds.slice(i, i + chunkSize));
    }

    const results: KseaRow[] = [];
    let current = 0;
    const errors: string[] = [];

    async function worker() {
      while (current < chunks.length) {
        const index = current;
        current += 1;
        const batch = chunks[index];
        try {
          const rows = await fetchKseaChunkRobust(
            batch,
            resolvedPerturbation,
            cellLine,
          );
          results.push(...rows);
        } catch (err) {
          errors.push(
            `Batch ${index + 1}/${chunks.length} failed: ${(err as Error).message}`,
          );
        }
      }
    }

    const effectiveConcurrency = Math.min(concurrency, 2);
    const workers = Array.from(
      { length: Math.min(effectiveConcurrency, chunks.length) },
      () => worker(),
    );
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
      name:
        kinases.find((k) => k.uniprotId === row.uniprotId)?.name ?? row.name,
    }));

    return {
      perturbation: resolvedPerturbation,
      cellLine,
      mode,
      assayType: "KSEA_phosphosite_enrichment",
      interpretationGuidance:
        "These scores reflect inferred downstream kinase activity shifts from phosphosite enrichment and may include indirect pathway effects. They are not direct kinase-drug binding measurements.",
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
          : resolution.autoCorrected
            ? `Perturbation name normalized from ${perturbation} to ${resolvedPerturbation}. Scanned ${scanIds.length} kinases and returned the top ${top.length} by ${mode} KSEA ranking.`
            : `Scanned ${scanIds.length} kinases and returned the top ${top.length} by ${mode} KSEA ranking.`,
    };
  },
});
