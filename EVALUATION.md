# KINEPIK Evaluation Methodology

This repository now includes a production-aligned benchmark harness for three problem areas:

1. RAG factuality against real KINEPIK queries
2. Hallucination mitigation when direct KINEPIK evidence is absent or weak
3. Intent parsing accuracy and function-calling reliability

## What Is Measured

The benchmark runner uses the same core stack as the live chat route:

- the same system prompt in `lib/server/prompts.ts`
- the same tool map in `lib/server/tools/index.ts`
- the same OpenAI-compatible model configuration in `lib/server/openai.ts`

Each benchmark case records:

- the user query
- the tools the model was expected to call
- optional forbidden tools for routing precision
- expected tool arguments for function-call reliability
- expected response fragments for minimum coverage
- whether the case requires KINEPIK-grounded evidence

## Metrics

### RAG Factuality

The evaluator extracts numeric claims from the final response and checks whether those numbers are supported by successful tool outputs from the same run. Unsupported quantitative claims lower the score.

This is aimed at the specific failure mode already documented in the system prompt: fabricated z-scores, p-values, substrate counts, or ranked results.

### Hallucination Mitigation

For cases that require live KINEPIK evidence, the run passes this metric only if:

- a successful KINEPIK tool call was made, or
- the answer clearly labels speculation with `Based on known biology:` when direct evidence is unavailable

Unsupported numeric claims always count against this metric.

### Intent Parsing Accuracy

This measures whether the model chose the correct tool for the user intent. Examples:

- ranking questions should route to `getTopAffectedKinases`
- comparison questions should route to `comparePerturbations`
- family lookup questions should route to `getKinaseFamily`

### Function Calling Reliability

This measures whether tool calls were both successful and correctly parameterized. The current scorer checks:

- call success rate
- required tool coverage
- expected argument coverage

## Benchmark Suite

The default suite in `lib/server/eval/benchmarks.ts` includes realistic KINEPIK-style prompts for:

- kinase target/substrate questions
- broad treatment-summary questions for a drug in a cell line
- exact mTOR plus AZD3759 evidence retrieval
- missing direct Rapamycin evidence with speculation labeling
- drug-target phrasing handled as KINEPIK activity effects rather than direct binding claims
- top inhibited kinase ranking in MCF7
- perturbation comparison across EGFR and mTOR
- combination-therapy inference wording
- exact-name requirement for ambiguous class-level inhibitor questions
- top connected kinase ranking
- heatmap and table generation requests
- network, family, and motif routing

## Acceptance Questions

These are good end-to-end prompts to test in the chat UI and in the benchmark harness:

- `Which proteins does EGFR target in KINEPIK?`
- `What happens when MCF7 is treated with AZD3759?`
- `What effect does AZD3759 have on the activity of mTOR in MCF7?`
- `Which kinases does AZD3759 target in KINEPIK?`
- `What are the top ten most connected kinases?`
- `What is the likely combined effect of AZD3759 and Gefitinib on mTOR in MCF7?`
- `Compare the likely effect of dual EGFR/MEK inhibition on AKT1 and ERK2.`
- `Estimate the combined effect of AZD3759 and Gefitinib on the top kinases in MCF7.`
- `Why does mTOR activity reduce when MCF7 is treated with AZD3759?`
- `What would happen if MCF7 was treated with AZD3759 and Gefitinib?`
- `Generate a heatmap of EGFR and mTOR activity under AZD3759 and Gefitinib in MCF7.`
- `Show me a table comparing EGFR and mTOR under AZD3759 and Gefitinib in MCF7.`

## How To Check Accuracy

Use three checks together:

1. Benchmark harness: run `pnpm eval:benchmarks` and inspect whether the required tools, arguments, and grounding checks passed.
2. Tool provenance: in the UI, expand `Data Sources` and verify that the answer used the expected KINEPIK tool for the query type.
3. Numeric traceability: every z-score, p-value, substrate count, ranking, or comparison claim in the answer should be present in a successful tool output from that same turn.

For the strongest validation, compare the assistant answer against the raw tool outputs from:

- `analyzeKinase` for kinase-specific KSEA questions
- `getTopAffectedKinases` for broad treatment summaries and "which kinases does drug X target?" phrasing
- `getTopKinaseConnectivity` for connectivity rankings
- `comparePerturbations` for cross-drug tables and comparisons
- `analyzeCombinationTherapy` for inferred dual-treatment effects

If a question uses a vague inhibitor class rather than an exact perturbation name in KINEPIK, the accurate behavior is to ask for an exact perturbation or explain that KINEPIK requires the exact perturbation name for a database-grounded answer.

## Running It

Install dependencies, then run:

```bash
pnpm eval:benchmarks
```

Useful options:

```bash
pnpm eval:benchmarks -- --list
pnpm eval:benchmarks -- --filter intent-routing
pnpm eval:benchmarks -- --filter rag-factuality
```

The runner requires a configured `OPENAI_API_KEY` because it executes real model calls.

## Interpreting Results

The summary reports:

- overall benchmark pass rate
- average intent parsing accuracy
- average function-calling reliability
- average RAG factuality
- average hallucination mitigation
- average response coverage

Benchmarks are deliberately strict. A response can fail even if it sounds plausible when:

- it uses the wrong tool for the query type
- it omits required arguments such as `MCF7` or the target UniProt ID
- it includes unsupported numeric claims
- it speculates without clearly labeling speculation

## Extending the Benchmarks

Add more cases to `lib/server/eval/benchmarks.ts` using the `BenchmarkCase` shape from `lib/server/eval/metrics.ts`.

The most useful next additions are:

1. more kinase-specific gold queries from real user logs
2. adversarial prompts that try to induce fabricated KINEPIK values
3. multi-turn cases where tool choice depends on earlier context