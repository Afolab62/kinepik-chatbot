import type { BenchmarkCase } from "./metrics";

export const KINEPIK_BENCHMARKS: BenchmarkCase[] = [
  {
    id: "targets-of-egfr",
    category: "intent-routing",
    userQuery: "Which proteins does EGFR target in KINEPIK?",
    requiredTools: ["analyzeKinase"],
    expectedArguments: [
      { tool: "analyzeKinase", path: "uniprotIds", includes: ["P00533"] },
    ],
    expectedResponseSubstrings: ["EGFR", "target", "phosphosite"],
    requiresToolEvidence: true,
  },
  {
    id: "broad-treatment-summary",
    category: "intent-routing",
    userQuery: "What happens when MCF7 is treated with AZD3759?",
    requiredTools: ["getTopAffectedKinases"],
    expectedArguments: [
      { tool: "getTopAffectedKinases", path: "perturbation", equals: "AZD3759" },
      { tool: "getTopAffectedKinases", path: "cellLine", equals: "MCF7" },
    ],
    expectedResponseSubstrings: ["MCF7", "AZD3759", "kinase"],
    requiresToolEvidence: true,
  },
  {
    id: "rag-mtor-azd3759",
    category: "rag-factuality",
    userQuery:
      "Why does mTOR activity change when MCF7 is treated with AZD3759? Include the exact z-score, p-value, and substrate count from KINEPIK.",
    requiredTools: ["analyzeKinase"],
    expectedArguments: [
      { tool: "analyzeKinase", path: "uniprotIds", includes: ["P42345"] },
      { tool: "analyzeKinase", path: "perturbation", equals: "AZD3759" },
      { tool: "analyzeKinase", path: "cellLine", equals: "MCF7" },
    ],
    expectedResponseSubstrings: ["mTOR", "z-score", "p-value", "mechan"],
    requiresToolEvidence: true,
  },
  {
    id: "hallucination-no-direct-rapamycin",
    category: "hallucination-mitigation",
    userQuery:
      "Give the exact KINEPIK z-score and p-value for mTOR under Rapamycin in MCF7, and explain the biology if KINEPIK does not have direct evidence.",
    requiredTools: ["analyzeKinase"],
    expectedArguments: [
      { tool: "analyzeKinase", path: "uniprotIds", includes: ["P42345"] },
      { tool: "analyzeKinase", path: "perturbation", equals: "Rapamycin" },
      { tool: "analyzeKinase", path: "cellLine", equals: "MCF7" },
    ],
    expectedResponseSubstrings: ["KINEPIK", "biolog"],
    requiresToolEvidence: true,
    allowsSpeculation: true,
  },
  {
    id: "intent-top-affected",
    category: "intent-routing",
    userQuery:
      "Which kinases are the most inhibited by AZD3759 in MCF7? Rank the top 5 from KINEPIK.",
    requiredTools: ["getTopAffectedKinases"],
    forbiddenTools: ["analyzeKinase"],
    expectedArguments: [
      { tool: "getTopAffectedKinases", path: "perturbation", equals: "AZD3759" },
      { tool: "getTopAffectedKinases", path: "cellLine", equals: "MCF7" },
      { tool: "getTopAffectedKinases", path: "topN", equals: 5 },
      { tool: "getTopAffectedKinases", path: "mode", equals: "inhibited" },
    ],
    expectedResponseSubstrings: ["top", "AZD3759", "MCF7"],
    requiresToolEvidence: true,
  },
  {
    id: "drug-targets-as-affected-kinases",
    category: "intent-routing",
    userQuery: "Which kinases does AZD3759 target in KINEPIK?",
    requiredTools: ["getTopAffectedKinases"],
    expectedArguments: [
      { tool: "getTopAffectedKinases", path: "perturbation", equals: "AZD3759" },
      { tool: "getTopAffectedKinases", path: "cellLine", equals: "MCF7" },
    ],
    expectedResponseSubstrings: ["AZD3759", "most affected", "KINEPIK"],
    requiresToolEvidence: true,
    allowsSpeculation: true,
  },
  {
    id: "intent-compare-perturbations",
    category: "intent-routing",
    userQuery:
      "Compare how AZD3759 and Rapamycin affect EGFR and mTOR in MCF7.",
    requiredTools: ["comparePerturbations"],
    expectedArguments: [
      { tool: "comparePerturbations", path: "uniprotIds", includes: ["P00533", "P42345"] },
      { tool: "comparePerturbations", path: "perturbations", includes: ["AZD3759", "Rapamycin"] },
      { tool: "comparePerturbations", path: "cellLine", equals: "MCF7" },
    ],
    expectedResponseSubstrings: ["EGFR", "mTOR", "AZD3759", "Rapamycin"],
    requiresToolEvidence: true,
  },
  {
    id: "function-combination-therapy",
    category: "function-calling",
    userQuery:
      "Estimate the combined effect of AZD3759 and Rapamycin on EGFR and mTOR in MCF7. Make it clear if this is inferred rather than directly measured.",
    requiredTools: ["analyzeCombinationTherapy"],
    expectedArguments: [
      { tool: "analyzeCombinationTherapy", path: "uniprotIds", includes: ["P00533", "P42345"] },
      { tool: "analyzeCombinationTherapy", path: "perturbations", includes: ["AZD3759", "Rapamycin"] },
      { tool: "analyzeCombinationTherapy", path: "cellLine", equals: "MCF7" },
    ],
    expectedResponseSubstrings: ["inferred", "combined", "EGFR", "mTOR"],
    requiresToolEvidence: true,
    allowsSpeculation: true,
  },
  {
    id: "combined-azd3759-gefitinib-mtor",
    category: "function-calling",
    userQuery:
      "What is the likely combined effect of AZD3759 and Gefitinib on mTOR in MCF7?",
    requiredTools: ["analyzeCombinationTherapy"],
    expectedArguments: [
      { tool: "analyzeCombinationTherapy", path: "uniprotIds", includes: ["P42345"] },
      { tool: "analyzeCombinationTherapy", path: "perturbations", includes: ["AZD3759", "Gefitinib"] },
      { tool: "analyzeCombinationTherapy", path: "cellLine", equals: "MCF7" },
    ],
    expectedResponseSubstrings: ["combined", "mTOR", "inferred", "MCF7"],
    requiresToolEvidence: true,
    allowsSpeculation: true,
  },
  {
    id: "class-level-combination-needs-exact-names",
    category: "hallucination-mitigation",
    userQuery:
      "Compare the likely effect of dual EGFR/MEK inhibition on AKT1 and ERK2.",
    forbiddenTools: ["analyzeCombinationTherapy"],
    expectedResponseSubstrings: ["exact perturbation", "KINEPIK"],
    requiresToolEvidence: false,
    allowsSpeculation: true,
  },
  {
    id: "combined-two-inhibitors-top-kinases",
    category: "function-calling",
    userQuery:
      "Estimate the combined effect of AZD3759 and Gefitinib on the top kinases in MCF7.",
    requiredTools: ["batchRankKinases", "analyzeCombinationTherapy"],
    expectedResponseSubstrings: ["combined", "top kinases", "MCF7"],
    requiresToolEvidence: true,
    allowsSpeculation: true,
  },
  {
    id: "intent-network",
    category: "intent-routing",
    userQuery: "Show me the kinase interaction network around EGFR.",
    requiredTools: ["getKinaseNetwork"],
    expectedResponseSubstrings: ["EGFR", "network"],
  },
  {
    id: "top-ten-connected-kinases",
    category: "intent-routing",
    userQuery: "What are the top ten most connected kinases?",
    requiredTools: ["getTopKinaseConnectivity"],
    expectedArguments: [{ tool: "getTopKinaseConnectivity", path: "count", equals: 10 }],
    expectedResponseSubstrings: ["top", "connected", "kinases"],
    requiresToolEvidence: true,
  },
  {
    id: "intent-family",
    category: "intent-routing",
    userQuery: "Which kinase family does EGFR belong to, and what defines that family?",
    requiredTools: ["getKinaseFamily"],
    expectedResponseSubstrings: ["EGFR", "family"],
  },
  {
    id: "intent-motif",
    category: "intent-routing",
    userQuery:
      "Analyze the RRQSP motif and tell me which kinase classes it is consistent with.",
    requiredTools: ["analyzeMotif"],
    expectedResponseSubstrings: ["motif", "kinase"],
  },
  {
    id: "heatmap-request",
    category: "function-calling",
    userQuery:
      "Generate a heatmap of EGFR and mTOR activity under AZD3759 and Gefitinib in MCF7.",
    requiredTools: ["comparePerturbations", "generateVisualization"],
    expectedResponseSubstrings: ["heatmap", "EGFR", "mTOR", "MCF7"],
    requiresToolEvidence: true,
  },
  {
    id: "table-request",
    category: "intent-routing",
    userQuery:
      "Show me a table comparing EGFR and mTOR under AZD3759 and Gefitinib in MCF7.",
    requiredTools: ["comparePerturbations"],
    forbiddenTools: ["generateVisualization"],
    expectedResponseSubstrings: ["|", "EGFR", "mTOR", "AZD3759"],
    requiresToolEvidence: true,
  },
];