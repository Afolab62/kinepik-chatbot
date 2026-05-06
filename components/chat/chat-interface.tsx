"use client";

import Image from "next/image";
import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Loader2, AlertCircle } from "lucide-react";
import { useChatStore, type StoredMessage } from "@/lib/client/chat-store";
import { ChatMessage } from "./chat-message";
import { ChatSidebar } from "./chat-sidebar";
import { cn } from "@/lib/utils";

const EXAMPLE_PROMPTS = [
  "Why does mTOR activity decrease when MCF7 is treated with Rapamycin",
  "What effect does Rapamycin have on mTOR",
  "What kinase families target tyrosine residues?",
  "What are the top 10 most connected kinases?",
];

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

  const {
    conversations,
    activeConversationId,
    createConversation,
    setActiveConversation,
    updateConversation,
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
    const id = createConversation();
    loadedConvRef.current = id;
  }, [createConversation, setMessages]);

  const handleConversationSelect = useCallback(
    (id: string) => {
      if (id === activeConversationId) return;
      setActiveConversation(id);
      loadedConvRef.current = null;
    },
    [activeConversationId, setActiveConversation],
  );

  const handleClearChat = useCallback(() => {
    setMessages([]);
    clearStoreMessages();
    setChatError(null);
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

      <main
        className={cn(
          "flex flex-col flex-1 h-screen min-w-0 transition-all duration-300",
          sidebarOpen ? "ml-80" : "ml-16",
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
                  const textContent = message.parts
                    .filter(
                      (p): p is Extract<typeof p, { type: "text" }> =>
                        p.type === "text",
                    )
                    .map((p) => p.text)
                    .join("");
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
