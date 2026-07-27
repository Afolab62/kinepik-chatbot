/**
 * Direct tool testing — bypass the chat endpoint and call tools directly.
 * Run: node -r tsx lib/server/test-tools.ts
 */

import { chatTools } from "./tools/index";

async function executeTool(
  toolName: string,
  execute:
    | ((
        input: unknown,
        options: { toolCallId: string; messages: [] },
      ) => unknown)
    | undefined,
  input: unknown,
): Promise<unknown> {
  if (!execute) {
    throw new Error(`Tool ${toolName} does not implement execute().`);
  }
  return await execute(input, { toolCallId: `${toolName}-test`, messages: [] });
}

async function testTopAffectedKinases() {
  console.log("\n=== TEST: Top Affected Kinases ===");
  try {
    const result = await executeTool(
      "getTopAffectedKinases",
      chatTools.getTopAffectedKinases.execute as
        | ((input: unknown, options: { toolCallId: string; messages: [] }) => unknown)
        | undefined,
      {
      perturbation: "AZD3759",
      cellLine: "MCF7",
      topN: 5,
      mode: "absolute",
      concurrency: 3,
      },
    );
    console.log("✅ Success:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

async function testAnalyzeKinase() {
  console.log("\n=== TEST: Analyze Single Kinase ===");
  try {
    const result = await executeTool(
      "analyzeKinase",
      chatTools.analyzeKinase.execute as
        | ((input: unknown, options: { toolCallId: string; messages: [] }) => unknown)
        | undefined,
      {
      uniprotIds: ["P00533"],
      perturbation: "AZD3759",
      cellLine: "MCF7",
      },
    );
    console.log("✅ Success:");
    console.log(JSON.stringify(result, null, 2).substring(0, 500));
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

async function testComparePerturbations() {
  console.log("\n=== TEST: Compare Perturbations ===");
  try {
    const result = await executeTool(
      "comparePerturbations",
      chatTools.comparePerturbations.execute as
        | ((input: unknown, options: { toolCallId: string; messages: [] }) => unknown)
        | undefined,
      {
      uniprotIds: ["P00533", "P42345"],
      perturbations: ["AZD3759", "Rapamycin"],
      cellLine: "MCF7",
      },
    );
    console.log("✅ Success:");
    console.log(JSON.stringify(result, null, 2).substring(0, 500));
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

async function main() {
  console.log("🧪 Direct Tool Tests — No LLM, No Hallucination\n");
  await testTopAffectedKinases();
  await testAnalyzeKinase();
  await testComparePerturbations();
  console.log("\n✅ All tests completed. Check output above.");
}

main().catch(console.error);
