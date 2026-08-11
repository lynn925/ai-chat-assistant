// 按 token 总量裁剪消息历史。
//
// 策略:
// - 从尾部(最新)向前累加 token,直到接近上限的 80%。
// - 保留首条 system 消息(若有);其余按从老到新保留。
// - 用 gpt-tokenizer 的 cl100k_base 近似;不同模型的真实分词会有偏差,
//   但对"防止超长上下文"这个目的已经够用。
//
// v5 适配:UIMessage 用 parts 数组承载内容(可能含 file 等非文本段);
// 这里只估算 text parts 的 token,file 段的真实视觉 token 由模型自己计算。

import type { UIMessage } from "ai";
import { encode } from "gpt-tokenizer";

const DEFAULT_MAX_TOKENS = 8000;
const DEFAULT_RESERVE_RATIO = 0.8;

export type TrimOptions = {
  /** 模型上下文上限(总 token);默认 10000。 */
  maxTokens?: number;
  /** 上限的可用比例,默认 0.8(留出 system + 本轮回复余量)。 */
  reserveRatio?: number;
};

/** 估算一条消息的 token 数(把所有 text parts 拼起来 + role/分隔符开销)。 */
function tokensOf(m: UIMessage): number {
  const text = (m.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
  return 4 + encode(text).length;
}

/**
 * 裁剪到不超过 token 上限。
 * 规则:保留 system(若存在),再从尾部向前累计 user/assistant,直到累计接近上限。
 */
export function trimMessagesByTokens(
  messages: UIMessage[],
  opts: TrimOptions = {},
): UIMessage[] {
  const maxTokens =
    (opts.maxTokens ?? DEFAULT_MAX_TOKENS) *
    (opts.reserveRatio ?? DEFAULT_RESERVE_RATIO);
  if (messages.length === 0) return messages;

  const head: UIMessage[] = [];
  let bodyStart = 0;
  if (messages[0]?.role === "system") {
    head.push(messages[0]);
    bodyStart = 1;
  }

  let used = head.reduce((sum, m) => sum + tokensOf(m), 0);
  const kept: UIMessage[] = [];
  for (let i = messages.length - 1; i >= bodyStart; i--) {
    const t = tokensOf(messages[i]);
    if (used + t > maxTokens) break;
    kept.push(messages[i]);
    used += t;
  }
  kept.reverse();
  return [...head, ...kept];
}

/** 工具:返回当前 messages 的总 token(用于调试 / UI 显示)。 */
export function totalTokens(messages: UIMessage[]): number {
  return messages.reduce((sum, m) => sum + tokensOf(m), 0);
}