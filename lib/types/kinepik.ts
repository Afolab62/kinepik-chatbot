// Shared KINEPIK types — safe to import from both client and server code.

export interface PhosphorylationSite {
  sequence: string;
  position: number;
  residue: "S" | "T" | "Y"; // Serine, Threonine, Tyrosine
  contextSequence: string; // -7 to +7 amino acids around the site
}

export interface InhibitorProfile {
  inhibitorName: string;
  ic50: number; // in nM
  selectivity: number;
  targetKinases: string[];
}

export interface KinaseCandidate {
  kinaseName: string;
  uniprotId: string;
  family: string;
  subfamily: string;
  score: number;
  pValue?: number;
  confidence: "high" | "medium" | "low";
  substrate: string;
  phosphositeCount?: number;
  knownInhibitors: InhibitorProfile[];
  relatedPathways: string[];
}

export interface KinepikAnalysisRequest {
  phosphoSite: PhosphorylationSite;
  cellType?: string;
  tissueType?: string;
  experimentalConditions?: string;
}

export interface KinepikAnalysisResponse {
  requestId: string;
  timestamp: string;
  phosphoSite: PhosphorylationSite;
  candidates: KinaseCandidate[];
  inhibitionFingerprint: Record<string, number>;
  suggestedExperiments: string[];
}
