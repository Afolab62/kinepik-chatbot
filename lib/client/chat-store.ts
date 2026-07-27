// Client-side chat state — Zustand store with multi-conversation persistence.
// Import this in client components via '@/lib/client/chat-store'

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NetworkData } from "@/lib/server/tools/get-kinase-network";

export interface ToolCall {
  toolName: string;
  timestamp?: string;
  input?: unknown;
  output?: unknown;
}

export interface VisualizationAsset {
  url: string;
  title?: string;
  type?: string;
  downloadName?: string;
}

export type StoredVisualizationAsset = string | VisualizationAsset;

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  images?: VisualizationAsset[];
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: { type: "text"; text: string }[];
  images?: StoredVisualizationAsset[];
  toolCalls?: ToolCall[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  lastNetworkData?: NetworkData;
  createdAt: number;
  updatedAt: number;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  showThinking: boolean;

  createConversation: () => string;
  setActiveConversation: (id: string) => void;
  updateConversation: (id: string, messages: StoredMessage[]) => void;
  saveNetworkData: (id: string, data: NetworkData) => void;
  deleteConversation: (id: string) => void;
  toggleThinking: () => void;
  clearMessages: () => void;
}

function generateTitle(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  return first.content.slice(0, 40) + (first.content.length > 40 ? "…" : "");
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      showThinking: false,

      createConversation: () => {
        const id = crypto.randomUUID();
        const conv: Conversation = {
          id,
          title: "New conversation",
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          conversations: [conv, ...state.conversations],
          activeConversationId: id,
        }));
        return id;
      },

      setActiveConversation: (id) => {
        set({ activeConversationId: id });
      },

      updateConversation: (id, messages) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id
              ? {
                  ...c,
                  messages,
                  title: generateTitle(messages),
                  updatedAt: Date.now(),
                }
              : c,
          ),
        }));
      },

      saveNetworkData: (id, data) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, lastNetworkData: data } : c,
          ),
        }));
      },

      deleteConversation: (id) => {
        const { conversations, activeConversationId, createConversation } =
          get();
        const remaining = conversations.filter((c) => c.id !== id);
        if (activeConversationId === id) {
          if (remaining.length > 0) {
            set({
              conversations: remaining,
              activeConversationId: remaining[0].id,
            });
          } else {
            set({ conversations: remaining, activeConversationId: null });
            createConversation();
          }
        } else {
          set({ conversations: remaining });
        }
      },

      toggleThinking: () =>
        set((state) => ({ showThinking: !state.showThinking })),

      clearMessages: () => {
        const { activeConversationId } = get();
        if (!activeConversationId) return;
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === activeConversationId
              ? { ...c, messages: [], updatedAt: Date.now() }
              : c,
          ),
        }));
      },
    }),
    {
      name: "kinepik-chat-store",
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        showThinking: state.showThinking,
      }),
    },
  ),
);
