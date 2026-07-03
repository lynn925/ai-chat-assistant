"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage, type ModelMessage } from "ai";
import {
  Send,
  Square,
  Trash2,
  Plus,
  AlertCircle,
  Bot,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  const scrollRef = useRef<HTMLDivElement>(null);

  // 客户端水合后生成/读取 threadId
  useEffect(() => {
    setThreadId(getOrCreateThreadId());
    setHydrated(true);
  }, []);

  // useChat 封装流式请求、消息管理
  const { messages, sendMessage, stop, status, setMessages, error } = useChat({
    id: threadId,
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

  // 自动滚动到底部
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

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
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      <div className="container max-w-4xl mx-auto py-6 px-4 flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <CardHeader className="border-b bg-muted/30 flex-row items-center justify-between space-y-0 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">AI 聊天助手</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Next.js · 千问 / OpenAI 兼容接口
                </p>
              </div>
            </div>

            {hydrated && threadId && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground font-mono">
                  {threadId.slice(0, 8)}…
                </span>
                {storeKind && (
                  <Badge
                    variant={storeKind === "redis" ? "success" : "secondary"}
                    className="font-normal"
                  >
                    {storeKind === "redis" ? "Redis" : "内存"}
                  </Badge>
                )}
              </div>
            )}
          </CardHeader>

          {/* Messages */}
          <CardContent
            ref={scrollRef}
            className="flex-1 overflow-y-auto scroll-area p-4 space-y-4"
          >
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center text-center text-muted-foreground py-16">
                <div>
                  <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">开始一个对话吧</p>
                </div>
              </div>
            )}

            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const text = msg.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("");
              const isLastAssistant =
                !isUser && msg === messages[messages.length - 1] && isStreaming;
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3 max-w-[85%]",
                    isUser ? "ml-auto flex-row-reverse" : "mr-auto",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      isUser
                        ? "bg-blue-500 text-white"
                        : "bg-primary text-primary-foreground",
                    )}
                  >
                    {isUser ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5 shadow-sm",
                      isUser
                        ? "bg-blue-500 text-white"
                        : "bg-muted text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {text}
                      {isLastAssistant && (
                        <span className="inline-block w-1.5 h-4 bg-current align-middle ml-1 cursor-blink" />
                      )}
                    </p>
                  </div>
                </div>
              );
            })}

            {isStreaming && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-3 mr-auto max-w-[85%]">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl px-4 py-2.5 bg-muted">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" />
                  </div>
                </div>
              </div>
            )}
          </CardContent>

          {/* Error */}
          {error && (
            <div className="mx-4 mb-2 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error.message}</span>
            </div>
          )}

          {/* Input */}
          <div className="border-t bg-muted/30 p-4">
            <form
              onSubmit={onSubmit}
              className="flex items-center gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入你的问题，回车发送…"
                className="flex-1 h-10 bg-background"
                disabled={isStreaming}
              />
              {isStreaming ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={stop}
                  aria-label="停止"
                >
                  <Square className="h-4 w-4 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || !threadId}
                  aria-label="发送"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onClearCurrent}
                disabled={!threadId}
                aria-label="清空当前对话"
                title="清空当前对话"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={onNewChat}
                aria-label="新会话"
                title="新会话"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-3">
          Powered by Next.js + AI SDK · 历史 24h 后过期
        </p>
      </div>
    </main>
  );
}
