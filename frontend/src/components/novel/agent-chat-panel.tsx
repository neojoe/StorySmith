import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { Bot, Loader2, Send, Sparkles, User, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentMessage, AgentToolEvent } from "@/types/novel";

const TOOL_LABELS: Record<string, string> = {
  get_project_status: "查看项目状态",
  read_project_context: "读取项目上下文",
  read_chapter_content: "读取章节正文",
  read_chapter_bundle: "批量读取章节",
  update_project_info: "更新项目信息",
  save_outline: "保存大纲",
  save_chapters: "保存章节列表",
  save_chapter_outline: "保存单章大纲",
  save_chapter_content: "保存章节内容",
  finalize_novel: "完成定稿",
  write_learnings: "更新创作资料",
  read_learnings: "读取创作资料",
  list_learnings: "检查创作资料",
};

const HIDDEN_TOOL_NAMES = new Set(["read_skill"]);

function getVisibleToolEvents(toolEvents?: AgentToolEvent[]) {
  if (!toolEvents?.length) return [];

  const visibleEvents = toolEvents.filter((event) => !HIDDEN_TOOL_NAMES.has(event.name));
  const merged = new Map<string, AgentToolEvent>();

  visibleEvents.forEach((event, index) => {
    const key = `${event.name}:${event.input ?? ""}`;
    const existing = merged.get(key);
    if (!existing || (existing.type === "tool_start" && event.type === "tool_end")) {
      merged.set(key, event);
      return;
    }
    merged.set(`${key}:${index}`, event);
  });

  return Array.from(merged.values());
}

function ToolEventBadge({ event }: { event: AgentToolEvent }) {
  const label = TOOL_LABELS[event.name] ?? event.name;
  return (
    <div
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-none ${
        event.type === "tool_start"
          ? "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400"
          : "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
      }`}
    >
      <Wrench className="h-3 w-3" />
      <span className="truncate">{event.type === "tool_start" ? `处理中：${label}` : label}</span>
      {event.type === "tool_end" && event.result && (
        <span className="max-w-[140px] truncate text-neutral-400 dark:text-neutral-500">
          — {event.result}
        </span>
      )}
    </div>
  );
}

function MessageBubble({ message, isStreaming }: { message: AgentMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user";
  const visibleToolEvents = getVisibleToolEvents(message.toolEvents);
  const showThinkingState = !isUser && isStreaming && !message.content && visibleToolEvents.length === 0;
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-primary-100 dark:bg-primary-900"
            : "bg-gradient-to-br from-violet-500 to-indigo-600"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary-600 dark:text-primary-400" />
        ) : (
          <Bot className="h-4 w-4 text-white" />
        )}
      </div>
      <div className={`flex max-w-[92%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && visibleToolEvents.length > 0 && (
          <div className="flex max-w-full flex-wrap gap-1.5 rounded-2xl border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-700 dark:bg-neutral-800/60">
            {visibleToolEvents.map((evt, i) => (
              <ToolEventBadge key={`${message.id}-${i}`} event={evt} />
            ))}
          </div>
        )}
        {message.content && (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              isUser
                ? "bg-primary-600 text-white dark:bg-primary-500"
                : "border border-neutral-200 bg-white text-neutral-800 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            }`}
          >
            {message.content}
            {isStreaming && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current" />}
          </div>
        )}
        {showThinkingState && (
          <div className="inline-flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-500 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
            <span>Agent 思考中…</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface QuickAction {
  label: string;
  prompt?: string;
  onClick?: () => Promise<unknown> | unknown;
}

interface AgentChatPanelProps {
  sessionId: string;
  messages: AgentMessage[];
  isSending: boolean;
  onSend: (text: string) => Promise<unknown> | unknown;
  onStop?: () => void;
  title?: string;
  subtitle?: string;
  quickActions?: QuickAction[];
  placeholder?: string;
}

export function AgentChatPanel({
  sessionId,
  messages,
  isSending,
  onSend,
  onStop,
  title = "Agent 对话",
  subtitle,
  quickActions = [],
  placeholder = "继续告诉 Agent 你的要求…",
}: AgentChatPanelProps) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isSending) return;
    setInputText("");
    await onSend(text);
    inputRef.current?.focus();
  };

  const handleQuickAction = async (action: QuickAction) => {
    if (isSending) return;
    if (action.onClick) {
      await action.onClick();
    } else if (action.prompt) {
      await onSend(action.prompt);
    }
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-neutral-900">
      <div className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {title}
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-400">
          {subtitle ?? `会话 ${sessionId.slice(0, 8)}…`}
        </p>
      </div>

      {quickActions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
          {quickActions.map((action) => (
            <Button
              key={action.label}
              size="sm"
              variant="outline"
              onClick={() => handleQuickAction(action)}
              disabled={isSending}
              className="h-7 gap-1.5 whitespace-nowrap px-3 text-[clamp(12px,0.85vw,13px)] leading-none"
            >
              <Sparkles className="h-3 w-3" />
              {action.label}
            </Button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30">
              <Sparkles className="h-7 w-7 text-violet-500" />
            </div>
            <p className="max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
              这里会保留当前会话的 Agent 对话和创作工具轨迹。
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isStreaming={isSending && idx === messages.length - 1 && msg.role === "assistant"}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
        <div className="flex items-end gap-2 rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2 transition-all focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-400/30 dark:border-neutral-600 dark:bg-neutral-800 dark:focus-within:border-primary-500">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isSending ? "后台任务执行中，可离开页面后稍后回来查看…" : placeholder}
            disabled={isSending}
            rows={1}
            className="min-h-[24px] max-h-[120px] flex-1 resize-none overflow-y-auto bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-100"
            style={{ fieldSizing: "content" } as CSSProperties}
          />
          {isSending ? (
            <button
              onClick={onStop}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-center text-xs text-neutral-400">
          任务在服务端后台执行；离开页面后回来，仍可继续查看和衔接创作
        </p>
      </div>
    </div>
  );
}
