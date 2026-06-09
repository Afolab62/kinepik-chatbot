"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Code,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Database,
  Network,
  FlaskConical,
  FileText,
  Beaker,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnimatedBackground } from "@/components/animated-background";

const API_SECTIONS = [
  {
    id: "protein",
    title: "Protein Routes",
    icon: Database,
    description: "Query protein information from the database",
    color: "from-emerald-500/20 to-teal-500/20",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    routes: [
      {
        method: "GET",
        path: "/api/0/proteins/results",
        description: "Get general information about proteins by UniProt IDs",
        example: "kinepik.org/api/0/proteins/results?protein_ids=P42345",
        params: [
          {
            name: "protein_ids",
            type: "string",
            required: true,
            description: "UniProt IDs (comma-separated)",
          },
          {
            name: "fields",
            type: "string",
            required: false,
            description: 'Filter: "kinase" or "mappedgene"',
          },
        ],
      },
      {
        method: "GET",
        path: "/api/0/proteins/results?fields=kinase",
        description: "Get kinase-specific information for proteins",
        example:
          "kinepik.org/api/0/proteins/results?protein_ids=P42345&fields=kinase",
        params: [],
      },
      {
        method: "GET",
        path: "/api/0/proteins/results?fields=mappedgene",
        description: "Get gene mapping information for proteins",
        example:
          "kinepik.org/api/0/proteins/results?protein_ids=P42345&fields=mappedgene",
        params: [],
      },
    ],
  },
  {
    id: "kinases",
    title: "Kinases Routes",
    icon: FlaskConical,
    description: "Access kinase-specific data and phosphosites",
    color: "from-blue-500/20 to-indigo-500/20",
    borderColor: "border-blue-500/30",
    textColor: "text-blue-600 dark:text-blue-400",
    routes: [
      {
        method: "GET",
        path: "/api/0/kinases/all",
        description: "Get all kinases in the database",
        example: "kinepik.org/api/0/kinases/all",
        params: [
          {
            name: "phosphosites",
            type: "0|1",
            required: false,
            description: "Include phosphosite data (1=yes)",
          },
        ],
      },
      {
        method: "GET",
        path: "/api/0/kinases/specific",
        description: "Get specific kinases with phosphosite details",
        example: "kinepik.org/api/0/kinases/specific?kinase_ids=P42345",
        params: [
          {
            name: "kinase_ids",
            type: "string",
            required: true,
            description: "UniProt IDs (comma-separated)",
          },
          {
            name: "phosphosites",
            type: "string",
            required: false,
            description: '"targets" or "sites"',
          },
          {
            name: "confidence",
            type: "0|1",
            required: false,
            description: "High confidence only (1=yes)",
          },
        ],
      },
    ],
  },
  {
    id: "perturbation",
    title: "Perturbation Routes",
    icon: Beaker,
    description:
      "Access experimental perturbation data, KSEA values, and fold-change",
    color: "from-rose-500/20 to-pink-500/20",
    borderColor: "border-rose-500/30",
    textColor: "text-rose-600 dark:text-rose-400",
    routes: [
      {
        method: "GET",
        path: "/api/0/perturbation/all",
        description: "Get all available perturbations",
        example: "kinepik.org/api/0/perturbation/all",
        params: [
          {
            name: "type",
            type: "string",
            required: false,
            description: '"small_molecule" or "knockout"',
          },
        ],
      },
      {
        method: "GET",
        path: "/api/0/perturbation/available",
        description: "Get available perturbations or target kinases",
        example: "kinepik.org/api/0/perturbation/available?name=AZD3759",
        params: [
          {
            name: "name",
            type: "string",
            required: true,
            description: "Perturbation name or UniProt ID",
          },
          {
            name: "confidence",
            type: "number",
            required: false,
            description: "Remaining activity threshold (0-1)",
          },
        ],
      },
      {
        method: "GET",
        path: "/api/0/perturbation/fc",
        description:
          "Get log2 fold-change values for phosphosites under perturbations",
        example:
          "kinepik.org/api/0/perturbation/fc?type=target_phosphosite&id=AAK1(S637)&cell_line=NTERA2&confidence=1",
        params: [
          {
            name: "type",
            type: "string",
            required: true,
            description: '"source", "target_kinase", or "target_phosphosite"',
          },
          {
            name: "id",
            type: "string",
            required: true,
            description: "UniProt ID or phosphosite ID",
          },
          {
            name: "cell_line",
            type: "string",
            required: false,
            description: "MCF7, NTERA2, or HL60",
          },
          {
            name: "confidence",
            type: "0|1",
            required: false,
            description: "High confidence only",
          },
        ],
      },
      {
        method: "GET",
        path: "/api/0/perturbation/KSEA",
        description: "Get KSEA values for kinase-perturbation pairs",
        example:
          "kinepik.org/api/0/perturbation/KSEA?kinase_ids=Q15208&perturbations=AZD3759&cell_line=MCF7",
        params: [
          {
            name: "kinase_ids",
            type: "string",
            required: true,
            description: "UniProt ID(s)",
          },
          {
            name: "perturbations",
            type: "string",
            required: true,
            description: "Perturbation name(s)",
          },
          {
            name: "cell_line",
            type: "string",
            required: false,
            description: "MCF7, NTERA2, or HL60",
          },
          {
            name: "weighted",
            type: "boolean",
            required: false,
            description: "Use weighted values",
          },
          {
            name: "autophosphorylation",
            type: "string",
            required: false,
            description: '"include" or "exclude"',
          },
          {
            name: "phosphosite_confidence",
            type: "0|1",
            required: false,
            description: "High confidence only",
          },
          {
            name: "sid",
            type: "number",
            required: false,
            description: "Signal intensity-dependent threshold",
          },
        ],
      },
    ],
  },
  {
    id: "sif",
    title: "SIF Routes (Cytoscape)",
    icon: Share2,
    description:
      "Export interaction data in SIF format for network visualization in Cytoscape",
    color: "from-violet-500/20 to-purple-500/20",
    borderColor: "border-violet-500/30",
    textColor: "text-violet-600 dark:text-violet-400",
    routes: [
      {
        method: "GET",
        path: "/api/0/sif/all",
        description: "Get all kinase interactions in SIF format",
        example: "kinepik.org/api/0/sif/all?resolution=phosphosites",
        params: [
          {
            name: "resolution",
            type: "string",
            required: true,
            description: '"phosphosites" or "kinases"',
          },
        ],
      },
      {
        method: "GET",
        path: "/api/0/sif/specific",
        description: "Get interactions for specific kinases in SIF format",
        example:
          "kinepik.org/api/0/sif/specific?kinase_ids=P01133,P00533,P62993&resolution=phosphosites",
        params: [
          {
            name: "kinase_ids",
            type: "string",
            required: true,
            description: "UniProt IDs (comma-separated)",
          },
          {
            name: "resolution",
            type: "string",
            required: true,
            description: '"phosphosites" or "kinases"',
          },
        ],
      },
      {
        method: "GET",
        path: "/api/0/sif/attributes",
        description:
          "Get attribute table for SIF data (for Cytoscape node styling)",
        example:
          "kinepik.org/api/0/sif/attributes?kinases=P01133,P00533&resolution=phosphosites&type=IDs",
        params: [
          {
            name: "kinases",
            type: "string",
            required: true,
            description: '"all" or UniProt IDs',
          },
          {
            name: "resolution",
            type: "string",
            required: true,
            description: '"phosphosites" or "kinases"',
          },
          {
            name: "type",
            type: "string",
            required: true,
            description: '"IDs", "type", or "known"',
          },
        ],
      },
    ],
  },
];

export default function HelpPage() {
  const [expandedSection, setExpandedSection] = useState<string | null>(
    "protein",
  );
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(text);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground />

      <main className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-xl">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              API Documentation
            </h1>
            <p className="text-muted-foreground text-sm">
              Complete guide to the KINEPIK REST API
            </p>
          </div>
        </div>

        {/* Introduction Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-card border border-border rounded-xl mb-8"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Introduction
              </h2>
              <p className="text-muted-foreground text-sm mb-4">
                KINEPIK is an integrated data resource for cell signalling
                research. The API provides programmatic access to the database
                for querying proteins, kinases, perturbation data, and network
                interactions.
              </p>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Code className="w-4 h-4 text-muted-foreground" />
                <code className="text-sm text-foreground">
                  Base URL:{" "}
                  <span className="text-accent">
                    https://kinepik.org/api/0/
                  </span>
                </code>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                All route info can be found at:{" "}
                <code className="text-accent">
                  kinepik.org/api/0/{"{main_route}"}/info/{"{specific_route}"}
                </code>
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-6 bg-card border border-border rounded-xl mb-8"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <FlaskConical className="w-6 h-6 text-slate-700 dark:text-slate-200" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Example prompt
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Try asking the assistant to both visualise a network and rank
                the most connected kinases.
              </p>
              <div className="p-4 bg-muted rounded-lg border border-border">
                <code className="text-xs text-foreground whitespace-pre-wrap">
                  Visualise the EGFR signalling network and show the top 10 most
                  connected kinases.
                </code>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Note: the app can open an interactive Cytoscape network panel
                for kinase network visualisation. It also supports
                markdown-style tables for ranked connectivity or KSEA
                comparisons, but it does not yet render native bar-chart or
                heatmap widgets unless the assistant supplies image content.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-6 bg-card border border-border rounded-xl mb-8"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <Beaker className="w-6 h-6 text-slate-700 dark:text-slate-200" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Suggested query patterns
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Use these question templates to get sensible KSEA, kinase activity,
                and combination-drug answers from the assistant.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 bg-muted rounded-lg border border-border">
                  <p className="text-xs font-semibold text-foreground mb-2">
                    1. What happens when {"{cell line}"} is treated with {"{drug}"}?
                  </p>
                  <code className="text-xs text-foreground whitespace-pre-wrap">
                    What happens when MCF7 cells are treated with AZD3759?
                    
                    What happens when NTERA2 cells are treated with Dasatinib?
                  </code>
                </div>
                <div className="p-4 bg-muted rounded-lg border border-border">
                  <p className="text-xs font-semibold text-foreground mb-2">
                    2. What effect does {"{drug}"} have on the activity of {"{kinase}"}?
                  </p>
                  <code className="text-xs text-foreground whitespace-pre-wrap">
                    What effect does AZD3759 have on mTOR activity in MCF7?
                    
                    How does Dasatinib affect AKT1 in NTERA2?
                  </code>
                </div>
                <div className="p-4 bg-muted rounded-lg border border-border">
                  <p className="text-xs font-semibold text-foreground mb-2">
                    3. Why does {"{kinase}"} activity reduce when {"{cell line}"} is treated with {"{drug}"}?
                  </p>
                  <code className="text-xs text-foreground whitespace-pre-wrap">
                    Why does mTOR activity reduce when MCF7 is treated with AZD3759?
                    
                    Why does AKT1 get inhibited when NTERA2 is treated with Dasatinib?
                  </code>
                </div>
                <div className="p-4 bg-muted rounded-lg border border-border">
                  <p className="text-xs font-semibold text-foreground mb-2">
                    4. What would happen if {"{cell line}"} was treated with {"{drug A}"} and {"{drug B}"}?
                  </p>
                  <code className="text-xs text-foreground whitespace-pre-wrap">
                    What would happen if MCF7 was treated with both AZD3759 and Dasatinib?
                    
                    What is the combined effect of AZD3759 and Gefitinib in HL60?
                  </code>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                These templates are useful for KSEA analysis, kinase activity
                interpretation, and combination perturbation comparisons.
              </p>
            </div>
          </div>
        </motion.div>

        {/* API Sections */}
        <div className="space-y-4">
          {API_SECTIONS.map((section, sectionIdx) => (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sectionIdx * 0.1 }}
              className={cn(
                "border rounded-xl overflow-hidden bg-card",
                section.borderColor,
              )}
            >
              {/* Section Header */}
              <button
                onClick={() =>
                  setExpandedSection(
                    expandedSection === section.id ? null : section.id,
                  )
                }
                className={cn(
                  "w-full p-5 flex items-center justify-between",
                  "hover:bg-muted/50 transition-colors",
                  "bg-gradient-to-r",
                  section.color,
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-card/50 flex items-center justify-center">
                    <section.icon
                      className={cn("w-5 h-5", section.textColor)}
                    />
                  </div>
                  <div className="text-left">
                    <h3 className={cn("font-semibold", section.textColor)}>
                      {section.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  className={cn(
                    "w-5 h-5 text-muted-foreground transition-transform",
                    expandedSection === section.id && "rotate-90",
                  )}
                />
              </button>

              {/* Routes */}
              <AnimatePresence>
                {expandedSection === section.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 border-t border-border space-y-4">
                      {section.routes.map((route, routeIdx) => (
                        <div
                          key={routeIdx}
                          className="p-4 bg-muted/30 rounded-lg space-y-3"
                        >
                          {/* Method & Path */}
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs font-mono rounded">
                                {route.method}
                              </span>
                              <code className="text-sm text-foreground font-mono">
                                {route.path}
                              </code>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-sm text-muted-foreground">
                            {route.description}
                          </p>

                          {/* Example */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 p-2 bg-card rounded border border-border overflow-x-auto">
                              <code className="text-xs text-foreground whitespace-nowrap">
                                {route.example}
                              </code>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              onClick={() =>
                                copyToClipboard(`https://${route.example}`)
                              }
                            >
                              {copiedUrl === `https://${route.example}` ? (
                                <Check className="w-4 h-4 text-accent" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </Button>
                            <a
                              href={`https://${route.example}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </a>
                          </div>

                          {/* Parameters */}
                          {route.params.length > 0 && (
                            <div className="pt-2">
                              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                Parameters
                              </h4>
                              <div className="space-y-1">
                                {route.params.map((param, paramIdx) => (
                                  <div
                                    key={paramIdx}
                                    className="flex items-start gap-2 text-xs"
                                  >
                                    <code className="px-1.5 py-0.5 bg-card rounded text-accent font-mono">
                                      {param.name}
                                    </code>
                                    <span className="text-muted-foreground">
                                      ({param.type})
                                    </span>
                                    {param.required && (
                                      <span className="text-destructive">
                                        required
                                      </span>
                                    )}
                                    <span className="text-foreground/70">
                                      - {param.description}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {/* Cell Lines Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 p-6 bg-card border border-border rounded-xl"
        >
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Available Cell Lines
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Experimental data is available for the following cell lines:
          </p>
          <div className="flex flex-wrap gap-2">
            {["MCF7", "NTERA2", "HL60"].map((cell) => (
              <span
                key={cell}
                className="px-3 py-1.5 bg-muted rounded-lg text-sm font-mono text-foreground"
              >
                {cell}
              </span>
            ))}
          </div>
        </motion.div>

        {/* External Link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-6 text-center"
        >
          <a
            href="https://kinepik.org/api"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-accent hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            View full API documentation on kinepik.org
          </a>
        </motion.div>
      </main>
    </div>
  );
}
