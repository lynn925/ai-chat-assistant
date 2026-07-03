"use client";

import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AlertCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ChatHeader } from "@/components/chat/chat-header";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useChatThread } from "@/hooks/use-chat-thread";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const {
    threadId,
    storeKind,
    hydrated,
    setThreadId,
    loadHistory,
    clearServerHistory,
  } = useChatThread();

  // useChat:封装流式请求 + 消息管理
  const { messages, sendMessage, stop, status, setMessages, error } = useChat({
    id: threadId, // 切 threadId 时 useChat 自动 reset
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ threadId }),
    }),
  });

  // 切 threadId 后从服务端拉历史
  useEffect(() => {
    if (threadId) loadHistory(setMessages);
  }, [threadId, loadHistory, setMessages]);

  const isStreaming = status === "submitted" || status === "streaming";

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isStreaming || !threadId) return;
    sendMessage({ text });
    setInput("");
  };

  const handleNewChat = () => {
    const oldId = threadId;
    const newId = crypto.randomUUID();
    setThreadId(newId);
    setMessages([]);
    if (oldId)
      fetch(`/api/sessions/${oldId}`, { method: "DELETE" }).catch(() => {});
  };

  const handleClear = () => {
    setMessages([]);
    clearServerHistory();
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      <div className="container max-w-4xl mx-auto py-6 px-4 flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <ChatHeader
            threadId={threadId}
            storeKind={storeKind}
            hydrated={hydrated}
          />

          <MessageList
            messages={messages}
            isStreaming={isStreaming}
          />

          {error && (
            <div className="mx-4 mb-2 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error.message}</span>
            </div>
          )}

          <ChatInput
            value={input}
            isStreaming={isStreaming}
            disabled={!threadId}
            onChange={setInput}
            onSubmit={handleSubmit}
            onStop={stop}
            onClear={handleClear}
            onNewChat={handleNewChat}
          />
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-3">
          Powered by Next.js + AI SDK · 历史 24h 后过期
        </p>
      </div>
    </main>
  );
}
