// /api/sessions/[id]/messages
//
// POST → 覆盖式保存该会话的全部 messages。
//       请求体:{ messages: UIMessage[] }
//       行为:zod 校验形状 → 写入 Redis。
//
// v5:消息为 UIMessage[] 形态,每条含 parts 数组(text + file 等)。
//   zod 不再做 token 截断(交给前端;v5 的 parts 形态与 trimMessagesByTokens
//   的字符串估算不匹配);若需截断,M4 用 convertToModelMessages + 模型上下文计算。

import { NextResponse } from "next/server";
import { z } from "zod";
import type { UIMessage } from "ai";
import { saveChat } from "@/lib/chat-store";

// v5 的 UIMessage.parts:每个 part 由 type 区分(text / file / reasoning / ...)。
// 这里只校验必备结构,parts 内具体形态由 useChat 流式保障。
const UIMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  // v5:content 字段仍可能存在(向下兼容),但 parts 是真正渲染来源。
  content: z.string().optional(),
  // v5 必填:消息由 parts 数组组成。
  parts: z.array(z.object({ type: z.string() }).passthrough()),
  createdAt: z.union([z.string(), z.date()]).optional(),
});

const BodySchema = z.object({
  messages: z.array(UIMessageSchema).max(500, "单会话最多 500 条消息"),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const messages = parsed.data.messages as UIMessage[];
  const { id } = await params;
  const saved = await saveChat(id, messages);

  return NextResponse.json({
    ok: true,
    id: saved.id,
    count: saved.messages.length,
    updatedAt: saved.updatedAt,
  });
}
