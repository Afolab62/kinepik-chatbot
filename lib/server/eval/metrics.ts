export interface ToolArgumentExpectation {
  tool: string;
  path: string;
  equals?: string | number | boolean;
  includes?: Array<string | number | boolean>;
}

export interface BenchmarkCase {
  id: string;
  category:
    | "rag-factuality"
    | "hallucination-mitigation"
    | "intent-routing"
    | "function-calling";
  userQuery: string;
  requiredTools?: string[];
  forbiddenTools?: string[];
  expectedArguments?: ToolArgumentExpectation[];
  expectedResponseSubstrings?: string[];
  requiresToolEvidence?: boolean;
  allowsSpeculation?: boolean;
  notes?: string;
}

export interface ToolTrace {
  toolName: string;
  input: unknown;
  output?: unknown;
  success: boolean;
  error?: string;
}

export interface BenchmarkObservation {
  responseText: string;
  toolTraces: ToolTrace[];
}

export interface MetricScore {
  score: number;
  passed: boolean;
  notes: string[];
}

export interface BenchmarkScores {
  intent: MetricScore;
  functionCalling: MetricScore;
  factuality: MetricScore;
  hallucinationMitigation: MetricScore;
  responseCoverage: MetricScore;
}

export interface BenchmarkResult {
  caseId: string;
  category: BenchmarkCase["category"];
  passed: boolean;
  responseText: string;
  toolNames: string[];
  scores: BenchmarkScores;
  unsupportedNumericClaims: number[];
  notes: string[];
}

export interface BenchmarkSummary {
  total: number;
  passed: number;
  passRate: number;
  averageIntentAccuracy: number;
  averageFunctionCallingReliability: number;
  averageRagFactuality: number;
  averageHallucinationMitigation: number;
  averageResponseCoverage: number;
}

const PASS_THRESHOLD = 0.8;
const RESPONSE_COVERAGE_THRESHOLD = 0.75;
const NUMERIC_TOLERANCE = 0.011;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function getPathValue(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current == null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      return current[Number(segment)];
    }
    if (typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

function normalizeTextForClaims(text: string): string {
  return text.replace(/^\s*\d+\.\s+/gm, "");
}

function extractNumericClaims(text: string): number[] {
  const normalized = normalizeTextForClaims(text);
  const matches = normalized.match(
    /(?<![A-Za-z])[-+]?\d*\.?\d+(?:e[-+]?\d+)?(?![A-Za-z])/gi,
  );

  return (matches ?? [])
    .map((match) => Number(match))
    .filter((value) => Number.isFinite(value));
}

function collectSupportedNumericValues(value: unknown): number[] {
  if (typeof value === "number") {
    return Number.isFinite(value) ? [value] : [];
  }

  if (typeof value === "string") {
    return extractNumericClaims(value);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSupportedNumericValues(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((item) => collectSupportedNumericValues(item));
  }

  return [];
}

function approximatelyMatches(value: number, supported: number): boolean {
  const difference = Math.abs(value - supported);
  const relativeTolerance = Math.abs(supported) * 0.02;
  return difference <= Math.max(NUMERIC_TOLERANCE, relativeTolerance);
}

function dedupeNumbers(values: number[]): number[] {
  return values.reduce<number[]>((unique, value) => {
    if (unique.some((candidate) => approximatelyMatches(candidate, value))) {
      return unique;
    }
    unique.push(value);
    return unique;
  }, []);
}

function evaluateIntentAccuracy(
  benchmarkCase: BenchmarkCase,
  toolNames: string[],
): MetricScore {
  const requiredTools = benchmarkCase.requiredTools ?? [];
  const forbiddenTools = benchmarkCase.forbiddenTools ?? [];

  if (requiredTools.length === 0 && forbiddenTools.length === 0) {
    return { score: 1, passed: true, notes: [] };
  }

  const matchedRequired = requiredTools.filter((tool) => toolNames.includes(tool));
  const forbiddenUsed = forbiddenTools.filter((tool) => toolNames.includes(tool));
  const requiredCoverage =
    requiredTools.length === 0 ? 1 : matchedRequired.length / requiredTools.length;
  const forbiddenPenalty =
    forbiddenTools.length === 0 ? 0 : forbiddenUsed.length / forbiddenTools.length;
  const score = clampScore(requiredCoverage - forbiddenPenalty);
  const notes: string[] = [];

  if (matchedRequired.length !== requiredTools.length) {
    const missing = requiredTools.filter((tool) => !matchedRequired.includes(tool));
    notes.push(`Missing required tool routing: ${missing.join(", ")}`);
  }

  if (forbiddenUsed.length > 0) {
    notes.push(`Forbidden tools were used: ${forbiddenUsed.join(", ")}`);
  }

  return {
    score,
    passed: score >= PASS_THRESHOLD,
    notes,
  };
}

function evaluateFunctionCallingReliability(
  benchmarkCase: BenchmarkCase,
  toolTraces: ToolTrace[],
): MetricScore {
  const requiredTools = benchmarkCase.requiredTools ?? [];
  const toolNames = toolTraces.map((trace) => trace.toolName);
  const successfulCalls = toolTraces.filter((trace) => trace.success).length;
  const callSuccessRate =
    toolTraces.length === 0
      ? requiredTools.length === 0
        ? 1
        : 0
      : successfulCalls / toolTraces.length;
  const requiredCoverage =
    requiredTools.length === 0
      ? 1
      : requiredTools.filter((tool) => toolNames.includes(tool)).length / requiredTools.length;

  const argumentExpectations = benchmarkCase.expectedArguments ?? [];
  const argumentMatches = argumentExpectations.filter((expectation) => {
    const trace = toolTraces.find((candidate) => candidate.toolName === expectation.tool);
    if (!trace) return false;

    const value = getPathValue(trace.input, expectation.path);
    if (expectation.equals !== undefined) {
      return value === expectation.equals;
    }

    if (expectation.includes) {
      if (!Array.isArray(value)) return false;
      return expectation.includes.every((item) => value.includes(item));
    }

    return value !== undefined;
  }).length;

  const argumentCoverage =
    argumentExpectations.length === 0 ? 1 : argumentMatches / argumentExpectations.length;
  const score = clampScore((callSuccessRate + requiredCoverage + argumentCoverage) / 3);
  const notes: string[] = [];

  if (toolTraces.some((trace) => !trace.success)) {
    const failedTools = toolTraces
      .filter((trace) => !trace.success)
      .map((trace) => `${trace.toolName}: ${trace.error ?? "unknown error"}`);
    notes.push(`Tool execution failures: ${failedTools.join("; ")}`);
  }

  if (argumentCoverage < 1) {
    notes.push("One or more expected tool arguments were missing or incorrect.");
  }

  return {
    score,
    passed: score >= PASS_THRESHOLD,
    notes,
  };
}

function evaluateRagFactuality(
  benchmarkCase: BenchmarkCase,
  observation: BenchmarkObservation,
): { metric: MetricScore; unsupportedNumericClaims: number[] } {
  const toolSupportedNumbers = dedupeNumbers(
    observation.toolTraces
      .filter((trace) => trace.success)
      .flatMap((trace) => collectSupportedNumericValues(trace.output)),
  );
  const responseNumbers = dedupeNumbers(extractNumericClaims(observation.responseText));
  const unsupportedNumericClaims = responseNumbers.filter(
    (claim) =>
      !toolSupportedNumbers.some((supported) => approximatelyMatches(claim, supported)),
  );

  const numbersScore =
    responseNumbers.length === 0
      ? benchmarkCase.requiresToolEvidence
        ? observation.toolTraces.some((trace) => trace.success)
          ? 1
          : 0
        : 1
      : clampScore((responseNumbers.length - unsupportedNumericClaims.length) / responseNumbers.length);

  const evidenceScore = benchmarkCase.requiresToolEvidence
    ? observation.toolTraces.some((trace) => trace.success)
      ? 1
      : 0
    : 1;

  const score = clampScore((numbersScore + evidenceScore) / 2);
  const notes: string[] = [];

  if (unsupportedNumericClaims.length > 0) {
    notes.push(
      `Unsupported numeric claims in response: ${unsupportedNumericClaims.join(", ")}`,
    );
  }

  if (benchmarkCase.requiresToolEvidence && evidenceScore === 0) {
    notes.push("Expected tool evidence was not produced for a KINEPIK-grounded query.");
  }

  return {
    metric: {
      score,
      passed: score >= PASS_THRESHOLD,
      notes,
    },
    unsupportedNumericClaims,
  };
}

function evaluateHallucinationMitigation(
  benchmarkCase: BenchmarkCase,
  observation: BenchmarkObservation,
  unsupportedNumericClaims: number[],
): MetricScore {
  const usedSuccessfulTool = observation.toolTraces.some((trace) => trace.success);
  const lower = observation.responseText.toLowerCase();
  const speculativePrefixPresent =
    lower.includes("based on known biology") ||
    lower.includes("biologically") ||
    lower.includes("mechanistically") ||
    lower.includes("from a pathway perspective") ||
    lower.includes("biological context") ||
    observation.responseText.includes("I cannot reliably query") ||
    observation.responseText.includes("I am not certain of the UniProt ID");

  const mitigationSatisfied = benchmarkCase.requiresToolEvidence
    ? usedSuccessfulTool || (benchmarkCase.allowsSpeculation && speculativePrefixPresent)
    : true;
  const score = clampScore(
    ((unsupportedNumericClaims.length === 0 ? 1 : 0) + (mitigationSatisfied ? 1 : 0)) / 2,
  );
  const notes: string[] = [];

  if (unsupportedNumericClaims.length > 0) {
    notes.push("Response included unsupported quantitative claims.");
  }

  if (!mitigationSatisfied) {
    notes.push(
      "Missing mitigation: expected either a successful KINEPIK tool call or explicitly labeled speculation.",
    );
  }

  return {
    score,
    passed: score >= PASS_THRESHOLD,
    notes,
  };
}

function evaluateResponseCoverage(
  benchmarkCase: BenchmarkCase,
  responseText: string,
): MetricScore {
  const expected = benchmarkCase.expectedResponseSubstrings ?? [];
  if (expected.length === 0) {
    return { score: 1, passed: true, notes: [] };
  }

  const normalized = responseText.toLowerCase();
  const matched = expected.filter((fragment) =>
    normalized.includes(fragment.toLowerCase()),
  );
  const score = clampScore(matched.length / expected.length);
  const missing = expected.filter((fragment) => !matched.includes(fragment));

  return {
    score,
    passed: score >= RESPONSE_COVERAGE_THRESHOLD,
    notes:
      missing.length > 0
        ? [`Missing expected response evidence: ${missing.join(" | ")}`]
        : [],
  };
}

export function evaluateBenchmarkCase(
  benchmarkCase: BenchmarkCase,
  observation: BenchmarkObservation,
): BenchmarkResult {
  const toolNames = observation.toolTraces.map((trace) => trace.toolName);
  const intent = evaluateIntentAccuracy(benchmarkCase, toolNames);
  const functionCalling = evaluateFunctionCallingReliability(
    benchmarkCase,
    observation.toolTraces,
  );
  const factualityResult = evaluateRagFactuality(benchmarkCase, observation);
  const hallucinationMitigation = evaluateHallucinationMitigation(
    benchmarkCase,
    observation,
    factualityResult.unsupportedNumericClaims,
  );
  const responseCoverage = evaluateResponseCoverage(
    benchmarkCase,
    observation.responseText,
  );

  const metrics = [
    intent,
    functionCalling,
    factualityResult.metric,
    hallucinationMitigation,
    responseCoverage,
  ];

  return {
    caseId: benchmarkCase.id,
    category: benchmarkCase.category,
    passed: metrics.every((metric) => metric.passed),
    responseText: observation.responseText,
    toolNames,
    scores: {
      intent,
      functionCalling,
      factuality: factualityResult.metric,
      hallucinationMitigation,
      responseCoverage,
    },
    unsupportedNumericClaims: factualityResult.unsupportedNumericClaims,
    notes: metrics.flatMap((metric) => metric.notes),
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeBenchmarks(results: BenchmarkResult[]): BenchmarkSummary {
  const passed = results.filter((result) => result.passed).length;
  return {
    total: results.length,
    passed,
    passRate: results.length === 0 ? 0 : passed / results.length,
    averageIntentAccuracy: average(results.map((result) => result.scores.intent.score)),
    averageFunctionCallingReliability: average(
      results.map((result) => result.scores.functionCalling.score),
    ),
    averageRagFactuality: average(
      results.map((result) => result.scores.factuality.score),
    ),
    averageHallucinationMitigation: average(
      results.map((result) => result.scores.hallucinationMitigation.score),
    ),
    averageResponseCoverage: average(
      results.map((result) => result.scores.responseCoverage.score),
    ),
  };
}

export function formatBenchmarkSummary(summary: BenchmarkSummary): string {
  return [
    `Benchmark summary: ${summary.passed}/${summary.total} passed (${(summary.passRate * 100).toFixed(1)}%).`,
    `Intent parsing accuracy: ${(summary.averageIntentAccuracy * 100).toFixed(1)}%.`,
    `Function calling reliability: ${(summary.averageFunctionCallingReliability * 100).toFixed(1)}%.`,
    `RAG factuality: ${(summary.averageRagFactuality * 100).toFixed(1)}%.`,
    `Hallucination mitigation: ${(summary.averageHallucinationMitigation * 100).toFixed(1)}%.`,
    `Response coverage: ${(summary.averageResponseCoverage * 100).toFixed(1)}%.`,
  ].join("\n");
}
