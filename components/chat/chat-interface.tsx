"use client";

import Image from "next/image";
import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Loader2, AlertCircle, PanelRight } from "lucide-react";
import { useChatStore, type StoredMessage } from "@/lib/client/chat-store";
import { ChatMessage } from "./chat-message";
import { ChatSidebar } from "./chat-sidebar";
import { NetworkPanel } from "@/components/network/network-panel";
import { cn } from "@/lib/utils";
import type { NetworkData } from "@/lib/server/tools/get-kinase-network";

const EXAMPLE_PROMPTS = [
  "Why does mTOR activity decrease when MCF7 is treated with Rapamycin",
  "Visualise the EGFR signalling network",
  "What kinase families target tyrosine residues?",
  "Show me the PI3K/AKT/mTOR network",
];

/** Extract all getKinaseNetwork results from a message's parts. */
function extractNetworkDataFromParts(
  parts: { type: string; [key: string]: unknown }[],
): NetworkData | null {
  for (const part of parts) {
    if (
      part.type === "tool-getKinaseNetwork" &&
      (part as { state?: string }).state === "output-available"
    ) {
      const output = (part as { output?: { networkData?: NetworkData } }).output;
      if (output?.networkData) return output.networkData;
    }
  }
  return null;
}

function toStoredMessages(
  msgs: ReturnType<typeof useChat>["messages"],
): StoredMessage[] {
  return msgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const parts = (m.parts ?? []).filter(
        (p): p is { type: "text"; text: string } => p.type === "text",
      );
      const content = parts.map((p) => p.text).join("");
      return { id: m.id, role: m.role as "user" | "assistant", content, parts };
    });
}

function fromStoredMessages(stored: StoredMessage[]) {
  return stored.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    parts: m.parts?.length
      ? m.parts
      : [{ type: "text" as const, text: m.content }],
    createdAt: new Date(),
  }));
}

export function ChatInterface() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [networkPanelOpen, setNetworkPanelOpen] = useState(false);
  const [activeNetworkData, setActiveNetworkData] = useState<NetworkData | null>(null);
  const lastNetworkIdRef = useRef<string | null>(null);

  const {
    conversations,
    activeConversationId,
    createConversation,
    setActiveConversation,
    updateConversation,
    saveNetworkData,
    clearMessages: clearStoreMessages,
  } = useChatStore();

  const loadedConvRef = useRef<string | null>(null);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onError: (err) => {
      setChatError(
        err.message ?? "An error occurred. Check your API key in .env.local.",
      );
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-open network panel whenever a new getKinaseNetwork result arrives
  useEffect(() => {
    // Scan in reverse to find the most recent network result
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      const parts = (msg.parts ?? []) as { type: string; [key: string]: unknown }[];
      const networkData = extractNetworkDataFromParts(parts);
      if (networkData) {
        // Use a stable key so we don't re-open on every render
        const key = `${msg.id}`;
        if (key !== lastNetworkIdRef.current) {
          lastNetworkIdRef.current = key;
          setActiveNetworkData(networkData);
          setNetworkPanelOpen(true);
          // Persist the network data so it survives conversation switches
          if (activeConversationId) {
            saveNetworkData(activeConversationId, networkData);
          }
        }
        break;
      }
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeConversationId) createConversation();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeConversationId) return;
    if (loadedConvRef.current === activeConversationId) return;
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (conv && conv.messages.length > 0) {
      setMessages(
        fromStoredMessages(conv.messages) as Parameters<typeof setMessages>[0],
      );
    } else {
      setMessages([]);
    }
    // Restore any network data persisted for this conversation
    if (conv?.lastNetworkData) {
      setActiveNetworkData(conv.lastNetworkData);
      // Don't auto-open — let the user click "View Network" to reopen
    } else {
      setActiveNetworkData(null);
    }
    loadedConvRef.current = activeConversationId;
  }, [activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeConversationId || messages.length === 0 || isLoading) return;
    updateConversation(activeConversationId, toStoredMessages(messages));
  }, [messages, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setChatError(null);
    setNetworkPanelOpen(false);
    setActiveNetworkData(null);
    lastNetworkIdRef.current = null;
    const id = createConversation();
    loadedConvRef.current = id;
  }, [createConversation, setMessages]);

  const handleConversationSelect = useCallback(
    (id: string) => {
      if (id === activeConversationId) return;
      setActiveConversation(id);
      setNetworkPanelOpen(false);
      setActiveNetworkData(null);
      lastNetworkIdRef.current = null;
      loadedConvRef.current = null;
    },
    [activeConversationId, setActiveConversation],
  );

  const handleClearChat = useCallback(() => {
    setMessages([]);
    clearStoreMessages();
    setChatError(null);
    setNetworkPanelOpen(false);
    setActiveNetworkData(null);
    lastNetworkIdRef.current = null;
  }, [setMessages, clearStoreMessages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    setChatError(null);
    if (!activeConversationId) createConversation();
    sendMessage({ text: input });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <ChatSidebar
        onClearChat={handleClearChat}
        onNewChat={handleNewChat}
        onConversationSelect={handleConversationSelect}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
      />

      {/* Cytoscape network side panel */}
      <NetworkPanel
        networkData={activeNetworkData}
        isOpen={networkPanelOpen}
        onClose={() => setNetworkPanelOpen(false)}
      />

      <main
        className={cn(
          "flex flex-col flex-1 h-screen min-w-0 transition-all duration-300",
          sidebarOpen ? "ml-80" : "ml-16",
          networkPanelOpen ? "mr-130" : "",
        )}
      >
        {/* Messages / Welcome */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {messages.length === 0 ? (
              <motion.div
                key="welcome"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center h-full px-6 pb-8"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 24 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 180,
                    damping: 22,
                    delay: 0.05,
                  }}
                  style={{
                    width: "min(820px, 96vw)",
                    height: 300,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <Image
                    src="/kinepik-logo.png"
                    alt="KINEPIK"
                    fill
                    loading="eager"
                    style={{
                      objectFit: "cover",
                      objectPosition: "center 50%",
                    }}
                  />
                </motion.div>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.4 }}
                  className="text-muted-foreground text-center text-lg max-w-lg mt-6 mb-8"
                >
                  Powered by Biochatter for kinase identification, analysis and
                  visualisation
                </motion.p>
              </motion.div>
            ) : (
              <motion.div
                key="messages"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="max-w-3xl mx-auto w-full py-6 px-4 space-y-4"
              >
                {messages.map((message, index) => {
                  const parts = (message.parts ?? []) as { type: string; [key: string]: unknown }[];
                  const textContent = parts
                    .filter(
                      (p): p is { type: "text"; text: string } =>
                        p.type === "text",
                    )
                    .map((p) => p.text)
                    .join("");
                  // Prefer live tool-part data; fall back to stored network data on
                  // the last assistant message (covers restored conversations).
                  const isLastAssistant =
                    message.role === "assistant" &&
                    messages.slice(index + 1).every((m) => m.role !== "assistant");
                  const msgNetworkData =
                    extractNetworkDataFromParts(parts) ??
                    (isLastAssistant ? activeNetworkData : null);
                  return (
                    <ChatMessage
                      key={message.id}
                      message={{
                        id: message.id,
                        role: message.role as "user" | "assistant",
                        content: textContent,
                        timestamp: Date.now(),
                        isStreaming:
                          isLoading &&
                          index === messages.length - 1 &&
                          message.role === "assistant",
                      }}
                      index={index}
                      networkData={msgNetworkData ?? undefined}
                      onViewNetwork={
                        msgNetworkData
                          ? () => {
                              setActiveNetworkData(msgNetworkData);
                              setNetworkPanelOpen(true);
                            }
                          : undefined
                      }
                    />
                  );
                })}
                <div ref={messagesEndRef} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input area */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.15,
            type: "spring",
            stiffness: 260,
            damping: 28,
          }}
          className="border-t border-border bg-background px-4 py-8 shrink-0"
        >
          <div className="max-w-4xl mx-auto w-full">
            {/* Network toggle pill — appears when a network is available */}
            <AnimatePresence>
              {activeNetworkData && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="flex justify-end mb-1.5"
                >
                  <button
                    onClick={() => setNetworkPanelOpen((o) => !o)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors",
                      networkPanelOpen
                        ? "bg-accent/10 border-accent/30 text-accent hover:bg-accent/20"
                        : "bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                    )}
                  >
                    <PanelRight className="w-3 h-3" />
                    Network
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-wrap gap-2 mb-3 justify-center"
                >
                  {EXAMPLE_PROMPTS.map((prompt, i) => (
                    <motion.button
                      key={i}
                      type="button"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: 0.35 + i * 0.07,
                        type: "spring",
                        stiffness: 300,
                        damping: 24,
                      }}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        setInput(prompt);
                        textareaRef.current?.focus();
                      }}
                      className="text-sm px-5 py-2.5 rounded-full border border-border bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {prompt}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {chatError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="mb-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{chatError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-end gap-2 bg-muted rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-accent/30 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about kinases, phosphorylation sites, or signaling pathways..."
                rows={1}
                className="flex-1 bg-transparent resize-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-h-6 max-h-48"
                disabled={isLoading}
              />
              <motion.button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                whileHover={input.trim() && !isLoading ? { scale: 1.1 } : {}}
                whileTap={input.trim() && !isLoading ? { scale: 0.88 } : {}}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className={cn(
                  "shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  input.trim() && !isLoading
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-muted-foreground/20 text-muted-foreground cursor-not-allowed",
                )}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowUp className="w-4 h-4" />
                )}
              </motion.button>
            </div>

            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
