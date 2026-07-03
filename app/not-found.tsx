import Link from "next/link";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Bot className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-6xl font-bold tracking-tight">404</h1>
          <p className="text-lg text-muted-foreground">页面不存在</p>
        </div>
        <Button asChild>
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    </main>
  );
}
