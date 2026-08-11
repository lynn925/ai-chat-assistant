// LLM 提供方封装:统一处理 API Key、baseURL、模型名等环境变量。
// 任意一处 import 都会得到同一个 provider 实例,避免重复创建。
//
// 为什么不用默认的 openai() 实例:
// 默认实例会读 OPENAI_API_KEY,但不会读 OPENAI_BASE_URL;
// 项目里需要兼容千问/DeepSeek/Moonshot 等 OpenAI 兼容服务,所以显式传 baseURL。

import { createOpenAI } from "@ai-sdk/openai";

// 读取环境变量。Next.js 在服务端渲染时会把 .env* 注入到 process.env;
// 这里不做客户端调用,所以无需 NEXT_PUBLIC_ 前缀。
const apiKey = process.env.OPENAI_API_KEY;
// 留空走 OpenAI 官方;填了就走对应的 OpenAI 兼容服务。
const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
// 模型名默认 qwen-turbo,与 .env.example 保持一致。
const modelId = process.env.LLM_MODEL?.trim() || "qwen-turbo";

if (!apiKey) {
  // 在服务端启动期就给出明确报错,避免请求时再抛出模糊的网络错误。
  console.warn(
    "[llm] OPENAI_API_KEY 未配置,POST /api/chat 将无法调用大模型。请参考 .env.example。"
  );
}

// 单一 provider 实例。
export const openai = createOpenAI({
  apiKey,
  baseURL,
});

// 当前使用的聊天模型。可在请求时按需切换其他模型。
export const chatModel = openai(modelId);

// 调试用:暴露当前生效的模型与 baseURL,日志里一眼可辨。
export const llmConfig = {
  modelId,
  baseURL: baseURL ?? "(default)",
};