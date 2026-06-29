import { createOpenAI } from "@ai-sdk/openai";
import {
  streamText,
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { getChatStore } from "@/lib/chat-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequestBody = {
  threadId?: string;
  messages?: UIMessage[];
};

export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const messages = body?.messages;
  const threadId = body?.threadId;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("messages 必须是非空数组", { status: 400 });
  }
  if (!threadId || typeof threadId !== "string") {
    return new Response("缺少 threadId", { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response("缺少环境变量 OPENAI_API_KEY", { status: 500 });
  }

  const openai = createOpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  const model = process.env.LLM_MODEL || "qwen-turbo";

  // 加载历史（来自 Redis / 进程内 fallback）
  const { store } = getChatStore();
  const history = await store.getHistory(threadId);
  const incomingModelMessages = await convertToModelMessages(messages);

  // 合并：历史 + 本次请求（去重：如果最后一条历史就是本次用户消息，避免重复）
  const lastHistory = history[history.length - 1];
  const firstIncoming = incomingModelMessages[0];
  const isDuplicateUser =
    lastHistory?.role === "user" &&
    firstIncoming?.role === "user" &&
    lastHistory.content === firstIncoming.content;
  const allMessages: ModelMessage[] = isDuplicateUser
    ? [...history, ...incomingModelMessages.slice(1)]
    : [...history, ...incomingModelMessages];

  // 找出本次新增的消息（要存回历史）
  const newOnes: ModelMessage[] = allMessages.slice(history.length);

  try {
    const result = streamText({
      model: openai(model),
      messages: allMessages,
      temperature: 0.7,
      onFinish: async ({ responseMessages }) => {
        // 流式结束后，把 assistant 完整回复也存进历史
        const toPersist = [...newOnes, ...responseMessages];
        if (toPersist.length > 0) {
          await store.appendMessages(threadId, toPersist);
        }
      },
    });

    return result.toUIMessageStreamResponse({
      headers: {
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(`Chat API error: ${message}`, { status: 500 });
  }
}
