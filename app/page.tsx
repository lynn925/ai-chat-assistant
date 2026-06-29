"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage, type ModelMessage } from "ai";

const THREAD_KEY = "chat:threadId";

function getOrCreateThreadId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(THREAD_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(THREAD_KEY, id);
  }
  return id;
}

function newThreadId(): string {
  const id = crypto.randomUUID();
  localStorage.setItem(THREAD_KEY, id);
  return id;
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string>("");
  const [storeKind, setStoreKind] = useState<"redis" | "memory" | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // 客户端水合后生成/读取 threadId
  useEffect(() => {
    setThreadId(getOrCreateThreadId());
    setHydrated(true);
  }, []);

  // useChat 封装流式请求、消息管理
  const { messages, sendMessage, stop, status, setMessages, error } = useChat({
    id: threadId, // 切换 threadId 时 useChat 会自动重置
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ threadId }),
    }),
  });

  // 切换 threadId 后加载历史
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${threadId}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          kind: "redis" | "memory";
          messages: ModelMessage[];
        };
        if (cancelled) return;
        setStoreKind(data.kind);
        // 把 ModelMessage[] 还原为 UIMessage 形态（加 id）
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
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, setMessages]);

  const isStreaming = status === "submitted" || status === "streaming";

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming || !threadId) return;
    sendMessage({ text });
    setInput("");
  };

  const onNewChat = async () => {
    const oldId = threadId;
    const id = newThreadId();
    setThreadId(id);
    setMessages([]);
    // 可选：异步清服务端记录
    if (oldId) {
      fetch(`/api/sessions/${oldId}`, { method: "DELETE" }).catch(() => {});
    }
  };

  const onClearCurrent = async () => {
    if (!threadId) return;
    setMessages([]);
    fetch(`/api/sessions/${threadId}`, { method: "DELETE" }).catch(() => {});
  };

  return (
    <main className="max-w-3xl mx-auto p-4 min-h-screen flex flex-col">
      <div className="flex items-center justify-between py-4">
        <h1 className="text-2xl font-bold">AI聊天助手(Next.js+千问)</h1>
        <div className="text-xs text-gray-400">
          {hydrated && threadId && (
            <>
              <span>会话: {threadId.slice(0, 8)}…</span>
              {storeKind && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-100">
                  {storeKind === "redis" ? "Redis" : "内存"}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-2 rounded mb-2">
          出错了：{error.message}
        </div>
      )}

      {/* 消息对话区域 */}
      <div className="flex-1 overflow-auto space-y-4 py-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-3 rounded-lg ${
              msg.role === "user"
                ? "bg-blue-100 text-right ml-auto max-w-[80%]"
                : "bg-gray-100 text-left mr-auto max-w-[80%]"
            }`}
          >
            {msg.parts.map((part, i) =>
              part.type === "text" ? (
                <p
                  key={i}
                  className="whitespace-pre-wrap"
                >
                  {part.text}
                </p>
              ) : null,
            )}
          </div>
        ))}
        {isStreaming && (
          <div className="text-gray-400 text-sm">AI 正在思考…</div>
        )}
      </div>

      {/* 输入区域 */}
      <form
        onSubmit={onSubmit}
        className="flex gap-2 mt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入你的问题..."
          className="flex-1 border rounded px-3 py-2 outline-none focus:border-blue-400"
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim() || !threadId}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          发送
        </button>
        {isStreaming && (
          <button
            type="button"
            onClick={stop}
            className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
          >
            停止
          </button>
        )}
        <button
          type="button"
          onClick={onClearCurrent}
          className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
        >
          清空
        </button>
        <button
          type="button"
          onClick={onNewChat}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
        >
          新会话
        </button>
      </form>
    </main>
  );
}
