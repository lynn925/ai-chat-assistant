"use client";

import { useEffect, useState, useCallback } from "react";
import type { ModelMessage, UIMessage } from "ai";

const THREAD_KEY = "chat:threadId";

export interface UseChatThreadReturn {
  threadId: string;
  storeKind: "redis" | "memory" | null;
  hydrated: boolean;
  setThreadId: (id: string) => void;
  loadHistory: (setMessages: (msgs: UIMessage[]) => void) => Promise<void>;
  clearServerHistory: () => Promise<void>;
}

export function useChatThread(): UseChatThreadReturn {
  const [threadId, setThreadIdState] = useState<string>("");
  const [storeKind, setStoreKind] = useState<"redis" | "memory" | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // 客户端水合后生成/读取 threadId
  useEffect(() => {
    let id = localStorage.getItem(THREAD_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(THREAD_KEY, id);
    }
    setThreadIdState(id);
    setHydrated(true);
  }, []);

  const setThreadId = useCallback((id: string) => {
    localStorage.setItem(THREAD_KEY, id);
    setThreadIdState(id);
  }, []);

  const loadHistory = useCallback(
    async (setMessages: (msgs: UIMessage[]) => void): Promise<void> => {
      if (!threadId) return;
      try {
        const res = await fetch(`/api/sessions/${threadId}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          kind: "redis" | "memory";
          messages: ModelMessage[];
        };
        setStoreKind(data.kind);
        const uiMsgs: UIMessage[] = (data.messages ?? []).map(
          (m, i): UIMessage => {
            const text = Array.isArray(m.content)
              ? m.content.map((p) => (p.type === "text" ? p.text : "")).join("")
              : typeof m.content === "string"
                ? m.content
                : "";
            return {
              id: `loaded-${i}`,
              role: m.role as UIMessage["role"],
              parts: [{ type: "text", text }],
            };
          },
        );
        setMessages(uiMsgs);
      } catch (err) {
        console.warn("加载历史失败:", err);
      }
    },
    [threadId],
  );

  const clearServerHistory = useCallback(async (): Promise<void> => {
    if (!threadId) return;
    await fetch(`/api/sessions/${threadId}`, { method: "DELETE" }).catch(
      () => {},
    );
  }, [threadId]);

  return {
    threadId,
    storeKind,
    hydrated,
    setThreadId,
    loadHistory,
    clearServerHistory,
  };
}
