"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">出错了</h1>
          <p className="text-sm text-muted-foreground">
            {error.message || "发生了未知错误"}
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/60 font-mono">
              {error.digest}
            </p>
          )}
        </div>
        <Button onClick={reset}>重试</Button>
      </div>
    </main>
  );
}
