import { tool } from "ai";
import { z } from "zod";

interface NumericRow {
  label: string;
  value: number;
  group?: string;
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

function toSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizeRows(params: {
  data?: unknown;
  kinaseNames?: string[];
  connectionCounts?: number[];
  familyLabels?: string[];
}): NumericRow[] {
  const fromNamedArrays =
    params.kinaseNames &&
    params.connectionCounts &&
    params.kinaseNames.length === params.connectionCounts.length;

  if (fromNamedArrays) {
    return params.kinaseNames!.map((label, i) => ({
      label,
      value: params.connectionCounts![i],
      group: params.familyLabels?.[i],
    }));
  }

  if (!Array.isArray(params.data)) {
    return [];
  }

  const labelKeys = [
    "label",
    "name",
    "kinaseName",
    "kinase",
    "id",
    "uniprotId",
  ];
  const valueKeys = [
    "value",
    "zScore",
    "score",
    "connectionCount",
    "count",
    "degree",
    "n",
  ];

  const rows: NumericRow[] = [];
  for (const item of params.data) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;

    let label = "";
    for (const key of labelKeys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        label = value.trim();
        break;
      }
    }

    let numericValue: number | undefined;
    for (const key of valueKeys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        numericValue = value;
        break;
      }
    }

    if (!label || numericValue === undefined) continue;
    const group = typeof record.family === "string" ? record.family : undefined;
    rows.push({ label, value: numericValue, group });
  }

  return rows;
}

function generateBarSvg(params: {
  title: string;
  subtitle?: string;
  rows: NumericRow[];
  diverging?: boolean;
}): string {
  const top = 84;
  const left = 110;
  const width = 980;
  const height = 600;
  const chartWidth = width - left - 70;
  const chartHeight = height - top - 70;

  const rows = params.rows.slice(0, 18);
  const maxAbs =
    rows.length > 0 ? Math.max(...rows.map((r) => Math.abs(r.value)), 1) : 1;

  const barGap = 10;
  const barH = Math.max(
    14,
    Math.floor((chartHeight - barGap * rows.length) / Math.max(rows.length, 1)),
  );

  const elements: string[] = [];
  const axisX = params.diverging ? left + chartWidth / 2 : left;

  elements.push(
    `<line x1="${axisX}" y1="${top}" x2="${axisX}" y2="${top + chartHeight}" stroke="#94a3b8" stroke-width="1" />`,
  );

  rows.forEach((row, i) => {
    const y = top + i * (barH + barGap);
    const normalized = Math.abs(row.value) / maxAbs;
    const w = Math.max(
      2,
      Math.floor(
        normalized * (params.diverging ? chartWidth / 2 - 14 : chartWidth - 14),
      ),
    );
    const isNegative = row.value < 0;
    const x = params.diverging ? (isNegative ? axisX - w : axisX) : left;
    const fill = params.diverging
      ? isNegative
        ? "#2563eb"
        : "#ef4444"
      : "#0ea5e9";
    elements.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${barH}" rx="5" fill="${fill}" />`,
    );
    elements.push(
      `<text x="${left - 8}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="12" fill="#1f2937">${escapeXml(row.label)}</text>`,
    );
    const valueX = params.diverging
      ? isNegative
        ? x - 6
        : x + w + 6
      : x + w + 6;
    const anchor = params.diverging && isNegative ? "end" : "start";
    elements.push(
      `<text x="${valueX}" y="${y + barH / 2 + 4}" text-anchor="${anchor}" font-size="11" fill="#334155">${row.value.toFixed(3)}</text>`,
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="${left}" y="36" font-size="20" font-weight="700" fill="#0f172a">${escapeXml(params.title)}</text>
  <text x="${left}" y="58" font-size="12" fill="#475569">${escapeXml(params.subtitle ?? "KINEPIK chart generated server-side (Vercel-safe SVG)")}</text>
  ${elements.join("\n  ")}
</svg>`;
}

function generateGridHeatmapSvg(params: {
  title: string;
  rowLabels: string[];
  colLabels: string[];
  values: number[][];
  subtitle?: string;
}): string {
  const rowCount = params.rowLabels.length;
  const colCount = params.colLabels.length;
  const cellW = 74;
  const cellH = 42;
  const left = 170;
  const top = 90;
  const width = left + colCount * cellW + 48;
  const height = top + rowCount * cellH + 120;

  const flat = params.values.flat().filter((n) => Number.isFinite(n));
  const min = flat.length > 0 ? Math.min(...flat) : 0;
  const max = flat.length > 0 ? Math.max(...flat) : 1;

  const cells: string[] = [];
  const labels: string[] = [];

  params.rowLabels.forEach((rowLabel, r) => {
    const y = top + r * cellH;
    labels.push(
      `<text x="${left - 10}" y="${y + cellH / 2 + 4}" text-anchor="end" font-size="12" font-weight="700" fill="#111827">${escapeXml(rowLabel)}</text>`,
    );

    params.colLabels.forEach((_, c) => {
      const x = left + c * cellW;
      const value = params.values[r]?.[c];
      const hasValue = Number.isFinite(value);
      const fill = hasValue ? blueScale(value, min, max) : "#f3f4f6";
      cells.push(
        `<rect x="${x}" y="${y}" width="${cellW - 2}" height="${cellH - 2}" rx="4" fill="${fill}" stroke="#ffffff" />`,
      );
      if (hasValue) {
        labels.push(
          `<text x="${x + (cellW - 2) / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#0f172a">${Number(value).toFixed(2)}</text>`,
        );
      }
    });
  });

  params.colLabels.forEach((colLabel, c) => {
    const x = left + c * cellW + (cellW - 2) / 2;
    const y = top + rowCount * cellH + 18;
    labels.push(
      `<text x="${x}" y="${y}" text-anchor="end" transform="rotate(-45 ${x} ${y})" font-size="11" fill="#374151">${escapeXml(colLabel)}</text>`,
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="${left}" y="36" font-size="20" font-weight="700" fill="#0f172a">${escapeXml(params.title)}</text>
  <text x="${left}" y="58" font-size="12" fill="#475569">${escapeXml(params.subtitle ?? "Darker cells indicate larger values")}</text>
  ${cells.join("\n  ")}
  ${labels.join("\n  ")}
</svg>`;
}

function generateRadarSvg(params: {
  title: string;
  rows: NumericRow[];
  subtitle?: string;
}): string {
  const rows = params.rows.slice(0, 8);
  const width = 920;
  const height = 620;
  const cx = width / 2;
  const cy = 320;
  const radius = 210;
  const levels = 5;

  const maxAbs =
    rows.length > 0 ? Math.max(...rows.map((r) => Math.abs(r.value)), 1) : 1;

  const rings: string[] = [];
  for (let i = 1; i <= levels; i += 1) {
    const r = (radius * i) / levels;
    rings.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" />`,
    );
  }

  const axes: string[] = [];
  const points: string[] = [];
  const labels: string[] = [];

  rows.forEach((row, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / rows.length;
    const ax = cx + Math.cos(angle) * radius;
    const ay = cy + Math.sin(angle) * radius;
    axes.push(
      `<line x1="${cx}" y1="${cy}" x2="${ax}" y2="${ay}" stroke="#cbd5e1" />`,
    );

    const normalized = Math.abs(row.value) / maxAbs;
    const px = cx + Math.cos(angle) * radius * normalized;
    const py = cy + Math.sin(angle) * radius * normalized;
    points.push(`${px},${py}`);

    const lx = cx + Math.cos(angle) * (radius + 28);
    const ly = cy + Math.sin(angle) * (radius + 28);
    labels.push(
      `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="12" fill="#1f2937">${escapeXml(row.label)}</text>`,
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="90" y="42" font-size="20" font-weight="700" fill="#0f172a">${escapeXml(params.title)}</text>
  <text x="90" y="64" font-size="12" fill="#475569">${escapeXml(params.subtitle ?? "Normalized radial profile")}</text>
  ${rings.join("\n  ")}
  ${axes.join("\n  ")}
  <polygon points="${points.join(" ")}" fill="#38bdf833" stroke="#0ea5e9" stroke-width="2" />
  ${labels.join("\n  ")}
</svg>`;
}

function generateNetworkSummarySvg(params: {
  title: string;
  data?: unknown;
  subtitle?: string;
}): string {
  const width = 980;
  const height = 580;
  const dataRecord =
    typeof params.data === "object" && params.data !== null
      ? (params.data as Record<string, unknown>)
      : undefined;
  const nodeCount =
    typeof dataRecord?.nodeCount === "number"
      ? dataRecord.nodeCount
      : Array.isArray(dataRecord?.nodes)
        ? dataRecord.nodes.length
        : undefined;
  const edgeCount =
    typeof dataRecord?.edgeCount === "number"
      ? dataRecord.edgeCount
      : Array.isArray(dataRecord?.edges)
        ? dataRecord.edges.length
        : undefined;

  const label =
    nodeCount !== undefined || edgeCount !== undefined
      ? `Nodes: ${nodeCount ?? "?"}  Edges: ${edgeCount ?? "?"}`
      : "Interactive network data was generated. Use View Network for full exploration.";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff" />
  <rect x="70" y="120" width="840" height="360" rx="18" fill="#f8fafc" stroke="#cbd5e1" />
  <text x="90" y="52" font-size="20" font-weight="700" fill="#0f172a">${escapeXml(params.title)}</text>
  <text x="90" y="74" font-size="12" fill="#475569">${escapeXml(params.subtitle ?? "Static preview generated in SVG (Vercel-safe)")}</text>
  <circle cx="320" cy="300" r="46" fill="#dbeafe" stroke="#2563eb" stroke-width="2" />
  <circle cx="500" cy="230" r="42" fill="#fde68a" stroke="#d97706" stroke-width="2" />
  <circle cx="640" cy="320" r="50" fill="#dcfce7" stroke="#16a34a" stroke-width="2" />
  <line x1="358" y1="285" x2="464" y2="246" stroke="#94a3b8" stroke-width="2" />
  <line x1="540" y1="250" x2="592" y2="292" stroke="#94a3b8" stroke-width="2" />
  <line x1="364" y1="320" x2="592" y2="320" stroke="#94a3b8" stroke-width="2" />
  <text x="90" y="520" font-size="14" fill="#334155">${escapeXml(label)}</text>
</svg>`;
}

function generateConnectivityHeatmapSvg(params: {
  title?: string;
  kinaseNames?: string[];
  familyLabels?: string[];
  connectionCounts?: number[];
}): { imageUrl: string; downloadName: string } {
  const inputRows = normalizeRows({
    kinaseNames: params.kinaseNames,
    connectionCounts: params.connectionCounts,
    familyLabels: params.familyLabels,
  });

  if (inputRows.length === 0) {
    throw new Error(
      "connectivity-heatmap requires equally sized kinaseNames and connectionCounts arrays.",
    );
  }

  const rowsOrder = ["AGC", "CAMK", "CK1", "CMGC", "STE", "TK", "TKL", "OTHER"];
  const indexed = inputRows.map((row) => ({
    name: row.label,
    family: row.group || "OTHER",
    degree: row.value,
  }));

  indexed.sort((a, b) => {
    const aRank = rowsOrder.includes(a.family)
      ? rowsOrder.indexOf(a.family)
      : rowsOrder.length;
    const bRank = rowsOrder.includes(b.family)
      ? rowsOrder.indexOf(b.family)
      : rowsOrder.length;
    if (aRank !== bRank) return aRank - bRank;
    if (b.degree !== a.degree) return b.degree - a.degree;
    return a.name.localeCompare(b.name);
  });

  const activeRows = rowsOrder.filter((family) =>
    indexed.some((entry) => entry.family === family),
  );
  const heatmapRows = activeRows.length > 0 ? activeRows : ["OTHER"];

  const cellW = 72;
  const cellH = 44;
  const left = 150;
  const top = 70;
  const width = left + indexed.length * cellW + 40;
  const height = top + heatmapRows.length * cellH + 80;

  const min = Math.min(...indexed.map((item) => item.degree));
  const max = Math.max(...indexed.map((item) => item.degree));

  const rects: string[] = [];
  const texts: string[] = [];

  heatmapRows.forEach((family, rowIndex) => {
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
        const textColor =
          entry.degree > min + (max - min) * 0.55 ? "#ffffff" : "#111827";
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
    const y = top + heatmapRows.length * cellH + 18;
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

  return {
    imageUrl: toSvgDataUrl(svg),
    downloadName: `${slugify(title || "kinepik-connectivity-heatmap")}.svg`,
  };
}

function resolveMatrix(params: {
  matrix?: Record<string, unknown>;
  data?: unknown;
  rows: NumericRow[];
}): { rowLabels: string[]; colLabels: string[]; values: number[][] } {
  if (params.matrix && typeof params.matrix === "object") {
    const rowLabels = Object.keys(params.matrix);
    const colSet = new Set<string>();
    const rowMaps = rowLabels.map((r) => {
      const value = params.matrix?.[r];
      const record =
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)
          : {};
      Object.keys(record).forEach((k) => colSet.add(k));
      return record;
    });
    const colLabels = Array.from(colSet);
    const values = rowMaps.map((record) =>
      colLabels.map((col) => {
        const value = record[col];
        return typeof value === "number" && Number.isFinite(value)
          ? value
          : NaN;
      }),
    );
    if (rowLabels.length > 0 && colLabels.length > 0) {
      return { rowLabels, colLabels, values };
    }
  }

  const baseRows = params.rows.slice(0, 16);
  const rowLabels = ["KSEA"];
  const colLabels = baseRows.map((r) => r.label);
  const values = [baseRows.map((r) => r.value)];
  return { rowLabels, colLabels, values };
}

function buildVisualization(params: {
  type:
    | "ksea-bar"
    | "ksea-heatmap"
    | "ksea-radar"
    | "top-connected"
    | "connectivity-heatmap"
    | "network";
  data?: unknown;
  title?: string;
  direction?: "positive" | "negative";
  kinaseNames?: string[];
  connectionCounts?: number[];
  familyLabels?: string[];
  matrix?: Record<string, unknown>;
}): { imageUrl: string; title: string; downloadName: string; note: string } {
  const title = params.title || "KINEPIK visualization";
  const rows = normalizeRows({
    data: params.data,
    kinaseNames: params.kinaseNames,
    connectionCounts: params.connectionCounts,
    familyLabels: params.familyLabels,
  });

  if (params.type === "connectivity-heatmap") {
    const connectivity = generateConnectivityHeatmapSvg({
      title,
      kinaseNames: params.kinaseNames,
      familyLabels: params.familyLabels,
      connectionCounts: params.connectionCounts,
    });
    return {
      imageUrl: connectivity.imageUrl,
      title,
      downloadName: connectivity.downloadName,
      note: "Generated using built-in TypeScript SVG renderer (no Python runtime required).",
    };
  }

  if (params.type === "ksea-radar") {
    if (rows.length === 0) {
      throw new Error("ksea-radar requires numeric rows in data.");
    }
    const svg = generateRadarSvg({
      title,
      rows,
      subtitle: "KSEA profile (absolute values normalized)",
    });
    return {
      imageUrl: toSvgDataUrl(svg),
      title,
      downloadName: `${slugify(title || "kinepik-ksea-radar")}.svg`,
      note: "Generated using built-in TypeScript SVG renderer (no Python runtime required).",
    };
  }

  if (params.type === "ksea-heatmap") {
    const matrix = resolveMatrix({
      matrix: params.matrix,
      data: params.data,
      rows,
    });
    const svg = generateGridHeatmapSvg({
      title,
      rowLabels: matrix.rowLabels,
      colLabels: matrix.colLabels,
      values: matrix.values,
      subtitle: "KSEA heatmap (SVG)",
    });
    return {
      imageUrl: toSvgDataUrl(svg),
      title,
      downloadName: `${slugify(title || "kinepik-ksea-heatmap")}.svg`,
      note: "Generated using built-in TypeScript SVG renderer (no Python runtime required).",
    };
  }

  if (params.type === "network") {
    const svg = generateNetworkSummarySvg({
      title,
      data: params.data,
      subtitle: "Static network preview",
    });
    return {
      imageUrl: toSvgDataUrl(svg),
      title,
      downloadName: `${slugify(title || "kinepik-network-preview")}.svg`,
      note: "Generated using built-in TypeScript SVG renderer (no Python runtime required).",
    };
  }

  if (rows.length === 0) {
    throw new Error(
      "Visualization requires numeric rows in data or named numeric arrays.",
    );
  }

  const isDiverging = params.type === "ksea-bar";
  const subtitle =
    params.type === "top-connected"
      ? "Top-connected kinase ranking"
      : params.direction === "negative"
        ? "Negative values indicate stronger inhibition"
        : "Positive values indicate stronger activation";

  const svg = generateBarSvg({
    title,
    subtitle,
    rows,
    diverging: isDiverging,
  });

  return {
    imageUrl: toSvgDataUrl(svg),
    title,
    downloadName: `${slugify(title || "kinepik-chart")}.svg`,
    note: "Generated using built-in TypeScript SVG renderer (no Python runtime required).",
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
    data: z
      .any()
      .optional()
      .describe("Structured chart data, typically a list of rows or a matrix."),
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
    const rendered = buildVisualization({
      type: params.type,
      data: params.data,
      title: params.title,
      direction: params.direction,
      kinaseNames: params.kinaseNames,
      connectionCounts: params.connectionCounts,
      familyLabels: params.familyLabels,
      matrix: params.matrix,
    });

    return {
      generated: true,
      imageUrl: rendered.imageUrl,
      type: params.type,
      title: rendered.title,
      downloadName: rendered.downloadName,
      note: rendered.note,
    };
  },
});
