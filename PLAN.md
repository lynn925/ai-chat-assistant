# AI Chat Assistant 后续需求 Plan

> 适用范围: `/Users/xinao/Desktop/ai-project/ai-chat-assistant`
> 当前版本: Next.js 16.2.9 · React 19.2 · `ai` 7.x · `@ai-sdk/react` 4.x · `@ai-sdk/openai` 4.x · `ioredis` 5.x
> 脚手架状态:仅一个占位 `app/page.tsx`(输入框 + 发送按钮 + 三个 Badge),依赖与 `.env.example` 已就位但路由/状态/持久化均为空。

## 1. 目标

在现有脚手架上把"AI Chat Assistant"从静态占位升级为一个**生产可用形态的最小聊天应用**:

1. 用户可在首页输入消息并以**流式**方式获得 LLM 回答。
2. 同一浏览器内**多轮对话自动带历史**;刷新页面/重开浏览器后**最近会话可恢复**。
3. 同一会话 ID 在浏览器刷新、切换标签后仍能续上,后端通过 Redis(可选)+ 进程内兜底实现。
4. 用户可一键"新建会话",左侧有简单会话列表(只保留最近 N 个)。
5. 体验细节:自动滚动、停止生成、错误提示、Markdown/代码块基础渲染、流式打字光标(已有 `.cursor-blink`)。

明确**不做**(避免范围蔓延):

- 多用户鉴权、登录、计费。
- 工具调用(Function calling)、RAG、图片/语音等多模态。
- 暗色主题切换 UI(只保留系统跟随)。
- 移动端深度优化、SSR 之外的 PWA、国际化。
- 复杂会话分享/导出(后续阶段再考虑)。

## 2. 架构总览

```
┌────────────────────────┐         POST /api/chat              ┌────────────────────────────┐
│  app/page.tsx (client) │ ─────────────────────────────────▶ │ app/api/chat/route.ts      │
│  + ChatPanel           │     UIMessage[] (streamable UI)     │ (Edge 或 Node runtime)     │
│  + useChat() @ai-sdk   │ ◀───────────────────────────────── │  streamText() + openai()   │
└─────────┬──────────────┘   UI Message Stream (chunked)       └─────────┬──────────────────┘
          │ GET /api/chat/:id (首次加载恢复历史)                        │
          │                                                            ▼
          ▼                                                  ┌──────────────────────┐
   localStorage(轻量持久化)                                   │ lib/chat-store.ts    │
   - 最近会话 ID 列表                                          │ - Redis(可选)        │
   - 会话标题(首条消息摘要)                                    │ - 进程内 Map 兜底    │
                                                              └──────────────────────┘
```

数据流关键点(对照 AI SDK v7):

- 前端用 `@ai-sdk/react` 的 `useChat({ id, transport })`,后端用 `streamText` + `convertToModelMessages(messages)` + `createUIMessageStreamResponse`。
- v7 中 `onFinish` → **`onEnd`**,`system` → **`instructions`**,流式结果字段 `fullStream` → **`stream`**。Plan 与后续代码必须遵循。
- Next.js 16:动态路由参数 `params` 是 `Promise`,服务端 `route.ts` 用 `RouteContext<'/api/chat/[id]'>` + `await ctx.params` 取参。

## 3. 目录与文件计划

仅列出**新增或被改写**的文件;其余保持不变。

```
app/
  layout.tsx                  # 改:title/description 改为 AI Chat Assistant; lang="zh-CN"
  page.tsx                    # 改:转为客户端聊天页(或拆为 <ChatPage> 客户端组件)
  api/
    chat/
      route.ts                # 新:POST /api/chat —— 流式聊天端点
      [id]/
        route.ts              # 新:GET /api/chat/[id] —— 拉取历史;DELETE 清空
  chat/
    [id]/
      page.tsx                # 新:SSR 拉历史 → 渲染 <ChatView initialMessages>

components/
  chat/
    ChatView.tsx              # 新:客户端总容器,管理 useChat、滚动、停止
    MessageList.tsx           # 新:消息流,空状态,流式打字光标
    MessageItem.tsx           # 新:用户/助手气泡,基础 Markdown 渲染
    Composer.tsx              # 新:输入框 + 发送/停止按钮,Enter 发送
    SessionSidebar.tsx        # 新:左侧会话列表,新建/切换
    ScrollToBottom.tsx        # 新:自动滚到底部 + "新消息"提示
    ErrorBanner.tsx           # 新:流式错误/网络错误的轻量提示

lib/
  llm.ts                     # 新:openai() provider 单例,封装 OPENAI_BASE_URL/LLM_MODEL
  chat-store.ts              # 新:会话存储抽象(loadChat/saveChat/listChats)
  chat-store.memory.ts       # 新:进程内 Map 实现(默认)
  chat-store.redis.ts        # 新:ioredis 实现(REDIS_URL 有值时启用)
  id.ts                      # 新:createChatId()(基于 crypto.randomUUID + 校验)
  types.ts                   # 新:UIMessage 别名、ChatSession 类型
  markdown.ts                # 新:轻量 Markdown → HTML(自实现,避免引入大依赖)

hooks/
  useChatId.ts               # 新:统一管理当前会话 ID(URL 优先,localStorage 兜底)

styles/                       # 不新增文件,沿用 globals.css 中的 .scroll-area / .cursor-blink

.env.example                 # 保持不变,文档化已在 PLAN 中体现
```

> 备注:`page.tsx` 与 `chat/[id]/page.tsx` 二选一保留作为入口。**默认**采用"`/` 直接渲染默认会话 + `/chat/[id]` 用于持久化会话"双入口结构,以便演示 URL 即会话 ID 的设计。

## 4. 分阶段交付(可独立验收)

### M0 · 最小可跑通(必须先做)

- [ ] 落 `lib/llm.ts`、`lib/types.ts`、`lib/id.ts`。
- [ ] `app/api/chat/route.ts`:实现 `POST`,使用 `streamText + openai(LLM_MODEL)`,返回 `createUIMessageStreamResponse`,`onEnd` 时将完整 messages 写入 `chat-store`。
- [ ] `app/page.tsx`:转为客户端组件,挂载 `<ChatView>`,使用 `useChat({ id })` 调 `/api/chat`。
- [ ] 准备 `.env.local`,跑通首轮对话 → 流式输出 → 刷新页面消息仍在。
- 验收:`npm run dev` → 输入"你好" → 出现流式回答,后端日志看到一次 `streamText` 完成。

### M1 · 多轮 + 历史 + 停止

- [ ] `Composer` 加停止按钮(`useChat` 的 `stop()`),流式未完成时显示。
- [ ] 异常处理:`ErrorBanner` 监听 `useChat` 的 `error`,展示并允许重发。
- [ ] `<MessageList>` 自动滚到底部,中途用户向上滚动则暂停自动滚,出现"↓ 新消息"按钮。
- [ ] `onEnd` 后保存 messages;`GET /api/chat/[id]` 读取并以 `initialMessages` 注入 `useChat`。

### M2 · 会话列表 + 侧边栏

- [ ] `SessionSidebar`:列出 `localStorage` 中最近 N(默认 10)个会话,标题取首条用户消息前 20 字。
- [ ] "新建会话"按钮 → `POST /api/chat` 创建 ID → `router.push('/chat/<id>')`。
- [ ] `useChatId` hook:URL > localStorage > 默认值,三者一致后再挂载 `useChat`。

### M3 · 体验与稳健性

- [ ] Markdown 基础渲染(段落、列表、行内 code、代码块),不引入 `react-markdown` 完整包,自实现以减小体积。
- [ ] 流式未完成时助手消息末尾追加 `<span class="cursor-blink">▍</span>`。
- [ ] 失败重试:对 `AI_APICallError` / 网络错误提供一键重发。
- [ ] 在 `next.config.ts` 添加 `headers(): X-Accel-Buffering: no`(本地反向代理场景需要)。
- [ ] `README.md` 增补运行/部署说明。

### M4(可选,延后) · Redis 持久化

- [ ] `chat-store.redis.ts`:key 命名 `chat:{id}`,`SETEX chat:{id} TTL value`,TTL 取 `CHAT_TTL_SECONDS`。
- [ ] 启动时检测 `REDIS_URL`,存在则切换实现,`chat-store.ts` 暴露统一接口。
- [ ] Upstash TLS(`rediss://`)已可被 `ioredis` 直连,无需额外配置。

## 5. 关键约定(写到代码注释里)

1. **不使用 `@/components/ui/...` 之外的自造样式系统**,继续走 Tailwind v4 + CSS 变量。
2. **客户端组件**只在确实需要交互的叶子节点声明 `'use client'`;容器与服务端数据获取保持 Server Component。
3. **环境变量**:
   - 服务端: `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`LLM_MODEL`、`REDIS_URL`、`CHAT_TTL_SECONDS`。
   - 客户端: 暂不暴露 LLM 配置;如需前端展示模型名,新增 `NEXT_PUBLIC_APP_NAME=AI Chat Assistant`。
4. **会话 ID 校验**:URL 段必须匹配 `^[A-Za-z0-9_-]{8,64}$`,作为文件路径/Redis key 前的硬性闸门。
5. **日志**:服务端 `onEnd` 内打印 `messages.length`、`usage`(若有),便于排错。
6. **Abort**:`streamText` 拿到 `request.signal`,客户端断开时自动中断流,无需手动管理。

## 6. 风险与决策记录(ADR 简版)

| 风险 | 影响 | 决策 |
| --- | --- | --- |
| 反向代理/CDN 缓冲流式响应 | 用户看到一次跳出的整段文本 | `next.config.ts` 设置 `X-Accel-Buffering: no`;README 提示部署平台 |
| `OPENAI_BASE_URL` 留空时硬编码走官方 | 千问/DeepSeek 用户配错 | `.env.example` 注释里给出四个常用 baseURL,`llm.ts` 做存在性校验并打 warning |
| 进程内 Map 重启即丢 | 开发体验落差 | 文档明示,默认实现 + Redis 实现双轨,README 提示生产用 Redis |
| `useChat` 切换 ID 时旧流未取消 | 出现串流 | `useChat` 自带 abort;`ChatView` 在 `id` 变更时显式调用 `stop()` |
| Markdown 自实现 XSS | 用户输入渲染风险 | 用纯文本替换 + 极简规则;不渲染 `<script>` `<iframe>` 等危险标签;代码块仅做 `<pre><code>` 转义 |

## 7. 不在本次范围(明确)

- 鉴权/多租户。
- 工具调用(Function calling)、MCP、知识库检索。
- 服务端持久化的备份/恢复、跨设备同步。
- 性能压测、可观测性接入(OpenTelemetry 等)。

---

## 8. 实施前的检查清单(每条实施任务前过一遍)

1. 是否已读 `node_modules/next/dist/docs/` 中相关章节?
2. 是否对照 AI SDK v7 codemod 表(`system→instructions`、`onFinish→onEnd`、`fullStream→stream`)?
3. 是否避免引入新依赖(`react-markdown`、`zod` 等),确需时单独说明?
4. 是否所有新增文件都写中文注释(尤其非自解释的命名)?
5. 是否本地 `npm run dev` 实测过流式输出与刷新恢复?