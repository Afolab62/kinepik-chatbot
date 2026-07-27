// Tool: comparePerturbations — compares KSEA effects of one or more perturbations on kinases.

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
    if (KINEPIK_LOG_REQUESTS) {
      console.log(
        `[kinepik-request] tool=comparePerturbations endpoint=/perturbation/KSEA kinase_ids=${ids} perturbation=${perturbation} cell_line=${cellLine} weighted=true autophosphorylation=exclude phosphosite_confidence=1 url=${url}`,
      );
    }
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
        const pertRecord = pertData as Record<string, unknown>;
        const n = typeof pertRecord.n === "number" ? pertRecord.n : 0;
        if (n === 0) continue;
        const zScore =
          typeof pertRecord.WeightedZ_score === "number"
            ? pertRecord.WeightedZ_score
            : typeof pertRecord.z_score === "number"
              ? pertRecord.z_score
              : NaN;
        const pValue =
          typeof pertRecord.p_value === "number" ? pertRecord.p_value : NaN;
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
    const resolvedPerturbations: string[] = [];
    const invalidPerturbations: Array<{ input: string; suggestions: string[] }> = [];

    await Promise.all(
      perturbations.map(async (perturbation) => {
        const resolution = resolvePerturbationName(perturbation);
        if (!resolution.matched || !resolution.resolvedName) {
          invalidPerturbations.push({
            input: perturbation,
            suggestions: resolution.suggestions,
          });
          comparison[perturbation] = [];
          return;
        }

        const resolvedPerturbation = resolution.resolvedName;
        resolvedPerturbations.push(resolvedPerturbation);
        if (resolution.autoCorrected) {
          errors.push(
            `Perturbation name normalized from ${perturbation} to ${resolvedPerturbation}.`,
          );
        }

        try {
          comparison[resolvedPerturbation] = await fetchKseaForPerturbation(
            uniprotIds,
            resolvedPerturbation,
            cellLine,
          );
        } catch (err) {
          errors.push(`KSEA ${resolvedPerturbation}: ${(err as Error).message}`);
          comparison[resolvedPerturbation] = [];
        }
      }),
    );

    for (const invalid of invalidPerturbations) {
      errors.push(
        invalid.suggestions.length > 0
          ? `Unknown perturbation ${invalid.input}. Closest matches: ${invalid.suggestions.join(", ")}.`
          : `Unknown perturbation ${invalid.input}.`,
      );
    }

    return {
      cellLine,
      uniprotIds,
      perturbations: resolvedPerturbations,
      comparison,
      errors,
      invalidPerturbations,
      note: `Compared ${resolvedPerturbations.length} perturbation(s) in ${cellLine} for ${uniprotIds.join(", ")}.`,
    };
  },
});
