import { Bot } from "lucide-react";

export default function Loading() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Bot className="h-6 w-6 animate-pulse" />
        </div>
        <p className="text-sm">加载中…</p>
      </div>
    </main>
  );
}
