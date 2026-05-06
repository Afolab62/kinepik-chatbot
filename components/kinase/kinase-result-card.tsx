"use client";

import { motion } from "framer-motion";
import {
  Activity,
  FlaskConical,
  Target,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KinaseCandidate } from "@/lib/types/kinepik";

interface KinaseResultCardProps {
  candidate: KinaseCandidate;
  index: number;
}

export function KinaseResultCard({ candidate, index }: KinaseResultCardProps) {
  const confidenceColors = {
    high: "bg-accent text-accent-foreground",
    medium: "bg-chart-4/80 text-foreground",
    low: "bg-muted text-muted-foreground",
  };

  const scorePercentage = Math.round(candidate.score * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.1, type: "spring", stiffness: 200 }}
      className="bg-card border border-border rounded-xl p-4 hover:border-accent/50 transition-colors group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground text-lg">
              {candidate.kinaseName}
            </h3>
            <span
              className={cn(
                "px-2 py-0.5 text-xs font-medium rounded-full",
                confidenceColors[candidate.confidence],
              )}
            >
              {candidate.confidence}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {candidate.family} / {candidate.subfamily}
          </p>
        </div>
        <a
          href={`https://www.uniprot.org/uniprotkb/${candidate.uniprotId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-accent transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Score Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-muted-foreground flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Match Score
          </span>
          <span className="font-mono font-medium text-foreground">
            {scorePercentage}%
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${scorePercentage}%` }}
            transition={{
              delay: index * 0.1 + 0.3,
              duration: 0.6,
              ease: "easeOut",
            }}
            className={cn(
              "h-full rounded-full",
              candidate.confidence === "high"
                ? "bg-accent"
                : candidate.confidence === "medium"
                  ? "bg-chart-4"
                  : "bg-muted-foreground",
            )}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          p-value:{" "}
          {candidate.pValue != null ? candidate.pValue.toExponential(2) : "N/A"}
        </p>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Target className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Substrates</span>
          </div>
          <p className="text-foreground text-xs leading-relaxed">
            {candidate.substrate}
          </p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Activity className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Pathways</span>
          </div>
          <p className="text-foreground text-xs leading-relaxed">
            {candidate.relatedPathways.slice(0, 2).join(", ")}
          </p>
        </div>
      </div>

      {/* Inhibitors */}
      {candidate.knownInhibitors.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
            <FlaskConical className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Known Inhibitors</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {candidate.knownInhibitors.map((inhibitor) => (
              <span
                key={inhibitor.inhibitorName}
                className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded-md"
                title={`IC50: ${inhibitor.ic50} nM`}
              >
                {inhibitor.inhibitorName}
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

interface KinaseResultsGridProps {
  candidates: KinaseCandidate[];
}

export function KinaseResultsGrid({ candidates }: KinaseResultsGridProps) {
  if (!candidates || candidates.length === 0) return null;

  return (
    <div className="mt-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 mb-3"
      >
        <Activity className="w-4 h-4 text-accent" />
        <h4 className="font-medium text-foreground">
          KINEPIK Analysis Results
        </h4>
        <span className="text-xs text-muted-foreground">
          {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}{" "}
          identified
        </span>
      </motion.div>
      <div className="grid gap-3 md:grid-cols-2">
        {candidates.map((candidate, index) => (
          <KinaseResultCard
            key={candidate.uniprotId}
            candidate={candidate}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}
