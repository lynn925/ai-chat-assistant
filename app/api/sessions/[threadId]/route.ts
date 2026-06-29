import { NextRequest } from "next/server";
import { getChatStore } from "@/lib/chat-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sessions/[threadId] -> 返回历史消息
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  if (!threadId) {
    return new Response("缺少 threadId", { status: 400 });
  }

  const { store, kind } = getChatStore();
  const history = await store.getHistory(threadId);
  return Response.json({ threadId, kind, messages: history });
}

// DELETE /api/sessions/[threadId] -> 清空某个会话历史
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  if (!threadId) {
    return new Response("缺少 threadId", { status: 400 });
  }

  const { store } = getChatStore();
  await store.clear(threadId);
  return Response.json({ threadId, ok: true });
}
