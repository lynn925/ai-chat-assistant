// 模型输出的 JSON 结构化约定(前后端共享)。
//
// 字段语义:
// - answer: 主回答文本(给用户看的核心内容)。
// - meta:   元数据,用于调试 / UI 副标题 / A/B 评估。
//   - reasoning: 模型内部思考(简短,≤ 100 字)。
//   - confidence: 置信度(0~1)。
//   - tags:       关键词标签(最多 5 个)。
//   - latencyMs:  服务端可注入的延迟(本 schema 不要求模型输出)。
//
// 约定:
// - 后端 streamText 强制要求模型输出符合此 schema 的 JSON 字符串。
// - 客户端解析失败时,会按 fallback 处理(见 page.tsx)。
// - 服务端用 zod 二次校验,失败时触发重试。

import { z } from "zod";

export const ChatAnswerMeta = z.object({
  reasoning: z
    .string()
    .max(200, "reasoning 不能超过 200 字")
    .describe("模型内部简短思考(1~2 句)"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("对回答的置信度,0~1 之间的小数"),
  tags: z
    .array(z.string().min(1).max(20))
    .max(5)
    .describe("关键词标签,最多 5 个,每项 ≤ 20 字"),
});

export const ChatAnswer = z.object({
  answer: z
    .string()
    .min(1, "answer 不能为空")
    .describe("面向用户的主回答,使用简体中文,必要时给出代码示例"),
  meta: ChatAnswerMeta,
});

export type ChatAnswer = z.infer<typeof ChatAnswer>;
export type ChatAnswerMeta = z.infer<typeof ChatAnswerMeta>;

/**
 * 去除模型输出中的 <think>...</think> 块(以及 <reasoning>、<analysis> 等同类标签)。
 * 这类标签常见于推理模型(DeepSeek R1 / Qwen3 / 混元 thinking),输出 JSON 之前会先吐思考过程。
 * 必须先剥掉,否则 JSON.parse 会因多余文本失败。
 */
export function stripThinkingBlocks(text: string): string {
  if (!text) return text;
  // 常见变体:<think>...</think> / <reasoning>...</reasoning> / <analysis>...</analysis>
  // 加 s flag 让 . 匹配换行。
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, "")
    .trim();
}

/**
 * 从模型原始输出中尽力抽取 JSON 字符串。
 * 兼容以下情况:
 * - 推理模型先吐 <think>...</think> 思考块(已剥除)
 * - 模型输出前后夹了无意义文本(罕见,但偶有)
 * - 模型用 ```json ... ``` 包了起来(常见)
 * - 前后有空白 / 换行
 */
export function extractJson(text: string): string | null {
  if (!text) return null;
  // 先剥除 <think> 类思考块
  const cleaned = stripThinkingBlocks(text);
  if (!cleaned) return null;
  const trimmed = cleaned.trim();

  // 1) 优先匹配 markdown json 代码块
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && fence[1]) return fence[1].trim();

  // 2) 否则尝试匹配第一个完整的 JSON 对象(贪心扫描括号)
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inStr) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 安全解析 + 校验。失败返回 null,由调用方决定 fallback。
 */
export function safeParseAnswer(text: string): ChatAnswer | null {
  const json = extractJson(text);
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    const result = ChatAnswer.safeParse(obj);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
