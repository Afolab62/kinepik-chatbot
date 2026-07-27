"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Copy, Check, Share2, ImageIcon, Download, ExternalLink } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Message, VisualizationAsset } from "@/lib/client/chat-store";
import { KinaseResultsGrid } from "../kinase/kinase-result-card";
import type { KinaseCandidate } from "@/lib/types/kinepik";
import type { NetworkData } from "@/lib/server/tools/get-kinase-network";

interface ChatMessageProps {
  message: Message;
  index: number;
  networkData?: NetworkData;
  onViewNetwork?: () => void;
}

export function ChatMessage({ message, index, networkData, onViewNetwork }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const hasVisualizations = !isUser && Boolean(message.images?.length);
  const hasDataToolEvidence = hasRelevantDataToolCall(message.toolCalls);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const kinaseData = extractKinaseData(message.content);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.03,
        type: "spring",
        stiffness: 400,
        damping: 35,
      }}
      className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      {/* Avatar — only for assistant */}
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center mt-0.5">
          <Bot className="w-3.5 h-3.5 text-accent" />
        </div>
      )}

      {/* Bubble */}
      <div
        className={cn(
          "group space-y-1",
          isUser
            ? "max-w-[75%] items-end"
            : hasVisualizations
              ? "max-w-[min(100%,56rem)] items-start"
              : "max-w-[75%] items-start",
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-accent text-accent-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div
              className={cn(
                "prose prose-sm prose-neutral dark:prose-invert max-w-none",
                "prose-headings:text-foreground prose-p:text-foreground/90 prose-p:my-1",
                "prose-strong:text-foreground prose-code:text-accent",
                "prose-pre:bg-background/50 prose-pre:border prose-pre:border-border prose-pre:text-xs",
                "prose-a:text-accent hover:prose-a:text-accent/80",
                "prose-ul:my-1 prose-li:my-0",
              )}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="my-3 overflow-x-auto rounded-lg border border-border/70">
                      <table className="min-w-full border-collapse text-xs">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-muted/60 text-foreground">{children}</thead>
                  ),
                  tr: ({ children }) => (
                    <tr className="border-b border-border/60 last:border-b-0">{children}</tr>
                  ),
                  th: ({ children }) => (
                    <th className="px-3 py-2 text-left font-semibold">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-2 align-top text-foreground/90">{children}</td>
                  ),
                  img: ({ src, alt }) => {
                    if (!src) return null;
                    return (
                      <Image
                        src={src}
                        alt={alt ?? ""}
                        width={1200}
                        height={800}
                        unoptimized
                        className="rounded-lg max-w-full my-2 border border-border h-auto"
                      />
                    );
                  },
                }}
              >
                {cleanContent(message.content, { stripVisualizationMarkdown: hasVisualizations })}
              </ReactMarkdown>
            </div>
          )}

          {/* Kinase Results */}
          {!isUser && kinaseData && kinaseData.length > 0 && (
            <KinaseResultsGrid candidates={kinaseData} />
          )}

          {/* Images */}
          {message.images && message.images.length > 0 && (
            <div className="mt-4 space-y-4">
              {message.images.map((image, idx) => (
                <motion.div
                  key={`${image.url}-${idx}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="overflow-hidden rounded-2xl border border-border/70 bg-background/80 shadow-lg shadow-black/5"
                >
                  <VisualizationCard image={image} index={idx} />
                </motion.div>
              ))}
            </div>
          )}

          {!isUser && message.content && /visuali[sz]e|chart|plot|heatmap|radar/i.test(message.content) && !message.images?.length && (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-background/40 px-2.5 py-2 text-[11px] text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" />
              Visualisation requested — the assistant can render a chart once the relevant KINEPIK data is available.
            </div>
          )}

          {/* API Transparency: Check for tool metadata in message */}
          {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
            <details className="mt-3 text-[11px]">
              <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground flex items-center gap-2">
                <span>📊 Data Sources ({message.toolCalls.length})</span>
              </summary>
              <div className="mt-2 space-y-2 p-2 bg-background/50 rounded border border-border/40">
                {message.toolCalls.map((call, idx) => (
                  <div key={idx} className="text-[10px] space-y-1 p-1.5 bg-muted/40 rounded border border-border/20">
                    <div className="font-mono font-bold text-accent">
                      ✓ {call.toolName}
                    </div>
                    {Boolean(call.input) && (
                      <div className="text-muted-foreground">
                        <span className="text-foreground/60">Input:</span>{" "}
                        {typeof call.input === "string"
                          ? call.input
                          : JSON.stringify(call.input).substring(0, 100)}
                      </div>
                    )}
                    {call.timestamp && (
                      <div className="text-muted-foreground/60 text-[9px]">
                        {new Date(call.timestamp).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Hallucination warning: No tool calls made */}
          {!isUser && 
            message.content && 
            message.content.length > 100 && 
            !hasDataToolEvidence && 
            /affected|kinase|activity|perturbation|drug|treatment/i.test(message.content) && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-2.5 py-2 text-[11px]">
              <div className="text-yellow-600 dark:text-yellow-400 font-bold">⚠️</div>
              <div className="text-yellow-700 dark:text-yellow-300">
                <strong>No data tools were called.</strong> This response may be based on general knowledge rather than live KINEPIK data. Consider asking a more specific question or request a visualization to trigger data retrieval.
              </div>
            </div>
          )}

          {/* Streaming indicator */}
          {message.isStreaming && (
            <motion.div
              className="flex items-center gap-1 mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 bg-accent rounded-full"
                  animate={{ y: [0, -4, 0] }}
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    delay: i * 0.1,
                  }}
                />
              ))}
            </motion.div>
          )}
        </div>

        {/* Copy button — assistant only */}
        {!isUser && (
          <div className="flex items-center gap-1">
            {/* View Network button */}
            {onViewNetwork && networkData && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                onClick={onViewNetwork}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent hover:text-accent transition-colors"
                title="Open interactive network visualisation"
              >
                <Share2 className="w-3 h-3" />
                View Network
                <span className="text-accent/60">
                  {networkData.nodeCount}n · {networkData.edgeCount}e
                </span>
              </motion.button>
            )}
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
              title="Copy message"
            >
              {copied ? (
                <Check className="w-3 h-3 text-accent" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function VisualizationCard({
  image,
  index,
}: {
  image: VisualizationAsset;
  index: number;
}) {
  const title = image.title?.trim() || `Generated visualisation ${index + 1}`;
  const typeLabel = image.type ? image.type.replace(/-/g, " ").toLowerCase() : "chart";
  const downloadName = image.downloadName || buildDownloadName(image.url, title);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {typeLabel}:
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={image.url}
            download={downloadName}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
            title="Download visualisation"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
          <a
            href={image.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
            title="Open full-size visualisation"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
        </div>
      </div>
      <a
        href={image.url}
        target="_blank"
        rel="noreferrer"
        className="block bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.08),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.35),rgba(255,255,255,0))] p-3"
      >
        <Image
          src={image.url}
          alt={title}
          width={1600}
          height={900}
          unoptimized
          className="max-h-136 w-full rounded-xl border border-border/70 bg-white object-contain shadow-sm h-auto"
        />
      </a>
    </div>
  );
}

function buildDownloadName(url: string, title: string): string {
  const extension = url.split(".").pop()?.split(/[?#]/)[0] || "png";
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "kinepik-visualisation";
  return `${slug}.${extension}`;
}

function hasRelevantDataToolCall(toolCalls: Message["toolCalls"]): boolean {
  if (!toolCalls || toolCalls.length === 0) return false;

  return toolCalls.some((call) =>
    [
      "analyzeKinase",
      "comparePerturbations",
      "listPerturbations",
      "getTopAffectedKinases",
      "getTopKinaseConnectivity",
      "getKinaseNetwork",
      "batchRankKinases",
      "analyzeCombinationTherapy",
    ].includes(call.toolName),
  );
}

function extractKinaseData(
  content: string | undefined | null,
): KinaseCandidate[] | null {
  if (!content) return null;
  try {
    const jsonMatch = content.match(/\{[\s\S]*"candidates"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.candidates && Array.isArray(parsed.candidates)) {
        return parsed.candidates;
      }
    }
  } catch {
    // Not JSON content, that's fine
  }
  return null;
}

function cleanContent(
  content: string | undefined | null,
  options: { stripVisualizationMarkdown?: boolean } = {},
): string {
  if (!content) return "";
  let cleaned = content
    .replace(/```json\n\{[\s\S]*?"candidates"[\s\S]*?\}\n```/g, "")
    .replace(/\{[\s\S]*?"candidates"[\s\S]*?\}/g, "");

  cleaned = cleaned
    .replace(
      /(?:^|\s)(?:there was|there is|i encountered|the plot attempt|the graph attempt|the chart attempt|the visuali[sz]ation attempt)\s+(?:a\s+)?technical issue[^.]*\.\s*(?:let me|i will)\s+[^.]*\.?/gim,
      " ",
    )
    .replace(
      /(?:^|\s)(?:the )?(?:plot|graph|chart|visuali[sz]ation)\s+generation\s+(?:encountered|hit|ran into)\s+an?\s+error[^.]*\.\s*(?:let me|i will)\s+[^.]*\.?/gim,
      " ",
    )
    .replace(
      /(?:^|\s)(?:the )?(?:plot|graph|chart|visuali[sz]ation)\s+attempt\s+failed[^.]*\.\s*(?:let me|i will)\s+[^.]*\.?/gim,
      " ",
    )
    .replace(/\n{3,}/g, "\n\n");

  if (options.stripVisualizationMarkdown) {
    cleaned = cleaned
      .replace(/^!\[[^\]]*\]\([^\n]+\)\s*$/gm, "")
      .replace(/^\[!\[[^\]]*\]\([^\n]+\)\]\([^\n]+\)\s*$/gm, "")
      .replace(/^\[(Download|Open)\]\([^\n]+\)\s*\[(Download|Open)\]\([^\n]+\)\s*$/gm, "")
      .replace(/^\[(Download|Open)\]\([^\n]+\)\s*$/gm, "")
      .replace(/^https?:\/\/[^\s]+$/gm, "")
      .replace(/\n\s*⚠️\s*/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  return cleaned.trim();
}
