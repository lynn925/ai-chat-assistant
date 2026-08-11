// 会话存储层(M1)。
//
// 设计:统一接口,后端可在内存与 Redis 之间透明切换。
// - 若设置了 REDIS_URL,所有读写走 Redis(可跨进程、可重启恢复)。
// - 若未设置,降级为进程内 Map(开发态 / 演示用,重启即丢)。
//
// 关键约束:
// - 只在服务端调用(Node 运行时)。客户端组件不要 import 此文件。
// - Redis 的 key 前缀为 `chat:`;value 用 JSON 字符串存储 Message[]。
// - 默认 TTL 24h(可通过环境变量 CHAT_TTL_SECONDS 覆盖)。

import type { UIMessage } from "ai";
import { redis, isRedisEnabled } from "@/lib/redis";

export type ChatSession = {
  id: string;
  messages: UIMessage[];
  // 最近更新时间(毫秒时间戳);M2 列表页会用到。
  updatedAt: number;
};

// Redis 中每条会话的 key。
const keyOf = (id: string) => `chat:${id}`;

// TTL 默认 24h,可通过环境变量覆盖。
const DEFAULT_TTL_SECONDS = 60 * 60 * 24;
function getTtl(): number {
  const v = Number(process.env.CHAT_TTL_SECONDS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TTL_SECONDS;
}

// ============== 进程内 Map(降级实现) ==============
type StoreShape = Map<string, ChatSession>;
const globalForStore = globalThis as unknown as { __chatStore?: StoreShape };
const memStore: StoreShape =
  globalForStore.__chatStore ?? (globalForStore.__chatStore = new Map());

const MAX_MESSAGES_PER_SESSION = 200; // 内存版的硬上限,Redis 版不做硬限(由 token 截断负责)

// ============== 公共 API ==============

/**
 * 加载会话。不存在返回 undefined。
 */
export async function loadChat(id: string): Promise<ChatSession | undefined> {
  if (!isRedisEnabled()) {
    const s = memStore.get(id);
    return s ? { ...s, messages: [...s.messages] } : undefined;
  }
  const raw = await redis!.get(keyOf(id));
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Omit<ChatSession, "id">;
    return { id, ...parsed };
  } catch {
    return undefined;
  }
}

/**
 * 保存会话。覆盖式写入;自动刷新 updatedAt 与 TTL。
 * 注意:不做 token 截断,调用方应在保存前用 trimMessagesByTokens 处理。
 */
export async function saveChat(
  id: string,
  messages: UIMessage[],
): Promise<ChatSession> {
  const session: ChatSession = {
    id,
    messages: [...messages],
    updatedAt: Date.now(),
  };
  if (!isRedisEnabled()) {
    // 内存版裁剪最近 N 条
    if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
      session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
    }
    memStore.set(id, session);
    return { ...session, messages: [...session.messages] };
  }
  const ttl = getTtl();
  await redis!.set(keyOf(id), JSON.stringify(session), "EX", ttl);
  return session;
}

/**
 * 删除会话。
 */
export async function deleteChat(id: string): Promise<void> {
  if (!isRedisEnabled()) {
    memStore.delete(id);
    return;
  }
  await redis!.del(keyOf(id));
}

/**
 * 列出所有会话 id(M2 侧栏会用到;M1 仅占位)。
 * Redis 版用 SCAN,内存版用 Map.keys()。
 */
export async function listChatIds(): Promise<string[]> {
  if (!isRedisEnabled()) return Array.from(memStore.keys());
  const ids: string[] = [];
  const stream = redis!.scanStream({ match: "chat:*", count: 100 });
  for await (const chunk of stream) {
    for (const k of chunk as string[]) ids.push(k.slice("chat:".length));
  }
  return ids;
}
