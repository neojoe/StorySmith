import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dramaService } from "@/services/drama-service";
import type { DramaAgentMessage, DramaAgentTask, DramaAgentToolEvent } from "@/types/drama";

const TOOL_MUTATION_NAMES = new Set([
  "save_project_info",
  "generate_story_blueprint",
  "create_asset_card",
  "generate_asset_reference",
  "create_shot_card",
  "update_shot_prompts",
  "generate_shot_keyframes_tool",
  "batch_generate_shot_keyframes_tool",
  "batch_render_shots_tool",
  "quality_check_shot_tool",
  "batch_quality_check_tool",
  "rework_shot_tool",
]);

function storageKey(sessionId: string) {
  return `drama-agent-chat:${sessionId}`;
}

function loadStoredMessages(sessionId: string): DramaAgentMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useDramaAgentChat(sessionId: string | null, onProjectChanged?: () => void) {
  const [messages, setMessages] = useState<DramaAgentMessage[]>([]);
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
      // ignore
    }
  }, [messages, sessionId]);

  const appendAssistantMessage = useCallback((content: string, toolEvents?: DramaAgentToolEvent[]) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        timestamp: new Date().toISOString(),
        toolEvents,
      },
    ]);
  }, []);

  const clearMessages = useCallback(() => {
    if (!sessionId) return;
    setMessages([]);
    try {
      localStorage.removeItem(storageKey(sessionId));
    } catch {
      // ignore
    }
  }, [sessionId]);

  const clearTaskMessages = useCallback((taskId: string) => {
    setMessages((prev) => prev.filter((message) => message.taskId !== taskId && message.id !== `user-${taskId}`));
  }, []);

  const syncTaskToMessages = useCallback((task: DramaAgentTask) => {
    const assistantContent =
      task.status === "failed" && !task.assistant_content
        ? `❌ 错误：${task.error_message || "任务执行失败"}`
        : task.status === "cancelled" && !task.assistant_content
          ? "已停止本次漫剧生产任务。"
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

      const assistantMessage: DramaAgentMessage = {
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
      const task = await dramaService.cancelAgentTask(activeTaskId);
      syncTaskToMessages(task);
    } finally {
      setIsSending(false);
      setActiveTaskId(null);
    }
  }, [activeTaskId, syncTaskToMessages]);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || !sessionId || isSending || activeTaskId) return null;

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
      const task = await dramaService.createAgentTask(sessionId, text);
      setActiveTaskId(task.id);
      syncTaskToMessages(task);
      return task.id;
    } catch {
      appendAssistantMessage("❌ 请求失败，请重试。");
      setIsSending(false);
      return null;
    }
  }, [activeTaskId, appendAssistantMessage, isSending, sessionId, syncTaskToMessages]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const restoreLatestTask = async () => {
      try {
        const task = await dramaService.getLatestAgentTask(sessionId);
        if (cancelled) return;
        if (task.status === "pending" || task.status === "running") {
          syncTaskToMessages(task);
          setActiveTaskId(task.id);
          setIsSending(true);
          return;
        }
        clearTaskMessages(task.id);
        setIsSending(false);
        setActiveTaskId(null);
      } catch {
        // ignore when no existing task
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
        const task = await dramaService.getAgentTask(activeTaskId);
        if (stopped) return;
        syncTaskToMessages(task);

        const toolCount = task.tool_events.length;
        const hasMutationToolEvent = task.tool_events.some(
          (evt) => evt.type === "tool_end" && TOOL_MUTATION_NAMES.has(evt.name),
        );
        if (toolCount !== lastToolEventCountRef.current) {
          lastToolEventCountRef.current = toolCount;
          if (hasMutationToolEvent) onProjectChanged?.();
        }

        if (task.status === "pending" || task.status === "running") {
          setIsSending(true);
          timer = setTimeout(() => {
            void poll();
          }, 1500);
          return;
        }

        if (task.status === "failed" || task.status === "cancelled") {
          clearTaskMessages(task.id);
        }
        if (hasMutationToolEvent || task.status === "completed") onProjectChanged?.();
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
  }, [activeTaskId, clearTaskMessages, onProjectChanged, syncTaskToMessages]);

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
