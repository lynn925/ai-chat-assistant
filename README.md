# AI Chat Assistant

一个基于 **Next.js 16 + React 19 + AI SDK v5** 的生产可用形态的 AI 聊天应用,支持流式响应、多轮会话记忆、多模态识图与 JSON 结构化输出,兼容任意 OpenAI 兼容 API(OpenAI 官方 / 阿里云千问 / DeepSeek / Moonshot …)。

> 目标:在最小依赖、最少代码量的前提下,把"AI 对话"做成**可部署、可演示、可二次开发**的参考实现。

---

## 特性

- 🚀 **流式响应**:基于 AI SDK v5 `streamText` + UIMessage Stream,逐字输出体验顺滑。
- 🧠 **多轮记忆**:Redis(可选)或进程内 Map 持久化历史,刷新页面/重开浏览器可恢复。
- 🖼️ **多模态识图**:拖拽或点选图片上传,服务端转 base64 后随消息发送,支持视觉理解。
- 📦 **JSON 结构化输出**:通过 zod schema 约束模型输出 `{ answer, meta }`,失败自动降级展示原文。
- ⏹ **流式可控**:支持中途停止生成、一键重试、流式光标提示。
- 🔌 **OpenAI 兼容**:`OPENAI_BASE_URL` 一键切换千问 / DeepSeek / Moonshot 等服务。
- ☁️ **Vercel 部署就绪**:`vercel.json` 已配置 `sin1` region,只读 fs 友好(`/uploads/` 在 .gitignore 中)。

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制示例文件并填入你的 API Key:

```bash
cp .env.example .env.local
```

最低必填:

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
# 可选:切换到其他 OpenAI 兼容服务
# OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-turbo
```

`.env.example` 中已列出常用的 baseURL 与模型名。

### 3. 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

### 4. 生产构建

```bash
npm run build
npm run start
```

---

## Redis(可选)

默认使用**进程内 Map** 存会话(重启即丢,适合本地开发)。需要跨进程/跨重启记忆时,启用 Redis:

```env
# .env.local
REDIS_URL=redis://localhost:6379
# 或者 Upstash: rediss://default:xxx@xxx.upstash.io:6379
```

本地快速起一个 Redis:

```bash
docker compose up -d
```

数据卷 `redis-data` 启用 AOF 持久化,`down` 不会丢。

会话默认 TTL 24h,通过 `CHAT_TTL_SECONDS` 覆盖。

---

## 目录结构

```
.
├── app/
│   ├── api/
│   │   ├── chat/route.ts                 # POST /api/chat (流式聊天)
│   │   ├── sessions/[id]/route.ts        # GET / DELETE 会话
│   │   ├── sessions/[id]/messages/route.ts # POST 保存消息
│   │   └── upload/route.ts               # POST /api/upload (图片上传)
│   ├── layout.tsx
│   └── page.tsx                          # 主页(聊天 UI)
├── components/ui/                        # shadcn 风格基础组件
├── lib/
│   ├── llm.ts                            # OpenAI provider 单例
│   ├── llm-config.ts                     # 客户端可见的配置常量
│   ├── chat-store.ts                     # 会话存储抽象(Redis / 内存)
│   ├── redis.ts                          # ioredis 单例
│   ├── json-schema.ts                    # ChatAnswer zod schema + JSON 抽取
│   ├── prompts.ts                        # 系统提示词集中管理
│   ├── token-trim.ts                     # 按 token 裁剪历史
│   └── utils.ts
├── docker-compose.yml                    # 本地 Redis
├── vercel.json                           # Vercel 部署配置
├── next.config.ts
└── .env.example
```

---

## API 概览

| 方法     | 路径                         | 说明                                                                                 |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| `POST`   | `/api/chat`                  | 流式聊天端点,body: `{ messages: UIMessage[], id?: string }`,返回 `text/event-stream` |
| `GET`    | `/api/sessions/:id`          | 加载会话(含 messages)                                                                |
| `POST`   | `/api/sessions/:id/messages` | 覆盖式保存该会话的所有消息                                                           |
| `DELETE` | `/api/sessions/:id`          | 删除会话                                                                             |
| `POST`   | `/api/upload`                | 上传图片(multipart/form-data),返回 `{ url, contentType, name }`                      |

所有路由运行在 Node 运行时(`runtime = 'nodejs'`)。

---

## 设计要点

### JSON 强制输出 — 三道防线

1. **System Prompt**:明确要求模型只输出 JSON,且禁止 `<think>…</think>` 前置块([lib/prompts.ts](file:///Users/xinao/Desktop/ai-project/ai-chat-assistant/lib/prompts.ts))。
2. **zod 校验**:前后端共享 [ChatAnswer](file:///Users/xinao/Desktop/ai-project/ai-chat-assistant/lib/json-schema.ts#L34-L40) schema。
3. **客户端降级**:解析失败时,展示原始文本 + "⚠ 模型输出未通过 JSON schema" 提示,而不是静默丢弃。

### 多模态

- 前端:`sendMessage({ text, files })` 一并提交,`FileUIPart[]` 走 parts 数组。
- 后端:[normalizeMessages](file:///Users/xinao/Desktop/ai-project/ai-chat-assistant/app/api/chat/route.ts#L62-L88) 把 file 的 url 字段从 `/uploads/xxx.jpg` 转成 `data:image/...;base64,xxx`,再交给 `convertToModelMessages` 处理 — 这样模型能直接"看到"图片。
- 一些 LLM 服务端无法 fetch 相对路径,这是**必须**转 data URL 的原因。

### 会话存储抽象

[chat-store.ts](file:///Users/xinao/Desktop/ai-project/ai-chat-assistant/lib/chat-store.ts) 暴露统一接口 (`loadChat / saveChat / deleteChat / listChatIds`),内部根据 `REDIS_URL` 是否配置自动切换实现。客户端不需要关心后端是 Redis 还是内存。

### 流式体验

- 使用 `useChat` 的 `stop()` 实现中途停止。
- 错误通过 `error` 状态捕获,提供"重试"按钮触发 `regenerate()`。
- 自动滚动到底;用户向上滚动则不打断。

---

## 部署

### Vercel

直接 `vercel deploy` 即可。已知约束:

- **Vercel serverless fs 是只读**:`/api/upload` 在生产环境无法写入 `public/uploads/`,需要改为对象存储(S3 / Vercel Blob / R2)。当前实现适合**本地与可写 fs 环境**(自托管、Docker、VPS)。
- **Region**:默认 `sin1`(新加坡),可在 `vercel.json` 调整,跨境调用 LLM API 时延可能较高。

### 自托管

```bash
docker build -t ai-chat-assistant .     # 自行添加 Dockerfile
docker run -p 3000:3000 --env-file .env.local ai-chat-assistant
```

需要持久化 Redis 时,挂载 `redis-data` 卷或外部 Redis。

---

## 技术栈

- **框架**:Next.js 16.2.9(App Router) + React 19.2
- **AI**:[AI SDK v5](https://sdk.vercel.ai/docs) (`@ai-sdk/openai` 2.x,`@ai-sdk/react` 2.x)
- **样式**:Tailwind CSS v4 + 少量 Radix UI primitives
- **存储**:可选 Redis([ioredis](https://github.com/redis/ioredis))
- **校验**:[zod](https://zod.dev)
- **Token 估算**:[gpt-tokenizer](https://github.com/niieani/gptokenizer) (cl100k_base)

---

## Roadmap

当前已实现的范围(明确不做):

- ❌ 多用户鉴权、计费
- ❌ 工具调用 / Function calling / MCP
- ❌ 暗色主题切换 UI(跟随系统)
- ❌ RAG / 知识库检索
- ❌ 移动端深度优化 / 国际化 / PWA

未来可能方向:对象存储适配、生产环境 Redis 配置、Markdown 富文本渲染、多会话侧栏、模型选择器。

---

## License

MIT
