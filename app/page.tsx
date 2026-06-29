"use client";

import { useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

export default function ChatPage() {
  const [input, setInput] = useState("");

  // useChat 封装流式请求、消息管理
  const { messages, sendMessage, stop, status, setMessages, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isStreaming = status === "submitted" || status === "streaming";

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <main className="max-w-3xl mx-auto p-4 min-h-screen flex flex-col">
      <h1 className="text-2xl font-bold text-center py-4">
        AI聊天助手(Next.js+千问)
      </h1>

      {error && (
        <div className="bg-red-100 text-red-700 p-2 rounded mb-2">
          出错了：{error.message}
        </div>
      )}

      {/* 消息对话区域 */}
      <div className="flex-1 overflow-auto space-y-4 py-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-3 rounded-lg ${
              msg.role === "user"
                ? "bg-blue-100 text-right ml-auto max-w-[80%]"
                : "bg-gray-100 text-left mr-auto max-w-[80%]"
            }`}
          >
            {msg.parts.map((part, i) =>
              part.type === "text" ? (
                <p
                  key={i}
                  className="whitespace-pre-wrap"
                >
                  {part.text}
                </p>
              ) : null,
            )}
          </div>
        ))}
        {isStreaming && (
          <div className="text-gray-400 text-sm">AI 正在思考…</div>
        )}
      </div>

      {/* 输入区域 */}
      <form
        onSubmit={onSubmit}
        className="flex gap-2 mt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入你的问题..."
          className="flex-1 border rounded px-3 py-2 outline-none focus:border-blue-400"
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          发送
        </button>
        {isStreaming && (
          <button
            type="button"
            onClick={stop}
            className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
          >
            停止
          </button>
        )}
        <button
          type="button"
          onClick={() => setMessages([])}
          className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
        >
          清空
        </button>
      </form>
    </main>
  );
}
