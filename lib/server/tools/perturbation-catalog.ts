import { readFileSync } from "fs";
import path from "path";

const CATALOG_PATH = path.join(
  process.cwd(),
  "lib/server/tools/KINEPIK_unique_PerturbationNames.csv",
);

let cachedPerturbationNames: string[] | null = null;

function normalizeForLookup(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeForIncludes(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function loadPerturbationCatalog(): string[] {
  if (cachedPerturbationNames) {
    return cachedPerturbationNames;
  }

  const raw = readFileSync(CATALOG_PATH, "utf8");
  cachedPerturbationNames = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "PerturbationName");

  return cachedPerturbationNames;
}

function rankSuggestions(input: string, names: string[]): string[] {
  const compactInput = normalizeForLookup(input);
  const looseInput = normalizeForIncludes(input);

  return names
    .map((name) => {
      const compact = normalizeForLookup(name);
      const loose = normalizeForIncludes(name);
      let score = 0;

      if (compact.startsWith(compactInput) || compactInput.startsWith(compact)) {
        score += 3;
      }

      if (loose.includes(looseInput) || looseInput.includes(loose)) {
        score += 2;
      }

      if (compact.includes(compactInput)) {
        score += 1;
      }

      return { name, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((entry) => entry.name);
}

export interface PerturbationResolution {
  input: string;
  resolvedName?: string;
  matched: boolean;
  autoCorrected: boolean;
  suggestions: string[];
}

export function getKnownPerturbations(): string[] {
  return loadPerturbationCatalog();
}

export function resolvePerturbationName(input: string): PerturbationResolution {
  const names = loadPerturbationCatalog();
  const trimmed = input.trim();
  const normalizedInput = normalizeForLookup(trimmed);

  const exactMatch = names.find((name) => name === trimmed);
  if (exactMatch) {
    return {
      input,
      resolvedName: exactMatch,
      matched: true,
      autoCorrected: false,
      suggestions: [],
    };
  }

  const normalizedMatch = names.find(
    (name) => normalizeForLookup(name) === normalizedInput,
  );
  if (normalizedMatch) {
    return {
      input,
      resolvedName: normalizedMatch,
      matched: true,
      autoCorrected: normalizedMatch !== trimmed,
      suggestions: [],
    };
  }

  return {
    input,
    matched: false,
    autoCorrected: false,
    suggestions: rankSuggestions(trimmed, names),
  };
}