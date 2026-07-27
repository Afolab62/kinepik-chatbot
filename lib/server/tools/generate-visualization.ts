import { tool } from "ai";
import { z } from "zod";
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const SCRIPT_PATH = path.join(process.cwd(), "lib/server/tools/visualisations.py");
const OUTPUT_DIR = path.join(process.cwd(), "public/visualizations");

function getPythonCommand(): string | null {
  const candidates = process.platform === "win32"
    ? ["py", "python", "python3"]
    : ["python3", "python"];

  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
      if (result.status === 0) return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function blueScale(value: number, min: number, max: number): string {
  const t = max === min ? 0.5 : (value - min) / (max - min);
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(239 - clamped * 196);
  const g = Math.round(246 - clamped * 144);
  const b = Math.round(255 - clamped * 72);
  return `rgb(${r},${g},${b})`;
}

function generateConnectivityHeatmapSvg(params: {
  title?: string;
  kinaseNames?: string[];
  familyLabels?: string[];
  connectionCounts?: number[];
}): { imageUrl: string; downloadName: string } {
  const names = params.kinaseNames ?? [];
  const families = params.familyLabels ?? [];
  const counts = params.connectionCounts ?? [];

  if (
    names.length === 0 ||
    counts.length === 0 ||
    names.length !== counts.length
  ) {
    throw new Error(
      "connectivity-heatmap requires equally sized kinaseNames and connectionCounts arrays.",
    );
  }

  const rowsOrder = ["AGC", "CAMK", "CK1", "CMGC", "STE", "TK", "TKL", "OTHER"];
  const normalizedFamilies = names.map((_, i) => families[i] || "OTHER");

  const indexed = names.map((name, i) => ({
    name,
    family: normalizedFamilies[i],
    degree: counts[i],
  }));

  indexed.sort((a, b) => {
    const aRank = rowsOrder.includes(a.family) ? rowsOrder.indexOf(a.family) : rowsOrder.length;
    const bRank = rowsOrder.includes(b.family) ? rowsOrder.indexOf(b.family) : rowsOrder.length;
    if (aRank !== bRank) return aRank - bRank;
    if (b.degree !== a.degree) return b.degree - a.degree;
    return a.name.localeCompare(b.name);
  });

  const activeRows = rowsOrder.filter((family) =>
    indexed.some((entry) => entry.family === family),
  );
  const rows = activeRows.length > 0 ? activeRows : ["OTHER"];

  const cellW = 72;
  const cellH = 44;
  const left = 150;
  const top = 70;
  const width = left + indexed.length * cellW + 40;
  const height = top + rows.length * cellH + 80;

  const min = Math.min(...indexed.map((item) => item.degree));
  const max = Math.max(...indexed.map((item) => item.degree));

  const rects: string[] = [];
  const texts: string[] = [];

  rows.forEach((family, rowIndex) => {
    const y = top + rowIndex * cellH;
    texts.push(
      `<text x="${left - 10}" y="${y + cellH / 2 + 4}" text-anchor="end" font-size="12" font-weight="700" fill="#111827">${escapeXml(family)}</text>`,
    );

    indexed.forEach((entry, colIndex) => {
      const x = left + colIndex * cellW;
      if (entry.family === family) {
        const fill = blueScale(entry.degree, min, max);
        rects.push(
          `<rect x="${x}" y="${y}" width="${cellW - 2}" height="${cellH - 2}" rx="4" fill="${fill}" stroke="#ffffff" />`,
        );
        const textColor = entry.degree > min + (max - min) * 0.55 ? "#ffffff" : "#111827";
        texts.push(
          `<text x="${x + (cellW - 2) / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="${textColor}">${entry.degree}</text>`,
        );
      } else {
        rects.push(
          `<rect x="${x}" y="${y}" width="${cellW - 2}" height="${cellH - 2}" rx="4" fill="#f3f4f6" stroke="#ffffff" />`,
        );
      }
    });
  });

  indexed.forEach((entry, colIndex) => {
    const x = left + colIndex * cellW + (cellW - 2) / 2;
    const y = top + rows.length * cellH + 18;
    texts.push(
      `<text x="${x}" y="${y}" text-anchor="end" transform="rotate(-45 ${x} ${y})" font-size="11" fill="#374151">${escapeXml(entry.name)}</text>`,
    );
  });

  const title = params.title || "Top Connected Kinases Grouped by Family";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="${left}" y="34" font-size="16" font-weight="700" fill="#111827">${escapeXml(title)}</text>
  <text x="${left}" y="54" font-size="12" fill="#4b5563">Darker cells indicate higher connectivity degree</text>
  ${rects.join("\n  ")}
  ${texts.join("\n  ")}
</svg>`;

  const fileBase = `connectivity-heatmap-${Date.now()}`;
  const fileName = `${fileBase}.svg`;
  const outPath = path.join(OUTPUT_DIR, fileName);
  writeFileSync(outPath, svg, "utf8");
  return {
    imageUrl: `/visualizations/${fileName}`,
    downloadName: `${slugify(title || "kinepik-connectivity-heatmap")}.svg`,
  };
}

export const generateVisualizationTool = tool({
  description:
    "Generate a static chart or diagram image from KINEPIK analysis data. " +
    "Use this when the user explicitly asks for a bar chart, heatmap, radar plot, comparison plot, or other visualization after KINEPIK data has been gathered. " +
    "The output is an image URL that can be displayed directly in the chat UI.",
  inputSchema: z.object({
    type: z.enum([
      "ksea-bar",
      "ksea-heatmap",
      "ksea-radar",
      "top-connected",
      "connectivity-heatmap",
      "network",
    ]),
    data: z.any().optional().describe("Structured chart data, typically a list of rows or a matrix."),
    perturbation: z.string().optional(),
    direction: z.enum(["positive", "negative"]).optional(),
    title: z.string().optional(),
    kinaseLabel: z.string().optional(),
    kinaseNames: z.array(z.string()).optional(),
    connectionCounts: z.array(z.number()).optional(),
    familyLabels: z.array(z.string()).optional(),
    perturbationLabels: z.array(z.string()).optional(),
    kinaseLabels: z.array(z.string()).optional(),
    matrix: z.record(z.any()).optional(),
    kinaseId: z.string().optional(),
  }),
  execute: async (params: {
    type:
      | "ksea-bar"
      | "ksea-heatmap"
      | "ksea-radar"
      | "top-connected"
      | "connectivity-heatmap"
      | "network";
    data?: unknown;
    perturbation?: string;
    direction?: "positive" | "negative";
    title?: string;
    kinaseLabel?: string;
    kinaseNames?: string[];
    connectionCounts?: number[];
    familyLabels?: string[];
    perturbationLabels?: string[];
    kinaseLabels?: string[];
    matrix?: Record<string, unknown>;
    kinaseId?: string;
  }) => {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const payload = {
      type: params.type,
      data: params.data,
      perturbation: params.perturbation,
      direction: params.direction,
      title: params.title,
      kinaseLabel: params.kinaseLabel,
      kinaseNames: params.kinaseNames,
      connectionCounts: params.connectionCounts,
      familyLabels: params.familyLabels,
      perturbationLabels: params.perturbationLabels,
      kinaseLabels: params.kinaseLabels,
      matrix: params.matrix,
      kinaseId: params.kinaseId,
    };

    const pythonCommand = getPythonCommand();
    if (!pythonCommand) {
      if (params.type === "connectivity-heatmap") {
        const fallback = generateConnectivityHeatmapSvg({
          title: params.title,
          kinaseNames: params.kinaseNames,
          familyLabels: params.familyLabels,
          connectionCounts: params.connectionCounts,
        });
        return {
          generated: true,
          imageUrl: fallback.imageUrl,
          type: params.type,
          title: params.title || "KINEPIK connectivity heatmap",
          downloadName: fallback.downloadName,
          note: "Generated using built-in SVG fallback (Python unavailable).",
        };
      }
      throw new Error(
        "Python is not installed or not on PATH. Install Python 3 and ensure `python` or `py` is available, then retry visualization generation.",
      );
    }
    const result = spawnSync(
      pythonCommand,
      [SCRIPT_PATH, "--payload", JSON.stringify(payload)],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          KINEPIK_VISUALIZATION_DIR: OUTPUT_DIR,
        },
      },
    );

    if (result.status !== 0) {
      const stderr = result.stderr?.trim();
      throw new Error(
        stderr || result.stdout?.trim() || "Visualization generation failed",
      );
    }

    const imagePath = result.stdout?.trim().split(/\s+/).pop() || "";
    const normalizedPath = imagePath.startsWith("/") ? imagePath : `/${imagePath}`;
    const title = params.title || "KINEPIK visualization";
    const type = params.type;
    const downloadName = `${slugify(title || type || "kinepik-visualization") || "kinepik-visualization"}.png`;

    return {
      generated: true,
      imageUrl: normalizedPath,
      type,
      title,
      downloadName,
      note: "The chart is now displayed in the chat UI.",
    };
  },
});
