// Tool: analyzeKinase — queries the live KINEPIK API (kinepik.org/api/0) for real kinase data.

import { tool } from "ai";
import { z } from "zod";
import type { KinaseCandidate } from "@/lib/types/kinepik";
import { resolvePerturbationName } from "./perturbation-catalog";

const KINEPIK_API = "https://kinepik.org/api/0";
const KINEPIK_LOG_REQUESTS = process.env.KINEPIK_LOG_REQUESTS === "true";

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

export function parseKinepikJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // KINEPIK occasionally emits non-JSON numeric tokens like NaN/Infinity.
    // Replace them with null so the rest of the payload remains parseable.
    const normalized = raw
      .replace(/\b-?Infinity\b/g, "null")
      .replace(/\bNaN\b/g, "null");
    return JSON.parse(normalized);
  }
}

async function fetchKseaScores(
  uniprotIds: string[],
  perturbation: string,
  cellLine: string,
  useWeightedZScore: boolean,
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
          `&weighted=${useWeightedZScore}&autophosphorylation=exclude&phosphosite_confidence=1`;
        if (KINEPIK_LOG_REQUESTS) {
          console.log(
            `[kinepik-request] tool=analyzeKinase endpoint=/perturbation/KSEA kinase_ids=${id} perturbation=${perturbation} cell_line=${cellLine} weighted=${useWeightedZScore} autophosphorylation=exclude phosphosite_confidence=1 url=${url}`,
          );
        }
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal,
        });
        clear();
        if (!res.ok) {
          errors.push(`KSEA ${id}: HTTP ${res.status}`);
          return;
        }
        const text = await res.text();
        const data = parseKinepikJson(text);
        // Weighted response: { value: [{ "P00533": { "AZD3759": { WeightedZ_score, n, p_value } } }], Count: N }
        // Unweighted response (fallback): plain array [{ "Q15208": { "AZD3759": { z_score, n, p_value } } }]
        const parsed = data as any;
        const entries: Record<string, unknown>[] = Array.isArray(parsed?.value)
          ? parsed.value
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
          // weighted=true usually returns WeightedZ_score, but some payloads
          // only include z_score. Fall back so valid records are not dropped.
          const zScore = useWeightedZScore
            ? (pertData.WeightedZ_score ?? pertData.z_score)
            : pertData.z_score;
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
    "Query the live KINEPIK database (kinepik.org) for real kinase data, phosphorylation sites, substrate targets, and KSEA enrichment scores. " +
    "Use this when the user asks about kinases, phosphorylation, substrate targets, inhibitors, or signalling pathways. " +
    "If the user asks which proteins or phosphosites a kinase targets, call this tool with only the kinase UniProt ID and omit perturbation. " +
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
        'Optional inhibitor or perturbation name for KSEA analysis. Omit this field entirely for target/substrate-only questions. When provided, it must match the exact name in KINEPIK — use the drug\'s common name as a single word (e.g. "AZD3759", "Gefitinib", "Erlotinib"). ' +
          'Note: "Rapamycin" has no substrate measurements for mTOR in KINEPIK — try "AZD3759" or other inhibitors instead.',
      ),
    cellLine: z
      .enum(["MCF7", "NTERA2", "HL60"])
      .optional()
      .describe("Cell line for experimental data context. Defaults to MCF7."),
    useWeightedZScore: z
      .boolean()
      .optional()
      .describe(
        "Use weighted z-scores (default: true). When false, returns unweighted z-scores. Weighted scores incorporate substrate quality weights; unweighted scores treat all substrates equally.",
      ),
  }),
  execute: async ({
    uniprotIds,
    perturbation,
    cellLine = "MCF7",
    useWeightedZScore = true,
  }: {
    uniprotIds: string[];
    perturbation?: string;
    cellLine?: "MCF7" | "NTERA2" | "HL60";
    useWeightedZScore?: boolean;
  }) => {
    let candidates: KinaseCandidate[] = [];
    let kseaScores: Record<string, KseaResult> = {};
    const errors: string[] = [];
    let resolvedPerturbation = perturbation;

    try {
      candidates = await fetchKinaseInfo(uniprotIds);
    } catch (err) {
      errors.push(`Kinase lookup failed: ${(err as Error).message}`);
    }

    if (perturbation && uniprotIds.length > 0) {
      const resolution = resolvePerturbationName(perturbation);
      if (!resolution.matched || !resolution.resolvedName) {
        const suggestions =
          resolution.suggestions.length > 0
            ? ` Closest matches: ${resolution.suggestions.join(", ")}.`
            : "";
        return {
          analysisNotes: [
            `The perturbation \"${perturbation}\" is not in the local KINEPIK perturbation catalogue.${suggestions}`,
            `Use one of the exact perturbation names from listPerturbations before requesting KSEA values.`,
          ],
          resolvedPerturbation: null,
          perturbationSuggestions: resolution.suggestions,
        };
      }

      resolvedPerturbation = resolution.resolvedName;
      if (resolution.autoCorrected && resolvedPerturbation) {
        errors.push(
          `Perturbation name normalized from ${perturbation} to ${resolvedPerturbation}.`,
        );
      }

      try {
        kseaScores = await fetchKseaScores(
          uniprotIds,
          resolvedPerturbation,
          cellLine,
          useWeightedZScore,
          errors,
        );
      } catch (err) {
        errors.push(`KSEA lookup failed: ${(err as Error).message}`);
      }
    }

    const kseaFound = Object.keys(kseaScores).length;
    const zScoreMethod = useWeightedZScore ? "weighted" : "unweighted";

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
      return `${name} (${id}): ${zScoreMethod} KSEA z-score=${r.zScore.toFixed(4)}, ${sig}, n=${r.n} substrates — ${interpretation} by ${perturbation} in ${r.cellLine}`;
    });

    const kseaErrors = errors.filter((e) => e.startsWith("KSEA"));
    const kseaNote = perturbation
      ? kseaFound > 0
        ? `KSEA results for ${resolvedPerturbation} in ${cellLine} (${zScoreMethod} z-scores):\n${kseaSummary.join("\n")}`
        : kseaErrors.length > 0
          ? `KSEA API error for ${resolvedPerturbation} in ${cellLine} (${kseaErrors.join("; ")}) — this appears to be a malformed upstream KINEPIK payload rather than an unknown perturbation. Do not say n=0; provide brief biological context in natural wording.`
          : `KSEA: no substrate data found in KINEPIK for ${resolvedPerturbation} in ${cellLine} (n=0 substrates measured for this combination).`
      : "Substrate-only lookup: no perturbation or cell-line filter was requested, so this result reflects kinase-target records rather than treatment-specific KSEA analysis.";

    const notes = [
      `Queried KINEPIK live API for: ${uniprotIds.join(", ")}`,
      candidates.length > 0
        ? `Kinase records found: ${candidates.map((c) => `${c.kinaseName} (${c.uniprotId}), ${c.phosphositeCount} known target phosphosites${c.substrate ? ` (examples: ${c.substrate})` : ""}`).join("; ")}`
        : `No kinase records found for: ${uniprotIds.join(", ")}`,
      kseaNote,
      ...(errors.filter((e) => !e.startsWith("KSEA")).length
        ? [
            `Other errors: ${errors.filter((e) => !e.startsWith("KSEA")).join("; ")}`,
          ]
        : []),
    ].filter(Boolean);

    // Return only analysisNotes — raw objects are not needed by the model and waste tokens
    return { analysisNotes: notes, resolvedPerturbation };
  },
});
