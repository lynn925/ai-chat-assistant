// Redis 客户端单例(ioredis)。
//
// 约定:
// - 仅当设置了 REDIS_URL 才连接;否则返回 null,调用方走内存存储降级路径。
// - Next.js dev 模式 HMR 会反复执行模块代码,用 globalThis 缓存避免连接泄漏。
// - runtime = 'nodejs' 才能用 ioredis(Edge 不支持 TCP)。
//
// 注意:本文件应仅在 Route Handler / Server Component 中 import,
// 绝不能被客户端代码 import(否则会把 ioredis 打进浏览器 bundle)。

import Redis from "ioredis";

type RedisClient = Redis | null;

const globalForRedis = globalThis as unknown as {
  __redis?: RedisClient;
};

function buildClient(): RedisClient {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  // lazyConnect: 在第一次实际命令时才连接,避免模块加载就抛错。
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
}

export const redis: RedisClient =
  globalForRedis.__redis ?? (globalForRedis.__redis = buildClient());

/**
 * 判断是否启用了 Redis 后端。客户端代码可以用此判断走哪条路径。
 */
export function isRedisEnabled(): boolean {
  return redis !== null;
}