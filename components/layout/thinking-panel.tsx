"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useChatStore } from "@/lib/client/chat-store";

interface ThinkingStep {
  id: string;
  title?: string;
  content: string;
  status: "pending" | "active" | "complete";
}
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ThinkingPanelProps {
  steps: ThinkingStep[];
  isActive: boolean;
}

export function ThinkingPanel({ steps, isActive }: ThinkingPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const { showThinking } = useChatStore();

  if (!showThinking || steps.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mb-4"
    >
      <div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-foreground">
              Chain of Thought
            </span>
            {isActive && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="w-3 h-3 text-accent" />
              </motion.div>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                {steps.map((step, index) => (
                  <ThinkingStepItem key={step.id} step={step} index={index} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ThinkingStepItem({
  step,
  index,
}: {
  step: ThinkingStep;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        "flex items-start gap-3 p-3 rounded-md text-sm",
        step.status === "active" && "bg-accent/10",
        step.status === "complete" && "bg-muted/50",
        step.status === "pending" && "opacity-50",
      )}
    >
      <div className="mt-0.5">
        {step.status === "complete" ? (
          <CheckCircle2 className="w-4 h-4 text-accent" />
        ) : step.status === "active" ? (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <div className="w-4 h-4 rounded-full bg-accent/30 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-accent" />
            </div>
          </motion.div>
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground">{step.title}</p>
        {step.content && (
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {step.content}
          </p>
        )}
      </div>
    </motion.div>
  );
}
