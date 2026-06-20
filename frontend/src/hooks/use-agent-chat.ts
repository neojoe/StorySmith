import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { novelService } from "@/services/novel-service";
import type { AgentMessage, AgentTask, AgentToolEvent } from "@/types/novel";

const TOOL_MUTATION_NAMES = new Set([
  "save_outline",
  "save_chapters",
  "save_chapter_outline",
  "save_chapter_content",
  "finalize_novel",
  "update_project_info",
]);

function storageKey(sessionId: string) {
  return `novel-agent-chat:${sessionId}`;
}

function loadStoredMessages(sessionId: string): AgentMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useAgentChat(
  sessionId: string | null,
  onProjectChanged?: () => void,
) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const lastToolEventCountRef = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setActiveTaskId(null);
      return;
    }
    setMessages(loadStoredMessages(sessionId));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    try {
      localStorage.setItem(storageKey(sessionId), JSON.stringify(messages));
    } catch {
      // Ignore quota / serialization errors.
    }
  }, [messages, sessionId]);

  const appendAssistantMessage = useCallback((content: string, toolEvents?: AgentToolEvent[]) => {
    const msg: AgentMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
      toolEvents,
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  const clearMessages = useCallback(() => {
    if (!sessionId) return;
    setMessages([]);
    try {
      localStorage.removeItem(storageKey(sessionId));
    } catch {
      // Ignore storage removal failures.
    }
  }, [sessionId]);

  const syncTaskToMessages = useCallback((task: AgentTask) => {
    const assistantContent =
      task.status === "failed" && !task.assistant_content
        ? `❌ 错误：${task.error_message || "任务执行失败"}`
        : task.status === "cancelled" && !task.assistant_content
          ? "已停止本次创作任务。"
          : task.assistant_content;

    setMessages((prev) => {
      const next = [...prev];
      const assistantIndex = next.findIndex((m) => m.role === "assistant" && m.taskId === task.id);
      const userExists = next.some((m) => m.role === "user" && m.content === task.user_message);

      if (!userExists && task.user_message) {
        next.push({
          id: `user-${task.id}`,
          role: "user",
          content: task.user_message,
          timestamp: task.created_at,
        });
      }

      const assistantMessage: AgentMessage = {
        id: `assistant-${task.id}`,
        role: "assistant",
        content: assistantContent,
        timestamp: task.updated_at,
        toolEvents: task.tool_events,
        taskId: task.id,
      };

      if (assistantIndex >= 0) {
        next[assistantIndex] = assistantMessage;
      } else {
        next.push(assistantMessage);
      }
      return next;
    });
  }, []);

  const stop = useCallback(async () => {
    if (!activeTaskId) return;
    try {
      const task = await novelService.cancelAgentTask(activeTaskId);
      syncTaskToMessages(task);
    } finally {
      setIsSending(false);
      setActiveTaskId(null);
    }
  }, [activeTaskId, syncTaskToMessages]);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || !sessionId || isSending || activeTaskId) return false;

    setIsSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      },
    ]);
    try {
      const task = await novelService.createAgentTask(sessionId, text);
      setActiveTaskId(task.id);
      syncTaskToMessages(task);
      return true;
    } catch (err) {
      appendAssistantMessage("❌ 请求失败，请重试。");
      setIsSending(false);
      return false;
    } finally {
      // Poller controls the final sending state once task really starts/stops.
    }
  }, [activeTaskId, appendAssistantMessage, isSending, sessionId, syncTaskToMessages]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const restoreLatestTask = async () => {
      try {
        const task = await novelService.getLatestAgentTask(sessionId);
        if (cancelled) return;
        syncTaskToMessages(task);
        if (task.status === "pending" || task.status === "running") {
          setActiveTaskId(task.id);
          setIsSending(true);
        }
      } catch {
        // Ignore when no existing task is found.
      }
    };

    void restoreLatestTask();
    return () => {
      cancelled = true;
    };
  }, [sessionId, syncTaskToMessages]);

  useEffect(() => {
    if (!activeTaskId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const task = await novelService.getAgentTask(activeTaskId);
        if (stopped) return;
        syncTaskToMessages(task);

        const toolCount = task.tool_events.length;
        const hasMutationToolEvent = task.tool_events.some(
          (evt) => evt.type === "tool_end" && TOOL_MUTATION_NAMES.has(evt.name),
        );
        if (toolCount !== lastToolEventCountRef.current) {
          lastToolEventCountRef.current = toolCount;
          if (hasMutationToolEvent) {
            onProjectChanged?.();
          }
        }

        if (task.status === "pending" || task.status === "running") {
          setIsSending(true);
          timer = setTimeout(() => {
            void poll();
          }, 1500);
          return;
        }

        if (hasMutationToolEvent || task.status === "completed") {
          onProjectChanged?.();
        }
        setIsSending(false);
        setActiveTaskId(null);
      } catch {
        if (stopped) return;
        timer = setTimeout(() => {
          void poll();
        }, 2000);
      }
    };

    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeTaskId, onProjectChanged, syncTaskToMessages]);

  return useMemo(() => ({
    messages,
    isSending,
    sendMessage,
    stop,
    appendAssistantMessage,
    clearMessages,
    activeTaskId,
  }), [activeTaskId, appendAssistantMessage, clearMessages, isSending, messages, sendMessage, stop]);
}
