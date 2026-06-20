import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Bot,
  User,
  Send,
  Loader2,
  BookOpen,
  CheckCircle2,
  PenLine,
  Wrench,
  ArrowRight,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { novelService } from "@/services/novel-service";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { useAgentSessionProject } from "@/hooks/use-novel";
import type { AgentMessage, AgentToolEvent, NovelProject } from "@/types/novel";
import { GENRE_NAME_MAP } from "@/constants/novel-genres";
import { linkProjectToAgentSession } from "@/utils/agent-session-link";

// ── Stage progress bar ──────────────────────────────────────────────────────────

const STAGES = [
  { key: "init", label: "了解需求" },
  { key: "outline", label: "生成大纲" },
  { key: "chapters", label: "规划章节" },
  { key: "writing", label: "逐章写作" },
  { key: "done", label: "定稿完成" },
] as const;

type Stage = (typeof STAGES)[number]["key"];

function StageBar({ stage }: { stage: Stage }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
      {STAGES.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1 min-w-0">
          <div
            className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              i < idx
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : i === idx
                  ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
                  : "text-neutral-400 dark:text-neutral-500"
            }`}
          >
            {i < idx && <CheckCircle2 className="h-3 w-3" />}
            {i === idx && <Sparkles className="h-3 w-3 animate-pulse" />}
            <span className="hidden sm:inline">{s.label}</span>
          </div>
          {i < STAGES.length - 1 && (
            <ChevronRight className="h-3 w-3 shrink-0 text-neutral-300 dark:text-neutral-600" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tool event display ──────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  get_project_status: "查看项目状态",
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
          ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
          : "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
      }`}
    >
      <Wrench className="h-3 w-3" />
      <span className="truncate">{event.type === "tool_start" ? `处理中：${label}` : label}</span>
      {event.type === "tool_end" && event.result && (
        <span className="text-neutral-400 dark:text-neutral-500 max-w-[140px] truncate">
          — {event.result}
        </span>
      )}
    </div>
  );
}

// ── Message bubble ──────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isStreaming,
}: {
  message: AgentMessage;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";
  const visibleToolEvents = getVisibleToolEvents(message.toolEvents);
  const showThinkingState = !isUser && isStreaming && !message.content && visibleToolEvents.length === 0;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
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

      {/* Content */}
      <div className={`flex max-w-[80%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        {/* Tool events (before assistant text) */}
        {!isUser && visibleToolEvents.length > 0 && (
          <div className="flex max-w-full flex-wrap gap-1.5 rounded-2xl border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-700 dark:bg-neutral-800/60">
            {visibleToolEvents.map((evt, i) => (
              <ToolEventBadge key={i} event={evt} />
            ))}
          </div>
        )}

        {/* Text bubble */}
        {message.content && (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              isUser
                ? "bg-primary-600 text-white dark:bg-primary-500"
                : "bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700 shadow-sm"
            }`}
          >
            {message.content}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-0.5 bg-current animate-pulse" />
            )}
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

// ── Novel preview sidebar ───────────────────────────────────────────────────────

function NovelPreview({ project, onOpenWorkspace }: {
  project: NovelProject | undefined;
  onOpenWorkspace: () => void;
}) {
  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <BookOpen className="h-10 w-10 text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          小说内容将在这里实时预览
        </p>
      </div>
    );
  }

  const isPublished = project.status === "published";

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* Title & genre */}
      <div>
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2">
          {project.title === "AI 创作中…" ? (
            <span className="text-neutral-400 italic">AI 创作中，书名待定…</span>
          ) : (
            project.title
          )}
        </h3>
        <p className="mt-0.5 text-xs text-neutral-400">
          {GENRE_NAME_MAP[project.genre] ?? project.genre}
          {isPublished && " · 已定稿"}
          {!isPublished && ` · ${project.status === "draft" ? "创作中" : project.status}`}
        </p>
      </div>

      {/* Outline preview */}
      {project.outline && (
        <div>
          <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">大纲</p>
          <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed line-clamp-6">
            {project.outline}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/50">
        <div>
          <p className="text-[11px] text-neutral-400">计划章节数</p>
          <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            {project.target_chapter_count || 10} 章
          </p>
        </div>
        <div>
          <p className="text-[11px] text-neutral-400">每章目标</p>
          <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            {project.min_chapter_word_count || 2000} 字+
          </p>
        </div>
      </div>

      {/* Stats */}
      {isPublished && (project.chapter_count > 0 || project.total_word_count > 0) && (
        <div className="flex gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3">
          {project.chapter_count > 0 && (
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {project.chapter_count}
              </p>
              <p className="text-xs text-neutral-500">章</p>
            </div>
          )}
          {project.total_word_count > 0 && (
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {project.total_word_count.toLocaleString()}
              </p>
              <p className="text-xs text-neutral-500">字</p>
            </div>
          )}
        </div>
      )}

      {/* Go to workspace */}
      <Button
        variant={isPublished ? "primary" : "outline"}
        size="sm"
        onClick={onOpenWorkspace}
        className="mt-auto gap-2"
      >
        <PenLine className="h-3.5 w-3.5" />
        {isPublished ? "阅读完整小说" : "在工作台查看进度"}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────

export function AgentNovelPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const existingSid = searchParams.get("sid");

  const [sessionId, setSessionId] = useState<string | null>(existingSid);
  const [inputText, setInputText] = useState("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [currentStage] = useState<Stage>("init");
  const [showSidebar, setShowSidebar] = useState(true);
  const [setupGenre, setSetupGenre] = useState("urbanReborn");
  const [setupChapterCount, setSetupChapterCount] = useState(10);
  const [setupFirstChapterWords, setSetupFirstChapterWords] = useState(2000);
  const [setupGenerationMode, setSetupGenerationMode] = useState<"guided_first_chapter" | "full_book">("guided_first_chapter");
  const [setupIdea, setSetupIdea] = useState("");
  const [pendingBootMessage, setPendingBootMessage] = useState<{
    mode: "send" | "append";
    text: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: project, refetch: refetchProject } = useAgentSessionProject(sessionId ?? "");
  const {
    messages,
    isSending,
    sendMessage: sendAgentMessage,
    appendAssistantMessage,
  } = useAgentChat(sessionId, refetchProject);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (sessionId && project?.id) {
      linkProjectToAgentSession(project.id, sessionId);
    }
  }, [project?.id, sessionId]);

  useEffect(() => {
    if (!sessionId || !pendingBootMessage) return;
    let cancelled = false;

    const run = async () => {
      if (pendingBootMessage.mode === "send") {
        await sendAgentMessage(pendingBootMessage.text);
      } else {
        appendAssistantMessage(pendingBootMessage.text);
      }
      if (!cancelled) {
        setPendingBootMessage(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [appendAssistantMessage, pendingBootMessage, sendAgentMessage, sessionId]);

  const initSession = async () => {
    setIsCreatingSession(true);
    try {
      const session = await novelService.createAgentSession({
        user_id: "default",
        genre: setupGenre,
        target_chapter_count: setupChapterCount,
        first_chapter_min_word_count: setupFirstChapterWords,
        generation_mode: setupGenerationMode,
      });
      linkProjectToAgentSession(session.project_id, session.id);
      setSessionId(session.id);
      navigate(`/novel/agent/new?sid=${session.id}`, { replace: true });

      if (setupIdea.trim()) {
        const firstPrompt = [
          "请按以下要求开始创作这本小说：",
          `- 故事方向：${setupIdea.trim()}`,
          `- 计划总章节数：${setupChapterCount}章`,
          `- 每章最低字数：${setupFirstChapterWords}字`,
          ...(setupGenerationMode === "full_book"
            ? [
                "- 先完成设定补全、大纲和章节规划。",
                `- 章节规划必须一次性完整生成 ${setupChapterCount} 章，不能只给 1 章或少量示例章。`,
                "- 然后从第一章开始，按顺序自动生成所有章节正文，直到整本书完成。",
                "- 每次只处理当前目标章节，不要跳章。",
              ]
            : [
                "- 先完成设定补全、大纲、章节规划，并直接产出第一章正文。",
                `- 章节规划必须一次性完整生成 ${setupChapterCount} 章，不能只给 1 章或少量示例章。`,
                "- 本次只生成第一章正文，不要继续生成第二章及之后的正文。",
                "- 后续章节我会继续通过对话逐章生成。",
              ]),
        ].join("\n");
        setPendingBootMessage({ mode: "send", text: firstPrompt });
      } else {
        setPendingBootMessage({
          mode: "append",
          text:
            setupGenerationMode === "full_book"
              ? `你好！我是你的 AI 小说创作助手。\n\n当前已为你设置：\n• 创作模式：整本自动生成\n• 计划章节数：${setupChapterCount}章\n• 每章最低字数：${setupFirstChapterWords}字\n\n请告诉我你的故事方向，我会先完成设定、大纲和章节规划，然后在后台按顺序把整本书继续写完。\n\n说明：创作任务会在服务端后台持续执行，离开页面后回来也可以继续查看进度。`
              : `你好！我是你的 AI 小说创作助手。\n\n当前已为你设置：\n• 创作模式：框架 + 第一章\n• 计划章节数：${setupChapterCount}章\n• 每章最低字数：${setupFirstChapterWords}字\n\n请告诉我你的故事方向，我会先帮你完成设定、大纲、章节规划，并优先写出第一章。后续章节我们再逐章推进。\n\n说明：创作任务会在服务端后台持续执行，离开页面后回来也可以继续查看进度。`,
        });
      }
    } catch {
      appendAssistantMessage("连接失败，请刷新页面重试。");
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleSendMessage = async () => {
    const userText = inputText.trim();
    if (!userText || !sessionId || isSending) return;
    setInputText("");
    await sendAgentMessage(userText);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleOpenWorkspace = () => {
    if (project) {
      if (project.status === "published") {
        navigate(`/novel/${project.id}/read`);
      } else {
        navigate(`/novel/${project.id}?sid=${sessionId}`);
      }
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              AI Agent 创作
            </p>
            <p className="text-xs text-neutral-400">
              {isCreatingSession ? "初始化中…" : sessionId ? `会话 ${sessionId.slice(0, 8)}…` : "准备中"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSidebar((v) => !v)}
            className="h-7 gap-1.5 text-xs"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {showSidebar ? "隐藏预览" : "显示预览"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/novel")}
            className="h-7 text-xs"
          >
            返回列表
          </Button>
        </div>
      </div>

      {/* Stage progress */}
      <StageBar stage={currentStage} />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!sessionId && !isCreatingSession && (
              <div className="mx-auto max-w-2xl rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
                <div className="mb-4">
                  <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                    开始 Agent 创作
                  </p>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    先选择创作方式，再设置章节数和字数目标。你可以只先生成框架和第一章，也可以让 Agent 在后台顺序生成整本书。
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSetupGenerationMode("guided_first_chapter")}
                    className={`rounded-xl border p-4 text-left transition ${
                      setupGenerationMode === "guided_first_chapter"
                        ? "border-primary-500 bg-primary-50 shadow-sm dark:border-primary-400 dark:bg-primary-900/20"
                        : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                    }`}
                  >
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">框架 + 第一章</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                      先生成设定、大纲、章节规划和第一章正文。后续章节由你在工作台里继续推进。
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetupGenerationMode("full_book")}
                    className={`rounded-xl border p-4 text-left transition ${
                      setupGenerationMode === "full_book"
                        ? "border-primary-500 bg-primary-50 shadow-sm dark:border-primary-400 dark:bg-primary-900/20"
                        : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                    }`}
                  >
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">整本自动生成</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                      先生成设定、大纲和章节规划，再由后台从第一章开始顺序写完整本书。
                    </p>
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      小说类型
                    </label>
                    <select
                      value={setupGenre}
                      onChange={(e) => setSetupGenre(e.target.value)}
                      className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                    >
                      {Object.entries(GENRE_NAME_MAP).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Input
                    label="计划章节数"
                    type="number"
                    min={1}
                    max={500}
                    value={setupChapterCount}
                    onChange={(e) => setSetupChapterCount(Number(e.target.value))}
                    hint="先规划整本书的总章数。"
                  />

                  <Input
                    label="每章最低字数"
                    type="number"
                    min={200}
                    max={20000}
                    step={100}
                    value={setupFirstChapterWords}
                    onChange={(e) => setSetupFirstChapterWords(Number(e.target.value))}
                    hint={
                      setupGenerationMode === "full_book"
                        ? "后台会按这个目标逐章补足字数。"
                        : "首章先按这个目标生成，后续章节也会沿用该最低字数。"
                    }
                  />
                </div>

                <div className="mt-4">
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    故事方向
                  </label>
                  <textarea
                    value={setupIdea}
                    onChange={(e) => setSetupIdea(e.target.value)}
                    rows={5}
                    placeholder={
                      setupGenerationMode === "full_book"
                        ? "例如：都市爽文，主角重生回高中，依靠先知优势逆袭，整体节奏要强反转，自动生成完整长篇。"
                        : "例如：都市爽文，主角重生回高中，依靠先知优势逆袭，并先写出第一章。"
                    }
                    className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={initSession}
                    disabled={isCreatingSession || !setupIdea.trim()}
                    className="gap-2"
                  >
                    {isCreatingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {setupGenerationMode === "full_book" ? "开始整本生成" : "开始创作第一章"}
                  </Button>
                </div>
              </div>
            )}

            {messages.length === 0 && !isCreatingSession && !!sessionId && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30">
                  <Sparkles className="h-8 w-8 text-violet-500" />
                </div>
                <p className="text-neutral-500 dark:text-neutral-400 text-sm max-w-xs">
                  {sessionId ? "Agent 正在初始化，稍后将引导你开始创作…" : "先选择创作方式并填写参数，再开始生成。"}
                </p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={isSending && idx === messages.length - 1 && msg.role === "assistant"}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3">
            <div className="flex gap-2 items-end rounded-xl border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 focus-within:border-primary-400 dark:focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-400/30 transition-all">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isCreatingSession
                    ? "Agent 初始化中，请稍候…"
                    : isSending
                      ? "后台任务执行中，可离开页面后稍后回来查看…"
                      : "告诉 Agent 你的想法… (Enter 发送，Shift+Enter 换行)"
                }
                disabled={!sessionId || isSending || isCreatingSession}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none min-h-[24px] max-h-[120px] overflow-y-auto"
                style={{ fieldSizing: "content" } as React.CSSProperties}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || !sessionId || isSending || isCreatingSession}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-center text-xs text-neutral-400">
              Agent 会自动把创作放到后台任务中执行，并持续保存到数据库；离开页面后也可稍后回来查看
            </p>
          </div>
        </div>

        {/* Novel preview sidebar */}
        {showSidebar && (
          <div className="w-64 shrink-0 border-l border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden flex flex-col">
            <div className="border-b border-neutral-200 dark:border-neutral-700 px-3 py-2">
              <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                小说预览
              </p>
            </div>
            <div className="flex-1 overflow-hidden">
              <NovelPreview
                project={project}
                onOpenWorkspace={handleOpenWorkspace}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
