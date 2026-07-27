/**
 * Production-aligned evaluation harness for KINEPIK chat behavior.
 *
 * Examples:
 * - pnpm eval:benchmarks
 * - pnpm eval:benchmarks -- --filter intent-routing
 * - pnpm eval:benchmarks -- --list
 */

import { KINEPIK_BENCHMARKS } from "./benchmarks";
import { runBenchmarkSuite } from "./runner";

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  if (process.argv.includes("--list")) {
    for (const benchmarkCase of KINEPIK_BENCHMARKS) {
      console.log(`${benchmarkCase.id}\t${benchmarkCase.category}\t${benchmarkCase.userQuery}`);
    }
    return;
  }

  const filter = readFlag("--filter");
  const report = await runBenchmarkSuite(KINEPIK_BENCHMARKS, { filter });

  console.log(report.summaryText);
  console.log("");

  for (const result of report.results) {
    console.log(
      `${result.passed ? "PASS" : "FAIL"} ${result.caseId} [${result.category}] tools=${result.toolNames.join(", ") || "none"}`,
    );
    console.log(
      `  intent=${result.scores.intent.score.toFixed(2)} functionCalling=${result.scores.functionCalling.score.toFixed(2)} factuality=${result.scores.factuality.score.toFixed(2)} hallucinationMitigation=${result.scores.hallucinationMitigation.score.toFixed(2)} responseCoverage=${result.scores.responseCoverage.score.toFixed(2)}`,
    );
    if (result.notes.length > 0) {
      for (const note of result.notes) {
        console.log(`  - ${note}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});