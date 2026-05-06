// Tool: listPerturbations — fetches all available perturbations from KINEPIK.
// Used to discover valid drug/inhibitor names before running KSEA queries.

import { tool } from "ai";
import { z } from "zod";

const KINEPIK_API = "https://kinepik.org/api/0";

export const listPerturbationsTool = tool({
  description:
    "List all perturbations (inhibitors, drugs, gene knockouts) available in the KINEPIK database. " +
    "Use this BEFORE calling analyzeKinase with a perturbation, to discover the exact drug names available. " +
    'Filter by type: "small_molecule" for drugs/inhibitors, "knockout" for gene knockouts.',
  inputSchema: z.object({
    type: z
      .enum(["small_molecule", "knockout", "all"])
      .optional()
      .default("small_molecule")
      .describe(
        'Type of perturbation to list. Use "small_molecule" for drugs/inhibitors.',
      ),
  }),
  execute: async ({
    type = "small_molecule",
  }: {
    type?: "small_molecule" | "knockout" | "all";
  }) => {
    const url =
      type === "all"
        ? `${KINEPIK_API}/perturbation/all`
        : `${KINEPIK_API}/perturbation/all?type=${type}`;

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok)
      throw new Error(`KINEPIK /perturbation/all returned ${res.status}`);

    const data = await res.json();

    // Response is an array of perturbation objects or strings
    const items: unknown[] = Array.isArray(data?.value)
      ? data.value
      : Array.isArray(data)
        ? data
        : [];

    // Extract names — the API may return objects or plain strings
    const names: string[] = items.map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        return String(
          obj.name ??
            obj.PerturbationName ??
            obj.perturbation ??
            obj.id ??
            JSON.stringify(item),
        );
      }
      return String(item);
    });

    return {
      type,
      count: names.length,
      perturbations: names,
      note: `These are the exact names to use in the analyzeKinase tool's perturbation field.`,
    };
  },
});
