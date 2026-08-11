// 流式聊天端点(AI SDK v5 + JSON 强制输出 + 多模态支持)。
//
// M2:Prompt 调优,稳定输出 JSON。
// M3:识图 ——
//   · 前端 useChat({ sendMessage: { text, files } }) 提交后,body 含
//     messages: UIMessage[],其中 user 消息可能含 file parts。
//   · 这里把 file part 读出来 → 转 base64 data URL → 注回 url 字段,
//     然后交给 AI SDK 内部的 convertToModelMessages 处理。
//   · 关键:避免 MiniMax 服务端 fetch 不到相对路径 /uploads/xxx.jpg。
//
// M3-thinking 应对策略:
//   · 不通过 providerOptions 传 thinking(不同 provider namespace 不同,
//     MiniMax 兼容端点可能拒收未知字段)。
//   · 而是在系统 prompt 里加更强的"禁止思考"指令,让模型听话。
//
// v5 关键 API 迁移(对照 v3.4):
//   · 旧(streamText + toDataStreamResponse + messages: Message[])
//   · 新(streamText + toUIMessageStreamResponse + UIMessage[])

import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { readFile } from "fs/promises";
import { join } from "path";
import { chatModel, llmConfig } from "@/lib/llm";
import { chatSystemPrompt } from "@/lib/prompts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RequestBody = {
  messages: UIMessage[];
  id?: string;
};

/**
 * 读取本地文件并转 base64 data URL;远程 URL 也走 fetch 后转 data URL。
 */
async function fetchAsDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${ct};base64,${buf.toString("base64")}`;
  }
  // 相对路径 → 直接读 public/<path>
  const filepath = join(process.cwd(), "public", url.replace(/^\//, ""));
  const buf = await readFile(filepath);
  const ext = url.split(".").pop()?.toLowerCase();
  const mime =
    ext === "png" ? "image/png" :
    ext === "webp" ? "image/webp" :
    ext === "gif" ? "image/gif" :
    "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * 防御 + 准备:把每条消息的 file parts url 转 data URL。
 * v3.4 时代消息没有 parts,补成单 text part。
 */
async function normalizeMessages(messages: UIMessage[]): Promise<UIMessage[]> {
  return Promise.all(
    messages.map(async (m) => {
      // 防御 v3.4 旧消息
      if (!Array.isArray(m.parts) || m.parts.length === 0) {
        const content = (m as { content?: string }).content ?? "";
        return { ...m, parts: [{ type: "text" as const, text: content }] };
      }
      // 把 file parts 的 url 转 data URL
      const newParts = await Promise.all(
        m.parts.map(async (p) => {
          if (p.type !== "file") return p;
          const url = p.url;
          if (url.startsWith("data:")) return p;
          try {
            const dataUrl = await fetchAsDataUrl(url);
            return { ...p, url: dataUrl };
          } catch (err) {
            console.warn(`[chat] skip unreadable file url=${url}:`, err);
            return null;
          }
        }),
      );
      return { ...m, parts: newParts.filter((p): p is NonNullable<typeof p> => p !== null) };
    }),
  );
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const { messages, id } = body;

  if (!Array.isArray(messages)) {
    return new Response("Invalid request: messages must be an array", {
      status: 400,
    });
  }

  console.log(
    `[chat] id=${id ?? "-"} model=${llmConfig.modelId} turns=${messages.length}`,
  );

  const normalized = await normalizeMessages(messages);

  const result = await streamText({
    model: chatModel,
    system: chatSystemPrompt(),
    messages: convertToModelMessages(normalized),
    temperature: 0.7,
  });

  return result.toUIMessageStreamResponse();
}