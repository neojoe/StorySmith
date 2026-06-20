import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { novelService } from "@/services/novel-service";
import type { AgentMessage, IdeaTask } from "@/types/novel";

function storageKey(sessionId: string) {
  return `novel-idea-chat:${sessionId}`;
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

export function useIdeaChat(sessionId: string | null) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const hydratedTaskRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setActiveTaskId(null);
      hydratedTaskRef.current = null;
      return;
    }
    setMessages(loadStoredMessages(sessionId));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    try {
      localStorage.setItem(storageKey(sessionId), JSON.stringify(messages));
    } catch {
      // Ignore storage errors.
    }
  }, [messages, sessionId]);

  const syncTaskToMessages = useCallback((task: IdeaTask) => {
    const assistantContent =
      task.status === "failed" && !task.assistant_content
        ? `❌ 错误：${task.error_message || "任务执行失败"}`
        : task.status === "cancelled" && !task.assistant_content
          ? "已停止本次灵感生成。"
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

  const appendAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        timestamp: new Date().toISOString(),
      },
    ]);
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

  const stop = useCallback(async () => {
    if (!activeTaskId) return;
    try {
      const task = await novelService.cancelIdeaTask(activeTaskId);
      syncTaskToMessages(task);
    } finally {
      setIsSending(false);
      setActiveTaskId(null);
    }
  }, [activeTaskId, syncTaskToMessages]);

  const sendMessage = useCallback(async (rawText: string, targetSessionId?: string) => {
    const text = rawText.trim();
    const effectiveSessionId = targetSessionId ?? sessionId;
    if (!text || !effectiveSessionId || isSending || activeTaskId) return false;

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
      const task = await novelService.createIdeaTask(effectiveSessionId, text);
      setActiveTaskId(task.id);
      hydratedTaskRef.current = task.id;
      syncTaskToMessages(task);
      return true;
    } catch {
      appendAssistantMessage("❌ 请求失败，请重试。");
      setIsSending(false);
      return false;
    }
  }, [activeTaskId, appendAssistantMessage, isSending, sessionId, syncTaskToMessages]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const restoreLatestTask = async () => {
      try {
        const task = await novelService.getLatestIdeaTask(sessionId);
        if (cancelled) return;
        syncTaskToMessages(task);
        hydratedTaskRef.current = task.id;
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
        const task = await novelService.getIdeaTask(activeTaskId);
        if (stopped) return;
        syncTaskToMessages(task);

        if (task.status === "pending" || task.status === "running") {
          setIsSending(true);
          timer = setTimeout(() => {
            void poll();
          }, 1500);
          return;
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
  }, [activeTaskId, syncTaskToMessages]);

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
