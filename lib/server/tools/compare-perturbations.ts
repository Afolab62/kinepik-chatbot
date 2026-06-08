// Tool: comparePerturbations — compares KSEA effects of one or more perturbations on kinases.

import { tool } from "ai";
import { z } from "zod";

const KINEPIK_API = "https://kinepik.org/api/0";

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

interface PerturbationResult {
  perturbation: string;
  kinaseId: string;
  zScore: number;
  pValue: number;
  n: number;
  direction: string;
}

async function fetchKseaForPerturbation(
  uniprotIds: string[],
  perturbation: string,
  cellLine: string,
): Promise<PerturbationResult[]> {
  const ids = uniprotIds.join(",");
  const url =
    `${KINEPIK_API}/perturbation/KSEA` +
    `?kinase_ids=${encodeURIComponent(ids)}` +
    `&perturbations=${encodeURIComponent(perturbation)}` +
    `&cell_line=${encodeURIComponent(cellLine)}` +
    `&weighted=true&autophosphorylation=exclude&phosphosite_confidence=1`;

  const { signal, clear } = withTimeout(15000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) throw new Error(`KSEA request returned ${res.status}`);
    const data = await res.json();
    const items: unknown[] = Array.isArray(data?.value)
      ? (data.value as unknown[])
      : Array.isArray(data)
        ? (data as unknown[])
        : [];
    const results: PerturbationResult[] = [];
    for (const item of items) {
      if (typeof item !== "object" || item === null) continue;
      const entry = item as Record<string, unknown>;
      for (const kinaseId of uniprotIds) {
        const kinaseData = entry[kinaseId];
        if (typeof kinaseData !== "object" || kinaseData === null) continue;
        const pertData = (kinaseData as Record<string, unknown>)[perturbation];
        if (typeof pertData !== "object" || pertData === null) continue;
        const n = typeof pertData.n === "number" ? pertData.n : 0;
        if (n === 0) continue;
        const zScore =
          typeof pertData.WeightedZ_score === "number"
            ? pertData.WeightedZ_score
            : typeof pertData.z_score === "number"
              ? pertData.z_score
              : NaN;
        const pValue =
          typeof pertData.p_value === "number" ? pertData.p_value : NaN;
        if (Number.isFinite(zScore)) {
          const absZ = Math.abs(zScore);
          const direction =
            absZ >= 2
              ? zScore > 0
                ? "strong activation"
                : "strong inhibition"
              : absZ >= 1
                ? zScore > 0
                  ? "moderate activation"
                  : "moderate inhibition"
                : "no significant change";
          results.push({
            perturbation,
            kinaseId,
            zScore,
            pValue,
            n,
            direction,
          });
        }
      }
    }
    return results;
  } finally {
    clear();
  }
}

export const comparePerturbationsTool = tool({
  description:
    "Compare KSEA effects for one or more perturbations on a set of kinase UniProt IDs in a single cell line. " +
    "Use this when the user asks how different drugs affect the same kinases, or to compare inhibitor effects in MCF7, NTERA2, or HL60.",
  inputSchema: z.object({
    uniprotIds: z
      .array(z.string())
      .min(1)
      .max(10)
      .describe("UniProt IDs of kinases to compare."),
    perturbations: z
      .array(z.string())
      .min(1)
      .max(4)
      .describe("One or more perturbation names to compare."),
    cellLine: z
      .enum(["MCF7", "NTERA2", "HL60"])
      .optional()
      .default("MCF7")
      .describe("Cell line for the comparison."),
  }),
  execute: async ({
    uniprotIds,
    perturbations,
    cellLine = "MCF7",
  }: {
    uniprotIds: string[];
    perturbations: string[];
    cellLine: "MCF7" | "NTERA2" | "HL60";
  }) => {
    const comparison: Record<string, PerturbationResult[]> = {};
    const errors: string[] = [];

    await Promise.all(
      perturbations.map(async (perturbation) => {
        try {
          comparison[perturbation] = await fetchKseaForPerturbation(
            uniprotIds,
            perturbation,
            cellLine,
          );
        } catch (err) {
          errors.push(`KSEA ${perturbation}: ${(err as Error).message}`);
          comparison[perturbation] = [];
        }
      }),
    );

    return {
      cellLine,
      uniprotIds,
      perturbations,
      comparison,
      errors,
      note: `Compared ${perturbations.length} perturbation(s) in ${cellLine} for ${uniprotIds.join(", ")}.`,
    };
  },
});
