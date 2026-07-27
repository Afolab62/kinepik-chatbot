import { tool } from "ai";
import { z } from "zod";
import { topAffectedKinasesTool } from "./top-affected-kinases";

const querySchema = z.object({
  perturbation: z.string().min(1).describe("Perturbation or drug name."),
  cellLine: z
    .enum(["MCF7", "NTERA2", "HL60"])
    .default("MCF7")
    .describe("Cell line for the ranking query."),
  topN: z.number().min(1).max(50).default(10).describe("Number of kinases to return."),
  mode: z
    .enum(["absolute", "activated", "inhibited"])
    .default("absolute")
    .describe("Ranking mode for the KSEA analysis."),
});

export const batchRankKinasesTool = tool({
  description:
    "Run top-kinase ranking for several perturbation/cell-line queries in one call. " +
    "Use this when the user asks for batch analysis, multiple drugs, or a ranked comparison across several conditions.",
  inputSchema: z.object({
    queries: z
      .array(querySchema)
      .min(1)
      .max(10)
      .describe("A set of ranking requests to execute in parallel."),
  }),
  execute: async ({ queries }: { queries: z.infer<typeof querySchema>[] }) => {
    const results = await Promise.all(
      queries.map(async (query) => {
        const executeTool = topAffectedKinasesTool.execute;
        const outcome = executeTool
          ? await executeTool(
              {
                perturbation: query.perturbation,
                cellLine: query.cellLine,
                topN: query.topN,
                mode: query.mode,
                concurrency: 3,
              },
              {
                toolCallId: `batch-${query.perturbation}-${query.cellLine}`,
                messages: [],
              },
            )
          : null;

        return {
          perturbation: query.perturbation,
          cellLine: query.cellLine,
          topN: query.topN,
          mode: query.mode,
          result: outcome,
        };
      }),
    );

    return {
      queryCount: results.length,
      results,
      note: "Batch ranking completed. Each result contains a true KINEPIK ranking for the requested perturbation/cell-line combination.",
    };
  },
});
