"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  MessageSquare,
  HelpCircle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sun,
  Moon,
  X,
} from "lucide-react";
import { useChatStore } from "@/lib/client/chat-store";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
  onClearChat?: () => void;
  onNewChat?: () => void;
  onConversationSelect?: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const NAV = [
  { href: "/", icon: MessageSquare, label: "Chat" },
  { href: "/help", icon: HelpCircle, label: "Help" },
];

function formatRelativeTime(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function ChatSidebar({
  onClearChat,
  onNewChat,
  onConversationSelect,
  isOpen,
  onToggle,
}: ChatSidebarProps) {
  const pathname = usePathname();
  const { conversations, activeConversationId, deleteConversation } =
    useChatStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 bottom-0 bg-sidebar border-r border-sidebar-border z-40 flex flex-col transition-all duration-300 overflow-hidden",
        isOpen ? "w-80" : "w-16",
      )}
    >
      {/* Toggle button — always at top */}
      <div
        className={cn(
          "flex items-center py-3 px-2",
          isOpen ? "justify-between" : "justify-center",
        )}
      >
        {isOpen && (
          <div className="flex items-center pl-1">
            <span className="text-xl font-bold tracking-widest text-accent uppercase">
              KINEPIK
            </span>
          </div>
        )}
        <button
          onClick={onToggle}
          title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        >
          {isOpen ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* New Chat button */}
      <div className={cn("px-2 mb-2", isOpen ? "" : "flex justify-center")}>
        <button
          onClick={onNewChat}
          title="New chat"
          className={cn(
            "h-11 rounded-lg flex items-center gap-2 px-3 transition-colors text-muted-foreground hover:bg-muted hover:text-foreground",
            isOpen ? "w-full" : "w-10 justify-center",
          )}
        >
          <Plus className="w-5 h-5 shrink-0" />
          {isOpen && <span className="text-base font-medium">New chat</span>}
        </button>
      </div>

      {/* Nav links */}
      <nav
        className={cn(
          "flex flex-col gap-0.5 px-2 mb-2",
          isOpen ? "" : "items-center",
        )}
      >
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              "h-11 rounded-lg flex items-center gap-2 px-3 transition-colors",
              isOpen ? "w-full" : "w-10 justify-center",
              pathname === href
                ? "bg-accent/20 text-accent"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="w-5 h-5 shrink-0" />
            {isOpen && (
              <span className="text-base font-medium truncate">{label}</span>
            )}
          </Link>
        ))}
      </nav>

      {/* Conversation history — only when expanded */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto px-2 min-h-0 mt-4">
          {conversations.length > 0 ? (
            <>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">
                History
              </p>
              <div className="space-y-0.5">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-lg pr-1 transition-colors cursor-pointer",
                      conv.id === activeConversationId
                        ? "bg-accent/15 text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    onClick={() => onConversationSelect?.(conv.id)}
                  >
                    <div className="flex-1 min-w-0 px-2 py-2">
                      <p className="text-sm font-medium truncate leading-tight">
                        {conv.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatRelativeTime(conv.updatedAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conv.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded flex items-center justify-center hover:bg-destructive/20 hover:text-destructive transition-all shrink-0"
                      title="Delete conversation"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center mt-4">
              No conversations yet
            </p>
          )}
        </div>
      )}

      {/* Spacer when collapsed */}
      {!isOpen && <div className="flex-1" />}

      {/* Bottom actions */}
      <div
        className={cn(
          "flex flex-col gap-0.5 px-2 pb-3",
          isOpen ? "" : "items-center",
        )}
      >
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={
            mounted && theme === "dark"
              ? "Switch to light mode"
              : "Switch to dark mode"
          }
          className={cn(
            "h-11 rounded-lg flex items-center gap-2 px-3 transition-colors text-muted-foreground hover:bg-muted hover:text-foreground",
            isOpen ? "w-full" : "w-10 justify-center",
          )}
        >
          {mounted && theme === "dark" ? (
            <Sun className="w-5 h-5 shrink-0" />
          ) : (
            <Moon className="w-5 h-5 shrink-0" />
          )}
          {isOpen && mounted && (
            <span className="text-base font-medium">
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </span>
          )}
          {isOpen && !mounted && (
            <span className="text-base font-medium">Dark mode</span>
          )}
        </button>

        <button
          onClick={() => onClearChat?.()}
          title="Clear chat"
          className={cn(
            "h-11 rounded-lg flex items-center gap-2 px-3 transition-colors text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
            isOpen ? "w-full" : "w-10 justify-center",
          )}
        >
          <Trash2 className="w-5 h-5 shrink-0" />
          {isOpen && (
            <span className="text-base font-medium truncate">Clear Chat</span>
          )}
        </button>
      </div>
    </aside>
  );
}
