// KINEPIK server-side engine — kinase knowledge constants used by tools.
// This file is server-only; import types from '@/lib/types/kinepik' on the client.

// ---------------------------------------------------------------------------
// Kinase family classifications
// ---------------------------------------------------------------------------

export const KINASE_FAMILIES = {
  AGC: ["PKA", "PKB/Akt", "PKC", "PKG", "RSK", "SGK", "PDK1"],
  CAMK: ["CaMK", "DAPK", "MLCK", "MARK", "AMPK"],
  CK1: ["CK1α", "CK1δ", "CK1ε", "CK1γ"],
  CMGC: ["CDK", "MAPK", "GSK", "CLK", "DYRK"],
  STE: ["MAP2K", "MAP3K", "MAP4K", "STE20"],
  TK: ["EGFR", "FGFR", "VEGFR", "PDGFR", "Src", "Abl", "JAK"],
  TKL: ["RAF", "MLK", "IRAK", "RIPK", "LRRK"],
  OTHER: ["NEK", "PLK", "Aurora", "WEE", "PIKK"],
} as const;

// ---------------------------------------------------------------------------
// Phosphorylation motif patterns
// ---------------------------------------------------------------------------

export const PHOSPHO_MOTIFS = {
  basophilic: {
    pattern: /R.{2}[ST]/,
    description: "Arginine at -3 position",
    typicalKinases: ["PKA", "PKB/Akt", "PKC"],
  },
  acidophilic: {
    pattern: /[ST].{2}[DE]/,
    description: "Acidic residue at +3 position",
    typicalKinases: ["CK1", "CK2", "GSK3"],
  },
  prolineDirected: {
    pattern: /[ST]P/,
    description: "Proline at +1 position",
    typicalKinases: ["CDK", "MAPK", "GSK3"],
  },
  tyrosineKinase: {
    pattern: /Y[A-Z]{3}[DE]/,
    description: "Tyrosine phosphorylation with acidic context",
    typicalKinases: ["Src", "Abl", "EGFR"],
  },
} as const;

// ---------------------------------------------------------------------------
// Kinase family metadata (used by the getKinaseFamily tool)
// ---------------------------------------------------------------------------

export function getKinaseFamilyDescription(family: string): string {
  const descriptions: Record<string, string> = {
    AGC: "Named after PKA, PKG, and PKC. These kinases typically phosphorylate substrates with basic residues at -3 position.",
    CAMK: "Calcium/calmodulin-dependent kinases. Activated by Ca2+ signaling and involved in neuronal function.",
    CK1: "Casein kinase 1 family. Constitutively active and involved in Wnt signaling and circadian rhythms.",
    CMGC: "Named after CDKs, MAPKs, GSKs, and CLKs. Many are proline-directed kinases involved in cell cycle and signaling.",
    STE: "Homologs of yeast STE kinases. Form MAPK cascades (MAP3K→MAP2K→MAPK).",
    TK: "Tyrosine kinases. Include receptor (RTKs) and non-receptor types. Key in growth factor signaling.",
    TKL: "Tyrosine kinase-like. Serine/threonine kinases with structures similar to TKs.",
    OTHER:
      "Kinases that do not fit other groups. Include Aurora, PLK, NEK families.",
  };
  return descriptions[family] ?? "Unknown family";
}

export function getKinaseFamilyFeatures(family: string): string[] {
  const features: Record<string, string[]> = {
    AGC: [
      "Basophilic substrate preference",
      "Often regulated by second messengers",
      "C-terminal hydrophobic motif",
    ],
    CAMK: [
      "Calcium-dependent activation",
      "Autoinhibitory domain",
      "CaM-binding region",
    ],
    CK1: [
      "Acidophilic substrate preference",
      "Constitutively active",
      "Multiple isoforms",
    ],
    CMGC: [
      "Proline-directed (most members)",
      "Activation loop phosphorylation",
      "Often require docking motifs",
    ],
    STE: [
      "Form kinase cascades",
      "Scaffold protein interactions",
      "MAPK pathway components",
    ],
    TK: [
      "Phosphorylate tyrosine residues",
      "SH2/SH3 domains common",
      "Often oncogenic when mutated",
    ],
    TKL: [
      "Mixed specificity possible",
      "Structurally similar to TKs",
      "Diverse substrates",
    ],
    OTHER: [
      "Diverse mechanisms",
      "Cell cycle regulation (Aurora, PLK)",
      "Various cellular functions",
    ],
  };
  return features[family] ?? [];
}
