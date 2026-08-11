// LLM 配置的可分享常量(同时供客户端展示和服务端读取)。
// 拆出此文件是因为 lib/llm.ts 中包含了 Node.js 才能 import 的 SDK,
// 客户端组件若 import 整个 llm.ts 会带入不必要的依赖。

// 客户端可见的展示用模型名(默认值)。
// 真要展示服务端实际生效的模型,可以通过 NEXT_PUBLIC_LLM_MODEL 在 .env 中覆盖。
export const PUBLIC_LLM_MODEL =
  process.env.NEXT_PUBLIC_LLM_MODEL ?? process.env.LLM_MODEL ?? "qwen-turbo";

// 客户端可见的 baseURL(仅用于"调试信息"展示)。
export const PUBLIC_LLM_BASE_URL =
  process.env.NEXT_PUBLIC_OPENAI_BASE_URL ??
  process.env.OPENAI_BASE_URL ??
  "(default OpenAI)";
