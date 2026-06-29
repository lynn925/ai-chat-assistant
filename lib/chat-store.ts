import type { ModelMessage } from "ai";
import Redis from "ioredis";

/**
 * 聊天历史存储抽象层：
 * - 有 REDIS_URL：走真 Redis（Upstash / 本地都兼容）
 * - 没有：降级到进程内 Map（仅开发用，重启即丢）
 *
 * Key 设计：
 * - chat:thread:{threadId} -> JSON(ModelMessage[])
 * - chat:threads -> Set<threadId>  （活跃会话索引）
 */

const KEY_PREFIX = "chat:thread:";
const INDEX_KEY = "chat:threads";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h

export interface ChatStore {
  getHistory(threadId: string): Promise<ModelMessage[]>;
  appendMessages(
    threadId: string,
    newMessages: ModelMessage[],
  ): Promise<ModelMessage[]>;
  clear(threadId: string): Promise<void>;
  listThreads(): Promise<string[]>;
}

// ---------- Redis 实现 ----------
class RedisChatStore implements ChatStore {
  private client: Redis;
  private ttl: number;

  constructor(url: string, ttl: number) {
    // Upstash 需要 TLS，ioredis 自动根据 rediss:// 协议处理
    this.client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
    this.ttl = ttl;
  }

  private key(threadId: string) {
    return `${KEY_PREFIX}${threadId}`;
  }

  async getHistory(threadId: string): Promise<ModelMessage[]> {
    const raw = await this.client.get(this.key(threadId));
    if (!raw) return [];
    try {
      return JSON.parse(raw) as ModelMessage[];
    } catch {
      return [];
    }
  }

  async appendMessages(
    threadId: string,
    newMessages: ModelMessage[],
  ): Promise<ModelMessage[]> {
    const key = this.key(threadId);
    const existing = await this.getHistory(threadId);
    const merged = [...existing, ...newMessages];

    const pipeline = this.client.multi();
    pipeline.set(key, JSON.stringify(merged), "EX", this.ttl);
    pipeline.sadd(INDEX_KEY, threadId);
    await pipeline.exec();

    return merged;
  }

  async clear(threadId: string): Promise<void> {
    const pipeline = this.client.multi();
    pipeline.del(this.key(threadId));
    pipeline.srem(INDEX_KEY, threadId);
    await pipeline.exec();
  }

  async listThreads(): Promise<string[]> {
    return this.client.smembers(INDEX_KEY);
  }
}

// ---------- 进程内 fallback ----------
class MemoryChatStore implements ChatStore {
  private map = new Map<string, ModelMessage[]>();
  private ttl: number;

  constructor(ttl: number) {
    this.ttl = ttl;
  }

  async getHistory(threadId: string): Promise<ModelMessage[]> {
    return this.map.get(threadId) ?? [];
  }

  async appendMessages(
    threadId: string,
    newMessages: ModelMessage[],
  ): Promise<ModelMessage[]> {
    const existing = this.map.get(threadId) ?? [];
    const merged = [...existing, ...newMessages];
    this.map.set(threadId, merged);
    // 简单过期：存时间戳
    setTimeout(() => {
      const cur = this.map.get(threadId);
      if (cur === merged) this.map.delete(threadId);
    }, this.ttl * 1000);
    return merged;
  }

  async clear(threadId: string): Promise<void> {
    this.map.delete(threadId);
  }

  async listThreads(): Promise<string[]> {
    return Array.from(this.map.keys());
  }
}

// ---------- 单例工厂 ----------
let _store: ChatStore | null = null;
let _storeKind: "redis" | "memory" | null = null;

export function getChatStore(): { store: ChatStore; kind: "redis" | "memory" } {
  if (_store) return { store: _store, kind: _storeKind! };

  const url = process.env.REDIS_URL;
  const ttl = Number(process.env.CHAT_TTL_SECONDS) || DEFAULT_TTL_SECONDS;

  if (url) {
    try {
      _store = new RedisChatStore(url, ttl);
      _storeKind = "redis";
      console.log("[chat-store] Using Redis at", url.replace(/:[^:@]+@/, ":***@"));
    } catch (err) {
      console.warn("[chat-store] Redis init failed, fallback to memory:", err);
      _store = new MemoryChatStore(ttl);
      _storeKind = "memory";
    }
  } else {
    _store = new MemoryChatStore(ttl);
    _storeKind = "memory";
    console.log("[chat-store] REDIS_URL not set, using in-memory store");
  }

  return { store: _store, kind: _storeKind! };
}
