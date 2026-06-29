import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, type UIMessage } from "ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { messages?: UIMessage[] };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("messages 必须是非空数组", { status: 400 });
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

  try {
    const result = streamText({
      model: openai(model),
      messages: await convertToModelMessages(messages),
      temperature: 0.7,
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
