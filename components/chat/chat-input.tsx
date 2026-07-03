"use client";

import { Send, Square, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatInputProps {
  value: string;
  isStreaming: boolean;
  disabled: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onClear: () => void;
  onNewChat: () => void;
}

export function ChatInput({
  value,
  isStreaming,
  disabled,
  onChange,
  onSubmit,
  onStop,
  onClear,
  onNewChat,
}: ChatInputProps) {
  return (
    <div className="border-t bg-muted/30 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="输入你的问题，回车发送…"
          className="flex-1 h-10 bg-background"
          disabled={isStreaming}
        />
        {isStreaming ? (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={onStop}
            aria-label="停止"
          >
            <Square className="h-4 w-4 fill-current" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={disabled || !value.trim()}
            aria-label="发送"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onClear}
          disabled={disabled}
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
  );
}
