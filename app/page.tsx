// AI Chat Assistant 入口页(客户端组件)。
//
// M0:接入 useChat + 流式响应。
// M1:多轮对话记忆(Redis)。
// M2:JSON 强制输出 ——
//   · 系统提示词约束模型输出 JSON。
//   · 客户端累积 messages 中最后一条 assistant 的 text part → 流结束后 JSON.parse。
//   · 成功:渲染 answer 字段,折叠展示 meta。
//   · 失败:降级显示原文 + 错误提示。
// M3:识图(真)——
//   · 拖拽 / 点选图片到输入框,上传到 /api/upload,拿到 URL。
//   · 在 sendMessage({ text, files }) 里把 FileUIPart[] 一起提交。
//   · 后端 convertToModelMessages 自动转多模态 parts,模型能"看到"图。
//
// AI SDK v5 经典写法:
// - useChat 不托管 input,需本地 useState + sendMessage({ text, files })。
// - 消息 m.parts 是数组,按 part.type === 'text' 渲染文本;
//   part.type === 'file' 渲染图片。
// - messages 整体走 JSON 序列化进 Redis,FileUIPart 里的 url 是字符串。

"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PUBLIC_LLM_MODEL } from "@/lib/llm-config";
import {
  ChatAnswer,
  extractJson,
  type ChatAnswer as ChatAnswerT,
} from "@/lib/json-schema";

const STORAGE_KEY = "ai-chat-assistant:chat-id";
const SAVE_DEBOUNCE_MS = 800;

function createChatId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// SSR 阶段不能读 localStorage(localStorage 是浏览器 API),否则服务端 / 客户端
// chatId 不一致导致 hydration mismatch。useState 初始值统一传 undefined,
// 客户端 mount 后由 useEffect 读 localStorage 并 setChatId;SSR 与客户端首渲染
// 都是 undefined,文本节点一致 → 不再 mismatch。
function readOrCreateChatId(): string {
  if (typeof window === "undefined") return "ssr";
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const fresh = createChatId();
  window.localStorage.setItem(STORAGE_KEY, fresh);
  return fresh;
}

/** 拼接所有 text 段为单一字符串(JSON 模式 / 降级渲染都要)。 */
function getTextFromMessage(m: UIMessage): string {
  if (!m.parts) return "";
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** 拿到一条消息的 FileUIPart 列表(用于 user 消息的缩略图渲染)。 */
function getFilesFromMessage(m: UIMessage): FileUIPart[] {
  if (!m.parts) return [];
  return m.parts.filter((p): p is FileUIPart => p.type === "file");
}

/**
 * 把 assistant 的 text 内容解析为结构化对象;失败返回 null。
 */
function tryParseAnswer(raw: string): ChatAnswerT | null {
  const json = extractJson(raw);
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    const r = ChatAnswer.safeParse(obj);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export default function Home() {
  // SSR 与客户端首渲染 chatId 都是 "ssr"(占位)→ 文本一致,避免 hydration mismatch。
  // 客户端 mount 后,下方 useEffect 立即把 chatId 替换为真实 ID,触发重渲染。
  const [chatId, setChatId] = useState<string>("ssr");

  useEffect(() => {
    // 仅在客户端 mount 时跑一次:从 localStorage 读或新建 chatId。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChatId(readOrCreateChatId());
  }, []);

  const chat = useChat({
    id: chatId === "ssr" ? undefined : chatId,
    transport:
      chatId && chatId !== "ssr"
        ? new DefaultChatTransport({
            api: "/api/chat",
            body: { id: chatId },
          })
        : undefined,
  });
  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
    regenerate,
    setMessages,
  } = chat;

  // v5:useChat 不托管 input,本地 useState。
  const [input, setInput] = useState("");
  // M3:本轮要随下条消息一起发送的图片(URL + mediaType + name)。
  const [pendingFiles, setPendingFiles] = useState<FileUIPart[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // M1:从 Redis 拉历史(SSR 后 hydrate)。
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // chatId 设置好之后才拉历史;SSR 阶段 chatId === "ssr",不跑。
    if (!chatId || chatId === "ssr") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${chatId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setHydrated(true);
          return;
        }
        const data = (await res.json()) as { messages?: UIMessage[] };
        if (!cancelled && Array.isArray(data.messages)) {
          // 防御:v3.4 时代 Redis 残留旧消息无 parts,这里补成 v5 形态。
          const migrated: UIMessage[] = data.messages.map((m) => {
            if (Array.isArray(m.parts) && m.parts.length > 0) return m;
            const content =
              (m as unknown as { content?: string }).content ?? "";
            return {
              ...m,
              parts: [{ type: "text" as const, text: content }],
            };
          });
          setMessages(migrated);
        }
      } catch {
        // 静默
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, setMessages]);

  // 自动滚动到底。
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // 持久化(messages 变化 + 非流式 + 已 hydrate 才保存)。
  useEffect(() => {
    if (!hydrated) return;
    if (status === "submitted" || status === "streaming") return;
    if (messages.length === 0) return;
    const t = setTimeout(() => {
      fetch(`/api/sessions/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      }).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [messages, status, hydrated, chatId]);

  const isStreaming = status === "submitted" || status === "streaming";

  // M3:提交。sendMessage({ text, files }) 一并发出。
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isStreaming) return;
    const text = input.trim();
    const files = pendingFiles;
    if (!text && files.length === 0) return;

    setInput("");
    setPendingFiles([]);

    await sendMessage({
      text,
      files, // v5 API:FileUIPart[] 走多模态,空数组也能传
    });
  }

  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    try {
      const uploaded: FileUIPart[] = [];
      for (const file of arr) {
        if (!file.type.startsWith("image/")) continue;
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          console.error("upload failed", await res.text());
          continue;
        }
        const data = (await res.json()) as {
          url: string;
          contentType: string;
          name: string;
        };
        uploaded.push({
          type: "file",
          url: data.url,
          mediaType: data.contentType,
          filename: data.name,
        });
      }
      if (uploaded.length > 0) {
        setPendingFiles((prev) => [...prev, ...uploaded]);
      }
    } finally {
      setUploading(false);
    }
  }

  function onFilePick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      void uploadFiles(e.target.files);
      e.target.value = "";
    }
  }

  function onDrop(e: DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      void uploadFiles(e.dataTransfer.files);
    }
  }

  function onDragOver(e: DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function onDragLeave() {
    setIsDragOver(false);
  }

  function removePending(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>AI Chat Assistant</CardTitle>
            <CardDescription>
              基于 OpenAI 兼容接口的多轮对话 · 模型:{PUBLIC_LLM_MODEL}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div
              ref={scrollRef}
              className="scroll-area h-80 overflow-y-auto rounded-md border bg-background/40 p-3 space-y-3"
            >
              {!hydrated ? (
                <p className="text-sm text-muted-foreground">加载中…</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  开始对话吧,试试输入&ldquo;你好&rdquo;或拖一张图片进来。
                </p>
              ) : (
                messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isStreaming={
                      isStreaming && m === messages[messages.length - 1]
                    }
                  />
                ))
              )}

              {isStreaming &&
                messages[messages.length - 1]?.role !== "assistant" && (
                  <p className="text-xs text-muted-foreground">正在生成…</p>
                )}
            </div>

            {error && (
              <div className="flex items-center justify-between rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <span>请求失败:{error.message}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => regenerate()}
                >
                  重试
                </Button>
              </div>
            )}

            {/* 待发送图片预览 */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 rounded-md border border-dashed p-2">
                {pendingFiles.map((f, i) => (
                  <div
                    key={f.url}
                    className="relative h-16 w-16 overflow-hidden rounded border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.url}
                      alt={f.filename ?? "preview"}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePending(i)}
                      className="absolute right-0 top-0 h-5 w-5 bg-black/60 text-xs text-white"
                      aria-label="移除"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {uploading && (
                  <span className="text-xs text-muted-foreground self-center">
                    上传中…
                  </span>
                )}
              </div>
            )}

            {/* 输入区:支持拖拽 + 点选 + 文本 */}
            <form
              onSubmit={handleSubmit}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={
                "flex items-center gap-2 rounded-md border p-1 transition-colors " +
                (isDragOver ? "border-primary bg-primary/5" : "border-input")
              }
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onFilePick}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || uploading}
                title="选择图片"
              >
                📎
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isDragOver ? "松开以上传图片" : "输入消息或拖拽图片..."
                }
                disabled={isStreaming}
                className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {isStreaming ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => stop()}
                >
                  停止
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!input.trim() && pendingFiles.length === 0}
                >
                  发送
                </Button>
              )}
            </form>

            <div className="flex flex-wrap gap-2">
              <Badge>Next.js 16</Badge>
              <Badge variant="secondary">AI SDK v5</Badge>
              <Badge variant="outline">流式响应</Badge>
              <Badge variant="outline">Redis 记忆</Badge>
              <Badge variant="outline">JSON 输出</Badge>
              <Badge variant="outline">多模态识图</Badge>
            </div>
            <p className="text-xs text-muted-foreground break-all">
              会话 ID:{chatId ?? "…"}
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

// 消息气泡:
// - user:从 parts 提取 text + file(图片缩略图)。
// - assistant 流式中:纯文本累加渲染。
// - assistant 流结束后:JSON 解析 → 成功展示 answer + meta;失败降级。
function MessageBubble({
  message,
  isStreaming,
}: {
  message: UIMessage;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";
  const files = isUser ? getFilesFromMessage(message) : [];
  const rawText = getTextFromMessage(message);

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words bg-primary text-primary-foreground space-y-2">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {files.map((f) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={f.url}
                  src={f.url}
                  alt={f.filename ?? "image"}
                  className="h-20 w-20 rounded object-cover border border-primary-foreground/20"
                />
              ))}
            </div>
          )}
          {rawText && <div>{rawText}</div>}
        </div>
      </div>
    );
  }

  const parsed = !isStreaming && rawText ? tryParseAnswer(rawText) : null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words bg-muted text-foreground">
        {parsed ? (
          <AssistantStructured
            data={parsed}
            raw={rawText}
          />
        ) : (
          <AssistantRaw
            content={rawText}
            isStreaming={isStreaming}
          />
        )}
      </div>
    </div>
  );
}

// 结构化渲染:answer + 可折叠 meta
function AssistantStructured({
  data,
  raw,
}: {
  data: ChatAnswerT;
  raw: string;
}) {
  return (
    <div className="space-y-2">
      <div className="whitespace-pre-wrap">{data.answer}</div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">
          元数据 · 置信度 {(data.meta.confidence * 100).toFixed(0)}%
        </summary>
        <div className="mt-1 space-y-2 pl-2 border-l border-border/40 max-h-60 overflow-y-auto">
          <div>
            <p className="font-medium text-foreground/80">思考:</p>
            <p className="whitespace-pre-wrap break-words">
              {data.meta.reasoning || "(空)"}
            </p>
          </div>
          {data.meta.tags.length > 0 && (
            <div>
              <p className="font-medium text-foreground/80">标签:</p>
              <p className="break-words">{data.meta.tags.join("、")}</p>
            </div>
          )}
          <div>
            <p className="font-medium text-foreground/80">原始输出:</p>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-background/60 p-2 text-[10px] leading-snug whitespace-pre-wrap break-all">
              {prettyPrintJson(raw)}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
}

/**
 * 尽力把原始字符串解析成 JSON,并美化打印;失败则原样返回。
 */
function prettyPrintJson(raw: string): string {
  const trimmed = raw.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.stringify(JSON.parse(stripped), null, 2);
  } catch {
    return raw;
  }
}

// 降级渲染(仅 assistant):原始文本 + 错误提示(只在流结束后且解析失败时)
function AssistantRaw({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  if (isStreaming) {
    return <>{content || "…"}</>;
  }
  return (
    <div className="space-y-1">
      <div>{content}</div>
      {content && (
        <p className="text-xs text-destructive">
          ⚠ 模型输出未通过 JSON schema,已降级显示原文。
        </p>
      )}
    </div>
  );
}
