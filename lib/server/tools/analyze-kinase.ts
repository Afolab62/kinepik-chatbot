// Tool: analyzeKinase — queries the live KINEPIK API (kinepik.org/api/0) for real kinase data.

import { tool } from "ai";
import { z } from "zod";
import type { KinaseCandidate } from "@/lib/types/kinepik";

const KINEPIK_API = "https://kinepik.org/api/0";

// Map a raw KINEPIK API kinase object to our KinaseCandidate shape.
// Real API returns: SourceUniprotID, UniprotName ("MTOR_HUMAN"), TargetPhosphosites
function mapKinase(raw: Record<string, unknown>): KinaseCandidate {
  const uniprotId = String(
    raw.SourceUniprotID ?? raw.uniprot_id ?? raw.uniprotId ?? "",
  );
  // UniprotName is like "MTOR_HUMAN" — extract gene symbol before the underscore
  const uniprotName = String(
    raw.UniprotName ?? raw.gene_name ?? raw.name ?? "",
  );
  const kinaseName = uniprotName.split("_")[0] || uniprotId || "Unknown";
  const phosphosites = Array.isArray(raw.TargetPhosphosites)
    ? (raw.TargetPhosphosites as string[])
    : Array.isArray(raw.phosphosites)
      ? (raw.phosphosites as string[])
      : [];
  return {
    kinaseName,
    uniprotId,
    family: String(raw.kinase_family ?? raw.family ?? "Unknown"),
    subfamily: String(raw.kinase_subfamily ?? raw.subfamily ?? ""),
    score: 1.0,
    confidence: "high", // presence in KINEPIK DB = confirmed kinase
    substrate: phosphosites.slice(0, 5).join(", "),
    phosphositeCount: phosphosites.length,
    knownInhibitors: [],
    relatedPathways: Array.isArray(raw.pathways)
      ? (raw.pathways as string[])
      : [],
  };
}

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function fetchKinaseInfo(
  uniprotIds: string[],
): Promise<KinaseCandidate[]> {
  const ids = uniprotIds.join(",");
  const url = `${KINEPIK_API}/kinases/specific?kinase_ids=${encodeURIComponent(ids)}&phosphosites=targets&confidence=1`;
  const { signal, clear } = withTimeout(10000);
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  } finally {
    clear();
  }
  if (!res!.ok)
    throw new Error(`KINEPIK /kinases/specific returned ${res!.status}`);
  const data = await res!.json();
  // API returns { value: [...kinases], Count: N } — must navigate into .value
  const items: Record<string, unknown>[] = Array.isArray(data?.value)
    ? (data.value as Record<string, unknown>[])
    : Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : [];
  return items.slice(0, 8).map((item) => mapKinase(item));
}

interface KseaResult {
  zScore: number;
  pValue: number;
  n: number;
  cellLine: string;
}

async function fetchKseaScores(
  uniprotIds: string[],
  perturbation: string,
  cellLine: string,
  errors: string[],
): Promise<Record<string, KseaResult>> {
  const scores: Record<string, KseaResult> = {};
  await Promise.all(
    uniprotIds.map(async (id) => {
      const { signal, clear } = withTimeout(10000);
      try {
        const url =
          `${KINEPIK_API}/perturbation/KSEA` +
          `?kinase_ids=${encodeURIComponent(id)}` +
          `&perturbations=${encodeURIComponent(perturbation)}` +
          `&cell_line=${encodeURIComponent(cellLine)}` +
          `&weighted=true&autophosphorylation=exclude&phosphosite_confidence=1`;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal,
        });
        clear();
        if (!res.ok) {
          errors.push(`KSEA ${id}: HTTP ${res.status}`);
          return;
        }
        const data = await res.json();
        // Weighted response: { value: [{ "P00533": { "AZD3759": { WeightedZ_score, n, p_value } } }], Count: N }
        // Unweighted response (fallback): plain array [{ "Q15208": { "AZD3759": { z_score, n, p_value } } }]
        const entries: Record<string, unknown>[] = Array.isArray(data?.value)
          ? data.value
          : Array.isArray(data)
            ? data
            : [];
        for (const entry of entries) {
          const kinaseData = (
            entry as Record<string, Record<string, Record<string, unknown>>>
          )[id];
          if (!kinaseData) continue;
          const pertData = kinaseData[perturbation];
          if (!pertData) continue;
          const n = pertData.n;
          if (typeof n !== "number" || n === 0) continue;
          // weighted=true returns WeightedZ_score; unweighted fallback returns z_score
          const zScore = pertData.WeightedZ_score ?? pertData.z_score;
          const pValue = pertData.p_value;
          if (typeof zScore === "number" && !isNaN(zScore)) {
            scores[id] = {
              zScore,
              pValue: typeof pValue === "number" && !isNaN(pValue) ? pValue : 1,
              n,
              cellLine,
            };
          }
        }
      } catch (err) {
        clear();
        errors.push(`KSEA ${id}: ${(err as Error).message}`);
      }
    }),
  );
  return scores;
}

export const analyzeKinaseTool = tool({
  description:
    "Query the live KINEPIK database (kinepik.org) for real kinase data, phosphorylation sites, and KSEA enrichment scores. " +
    "Use this when the user asks about kinases, phosphorylation, inhibitors, or signalling pathways. " +
    "You MUST provide UniProt IDs for the kinases of interest — use your knowledge to supply them (e.g. mTOR=P42345, AKT1=P31749, EGFR=P00533).",
  inputSchema: z.object({
    uniprotIds: z
      .array(z.string())
      .min(1)
      .max(5)
      .describe(
        'UniProt IDs of kinases to query (e.g. ["P42345", "P31749"]). Required.',
      ),
    perturbation: z
      .string()
      .optional()
      .describe(
        'Inhibitor or perturbation name for KSEA analysis. Must match the exact name in KINEPIK — use the drug\'s common name as a single word (e.g. "AZD3759", "Gefitinib", "Erlotinib"). ' +
          'Note: "Rapamycin" has no substrate measurements for mTOR in KINEPIK — try "AZD3759" or other inhibitors instead.',
      ),
    cellLine: z
      .enum(["MCF7", "NTERA2", "HL60"])
      .optional()
      .describe("Cell line for experimental data context. Defaults to MCF7."),
  }),
  execute: async ({
    uniprotIds,
    perturbation,
    cellLine = "MCF7",
  }: {
    uniprotIds: string[];
    perturbation?: string;
    cellLine?: "MCF7" | "NTERA2" | "HL60";
  }) => {
    let candidates: KinaseCandidate[] = [];
    let kseaScores: Record<string, KseaResult> = {};
    const errors: string[] = [];

    try {
      candidates = await fetchKinaseInfo(uniprotIds);
    } catch (err) {
      errors.push(`Kinase lookup failed: ${(err as Error).message}`);
    }

    if (perturbation && uniprotIds.length > 0) {
      try {
        kseaScores = await fetchKseaScores(
          uniprotIds,
          perturbation,
          cellLine,
          errors,
        );
      } catch (err) {
        errors.push(`KSEA lookup failed: ${(err as Error).message}`);
      }
    }

    const kseaFound = Object.keys(kseaScores).length;

    // Format KSEA results for the model: include z-score, p-value, n, and direction
    const kseaSummary = Object.entries(kseaScores).map(([id, r]) => {
      const candidate = candidates.find((c) => c.uniprotId === id);
      const name = candidate?.kinaseName ?? id;
      const absZ = Math.abs(r.zScore);
      const interpretation =
        absZ >= 2
          ? r.zScore > 0
            ? "strongly activated"
            : "strongly inhibited"
          : absZ >= 1
            ? r.zScore > 0
              ? "moderately activated"
              : "moderately inhibited"
            : "no significant change";
      const sig =
        r.pValue < 0.001
          ? "p<0.001"
          : r.pValue < 0.05
            ? `p=${r.pValue.toFixed(3)} (significant)`
            : `p=${r.pValue.toFixed(3)} (not significant)`;
      return `${name} (${id}): KSEA z-score=${r.zScore.toFixed(3)}, ${sig}, n=${r.n} substrates — ${interpretation} by ${perturbation} in ${r.cellLine}`;
    });

    const kseaErrors = errors.filter((e) => e.startsWith("KSEA"));
    const kseaNote = perturbation
      ? kseaFound > 0
        ? `KSEA results for ${perturbation} in ${cellLine}:\n${kseaSummary.join("\n")}`
        : kseaErrors.length > 0
          ? `KSEA API error for ${perturbation} in ${cellLine} (${kseaErrors.join("; ")}) — the data may exist but the KINEPIK server was temporarily unavailable. Do not say n=0; instead speculate based on known biology.`
          : `KSEA: no substrate data found in KINEPIK for ${perturbation} in ${cellLine} (n=0 substrates measured for this combination).`
      : "No perturbation specified — provide a drug/inhibitor name for KSEA analysis";

    const notes = [
      `Queried KINEPIK live API for: ${uniprotIds.join(", ")}`,
      candidates.length > 0
        ? `Kinase records found: ${candidates.map((c) => `${c.kinaseName} (${c.uniprotId}), ${c.phosphositeCount} known target phosphosites`).join("; ")}`
        : `No kinase records found for: ${uniprotIds.join(", ")}`,
      kseaNote,
      ...(errors.filter((e) => !e.startsWith("KSEA")).length
        ? [
            `Other errors: ${errors.filter((e) => !e.startsWith("KSEA")).join("; ")}`,
          ]
        : []),
    ].filter(Boolean);

    // Return only analysisNotes — raw objects are not needed by the model and waste tokens
    return { analysisNotes: notes };
  },
});
