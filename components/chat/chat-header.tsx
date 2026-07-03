"use client";

import { Bot } from "lucide-react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ChatHeaderProps {
  threadId: string;
  storeKind: "redis" | "memory" | null;
  hydrated: boolean;
}

export function ChatHeader({
  threadId,
  storeKind,
  hydrated,
}: ChatHeaderProps) {
  return (
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
  );
}
