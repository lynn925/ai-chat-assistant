// /api/sessions/[id]
//
// GET   → 加载会话(含 messages 数组)
// DELETE → 删除会话
//
// 错误约定:找不到返回 404;Redis 故障返回 500(中间件会捕获)。

import { NextResponse } from "next/server";
import { deleteChat, loadChat } from "@/lib/chat-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await loadChat(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json(session);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await deleteChat(id);
  return new Response(null, { status: 204 });
}