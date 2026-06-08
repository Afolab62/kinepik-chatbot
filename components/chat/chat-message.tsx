"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Copy, Check, Share2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/client/chat-store";
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
          "group max-w-[75%] space-y-1",
          isUser ? "items-end" : "items-start",
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
                  img: ({ src, alt }) => (
                    <img
                      src={src}
                      alt={alt ?? ""}
                      className="rounded-lg max-w-full my-2 border border-border"
                      loading="lazy"
                    />
                  ),
                }}
              >
                {cleanContent(message.content)}
              </ReactMarkdown>
            </div>
          )}

          {/* Kinase Results */}
          {!isUser && kinaseData && kinaseData.length > 0 && (
            <KinaseResultsGrid candidates={kinaseData} />
          )}

          {/* Images */}
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-3">
              {message.images.map((img, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative group/img"
                >
                  <img
                    src={img}
                    alt={`Generated visualization ${idx + 1}`}
                    className="rounded-lg border border-border max-w-xs shadow-md"
                  />
                </motion.div>
              ))}
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

function cleanContent(content: string | undefined | null): string {
  if (!content) return "";
  return content
    .replace(/```json\n\{[\s\S]*?"candidates"[\s\S]*?\}\n```/g, "")
    .replace(/\{[\s\S]*?"candidates"[\s\S]*?\}/g, "")
    .trim();
}
