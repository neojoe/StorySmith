/**
 * Novel Workspace
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ ← Back   [Title]   Genre Badge   Model          [✓ saved]          │
 *   ├─────────────────────┬───────────────────────────────────────────────┤
 *   │  Left: Settings     │  Right: Tabs [大纲] [章节] [正文]             │
 *   │  - genre            │                                               │
 *   │  - model (dynamic   │  Tab content (streamed in real-time)          │
 *   │    from OpenAI API) │                                               │
 *   │  - characters       │                                               │
 *   │  - relationships    │   提示词 Tab:                                 │
 *   │  - plot             │   • AI 一键生成专属提示词 (SSE streaming)     │
 *   │  - style            │   • 类型模板库 modal                          │
 *   │                    │                                               │
 *   └─────────────────────┴───────────────────────────────────────────────┘
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AgentChatPanel } from "@/components/novel/agent-chat-panel";
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  PenLine,
  Play,
  RotateCcw,
  Save,
  SendHorizonal,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/shared/loading-spinner";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { useFeedback } from "@/hooks/use-feedback";
import { novelService } from "@/services/novel-service";
import { fetchSSE } from "@/utils/sse";
import { getLinkedAgentSessionId, linkProjectToAgentSession } from "@/utils/agent-session-link";
import {
  useCreateChapter,
  useCreateOrReuseProjectAgentSession,
  useDeleteChapter,
  useFinalizeProject,
  useLatestProjectAgentSession,
  useModels,
  useProject,
  useUpdateChapter,
  useUpdateProject,
  novelKeys,
} from "@/hooks/use-novel";
import { NOVEL_GENRES, GENRE_NAME_MAP } from "@/constants/novel-genres";
import type { Chapter, GenerationMode, NovelProjectDetail } from "@/types/novel";

// ── Constants ──────────────────────────────────────────────────────────────────

const TABS = ["大纲", "章节", "正文"] as const;
type Tab = (typeof TABS)[number];

function getStoredManualMode(pid: string): GenerationMode | null {
  try {
    const value = localStorage.getItem(`novel:manual-mode:${pid}`);
    return value === "full_book" || value === "guided_first_chapter" ? value : null;
  } catch {
    return null;
  }
}

function setStoredManualMode(pid: string, mode: GenerationMode) {
  try {
    localStorage.setItem(`novel:manual-mode:${pid}`, mode);
  } catch {
    // Ignore storage errors.
  }
}

function describeManualMode(mode: GenerationMode) {
  return mode === "full_book" ? "一次性生成全书" : "框架 + 第一章";
}

// Fallback model list shown while the API is loading / if it fails
const FALLBACK_MODELS = ["gpt-5-nano", "gpt-4.1", "gpt-4o", "gpt-4o-mini"];

function joinAgentPrompt(lines: Array<string | undefined | false>) {
  return lines.filter(Boolean).join("\n");
}

function buildOutlinePrompt(extra?: string) {
  return joinAgentPrompt([
    "请基于当前项目设定生成或完善本书大纲，并将结果保存到项目中。",
    "先检查人物设定、角色关系、核心剧情和写作风格是否完整，不足时可先补全。",
    extra?.trim() ? `额外要求：${extra.trim()}` : "",
  ]);
}

type ChapterPlanMode = "replace_all" | "replace_future";

function buildChaptersPrompt(
  chapterCount: number,
  extra?: string,
  mode: ChapterPlanMode = "replace_all",
  preservedChapterCount = 0,
) {
  if (mode === "replace_future") {
    const nextOrder = preservedChapterCount + 1;
    const remainingCount = Math.max(1, chapterCount - preservedChapterCount);
    return joinAgentPrompt([
      "请基于当前项目设定、已保存大纲和已写章节，重新规划后续章节并保存。",
      `保留前 ${preservedChapterCount} 章及其正文不变。`,
      `仅规划从第 ${nextOrder} 章开始的后续 ${remainingCount} 章。`,
      "新章节标题和章节概要要彼此衔接，节奏上保留成长线与钩子。",
      "不要重复追加旧章节，不要改动已写章节的正文。",
      `保存时请调用 save_chapters(chapters_json, mode="replace_future", start_order=${nextOrder})。`,
      extra?.trim() ? `额外要求：${extra.trim()}` : "",
    ]);
  }

  return joinAgentPrompt([
    "请基于当前项目设定和已保存大纲，规划本书章节列表并保存。",
    `目标章节数：${chapterCount}章。`,
    "如果当前已有章节规划，本次应直接覆盖旧的章节列表，不要重复追加。",
    "章节标题和章节概要要彼此衔接，节奏上保留成长线与钩子。",
    '保存时请调用 save_chapters(chapters_json, mode="replace_all")。',
    extra?.trim() ? `额外要求：${extra.trim()}` : "",
  ]);
}

function buildChapterContentPrompt(chapter: Chapter, minWords: number, extra?: string) {
  return joinAgentPrompt([
    `请写第 ${chapter.order_num} 章《${chapter.title}》的正文，并保存到项目中。`,
    `本章最低字数：${minWords}字。`,
    "请严格承接前文设定、上一章状态和本章概要，只生成当前这一章，不要继续下一章正文。",
    "正文必须全篇只使用简体中文叙事，不允许夹杂英文单词、英文短语、英文拟声、英文修辞标签或其它外语。",
    "像 `inked`、`Chapter`、`hook`、`arc`、`foreshadowing` 这类英文内容一律不要出现；如果想到英文表达，必须当场改写成自然中文。",
    "若需要氛围描写、动作描写、心理描写、比喻或意象，也必须全部写成中文，不能出现中英混写句子。",
    extra?.trim() ? `额外要求：${extra.trim()}` : "",
  ]);
}

function buildSingleChapterOutlinePrompt(chapter: Chapter, extra?: string) {
  return joinAgentPrompt([
    `请生成或完善第 ${chapter.order_num} 章的章节大纲，并只更新这一章。`,
    `当前标题：${chapter.title || "（待定）"}`,
    `当前大纲：${chapter.outline?.trim() || "（暂无）"}`,
    "先调用 read_project_context；如有必要，再调用 read_chapter_bundle 检查前后章节衔接。",
    "只处理当前这一章，不要重排整本章节列表，也不要修改其他章节。",
    `完成后请调用 save_chapter_outline(chapter_order=${chapter.order_num}, title='更新后的标题', outline='更新后的章节大纲')。`,
    extra?.trim() ? `额外要求：${extra.trim()}` : "",
  ]);
}

function buildContinueRemainingPrompt(minWords: number, extra?: string) {
  return joinAgentPrompt([
    "请根据当前项目进度，继续生成后续尚未完成的章节正文，并在每章完成后保存。",
    `每章最低字数：${minWords}字。`,
    "请按章节顺序推进，保持剧情连续；如果遇到信息缺口，先基于现有设定补足再继续写。",
    extra?.trim() ? `额外要求：${extra.trim()}` : "",
  ]);
}

function describeChapter(chapter?: Chapter) {
  if (!chapter) return "当前未选中章节";
  return `第 ${chapter.order_num} 章《${chapter.title}》`;
}

function buildGlobalConsistencyPrompt() {
  return joinAgentPrompt([
    "请执行一次全书一致性检查。",
    "先调用 read_project_context；如有必要，再调用 read_chapter_bundle 或 read_chapter_content 补充核查。",
    "重点检查：人设、角色关系、全局大纲、章节规划、已生成正文、时间线、称谓、状态变化是否一致。",
    "请先输出结构化问题清单：严重 / 中等 / 轻微，并标明涉及章节、冲突点、建议修复方式。",
    "未经我进一步确认，不要直接覆盖正文；如只有轻微结构问题，可在说明后再决定是否更新章节规划或记忆。",
  ]);
}

function buildChapterContinuityPrompt(chapter?: Chapter) {
  return joinAgentPrompt([
    `请重点检查 ${describeChapter(chapter)} 与上一章之间的连续性。`,
    "先调用 read_project_context，再调用 read_chapter_bundle 检查上一章与当前章；必要时补充调用 read_chapter_content。",
    "重点检查：时间线是否跳跃、场景是否突变、人物情绪/伤势/关系/目标是否衔接、上一章钩子在本章是否有承接。",
    "请先只输出问题清单和修复建议，不要直接改正文。",
  ]);
}

function buildChapterOutlineConsistencyPrompt(chapter?: Chapter) {
  return joinAgentPrompt([
    `请检查 ${describeChapter(chapter)} 的正文是否偏离本章大纲。`,
    "先调用 read_project_context，再调用 read_chapter_content 阅读当前章正文。",
    "重点检查：本章是否完成了章节概要里的关键事件、人物推进、冲突节点和章末钩子；是否出现无关支线或设定偏移。",
    "请输出：符合点、偏离点、建议修复方式。未经确认，不要直接覆盖正文。",
  ]);
}

// ── Settings panel ─────────────────────────────────────────────────────────────

interface SettingsPanelProps {
  project: NovelProjectDetail;
  onSaved: () => void;
  agentMode?: boolean;
  manualGenerationMode?: GenerationMode;
  isCustomGenerating?: boolean;
  onStartCustomGeneration?: (mode: GenerationMode) => Promise<void>;
}

function SettingsPanel({
  project,
  onSaved,
  agentMode = false,
  manualGenerationMode = "guided_first_chapter",
  isCustomGenerating = false,
  onStartCustomGeneration,
}: SettingsPanelProps) {
  const qc = useQueryClient();
  const { mutate: update, isPending } = useUpdateProject(project.id);
  const { data: modelList, isLoading: modelsLoading } = useModels();
  const feedback = useFeedback();

  // "manual" | "ai"
  const [settingsMode, setSettingsMode] = useState<"manual" | "ai">("manual");
  const [concept, setConcept] = useState("");
  const [isGeneratingSettings, setIsGeneratingSettings] = useState(false);
  const [settingsStreamText, setSettingsStreamText] = useState("");
  const abortSettingsRef = useRef<AbortController | null>(null);

  const [form, setForm] = useState({
    title: project.title,
    genre: project.genre,
    background: project.background,
    characters: project.characters,
    relationships: project.relationships,
    plot: project.plot,
    style: project.style,
    knowledge_base: project.knowledge_base,
    target_chapter_count: project.target_chapter_count,
    min_chapter_word_count: project.min_chapter_word_count,
    model: project.model,
    temperature: project.temperature,
  });

  // Sync if project reloads
  useEffect(() => {
    setForm({
      title: project.title,
      genre: project.genre,
      background: project.background,
      characters: project.characters,
      relationships: project.relationships,
      plot: project.plot,
      style: project.style,
      knowledge_base: project.knowledge_base,
      target_chapter_count: project.target_chapter_count,
      min_chapter_word_count: project.min_chapter_word_count,
      model: project.model,
      temperature: project.temperature,
    });
  }, [project.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // When model list loads, ensure form.model is a valid option;
  // if not (e.g. old project with a deprecated model), prefer gpt-5-nano
  // or fall back to the first available model.
  useEffect(() => {
    if (!modelList?.length) return;
    const ids = modelList.map((m) => m.id);
    if (ids.includes(form.model)) return;
    const preferred = ids.includes("gpt-5-nano") ? "gpt-5-nano" : ids[0];
    setForm((f) => ({ ...f, model: preferred }));
  }, [modelList]);  // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const setNumber = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = Number(e.target.value);
    setForm((f) => ({ ...f, [key]: Number.isFinite(value) ? value : 0 }));
  };

  const handleSave = () => {
    update(form, { onSuccess: onSaved });
  };

  const handleSaveAndStart = async () => {
    const hasExistingContent = project.chapters.some((chapter) => chapter.content.trim());
    const hasExistingPlan = project.outline.trim() || project.chapters.length > 0;
    if ((hasExistingContent || hasExistingPlan) && onStartCustomGeneration) {
      const confirmed = await feedback.confirm({
        title: "确认重新生成",
        content: hasExistingContent
          ? "当前项目已存在大纲、章节或正文。继续后会按当前设定重新生成，并可能覆盖现有章节规划与已写内容。"
          : "当前项目已存在大纲或章节规划。继续后会按当前设定重新生成并覆盖现有规划。",
        okText: "确认继续",
        cancelText: "取消",
        danger: hasExistingContent,
      });
      if (!confirmed) return;
    }

    await new Promise<void>((resolve) => {
      update(form, {
        onSuccess: async () => {
          onSaved();
          if (onStartCustomGeneration) {
            await onStartCustomGeneration(manualGenerationMode);
          }
          resolve();
        },
        onError: () => resolve(),
      });
    });
  };

  const handleAIGenerateSettings = async () => {
    if (!concept.trim()) {
      feedback.warning("请先补充故事创意", "先输入 1-3 句故事想法，再让 AI 生成完整设定。");
      return;
    }
    if (concept.trim().length < 2) {
      feedback.warning("故事创意太短", "至少输入 2 个字，例如“重生复仇”或“高中逆袭”。");
      return;
    }
    abortSettingsRef.current = new AbortController();
    setIsGeneratingSettings(true);
    setSettingsStreamText("");

    await fetchSSE(
      novelService.generateSettingsUrl(project.id),
      { concept: concept.trim() },
      {
        onToken: (t) => setSettingsStreamText((prev) => prev + t),
        onDone: (data) => {
          setIsGeneratingSettings(false);
          const d = data as {
            background?: string; characters?: string;
            relationships?: string; plot?: string; style?: string;
          } | null;
          if (d) {
            setForm((f) => ({
              ...f,
              background: d.background || f.background,
              characters: d.characters || f.characters,
              relationships: d.relationships || f.relationships,
              plot: d.plot || f.plot,
              style: d.style || f.style,
            }));
          }
          setTimeout(() => {
            setSettingsStreamText("");
            setSettingsMode("manual"); // switch to manual to review/edit
          }, 600);
          qc.invalidateQueries({ queryKey: novelKeys.project(project.id) });
        },
        onError: (msg) => {
          setIsGeneratingSettings(false);
          feedback.error("故事设定生成失败", msg);
        },
      },
      abortSettingsRef.current.signal,
    );
  };

  const labelCls = "text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide";

  const modeTabCls = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors
    ${active
      ? "bg-white text-primary-700 shadow-sm dark:bg-neutral-700 dark:text-primary-400"
      : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
    }`;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <p className={labelCls}>基础设置</p>

      <Input label="标题" value={form.title} onChange={set("title")} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          小说类型
        </label>
        <select
          value={form.genre}
          onChange={set("genre")}
          className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm
            focus:outline-none focus:ring-2 focus:ring-primary-500
            dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
        >
          {NOVEL_GENRES.map((g) => (
            <option key={g.key} value={g.key}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {agentMode ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Agent 模型
          </label>
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            Agent 模式下使用服务端固定模型，左侧不单独配置。
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            模型
            {modelsLoading && (
              <span className="ml-1 text-xs font-normal text-neutral-400">加载中…</span>
            )}
          </label>
          <select
            value={form.model}
            onChange={set("model")}
            className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm
              focus:outline-none focus:ring-2 focus:ring-primary-500
              dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
          >
            {(modelList ?? FALLBACK_MODELS.map((id) => ({ id, created: 0 }))).map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="border-t border-neutral-200 pt-2 dark:border-neutral-700" />

      {!agentMode && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 p-3 text-xs text-primary-700 dark:border-primary-900 dark:bg-primary-950 dark:text-primary-300">
          <p className="font-medium">当前自定义模式：{describeManualMode(manualGenerationMode)}</p>
          <p className="mt-1 leading-5">
            {isCustomGenerating
              ? "当前任务正在后台执行，离开工作台后也会继续生成。"
              : manualGenerationMode === "full_book"
              ? "会自动生成大纲、章节规划，并按顺序写完整本书。"
              : "会先生成大纲、章节规划和第一章正文，后续章节继续在工作台里创作。"}
          </p>
        </div>
      )}

      {!agentMode && (
        <div className="sticky top-0 z-10 -mx-1 rounded-xl border border-neutral-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
          <div className="grid gap-2">
            <Button
              variant="outline"
              onClick={() => void handleSaveAndStart()}
              disabled={isPending || isCustomGenerating}
              className="gap-2"
            >
              {isCustomGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isCustomGenerating
                ? "后台生成中…"
                : manualGenerationMode === "full_book"
                  ? "开始生成全书"
                  : "生成框架和第一章"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="计划章节数"
          type="number"
          min={1}
          max={500}
          value={form.target_chapter_count}
          onChange={setNumber("target_chapter_count")}
          hint="用于章节列表规划，默认生成时会采用这个数量。"
        />
        <Input
          label="每章最低字数"
          type="number"
          min={200}
          max={20000}
          step={100}
          value={form.min_chapter_word_count}
          onChange={setNumber("min_chapter_word_count")}
          hint="正文不足这个字数时，后端会自动继续补写。"
        />
      </div>

      <div className="border-t border-neutral-200 pt-2 dark:border-neutral-700" />

      {/* ── 故事设定 section with mode tabs ── */}
      <div className="flex items-center justify-between">
        <p className={labelCls}>故事设定</p>
        {/* Mode toggle */}
        <div className="flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
          <button className={modeTabCls(settingsMode === "manual")} onClick={() => setSettingsMode("manual")}>
            <PenLine className="h-3 w-3" />
            手动
          </button>
          <button className={modeTabCls(settingsMode === "ai")} onClick={() => setSettingsMode("ai")}>
            <Sparkles className="h-3 w-3" />
            AI 生成
          </button>
        </div>
      </div>

      {/* AI mode — concept input */}
      {settingsMode === "ai" && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary-200 bg-gradient-to-b from-primary-50 to-white p-3
          dark:border-primary-800 dark:from-primary-950 dark:to-neutral-900">
          <p className="text-xs text-primary-700 dark:text-primary-300">
            <Sparkles className="mr-1 inline h-3 w-3" />
            用1-3句话描述你的故事想法，AI 会自动生成完整的世界观、人物、关系、剧情和风格设定。
          </p>
          <Textarea
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            rows={4}
            placeholder={`例如：\n一个普通打工人重生到10年前，利用前世记忆在商界逆袭，同时与青梅竹马重续情缘…`}
            disabled={isGeneratingSettings}
          />
          <div className="flex gap-2">
            {!isGeneratingSettings ? (
              <Button onClick={handleAIGenerateSettings} className="flex-1 gap-2">
                <Sparkles className="h-4 w-4" />
                AI 一键生成故事设定
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => { abortSettingsRef.current?.abort(); setIsGeneratingSettings(false); }}
                className="flex-1 gap-2"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                停止生成
              </Button>
            )}
          </div>

          {/* Streaming preview */}
          {isGeneratingSettings && settingsStreamText && (
            <div className="rounded-lg border border-primary-200 bg-white/80 p-2.5
              dark:border-primary-900 dark:bg-neutral-900/80">
              <p className="mb-1 text-[10px] font-medium text-primary-600 dark:text-primary-400">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                AI 正在生成故事设定…
              </p>
              <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-[10px]
                text-neutral-500 dark:text-neutral-400">
                {settingsStreamText}
              </pre>
            </div>
          )}

          {/* Fill indicator */}
          {!isGeneratingSettings && (form.background || form.characters) && (
            <p className="text-center text-[11px] text-success-600 dark:text-success-400">
              ✓ 设定已填入下方字段，可切换到「手动」标签查看和编辑
            </p>
          )}
        </div>
      )}

      {/* Story setting fields — always visible in manual mode; show as preview in AI mode */}
      <div className={settingsMode === "ai" ? "opacity-60 pointer-events-none" : ""}>
        <div className="flex flex-col gap-3">
          <Textarea
            label="世界观 / 背景"
            rows={3}
            placeholder="描述故事发生的时代、世界观、社会背景…"
            value={form.background}
            onChange={set("background")}
          />
          <Textarea
            label="人物设定"
            rows={3}
            placeholder="主角、配角的姓名、性格、身份…"
            value={form.characters}
            onChange={set("characters")}
          />
          <Textarea
            label="角色关系"
            rows={2}
            placeholder="各角色之间的关系网络…"
            value={form.relationships}
            onChange={set("relationships")}
          />
          <Textarea
            label="核心剧情"
            rows={3}
            placeholder="主线剧情的核心矛盾和走向…"
            value={form.plot}
            onChange={set("plot")}
          />
          <Textarea
            label="写作风格"
            rows={2}
            placeholder="语言风格、节奏偏好、情感基调…"
            value={form.style}
            onChange={set("style")}
          />
        </div>
      </div>
      {agentMode && (
        <Button onClick={handleSave} disabled={isPending} className="mt-2 gap-2">
          <Save className="h-4 w-4" />
          {isPending ? "保存中…" : "保存设定"}
        </Button>
      )}
    </div>
  );
}

// ── Outline Tab ────────────────────────────────────────────────────────────────

interface OutlineTabProps {
  project: NovelProjectDetail;
  agentMode?: boolean;
  agentSending?: boolean;
  interactionLocked?: boolean;
  onAgentGenerate?: (extra?: string) => Promise<void>;
}

function OutlineTab({
  project,
  agentMode = false,
  agentSending = false,
  interactionLocked = false,
  onAgentGenerate,
}: OutlineTabProps) {
  const qc = useQueryClient();
  const { mutate: updateOutline } = useUpdateProject(project.id);
  const feedback = useFeedback();
  const [text, setText] = useState(project.outline);
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentNote, setAgentNote] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const abortRef = useRef<AbortController | null>(null);
  const lastSavedTextRef = useRef(project.outline);

  // Sync if project reloads from server
  useEffect(() => {
    setText(project.outline);
    lastSavedTextRef.current = project.outline;
  }, [project.id, project.outline]);

  const handleGenerate = useCallback(async () => {
    if (agentMode) {
      await onAgentGenerate?.(agentNote);
      return;
    }
    abortRef.current = new AbortController();
    setIsGenerating(true);
    setText("");

    await fetchSSE(
      novelService.outlineGenerateUrl(project.id),
      { custom_prompt: null },
      {
        onToken: (t) => setText((prev) => prev + t),
        onDone: () => {
          setIsGenerating(false);
          qc.invalidateQueries({ queryKey: novelKeys.project(project.id) });
        },
        onError: (msg) => {
          setIsGenerating(false);
          feedback.error("大纲生成失败", msg);
        },
      },
      abortRef.current.signal,
    );
  }, [agentMode, agentNote, feedback, onAgentGenerate, project.id, qc]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsGenerating(false);
  };

  useEffect(() => {
    if (agentMode || isGenerating || interactionLocked) return;
    if (text === lastSavedTextRef.current) return;

    setSaveState("saving");
    const nextText = text;
    const timer = window.setTimeout(() => {
      updateOutline(
        { outline: nextText },
        {
          onSuccess: () => {
            lastSavedTextRef.current = nextText;
            setSaveState("saved");
            window.setTimeout(() => setSaveState("idle"), 1200);
          },
          onError: (err) => {
            setSaveState("idle");
            const message = err instanceof Error ? err.message : "大纲自动保存失败，请重试。";
            feedback.error("大纲自动保存失败", message);
          },
        },
      );
    }, 800);

    return () => window.clearTimeout(timer);
  }, [agentMode, feedback, interactionLocked, isGenerating, text, updateOutline]);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {!isGenerating && !agentSending ? (
          <Button
            onClick={handleGenerate}
            disabled={interactionLocked}
            className="gap-2 whitespace-nowrap px-3 text-[clamp(12px,0.95vw,14px)] leading-none"
          >
            <Sparkles className="h-4 w-4" />
            {agentMode ? "Agent 生成大纲" : "生成大纲"}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={handleStop}
            className="gap-2 whitespace-nowrap px-3 text-[clamp(12px,0.95vw,14px)] leading-none"
            disabled={agentMode}
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {agentMode ? "Agent 处理中…" : "停止生成"}
          </Button>
        )}
        {text && !isGenerating && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setText("")}
            disabled={interactionLocked}
            className="ml-auto gap-1 whitespace-nowrap px-3 text-[clamp(12px,0.9vw,13px)] leading-none text-neutral-400"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            清空
          </Button>
        )}
      </div>

      <p className="text-xs text-neutral-400">
        {agentMode
          ? "Agent 模式下会通过右侧对话面板流式生成，并在完成后自动同步到项目。"
          : isGenerating
            ? "AI 正在生成大纲，请稍候…"
            : interactionLocked
              ? "当前正在按既定模式自动生成内容，相关操作已临时锁定。"
            : saveState === "saving"
              ? "编辑后会自动保存…"
              : saveState === "saved"
                ? "已自动保存"
                : "生成完成后可直接编辑，修改会自动保存。"}
      </p>

      {agentMode && (
        <Input
          label="补充要求（可选）"
          value={agentNote}
          onChange={(e) => setAgentNote(e.target.value)}
          placeholder="例如：强调主线悬念、世界观再展开一些"
          disabled={agentSending}
        />
      )}

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={28}
        placeholder="点击「生成大纲」开始，或直接在此手动撰写大纲…"
        className="w-full font-mono text-sm leading-relaxed"
        disabled={isGenerating || interactionLocked}
      />

      <div className="text-right text-xs text-neutral-400">
        {text.length} 字
      </div>
    </div>
  );
}

// ── Chapters Tab ───────────────────────────────────────────────────────────────

interface ChaptersTabProps {
  project: NovelProjectDetail;
  onSelectChapter: (ch: Chapter) => void;
  agentMode?: boolean;
  manualGenerationMode?: GenerationMode;
  agentSending?: boolean;
  interactionLocked?: boolean;
  onAgentGenerateChapters?: (chapterCount: number, extra?: string) => Promise<void>;
  onAgentContinueRemaining?: (extra?: string) => Promise<void>;
  onAgentGenerateChapterOutline?: (chapter: Chapter, extra?: string) => Promise<void>;
}

function ChaptersTab({
  project,
  onSelectChapter,
  agentMode = false,
  manualGenerationMode = "guided_first_chapter",
  agentSending = false,
  interactionLocked = false,
  onAgentGenerateChapters,
  onAgentContinueRemaining,
  onAgentGenerateChapterOutline,
}: ChaptersTabProps) {
  const qc = useQueryClient();
  const { mutate: createChapter, isPending: isCreatingChapter } = useCreateChapter(project.id);
  const { mutate: deleteChapter } = useDeleteChapter(project.id);
  const { mutate: updateChapter } = useUpdateChapter(project.id);
  const feedback = useFeedback();

  // Chapter-list generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [chapterCount, setChapterCount] = useState(project.target_chapter_count || 10);
  const abortRef = useRef<AbortController | null>(null);

  // Batch content generation state
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, title: "" });
  const batchAbortRef = useRef<AbortController | null>(null);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [agentPlanNote, setAgentPlanNote] = useState("");
  const [agentWritingNote, setAgentWritingNote] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [newChapterOutline, setNewChapterOutline] = useState("");
  const [insertAfterOrder, setInsertAfterOrder] = useState(
    project.chapters.length > 0 ? project.chapters[project.chapters.length - 1].order_num : 0,
  );

  const runSilentSSE = useCallback((url: string, body: Record<string, unknown>, signal?: AbortSignal) => (
    new Promise<void>((resolve, reject) => {
      void fetchSSE(
        url,
        body,
        {
          onToken: () => {},
          onDone: () => resolve(),
          onError: (msg) => reject(new Error(msg || "生成失败")),
        },
        signal,
      );
    })
  ), []);

  useEffect(() => {
    setChapterCount(project.target_chapter_count || 10);
  }, [project.id, project.target_chapter_count]);

  useEffect(() => {
    if (!showAddForm) {
      setInsertAfterOrder(
        project.chapters.length > 0 ? project.chapters[project.chapters.length - 1].order_num : 0,
      );
    }
  }, [project.chapters, showAddForm]);

  const handleAddChapter = useCallback(() => {
    const title = newChapterTitle.trim() || `第 ${insertAfterOrder + 1} 章`;
    createChapter(
      {
        title,
        order_num: insertAfterOrder + 1,
        outline: newChapterOutline.trim(),
      },
      {
        onSuccess: (chapter) => {
          feedback.success("章节已新增", `已插入第 ${chapter.order_num} 章《${chapter.title}》。`);
          setShowAddForm(false);
          setNewChapterTitle("");
          setNewChapterOutline("");
          setInsertAfterOrder(chapter.order_num);
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : "新增章节失败，请重试。";
          feedback.error("新增章节失败", message);
        },
      },
    );
  }, [createChapter, feedback, insertAfterOrder, newChapterOutline, newChapterTitle]);

  const handleGenerate = useCallback(async () => {
    if (agentMode) {
      await onAgentGenerateChapters?.(chapterCount, agentPlanNote);
      return;
    }
    if (!project.outline) {
      feedback.info("请先生成大纲", "章节规划依赖故事大纲，先在「大纲」标签完成大纲生成。");
      return;
    }
    abortRef.current = new AbortController();
    setIsGenerating(true);
    setStreamText("");

    let chapterGenerationError: string | null = null;
    await fetchSSE(
      novelService.chaptersGenerateUrl(project.id),
      { chapter_count: chapterCount, custom_prompt: null },
      {
        onToken: (t) => setStreamText((prev) => prev + t),
        onDone: () => {},
        onError: (msg) => {
          chapterGenerationError = msg;
        },
      },
      abortRef.current.signal,
    );

    if (chapterGenerationError) {
      setIsGenerating(false);
      feedback.error("章节规划生成失败", chapterGenerationError);
      return;
    }

    try {
      if (manualGenerationMode === "guided_first_chapter") {
        const latestProject = await novelService.getProject(project.id);
        const hasAnyContent = latestProject.chapters.some((chapter) => chapter.content.trim());
        const firstChapter = latestProject.chapters[0];
        if (!hasAnyContent && firstChapter) {
          await runSilentSSE(
            novelService.contentGenerateUrl(latestProject.id, firstChapter.id),
            { custom_prompt: null, min_word_count: latestProject.min_chapter_word_count },
            abortRef.current.signal,
          );
          onSelectChapter(firstChapter);
          feedback.success("章节规划完成", "已按“框架 + 第一章”模式自动生成第一章正文。");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "第一章正文生成失败，请重试。";
      feedback.error("第一章正文生成失败", message);
    } finally {
      setIsGenerating(false);
      setStreamText("");
      qc.invalidateQueries({ queryKey: novelKeys.project(project.id) });
    }
  }, [
    agentMode,
    agentPlanNote,
    chapterCount,
    feedback,
    manualGenerationMode,
    onAgentGenerateChapters,
    onSelectChapter,
    project.id,
    project.outline,
    qc,
    runSilentSSE,
  ]);

  // Batch: generate content for all chapters that don't have content yet
  const handleBatchGenerate = useCallback(async () => {
    if (agentMode) {
      await onAgentContinueRemaining?.(agentWritingNote);
      return;
    }
    const pending = project.chapters.filter((ch) => !ch.content);
    if (pending.length === 0) {
      feedback.info("当前没有未完成正文", "所有章节都已有正文了；如需重写，请到「正文」标签单独处理。");
      return;
    }

    const ctrl = new AbortController();
    batchAbortRef.current = ctrl;
    setIsBatchGenerating(true);
    setBatchErrors([]);
    setBatchProgress({ current: 0, total: pending.length, title: "" });

    for (let i = 0; i < pending.length; i++) {
      if (ctrl.signal.aborted) break;
      const ch = pending[i];
      setBatchProgress({ current: i + 1, total: pending.length, title: ch.title });

      await new Promise<void>((resolve) => {
        // Resolve on abort so the loop can exit cleanly
        ctrl.signal.addEventListener("abort", () => resolve(), { once: true });

        fetchSSE(
          novelService.contentGenerateUrl(project.id, ch.id),
          { custom_prompt: null, min_word_count: project.min_chapter_word_count },
          {
            onToken: () => {},   // discard streaming tokens in batch mode
            onDone: () => {
              qc.invalidateQueries({ queryKey: novelKeys.project(project.id) });
              resolve();
            },
            onError: (msg) => {
              setBatchErrors((prev) => [...prev, `第 ${ch.order_num} 章「${ch.title}」: ${msg}`]);
              resolve();           // skip failed chapter and continue
            },
          },
          ctrl.signal,
        );
      });

      // Brief pause between requests to avoid rate-limiting
      if (i < pending.length - 1 && !ctrl.signal.aborted) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    setIsBatchGenerating(false);
    setBatchProgress({ current: 0, total: 0, title: "" });
  }, [agentMode, agentWritingNote, feedback, onAgentContinueRemaining, project.chapters, project.id, project.min_chapter_word_count, qc]);

  const pendingCount = project.chapters.filter((ch) => !ch.content).length;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar row 1: chapter-list generation */}
      <div className="flex flex-wrap items-center gap-2">
        {!isGenerating ? (
          <Button
            onClick={handleGenerate}
            disabled={isBatchGenerating || agentSending || interactionLocked}
            className="gap-2 whitespace-nowrap px-3 text-[clamp(12px,0.95vw,14px)] leading-none"
          >
            <Sparkles className="h-4 w-4" />
            {agentMode
              ? (project.chapters.length > 0 ? "重新规划章节" : "生成章节规划")
              : manualGenerationMode === "guided_first_chapter" && !project.chapters.some((chapter) => chapter.content.trim())
                ? "生成章节规划 + 第一章"
                : "生成章节规划"}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => { abortRef.current?.abort(); setIsGenerating(false); }}
            className="gap-2 whitespace-nowrap px-3 text-[clamp(12px,0.95vw,14px)] leading-none"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            停止
          </Button>
        )}
        <div className="flex items-center gap-1">
          <span className="text-sm text-neutral-500">章节数：</span>
          <input
            type="number"
            min={1}
            max={500}
            value={chapterCount}
            onChange={(e) => setChapterCount(Number(e.target.value))}
            disabled={interactionLocked}
            className="h-8 w-16 rounded border border-neutral-300 px-2 text-sm
              dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setShowAddForm((prev) => !prev)}
          disabled={isGenerating || isBatchGenerating || agentSending || interactionLocked}
          className="gap-2 whitespace-nowrap px-3 text-[clamp(12px,0.95vw,14px)] leading-none"
        >
          <Plus className="h-4 w-4" />
          {showAddForm ? "收起新增" : "新增章节"}
        </Button>
        <span className="ml-auto text-xs text-neutral-400">
          计划 {project.target_chapter_count} 章，当前共 {project.chapters.length} 章
        </span>
      </div>

      <p className="text-xs text-neutral-400">
        {agentMode
          ? "Agent 模式下，章节规划和续写会走右侧同一会话，确保设定和节奏连续。"
          : interactionLocked
            ? "当前正在按既定模式自动生成内容，章节相关操作已临时锁定。"
          : manualGenerationMode === "guided_first_chapter"
            ? "当前是“框架 + 第一章”模式：生成章节规划后，如果还没有正文，会自动补上第一章内容。"
            : `章节列表默认按项目的“计划章节数”生成；正文批量生成会按顺序逐章写作，并使用每章至少 ${project.min_chapter_word_count} 字的约束。`}
      </p>

      {showAddForm && (
        <div className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/40">
          <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <Input
              label="章节标题"
              value={newChapterTitle}
              onChange={(e) => setNewChapterTitle(e.target.value)}
              placeholder="例如：风暴前夜"
              disabled={isCreatingChapter || interactionLocked}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                插入位置
              </label>
              <select
                value={insertAfterOrder}
                onChange={(e) => setInsertAfterOrder(Number(e.target.value))}
                disabled={isCreatingChapter || interactionLocked}
                className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              >
                <option value={0}>插入到最前面</option>
                {project.chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.order_num}>
                    插入到第 {chapter.order_num} 章《{chapter.title}》后
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Textarea
            label="初始章节大纲（可选）"
            value={newChapterOutline}
            onChange={(e) => setNewChapterOutline(e.target.value)}
            rows={3}
            placeholder="可以先留空，新增后再手动编辑，或交给 Agent 生成本章大纲。"
            disabled={isCreatingChapter || interactionLocked}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddForm(false);
                setNewChapterTitle("");
                setNewChapterOutline("");
                setInsertAfterOrder(
                  project.chapters.length > 0 ? project.chapters[project.chapters.length - 1].order_num : 0,
                );
              }}
              disabled={isCreatingChapter || interactionLocked}
            >
              取消
            </Button>
            <Button onClick={handleAddChapter} disabled={isCreatingChapter || interactionLocked} className="gap-2">
              {isCreatingChapter ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isCreatingChapter ? "新增中…" : "确认新增"}
            </Button>
          </div>
        </div>
      )}

      {agentMode && (
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="本次章节规划要求（可选）"
            value={agentPlanNote}
            onChange={(e) => setAgentPlanNote(e.target.value)}
            placeholder="例如：前10章多埋伏笔"
            disabled={agentSending}
          />
          <Input
            label="本次批量续写要求（可选）"
            value={agentWritingNote}
            onChange={(e) => setAgentWritingNote(e.target.value)}
            placeholder="例如：加快冲突升级"
            disabled={agentSending}
          />
        </div>
      )}

      {/* Toolbar row 2: batch content generation */}
      {project.chapters.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-neutral-50 px-3 py-2
          dark:bg-neutral-800/50">
          {!isBatchGenerating ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBatchGenerate}
                disabled={isGenerating || pendingCount === 0 || agentSending || interactionLocked}
                className="gap-1.5 whitespace-nowrap border-primary-300 px-3 text-[clamp(12px,0.95vw,14px)] text-primary-700 hover:bg-primary-50
                  dark:border-primary-700 dark:text-primary-400 dark:hover:bg-primary-950"
              >
                <Zap className="h-3.5 w-3.5" />
                {agentMode ? "继续生成未完成正文" : "一键生成未写正文"}
              </Button>
              <span className="text-xs text-neutral-400">
                {pendingCount > 0
                  ? `待生成 ${pendingCount} / ${project.chapters.length} 章`
                  : "所有章节均已生成正文 ✓"}
              </span>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => batchAbortRef.current?.abort()}
                className="gap-1.5 whitespace-nowrap px-3 text-[clamp(12px,0.95vw,14px)]"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                停止生成
              </Button>
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-600 dark:text-neutral-300 truncate max-w-[200px]">
                    第 {batchProgress.current}/{batchProgress.total} 章：{batchProgress.title}
                  </span>
                  <span className="text-neutral-400 shrink-0 ml-2">
                    {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <div
                    className="h-full rounded-full bg-primary-500 transition-all duration-300"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Batch errors */}
      {batchErrors.length > 0 && !isBatchGenerating && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs
          text-danger-700 dark:border-danger-800 dark:bg-danger-950/30 dark:text-danger-400">
          <p className="mb-1 font-medium">以下章节生成失败，可在「正文」标签单独重试：</p>
          {batchErrors.map((e, i) => <p key={i}>• {e}</p>)}
        </div>
      )}

      {/* Streaming preview (chapter-list generation) */}
      {isGenerating && streamText && (
        <div className="rounded-lg border border-primary-200 bg-primary-50 p-3 text-xs
          font-mono text-neutral-700 dark:border-primary-900 dark:bg-primary-950 dark:text-neutral-300">
          <p className="mb-1 text-primary-600 dark:text-primary-400">AI 正在生成章节规划…</p>
          <pre className="whitespace-pre-wrap">{streamText}</pre>
        </div>
      )}

      {/* Chapter list */}
      {!isGenerating && project.chapters.length === 0 && (
        <p className="text-center text-sm text-neutral-400 py-8">
          还没有章节 — 先生成大纲，再点「生成章节规划」
        </p>
      )}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {project.chapters.map((ch) => (
          <ChapterRow
            key={ch.id}
            chapter={ch}
            isBatchActive={isBatchGenerating && batchProgress.title === ch.title}
            agentMode={agentMode}
            agentSending={agentSending}
            interactionLocked={interactionLocked}
            onEdit={(cid, title, outline) => updateChapter({ cid, body: { title, outline } })}
            onDelete={(cid) => deleteChapter(cid)}
            onGenerateContent={() => onSelectChapter(ch)}
            onAgentGenerateOutline={onAgentGenerateChapterOutline}
          />
        ))}
      </div>
    </div>
  );
}

interface ChapterRowProps {
  chapter: Chapter;
  isBatchActive?: boolean;
  agentMode?: boolean;
  agentSending?: boolean;
  interactionLocked?: boolean;
  onEdit: (cid: string, title: string, outline: string) => void;
  onDelete: (cid: string) => void;
  onGenerateContent: () => void;
  onAgentGenerateOutline?: (chapter: Chapter, extra?: string) => Promise<void>;
}

function ChapterRow({
  chapter,
  isBatchActive,
  agentMode = false,
  agentSending = false,
  interactionLocked = false,
  onEdit,
  onDelete,
  onGenerateContent,
  onAgentGenerateOutline,
}: ChapterRowProps) {
  const feedback = useFeedback();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(chapter.title);
  const [outline, setOutline] = useState(chapter.outline);
  const [outlineNote, setOutlineNote] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const lastSavedRef = useRef(`${chapter.title}\n@@\n${chapter.outline}`);

  useEffect(() => {
    setTitle(chapter.title);
    setOutline(chapter.outline);
    setOutlineNote("");
    lastSavedRef.current = `${chapter.title}\n@@\n${chapter.outline}`;
  }, [chapter.outline, chapter.title]);

  useEffect(() => {
    if (agentMode || interactionLocked) return;
    const nextValue = `${title}\n@@\n${outline}`;
    if (nextValue === lastSavedRef.current) return;

    setSaveState("saving");
    const timer = window.setTimeout(() => {
      onEdit(chapter.id, title, outline);
      lastSavedRef.current = nextValue;
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1200);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [agentMode, chapter.id, interactionLocked, onEdit, outline, title]);

  return (
    <Card className="group">
      <CardContent className="py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex flex-1 items-center gap-2 text-left"
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
            <span className="flex-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
              第 {chapter.order_num} 章 &nbsp;{chapter.title}
            </span>
            {isBatchActive && (
              <Badge variant="default" className="gap-1 text-xs animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />
                生成中…
              </Badge>
            )}
            {!isBatchActive && chapter.content && (
              <Badge variant="success" className="text-xs">
                已有正文 {chapter.word_count}字
              </Badge>
            )}
          </button>

          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button size="sm" variant="outline" onClick={onGenerateContent} disabled={interactionLocked} className="h-7 gap-1 text-xs">
              <Play className="h-3 w-3" />
              生成正文
            </Button>
            <button
              onClick={async () => {
                const confirmed = await feedback.confirm({
                  title: "删除章节",
                  content: `确定删除第 ${chapter.order_num} 章「${chapter.title}」吗？`,
                  okText: "确认删除",
                  danger: true,
                });
                if (confirmed) onDelete(chapter.id);
              }}
              disabled={interactionLocked}
              className="rounded p-1 text-neutral-400 hover:text-danger-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-2 flex flex-col gap-2 pl-6">
            <Input
              label="章节标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：风暴前夜"
              disabled={interactionLocked}
            />
            <Textarea
              label="章节大纲"
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              rows={3}
              placeholder="章节概要…"
              className="text-xs"
              disabled={interactionLocked}
            />
            {agentMode && (
              <Input
                label="本章大纲补充（可选）"
                value={outlineNote}
                onChange={(e) => setOutlineNote(e.target.value)}
                placeholder="例如：强化与上一章的情绪衔接"
                disabled={agentSending}
              />
            )}
            <div className="flex justify-end">
              {agentMode && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void onAgentGenerateOutline?.({ ...chapter, title, outline }, outlineNote)}
                  disabled={agentSending || interactionLocked}
                  className="mr-2 h-7 gap-1 text-xs"
                >
                  <Sparkles className="h-3 w-3" />
                  Agent 生成本章大纲
                </Button>
              )}
              {!agentMode && (
                <span className="text-xs text-neutral-400">
                  {saveState === "saving" ? "自动保存中…" : saveState === "saved" ? "已自动保存" : "修改后自动保存"}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Content Tab ────────────────────────────────────────────────────────────────

interface ContentTabProps {
  project: NovelProjectDetail;
  initialChapter?: Chapter;
  agentMode?: boolean;
  agentSending?: boolean;
  interactionLocked?: boolean;
  onAgentGenerateChapter?: (chapter: Chapter, extra?: string) => Promise<void>;
  onSelectedChapterChange?: (chapter?: Chapter) => void;
}

function ContentTab({
  project,
  initialChapter,
  agentMode = false,
  agentSending = false,
  interactionLocked = false,
  onAgentGenerateChapter,
  onSelectedChapterChange,
}: ContentTabProps) {
  const qc = useQueryClient();
  const { mutate: updateChapter } = useUpdateChapter(project.id);
  const feedback = useFeedback();

  const [selectedId, setSelectedId] = useState<string>(
    initialChapter?.id ?? project.chapters[0]?.id ?? "",
  );
  const [text, setText] = useState<string>(() => {
    const ch = project.chapters.find((c) => c.id === (initialChapter?.id ?? project.chapters[0]?.id));
    return ch?.content ?? "";
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentNote, setAgentNote] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const abortRef = useRef<AbortController | null>(null);
  const lastSavedContentRef = useRef(text);

  const selectedChapter = project.chapters.find((c) => c.id === selectedId);

  useEffect(() => {
    onSelectedChapterChange?.(selectedChapter);
  }, [onSelectedChapterChange, selectedChapter]);

  // When selectedId changes, load the chapter's content
  useEffect(() => {
    const ch = project.chapters.find((c) => c.id === selectedId);
    setText(ch?.content ?? "");
    lastSavedContentRef.current = ch?.content ?? "";
  }, [selectedId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from server when content changes externally (cleanup, agent save, etc.)
  // Skips if user has unsaved local edits to avoid overwriting them.
  useEffect(() => {
    if (isGenerating) return;
    const serverContent = selectedChapter?.content ?? "";
    if (serverContent === lastSavedContentRef.current) return;
    if (text !== lastSavedContentRef.current) return;
    setText(serverContent);
    lastSavedContentRef.current = serverContent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChapter?.content]);

  useEffect(() => {
    if (!selectedChapter) return;
    if (agentMode || isGenerating || interactionLocked) return;
    if (text === lastSavedContentRef.current) return;

    setSaveState("saving");
    const nextText = text;
    const timer = window.setTimeout(() => {
      updateChapter(
        { cid: selectedChapter.id, body: { content: nextText } },
        {
          onSuccess: () => {
            lastSavedContentRef.current = nextText;
            setSaveState("saved");
            window.setTimeout(() => setSaveState("idle"), 1200);
          },
          onError: (err) => {
            setSaveState("idle");
            const message = err instanceof Error ? err.message : "正文自动保存失败，请重试。";
            feedback.error("正文自动保存失败", message);
          },
        },
      );
    }, 800);

    return () => window.clearTimeout(timer);
  }, [agentMode, feedback, interactionLocked, isGenerating, selectedChapter, text, updateChapter]);

  const handleGenerate = useCallback(async () => {
    if (!selectedChapter) return;
    if (agentMode) {
      await onAgentGenerateChapter?.(selectedChapter, agentNote);
      return;
    }
    abortRef.current = new AbortController();
    setIsGenerating(true);
    setText("");

    await fetchSSE(
      novelService.contentGenerateUrl(project.id, selectedChapter.id),
        { custom_prompt: null, min_word_count: project.min_chapter_word_count },
      {
        onToken: (t) => setText((prev) => prev + t),
        onDone: (data) => {
          const cleanContent = (data?.clean_content as string) ?? undefined;
          if (cleanContent !== undefined) {
            setText(cleanContent);
            lastSavedContentRef.current = cleanContent;
          }
          setIsGenerating(false);
          qc.invalidateQueries({ queryKey: novelKeys.project(project.id) });
        },
        onError: (msg) => {
          setIsGenerating(false);
          feedback.error("正文生成失败", msg);
        },
      },
      abortRef.current.signal,
    );
  }, [agentMode, agentNote, feedback, onAgentGenerateChapter, project.id, project.min_chapter_word_count, selectedChapter, qc]);

  if (project.chapters.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-400">
        还没有章节 — 请先在「章节」标签生成章节规划
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Chapter selector */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-neutral-600 dark:text-neutral-400 shrink-0">选择章节：</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={interactionLocked}
          className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm
            focus:outline-none focus:ring-2 focus:ring-primary-500
            dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
        >
          {project.chapters.map((ch) => (
            <option key={ch.id} value={ch.id}>
              第 {ch.order_num} 章 {ch.title}
              {ch.content ? ` ✓ (${ch.word_count}字)` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Chapter outline preview — limited height, scrollable */}
      {selectedChapter?.outline && (
        <div className="max-h-24 overflow-y-auto rounded-lg bg-neutral-50 px-3 py-2 text-xs
          text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
          <span className="font-medium text-neutral-600 dark:text-neutral-300">章节大纲：</span>
          {selectedChapter.outline}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2">
        {!isGenerating ? (
          <Button onClick={handleGenerate} className="gap-2" disabled={!selectedChapter || agentSending || interactionLocked}>
            <Sparkles className="h-4 w-4" />
            {agentMode ? "Agent 生成正文" : "生成正文"}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => { abortRef.current?.abort(); setIsGenerating(false); }} className="gap-2" disabled={agentMode}>
            <Loader2 className="h-4 w-4 animate-spin" />
            {agentMode ? "Agent 处理中…" : "停止生成"}
          </Button>
        )}
        <span className="ml-auto text-xs text-neutral-400">{text.length} 字</span>
      </div>

      <p className="text-xs text-neutral-400">
        {agentMode
          ? `当前正文生成会通过 Agent 执行，并在结束后自动写回项目。本章目标不少于 ${project.min_chapter_word_count} 字。`
          : interactionLocked
            ? `当前正在按既定模式自动生成内容，正文相关操作已临时锁定。本章目标不少于 ${project.min_chapter_word_count} 字。`
            : saveState === "saving"
              ? `当前按单章生成，系统会自动加载前文章节摘要和上一章结尾做连贯衔接。正在自动保存…`
              : saveState === "saved"
                ? `当前按单章生成，系统会自动加载前文章节摘要和上一章结尾做连贯衔接。已自动保存。`
                : `当前按单章生成，系统会自动加载前文章节摘要和上一章结尾做连贯衔接。本章目标不少于 ${project.min_chapter_word_count} 字。`}
      </p>

      {agentMode && (
        <Input
          label="本章正文要求（可选）"
          value={agentNote}
          onChange={(e) => setAgentNote(e.target.value)}
          placeholder="例如：这一章突出情绪爆点，结尾留下反转"
          disabled={agentSending}
        />
      )}

      {/* Content area — grows with content, always fully visible */}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={28}
        placeholder="点击「生成正文」，AI 将根据章节大纲生成本章内容…"
        className="w-full font-serif text-sm leading-8 tracking-wide"
        disabled={isGenerating || interactionLocked}
      />
    </div>
  );
}


export function WorkspacePage() {
  const { id: pid = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: project, isLoading, refetch } = useProject(pid);
  const customModeFromUrl = searchParams.get("customMode");
  const urlSessionId = searchParams.get("sid");
  const linkedSessionId = getLinkedAgentSessionId(pid);
  const [restoredSessionId, setRestoredSessionId] = useState<string | null>(urlSessionId || linkedSessionId);
  const sessionId = urlSessionId || linkedSessionId || restoredSessionId;
  const { mutate: finalizeProject, isPending: isFinalizing } = useFinalizeProject(pid);
  const { mutate: updateProjectTitle, isPending: isRenamingTitle } = useUpdateProject(pid);
  const { mutate: createOrReuseProjectAgentSession, isPending: isActivatingAgentMode } =
    useCreateOrReuseProjectAgentSession(pid);
  const feedback = useFeedback();
  const isAgentMode = !!sessionId;
  const [manualGenerationMode, setManualGenerationMode] = useState<GenerationMode>(
    customModeFromUrl === "full_book" || customModeFromUrl === "guided_first_chapter"
      ? customModeFromUrl
      : "guided_first_chapter",
  );
  const [isStartingCustomGeneration, setIsStartingCustomGeneration] = useState(false);
  const isCustomGenerating = !isAgentMode && (project?.generation_status === "running" || isStartingCustomGeneration);
  const isManualWorkspaceLocked = !isAgentMode && isCustomGenerating;
  const { data: latestProjectSession } = useLatestProjectAgentSession(
    pid,
    !!pid && !sessionId,
  );
  const {
    messages: agentMessages,
    isSending: isAgentSending,
    sendMessage: sendAgentMessage,
    stop: stopAgentMessage,
  } = useAgentChat(sessionId, refetch);

  const [activeTab, setActiveTab] = useState<Tab>("大纲");
  const [jumpToChapter, setJumpToChapter] = useState<Chapter | undefined>();
  const [selectedContentChapter, setSelectedContentChapter] = useState<Chapter | undefined>();
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);

  useEffect(() => {
    if (urlSessionId || linkedSessionId) {
      setRestoredSessionId(urlSessionId || linkedSessionId);
    }
  }, [linkedSessionId, urlSessionId]);

  useEffect(() => {
    if (!pid || isAgentMode) return;
    const nextMode =
      customModeFromUrl === "full_book" || customModeFromUrl === "guided_first_chapter"
        ? customModeFromUrl
        : getStoredManualMode(pid) ?? "guided_first_chapter";
    setManualGenerationMode(nextMode);
    setStoredManualMode(pid, nextMode);
  }, [customModeFromUrl, isAgentMode, pid]);

  useEffect(() => {
    if (!pid || !latestProjectSession?.id) return;
    linkProjectToAgentSession(pid, latestProjectSession.id);
    setRestoredSessionId(latestProjectSession.id);
    navigate(`/novel/${pid}?sid=${latestProjectSession.id}`, { replace: true });
  }, [latestProjectSession?.id, navigate, pid]);

  const handleSelectChapter = (ch: Chapter) => {
    setJumpToChapter(ch);
    setSelectedContentChapter(ch);
    setActiveTab("正文");
  };

  const chapters = project?.chapters ?? [];
  const totalChapters = chapters.length;
  const doneChapters = chapters.filter((c) => c.content?.trim()).length;
  const hasPublishableChapter = doneChapters > 0;

  useEffect(() => {
    if (!project) {
      setSelectedContentChapter(undefined);
      return;
    }
    if (!selectedContentChapter) return;
    const next = project.chapters.find((chapter) => chapter.id === selectedContentChapter.id);
    setSelectedContentChapter(next);
  }, [project, selectedContentChapter?.id]);

  const handleFinalize = () => {
    if (project?.status === "published") {
      navigate(`/novel/${pid}/read`);
      return;
    }
    if (!hasPublishableChapter) return; // guarded by disabled state
    void (async () => {
      const confirmed = await feedback.confirm({
        title: "确认定稿发布",
        content: `确认将「${project?.title}」进入发布阶段？当前只要已有至少 1 章正文，就可以继续按连载方式逐章发布；进入发布阶段后仍可继续编辑和补充后续章节。`,
        okText: "确认定稿",
      });
      if (confirmed) {
        finalizeProject();
      }
    })();
  };

  const handleEnterAgentMode = useCallback(() => {
    createOrReuseProjectAgentSession("default", {
      onSuccess: (session) => {
        linkProjectToAgentSession(pid, session.id);
        setRestoredSessionId(session.id);
        navigate(`/novel/${pid}?sid=${session.id}`);
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : "进入 Agent 模式失败，请重试。";
        feedback.error("进入 Agent 模式失败", message);
      },
    });
  }, [createOrReuseProjectAgentSession, feedback, navigate, pid]);

  const sendWorkspaceAgentMessage = useCallback(async (text: string) => {
    if (!sessionId) return;
    await sendAgentMessage(text);
    refetch();
  }, [refetch, sendAgentMessage, sessionId]);

  const handleAgentOutline = useCallback(async (extra?: string) => {
    await sendWorkspaceAgentMessage(buildOutlinePrompt(extra));
  }, [sendWorkspaceAgentMessage]);

  const handleAgentChapters = useCallback(async (chapterCount: number, extra?: string) => {
    if (!project) return;

    const chapters = project.chapters || [];
    if (chapters.length === 0) {
      await sendWorkspaceAgentMessage(buildChaptersPrompt(chapterCount, extra, "replace_all"));
      return;
    }

    const writtenChapters = chapters.filter((chapter) => chapter.content.trim());
    if (writtenChapters.length === 0) {
      const confirmed = await feedback.confirm({
        title: "重新规划章节",
        content: "当前还没有已写正文，本次会直接覆盖现有章节规划，避免重复追加同一批章节。",
        okText: "覆盖当前规划",
        cancelText: "取消",
      });
      if (!confirmed) return;
      await sendWorkspaceAgentMessage(buildChaptersPrompt(chapterCount, extra, "replace_all"));
      return;
    }

    const lastWrittenOrder = Math.max(...writtenChapters.map((chapter) => chapter.order_num));
    const selectedMode = await feedback.choose({
      title: "重新规划章节",
      content: `检测到已有 ${writtenChapters.length} 章正文。请选择这次重排方式，系统将避免重复追加章节。`,
      cancelText: "取消",
      choices: [
        {
          key: "replace_future",
          label: "仅重排未写章节",
          description: `保留前 ${lastWrittenOrder} 章及其正文，从第 ${lastWrittenOrder + 1} 章开始重新规划后续章节。`,
        },
        {
          key: "replace_all",
          label: "覆盖全部章节",
          description: "删除当前全部章节规划与已写正文，适合整本推倒重来。",
        },
      ],
    });
    if (!selectedMode) return;

    if (selectedMode === "replace_all") {
      const confirmed = await feedback.confirm({
        title: "确认覆盖全部章节",
        content: "这会删除当前全部章节规划和已写正文，且不可自动恢复。确认继续吗？",
        okText: "确认覆盖",
        cancelText: "取消",
        danger: true,
      });
      if (!confirmed) return;
      await sendWorkspaceAgentMessage(buildChaptersPrompt(chapterCount, extra, "replace_all"));
      return;
    }

    const effectiveChapterCount = Math.max(chapterCount, lastWrittenOrder + 1);
    if (effectiveChapterCount !== chapterCount) {
      feedback.info(
        "章节数已自动调整",
        `前 ${lastWrittenOrder} 章会被保留，重新规划后续章节时，总章节数至少需要 ${lastWrittenOrder + 1} 章。`,
      );
    }
    await sendWorkspaceAgentMessage(
      buildChaptersPrompt(effectiveChapterCount, extra, "replace_future", lastWrittenOrder),
    );
  }, [feedback, project, sendWorkspaceAgentMessage]);

  const handleAgentChapterContent = useCallback(async (chapter: Chapter, extra?: string) => {
    await sendWorkspaceAgentMessage(
      buildChapterContentPrompt(chapter, project?.min_chapter_word_count || 2000, extra),
    );
  }, [project?.min_chapter_word_count, sendWorkspaceAgentMessage]);

  const handleAgentChapterOutline = useCallback(async (chapter: Chapter, extra?: string) => {
    await sendWorkspaceAgentMessage(buildSingleChapterOutlinePrompt(chapter, extra));
  }, [sendWorkspaceAgentMessage]);

  const handleAgentContinueRemaining = useCallback(async (extra?: string) => {
    await sendWorkspaceAgentMessage(
      buildContinueRemainingPrompt(project?.min_chapter_word_count || 2000, extra),
    );
  }, [project?.min_chapter_word_count, sendWorkspaceAgentMessage]);

  const focusedChapter = selectedContentChapter
    ?? jumpToChapter
    ?? project?.chapters.find((chapter) => chapter.content?.trim())
    ?? project?.chapters[0];

  const handleAgentGlobalConsistencyCheck = useCallback(async () => {
    await sendWorkspaceAgentMessage(buildGlobalConsistencyPrompt());
  }, [sendWorkspaceAgentMessage]);

  const handleAgentChapterContinuityCheck = useCallback(async () => {
    await sendWorkspaceAgentMessage(buildChapterContinuityPrompt(focusedChapter));
  }, [focusedChapter, sendWorkspaceAgentMessage]);

  const handleAgentOutlineConsistencyCheck = useCallback(async () => {
    await sendWorkspaceAgentMessage(buildChapterOutlineConsistencyPrompt(focusedChapter));
  }, [focusedChapter, sendWorkspaceAgentMessage]);

  const handleRenameTitle = useCallback(async () => {
    if (!project) return;
    const nextTitle = await feedback.prompt({
      title: "修改标题",
      content: "建议 4-12 个字，尽量使用单主标题，避免副标题结构。",
      label: "小说标题",
      initialValue: project.title,
      placeholder: "请输入新的小说标题",
      okText: "保存标题",
      maxLength: 40,
      validator: (value) => {
        if (!value.trim()) return "标题不能为空。";
        if (value.length > 40) return "标题最多 40 个字。";
        return null;
      },
    });
    if (!nextTitle || nextTitle === project.title) return;
    updateProjectTitle(
      { title: nextTitle },
      {
        onSuccess: () => feedback.success("标题已更新", `已改为《${nextTitle}》。`),
        onError: (err) => {
          const message = err instanceof Error ? err.message : "修改标题失败，请重试。";
          feedback.error("修改标题失败", message);
        },
      },
    );
  }, [feedback, project, updateProjectTitle]);

  const handleStartCustomGeneration = useCallback(async (mode: GenerationMode) => {
    if (!project || isAgentMode || isCustomGenerating) return;
    setIsStartingCustomGeneration(true);
    try {
      await novelService.startProjectGeneration(project.id, { generation_mode: mode });
      await refetch();
      feedback.success("已开始后台生成", "现在离开工作台后，系统也会继续生成；回到列表页仍会显示生成中。");
    } catch (err) {
      const message = err instanceof Error ? err.message : "启动后台生成失败，请稍后重试。";
      feedback.error("自定义创作生成失败", message);
    } finally {
      setIsStartingCustomGeneration(false);
    }
  }, [feedback, isAgentMode, isCustomGenerating, project, refetch]);

  if (!pid) {
    navigate("/novel");
    return null;
  }

  if (isLoading) return <PageLoader />;
  if (!project) {
    return (
      <div className="p-8 text-center text-neutral-500">
        找不到该项目，
        <button onClick={() => navigate("/novel")} className="text-primary-600 underline">
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-200
        bg-white px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/novel")}
            className="gap-1 text-neutral-500"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate font-semibold text-neutral-900 dark:text-neutral-100">
                {project.title}
              </p>
              <button
                onClick={() => void handleRenameTitle()}
                disabled={isRenamingTitle || isManualWorkspaceLocked}
                className="shrink-0 rounded p-1 text-neutral-400 transition-colors hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="修改标题"
              >
                {isRenamingTitle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="default" className="text-xs">
                {GENRE_NAME_MAP[project.genre] ?? project.genre}
              </Badge>
              {isAgentMode && (
                <Badge variant="primary" className="text-xs">
                  Agent 模式
                </Badge>
              )}
              {!isAgentMode && (
                <Badge variant="primary" className="text-xs">
                  {describeManualMode(manualGenerationMode)}
                </Badge>
              )}
              {!isAgentMode && project.generation_status === "running" && (
                <Badge variant="success" className="text-xs">
                  后台生成中
                </Badge>
              )}
              {!isAgentMode && (
                <span className="text-xs text-neutral-400">{project.model}</span>
              )}
              {settingsSaved && (
                <span className="text-xs text-success-600 dark:text-success-400">✓ 已保存</span>
              )}
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isAgentMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsDrawerOpen(true)}
              className="gap-1.5 whitespace-nowrap"
            >
              <PenLine className="h-3.5 w-3.5" />
              项目设定
            </Button>
          )}

          {!isAgentMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnterAgentMode}
              disabled={isActivatingAgentMode || isManualWorkspaceLocked}
              className="gap-1.5 whitespace-nowrap"
            >
              {isActivatingAgentMode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isActivatingAgentMode ? "连接 Agent…" : "进入 Agent 模式"}
            </Button>
          )}
          {isAgentMode && sessionId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/novel/agent/new?sid=${sessionId}`)}
              className="gap-1.5 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              打开 Agent 页
            </Button>
          )}
          {project.status === "published" ? (
            /* ── Already published ── */
            <>
              <button
                onClick={handleFinalize}
                disabled={isManualWorkspaceLocked}
                className="flex items-center gap-1.5 rounded-full border border-emerald-300
                  bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700
                  shadow-sm transition-all hover:bg-emerald-100 hover:shadow
                  disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400
                  dark:hover:bg-emerald-900/50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                已定稿 · 阅读
                <BookOpen className="h-3.5 w-3.5" />
              </button>
              {/* 发布到平台：保留按钮但在开源版中不可操作 */}
              <div className="group relative">
                <button
                  disabled
                  className="flex cursor-not-allowed items-center gap-1.5 rounded-full border border-neutral-200
                    bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-400
                    shadow-sm opacity-60
                    dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500"
                >
                  <SendHorizonal className="h-3.5 w-3.5" />
                  发布到平台
                </button>
                <div className="pointer-events-none absolute -bottom-9 right-0 hidden whitespace-nowrap
                  rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-white shadow-lg group-hover:block dark:bg-neutral-700">
                  平台发布功能在开源版中暂不开放
                  <div className="absolute -top-1 right-5 h-2 w-2 rotate-45 bg-neutral-800 dark:bg-neutral-700" />
                </div>
              </div>
            </>
          ) : hasPublishableChapter ? (
            /* ── At least one chapter ready: publish CTA ── */
            <button
              onClick={handleFinalize}
              disabled={isFinalizing || isManualWorkspaceLocked}
              className="relative flex items-center gap-2 overflow-hidden rounded-full
                bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500
                px-4 py-1.5 text-sm font-semibold text-white shadow-md
                transition-all hover:shadow-lg hover:brightness-110
                active:scale-95 disabled:cursor-not-allowed disabled:opacity-60
                before:absolute before:inset-0 before:-translate-x-full
                before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent
                hover:before:translate-x-full before:transition-transform before:duration-500"
            >
              {isFinalizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookMarked className="h-4 w-4" />
              )}
              {isFinalizing ? "定稿中…" : "定稿发布"}
            </button>
          ) : (
            /* ── No chapter content yet: locked with progress ── */
            <div className="group relative flex items-center gap-2">
              {/* Progress pill */}
              {totalChapters > 0 && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs
                  text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
                  {doneChapters}/{totalChapters} 章已生成
                </span>
              )}
              {/* Locked button */}
              <button
                disabled
                className="flex cursor-not-allowed items-center gap-2 rounded-full
                  border border-neutral-200 bg-neutral-100 px-4 py-1.5
                  text-sm font-semibold text-neutral-400
                  dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500"
              >
                <BookMarked className="h-4 w-4" />
                定稿发布
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute -bottom-9 right-0 hidden
                whitespace-nowrap rounded-lg bg-neutral-800 px-3 py-1.5 text-xs
                text-white shadow-lg group-hover:block dark:bg-neutral-700">
                请先至少生成 1 章正文后再进入发布阶段
                <div className="absolute -top-1 right-5 h-2 w-2 rotate-45 bg-neutral-800 dark:bg-neutral-700" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {!isAgentMode && (
          <aside className="w-[360px] shrink-0 overflow-y-auto border-r border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
            <SettingsPanel
              project={project}
              onSaved={() => {
                setSettingsSaved(true);
                setTimeout(() => setSettingsSaved(false), 2000);
              }}
              agentMode={false}
              manualGenerationMode={manualGenerationMode}
              isCustomGenerating={isCustomGenerating}
              onStartCustomGeneration={handleStartCustomGeneration}
            />
          </aside>
        )}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-neutral-200
            bg-white px-4 dark:border-neutral-700 dark:bg-neutral-800">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex h-9 shrink-0 items-center whitespace-nowrap px-4 text-sm font-medium transition-colors
                  border-b-2 -mb-px
                  ${activeTab === tab
                    ? "border-primary-600 text-primary-700 dark:border-primary-400 dark:text-primary-400"
                    : "border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
              >
                {tab}
                {tab === "章节" && project.chapters.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-neutral-200 px-1.5 py-0.5 text-xs
                    text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                    {project.chapters.length}
                  </span>
                )}
                {tab === "正文" && project.chapters.filter((c) => c.content).length > 0 && (
                  <span className="ml-1.5 rounded-full bg-success-100 px-1.5 py-0.5 text-xs
                    text-success-700 dark:bg-success-900/30 dark:text-success-400">
                    {project.chapters.filter((c) => c.content).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {isManualWorkspaceLocked && (
              <div className="mb-3 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs text-primary-700 dark:border-primary-900 dark:bg-primary-950 dark:text-primary-300">
                正在后台生成中，离开当前页面后也会继续执行。
                {project.generation_label ? ` 当前进度：${project.generation_label}` : ""}
                {project.generation_total > 0 ? `（${project.generation_current}/${project.generation_total}）` : ""}
              </div>
            )}
            {activeTab === "大纲" && (
              <OutlineTab
                project={project}
                agentMode={isAgentMode}
                agentSending={isAgentSending}
                interactionLocked={isManualWorkspaceLocked}
                onAgentGenerate={handleAgentOutline}
              />
            )}
            {activeTab === "章节" && (
              <ChaptersTab
                project={project}
                onSelectChapter={handleSelectChapter}
                agentMode={isAgentMode}
                manualGenerationMode={manualGenerationMode}
                agentSending={isAgentSending}
                interactionLocked={isManualWorkspaceLocked}
                onAgentGenerateChapters={handleAgentChapters}
                onAgentContinueRemaining={handleAgentContinueRemaining}
                onAgentGenerateChapterOutline={handleAgentChapterOutline}
              />
            )}
            {activeTab === "正文" && (
              <ContentTab
                key={jumpToChapter?.id ?? "content"}
                project={project}
                initialChapter={jumpToChapter}
                agentMode={isAgentMode}
                agentSending={isAgentSending}
                interactionLocked={isManualWorkspaceLocked}
                onAgentGenerateChapter={handleAgentChapterContent}
                onSelectedChapterChange={setSelectedContentChapter}
              />
            )}
          </div>
        </main>

        {isAgentMode && sessionId && (
          <aside className="w-[380px] shrink-0 overflow-hidden border-l border-neutral-200 dark:border-neutral-700">
            <AgentChatPanel
              sessionId={sessionId}
              messages={agentMessages}
              isSending={isAgentSending}
              onSend={sendWorkspaceAgentMessage}
              onStop={stopAgentMessage}
              title="创作 Agent"
              subtitle="工作台和 Agent 页共用同一会话上下文"
              quickActions={[
                {
                  label: "检查全书一致性",
                  onClick: handleAgentGlobalConsistencyCheck,
                },
                {
                  label: focusedChapter ? `检查本章衔接 · ${focusedChapter.order_num}` : "检查本章衔接",
                  onClick: handleAgentChapterContinuityCheck,
                },
                {
                  label: focusedChapter ? `检查本章偏纲 · ${focusedChapter.order_num}` : "检查本章偏纲",
                  onClick: handleAgentOutlineConsistencyCheck,
                },
              ]}
              placeholder="继续给 Agent 下达创作、修订或续写要求…"
            />
          </aside>
        )}
      </div>

      {isAgentMode && settingsDrawerOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/40">
          <button
            aria-label="关闭项目设定"
            className="flex-1 cursor-default"
            onClick={() => setSettingsDrawerOpen(false)}
          />
          <div className="flex h-full w-full max-w-[420px] flex-col overflow-hidden bg-white shadow-2xl dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">项目设定</h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  设定调整集中在抽屉中编辑，不占用主创作区宽度
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsDrawerOpen(false)}
                className="gap-1.5"
              >
                <X className="h-4 w-4" />
                关闭
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SettingsPanel
                project={project}
                agentMode={isAgentMode}
                onSaved={() => {
                  setSettingsSaved(true);
                  setTimeout(() => setSettingsSaved(false), 2000);
                }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
