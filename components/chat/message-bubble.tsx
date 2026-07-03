"use client";

import { Bot, User } from "lucide-react";
import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  msg: UIMessage;
  isLastAssistant: boolean;
}

export function MessageBubble({ msg, isLastAssistant }: MessageBubbleProps) {
  const isUser = msg.role === "user";
  const text = msg.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");

  return (
    <div
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
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
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
}
