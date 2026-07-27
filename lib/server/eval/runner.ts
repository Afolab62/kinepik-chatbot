import { generateText, stepCountIs } from "ai";
import { getOpenAIModel, getWebSearchTools, validateApiKey } from "@/lib/server/openai";
import { SYSTEM_PROMPT } from "@/lib/server/prompts";
import { chatTools } from "@/lib/server/tools";
import type { BenchmarkCase, BenchmarkResult, ToolTrace } from "./metrics";
import {
  evaluateBenchmarkCase,
  formatBenchmarkSummary,
  summarizeBenchmarks,
} from "./metrics";

interface RunOptions {
  filter?: string;
}

export interface BenchmarkSuiteReport {
  results: BenchmarkResult[];
  summaryText: string;
}

function buildWrappedTools(toolTraces: ToolTrace[]) {
  const webSearchTools = getWebSearchTools();
  const tools = webSearchTools ? { ...chatTools, ...webSearchTools } : chatTools;
  const wrappedTools: Record<string, any> = {};

  for (const [toolName, tool] of Object.entries(tools)) {
    const originalExecute = tool.execute as
      | ((input: unknown, options: unknown) => Promise<unknown> | unknown)
      | undefined;
    wrappedTools[toolName] = {
      ...tool,
      execute: async (input: unknown, options: unknown) => {
        try {
          if (!originalExecute) {
            throw new Error(`Tool ${toolName} does not implement execute().`);
          }
          const output = await originalExecute(input, options);
          toolTraces.push({ toolName, input, output, success: true });
          return output;
        } catch (error) {
          toolTraces.push({
            toolName,
            input,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    };
  }

  return wrappedTools;
}

export async function runBenchmark(benchmarkCase: BenchmarkCase): Promise<BenchmarkResult> {
  const toolTraces: ToolTrace[] = [];
  const tools = buildWrappedTools(toolTraces);
  const result = await generateText({
    model: getOpenAIModel(),
    system: SYSTEM_PROMPT,
    prompt: benchmarkCase.userQuery,
    tools,
    stopWhen: stepCountIs(5),
  });

  return evaluateBenchmarkCase(benchmarkCase, {
    responseText: result.text,
    toolTraces,
  });
}

export async function runBenchmarkSuite(
  benchmarkCases: BenchmarkCase[],
  options: RunOptions = {},
): Promise<BenchmarkSuiteReport> {
  const { valid, error } = validateApiKey();
  if (!valid) {
    throw new Error(error);
  }

  const selectedCases = options.filter
    ? benchmarkCases.filter(
        (benchmarkCase) =>
          benchmarkCase.id.includes(options.filter!) ||
          benchmarkCase.category.includes(options.filter!),
      )
    : benchmarkCases;

  const results: BenchmarkResult[] = [];
  for (const benchmarkCase of selectedCases) {
    results.push(await runBenchmark(benchmarkCase));
  }

  return {
    results,
    summaryText: formatBenchmarkSummary(summarizeBenchmarks(results)),
  };
}