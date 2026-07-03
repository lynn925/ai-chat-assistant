"use client";

import { useEffect, useRef } from "react";
import { Bot } from "lucide-react";
import type { UIMessage } from "ai";
import { CardContent } from "@/components/ui/card";
import { MessageBubble } from "./message-bubble";

interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const lastMsg = messages[messages.length - 1];
  // 只在最后一条是 assistant 且正在流式输出时显示光标
  const isLastAssistantStreaming =
    !!lastMsg && lastMsg.role === "assistant" && isStreaming;

  return (
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

      {messages.map((msg, i) => (
        <MessageBubble
          key={msg.id}
          msg={msg}
          isLastAssistant={
            i === messages.length - 1 && isLastAssistantStreaming
          }
        />
      ))}

      {isStreaming && lastMsg?.role === "user" && <ThinkingIndicator />}
    </CardContent>
  );
}

function ThinkingIndicator() {
  return (
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
  );
}
