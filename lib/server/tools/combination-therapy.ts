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

interface KseaObservation {
  perturbation: string;
  zScore: number;
  pValue: number;
  n: number;
  direction: string;
  hasData: boolean;
}

interface CombinationEstimate {
  kinaseId: string;
  directEvidence: KseaObservation[];
  inferredCombinedEffect: {
    combinedZScore: number;
    direction: string;
    label: string;
    rationale: string;
  };
  confidence: "high" | "medium" | "low";
}

async function fetchKseaForPerturbation(
  uniprotIds: string[],
  perturbation: string,
  cellLine: string,
): Promise<Record<string, KseaObservation>> {
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
        `[kinepik-request] tool=analyzeCombinationTherapy endpoint=/perturbation/KSEA kinase_ids=${ids} perturbation=${perturbation} cell_line=${cellLine} weighted=true autophosphorylation=exclude phosphosite_confidence=1 url=${url}`,
      );
    }
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

    const observations: Record<string, KseaObservation> = {};
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
        if (!Number.isFinite(zScore)) continue;

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

        observations[kinaseId] = {
          perturbation,
          zScore,
          pValue,
          n,
          direction,
          hasData: true,
        };
      }
    }

    return observations;
  } finally {
    clear();
  }
}

function classifyDirection(zScore: number): string {
  const absZ = Math.abs(zScore);
  if (absZ >= 2) return zScore > 0 ? "strong activation" : "strong inhibition";
  if (absZ >= 1) return zScore > 0 ? "moderate activation" : "moderate inhibition";
  return "no significant change";
}

function inferConfidence(observations: KseaObservation[]): "high" | "medium" | "low" {
  const available = observations.filter((obs) => obs.hasData);
  if (available.length === 0) return "low";
  const significant = available.filter((obs) => Math.abs(obs.zScore) >= 1);
  const sameDirection = available.every((obs) => obs.zScore > 0) || available.every((obs) => obs.zScore < 0);
  if (sameDirection && significant.length === available.length) return "high";
  if (available.length >= 2 && significant.length >= 1) return "medium";
  return "low";
}

export const analyzeCombinationTherapyTool = tool({
  description:
    "Reason about combination therapy effects by comparing individual KSEA profiles for two or more perturbations and estimating a combined effect per kinase. " +
    "Use this when the user asks about combination treatments, dual inhibition, or likely combined drug effects.",
  inputSchema: z.object({
    uniprotIds: z
      .array(z.string())
      .min(1)
      .max(10)
      .describe("UniProt IDs of kinases to evaluate."),
    perturbations: z
      .array(z.string())
      .min(2)
      .max(4)
      .describe("Two or more perturbation names to compare."),
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
    const evidenceByKinase: Record<string, KseaObservation[]> = {};
    const errors: string[] = [];
    const resolvedPerturbations: string[] = [];
    const invalidPerturbations: Array<{ input: string; suggestions: string[] }> = [];

    for (const perturbation of perturbations) {
      const resolution = resolvePerturbationName(perturbation);
      if (!resolution.matched || !resolution.resolvedName) {
        invalidPerturbations.push({
          input: perturbation,
          suggestions: resolution.suggestions,
        });
        continue;
      }

      const resolvedPerturbation = resolution.resolvedName;
      resolvedPerturbations.push(resolvedPerturbation);
      if (resolution.autoCorrected) {
        errors.push(
          `Perturbation name normalized from ${perturbation} to ${resolvedPerturbation}.`,
        );
      }

      try {
        const observations = await fetchKseaForPerturbation(
          uniprotIds,
          resolvedPerturbation,
          cellLine,
        );
        for (const kinaseId of uniprotIds) {
          const observation = observations[kinaseId];
          if (observation) {
            evidenceByKinase[kinaseId] = evidenceByKinase[kinaseId] ?? [];
            evidenceByKinase[kinaseId].push(observation);
          }
        }
      } catch (err) {
        errors.push(`KSEA ${resolvedPerturbation}: ${(err as Error).message}`);
      }
    }

    for (const invalid of invalidPerturbations) {
      errors.push(
        invalid.suggestions.length > 0
          ? `Unknown perturbation ${invalid.input}. Closest matches: ${invalid.suggestions.join(", ")}.`
          : `Unknown perturbation ${invalid.input}.`,
      );
    }

    const estimates: CombinationEstimate[] = [];
    for (const kinaseId of uniprotIds) {
      const directEvidence = (evidenceByKinase[kinaseId] ?? []).map((obs) => ({
        ...obs,
        hasData: true,
      }));

      const validScores = directEvidence.filter((obs) => obs.hasData);
      const combinedZScore = validScores.reduce((sum, obs) => sum + obs.zScore, 0);
      const averageZScore = validScores.length > 0 ? combinedZScore / validScores.length : 0;
      const sameDirection = validScores.every((obs) => obs.zScore > 0) || validScores.every((obs) => obs.zScore < 0);
      const direction = classifyDirection(averageZScore);
      let label = "mixed or uncertain";
      let rationale = "No direct KINEPIK combination experiment was available; the estimate combines the individual perturbation profiles.";

      if (validScores.length === 0) {
        label = "no direct evidence";
        rationale = "No KINEPIK data was available for this kinase under the requested perturbations.";
      } else if (sameDirection && validScores.every((obs) => Math.abs(obs.zScore) >= 1)) {
        label = "likely stronger combined effect";
        rationale = "Each perturbation drives the same direction, so the combined profile is inferred to reinforce the same biological effect.";
      } else if (sameDirection && validScores.some((obs) => Math.abs(obs.zScore) < 1)) {
        label = "partially reinforced";
        rationale = "The perturbations are directionally consistent, but at least one profile is weak or non-significant.";
      } else if (validScores.some((obs) => obs.zScore > 0) && validScores.some((obs) => obs.zScore < 0)) {
        label = "likely offsetting effect";
        rationale = "The perturbations push the kinase in opposing directions, so the combined effect is inferred to be partially offsetting.";
      }

      estimates.push({
        kinaseId,
        directEvidence,
        inferredCombinedEffect: {
          combinedZScore: Number(averageZScore.toFixed(4)),
          direction,
          label,
          rationale,
        },
        confidence: inferConfidence(validScores),
      });
    }

    return {
      cellLine,
      perturbations: resolvedPerturbations,
      uniprotIds,
      estimates,
      errors,
      invalidPerturbations,
      note: "This tool does not claim a direct measured combination experiment. It infers a likely combined effect from the individual KSEA profiles and labels the result as an estimate.",
    };
  },
});
