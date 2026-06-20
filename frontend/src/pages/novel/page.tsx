import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Plus,
  Trash2,
  ChevronRight,
  FileText,
  BookMarked,
  PenLine,
  CheckCircle2,
  Bot,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/shared/loading-spinner";
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from "@/hooks/use-novel";
import { useFeedback } from "@/hooks/use-feedback";
import { NOVEL_GENRES, GENRE_NAME_MAP } from "@/constants/novel-genres";
import type { GenerationMode, NovelProject } from "@/types/novel";
import { getLinkedAgentSessionId } from "@/utils/agent-session-link";

// ── Create dialog ──────────────────────────────────────────────────────────────

interface CreateDialogProps {
  onClose: () => void;
}

function CreateDialog({ onClose }: CreateDialogProps) {
  const { mutate: create, isPending } = useCreateProject();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("urbanReborn");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("guided_first_chapter");

  const handleCreate = () => {
    if (!title.trim()) return;
    create(
      { title: title.trim(), genre },
      {
        onSuccess: (project) => {
          try {
            localStorage.setItem(`novel:manual-mode:${project.id}`, generationMode);
          } catch {
            // Ignore storage errors.
          }
          onClose();
          navigate(`/novel/${project.id}?customMode=${generationMode}`);
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle>新建小说项目</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setGenerationMode("guided_first_chapter")}
              className={`rounded-xl border p-4 text-left transition ${
                generationMode === "guided_first_chapter"
                  ? "border-primary-500 bg-primary-50 shadow-sm dark:border-primary-400 dark:bg-primary-900/20"
                  : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
              }`}
            >
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">框架 + 第一章</p>
              <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                先生成大纲、章节规划和第一章正文，后续章节在工作台里继续创作。
              </p>
            </button>
            <button
              type="button"
              onClick={() => setGenerationMode("full_book")}
              className={`rounded-xl border p-4 text-left transition ${
                generationMode === "full_book"
                  ? "border-primary-500 bg-primary-50 shadow-sm dark:border-primary-400 dark:bg-primary-900/20"
                  : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
              }`}
            >
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">一次性生成全书</p>
              <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                生成大纲、章节规划，并按顺序写完整本书的正文。
              </p>
            </button>
          </div>

          <Input
            label="小说标题"
            placeholder="请输入小说标题…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              小说类型
            </label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
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

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={isPending || !title.trim()}>
              {isPending ? "创建中…" : generationMode === "full_book" ? "创建并进入整本模式" : "创建并进入首章模式"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Project card ───────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: NovelProject;
  onDelete: (pid: string) => void;
}

function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const navigate = useNavigate();
  const linkedSessionId = getLinkedAgentSessionId(project.id);
  const feedback = useFeedback();
  const { mutate: updateProject, isPending: isRenaming } = useUpdateProject(project.id);

  const genreName = GENRE_NAME_MAP[project.genre] ?? project.genre;
  const updatedDate = new Date(project.updated_at).toLocaleDateString("zh-CN");
  const isPublished = project.status === "published";
  const isGenerating = project.generation_status === "running";

  const handleRename = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
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
    updateProject(
      { title: nextTitle },
      {
        onSuccess: () => feedback.success("标题已更新", `已改为《${nextTitle}》。`),
        onError: (err) => {
          const message = err instanceof Error ? err.message : "修改标题失败，请重试。";
          feedback.error("修改标题失败", message);
        },
      },
    );
  };

  return (
    <Card
      className={`group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md ${
        isPublished ? "border-emerald-200 dark:border-emerald-800" : ""
      }`}
    >
      <CardContent className="flex min-h-[250px] flex-1 flex-col gap-3 pt-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {isPublished ? (
              <BookMarked className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <BookOpen className="h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" />
            )}
            <h3 className="min-h-[2.75rem] line-clamp-2 text-sm font-semibold leading-6 text-neutral-900 dark:text-neutral-100">
              {project.title}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => void handleRename(e)}
              disabled={isRenaming}
              className="rounded p-1 text-neutral-400 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="修改标题"
            >
              <PenLine className="h-4 w-4" />
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const confirmed = await feedback.confirm({
                  title: "删除小说项目",
                  content: `确定删除「${project.title}」？该操作会同时删除章节内容，且不可撤销。`,
                  okText: "确认删除",
                  danger: true,
                });
                if (confirmed) {
                  onDelete(project.id);
                }
              }}
              className="rounded p-1 text-neutral-400 hover:text-danger-500"
              aria-label="删除项目"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex min-h-[1.75rem] flex-wrap gap-1.5">
          <Badge variant="default" className="whitespace-nowrap text-xs">
            {genreName}
          </Badge>
          {isPublished && (
            <Badge
              variant="success"
              className="gap-1 whitespace-nowrap text-xs bg-emerald-100 text-emerald-700 border-emerald-300
                dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700"
            >
              <CheckCircle2 className="h-3 w-3" />
              已定稿
            </Badge>
          )}
          {!isPublished && project.outline && (
            <Badge variant="primary" className="whitespace-nowrap text-xs">
              已有大纲
            </Badge>
          )}
          {isGenerating && (
            <Badge variant="primary" className="whitespace-nowrap text-xs">
              生成中
            </Badge>
          )}
        </div>

        {/* Stats row (shown after finalize) */}
        {isPublished && (project.total_word_count > 0 || project.chapter_count > 0) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            {project.chapter_count > 0 && (
              <span className="whitespace-nowrap">{project.chapter_count} 章</span>
            )}
            {project.total_word_count > 0 && (
              <span className="whitespace-nowrap">{project.total_word_count.toLocaleString()} 字</span>
            )}
          </div>
        )}

        {/* Background preview */}
        {project.background && (
          <p className="min-h-[2.5rem] line-clamp-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            {project.background}
          </p>
        )}
        {isGenerating && (
          <p className="min-h-[1.25rem] text-xs leading-5 text-primary-600 dark:text-primary-400">
            {project.generation_label
              ? `${project.generation_label}${project.generation_total > 0 ? `（${project.generation_current}/${project.generation_total}）` : ""}`
              : "后台生成中，退出页面后会继续执行"}
          </p>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-neutral-400">{updatedDate}</span>
          <div className="flex items-center gap-1">
            {isPublished && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/novel/${project.id}/read`)}
                className="h-7 gap-1 whitespace-nowrap text-xs text-emerald-700 border-emerald-300
                  hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700
                  dark:hover:bg-emerald-950"
              >
                <BookOpen className="h-3 w-3" />
                阅读
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(linkedSessionId ? `/novel/${project.id}?sid=${linkedSessionId}` : `/novel/${project.id}`)}
              className="h-7 gap-1 whitespace-nowrap text-xs"
            >
              <PenLine className="h-3 w-3" />
              {isGenerating ? "查看进度" : "工作台"}
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Filter tabs ────────────────────────────────────────────────────────────────

type FilterTab = "all" | "draft" | "published";

function FilterTabs({
  value,
  onChange,
  counts,
}: {
  value: FilterTab;
  onChange: (v: FilterTab) => void;
  counts: { all: number; draft: number; published: number };
}) {
  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: `全部 (${counts.all})` },
    { key: "draft", label: `创作中 (${counts.draft})` },
    { key: "published", label: `已定稿 (${counts.published})` },
  ];
  return (
    <div className="flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === t.key
              ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
              : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function NovelPage() {
  const navigate = useNavigate();
  const { data: projects, isLoading, isError, refetch } = useProjects();
  const { mutate: deleteProject } = useDeleteProject();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");

  const counts = {
    all: projects?.length ?? 0,
    draft: projects?.filter((p) => p.status !== "published").length ?? 0,
    published: projects?.filter((p) => p.status === "published").length ?? 0,
  };

  const filtered = projects?.filter((p) => {
    if (filter === "published") return p.status === "published";
    if (filter === "draft") return p.status !== "published";
    return true;
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            AI 小说创作
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            选择类型、填写设定，三步生成完整网文 — 大纲 → 章节 → 正文 → 定稿
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/novel/ideas")}
            className="gap-2 border-amber-300 text-amber-700 hover:border-amber-400 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
          >
            <Lightbulb className="h-4 w-4" />
            AI 灵感
          </Button>
          {/* Agent mode entry */}
          <Button
            variant="outline"
            onClick={() => navigate("/novel/agent/new")}
            className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400
              dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950"
          >
            <Bot className="h-4 w-4" />
            AI Agent 创作
            <Sparkles className="h-3.5 w-3.5 opacity-70" />
          </Button>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            自定义创作
          </Button>
        </div>
      </div>

      {/* Filter tabs (only when we have projects) */}
      {!isLoading && !isError && (projects?.length ?? 0) > 0 && (
        <FilterTabs value={filter} onChange={setFilter} counts={counts} />
      )}

      {/* Content */}
      {isLoading ? (
        <PageLoader />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2
          border-dashed border-danger-200 bg-danger-50 py-20 dark:border-danger-800 dark:bg-danger-950/30">
          <div className="text-center">
            <p className="font-medium text-danger-600 dark:text-danger-400">
              无法连接到服务器
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              请确认后端服务已启动（默认端口 8080），然后重试
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">
              启动命令：<code className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                uvicorn app.main:app --port 8080
              </code>
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            重试连接
          </Button>
        </div>
      ) : !filtered?.length ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2
          border-dashed border-neutral-200 py-20 dark:border-neutral-700">
          <FileText className="h-12 w-12 text-neutral-300 dark:text-neutral-600" />
          <div className="text-center">
            <p className="font-medium text-neutral-600 dark:text-neutral-400">
              {filter === "all" ? "开始你的第一部作品" : filter === "published" ? "暂无已定稿的作品" : "暂无创作中的项目"}
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              {filter === "all" ? "选择 AI 全自动生成，或按自己的思路精细创作" : "切换到「全部」查看所有作品"}
            </p>
          </div>
          {filter === "all" && (
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => navigate("/novel/ideas")}
                className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
              >
                <Lightbulb className="h-4 w-4" />
                AI 灵感
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/novel/agent/new")}
                className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50
                  dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950"
              >
                <Bot className="h-4 w-4" />
                AI Agent 全自动生成
              </Button>
              <Button onClick={() => setShowCreate(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                自定义创作
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onDelete={(pid) => deleteProject(pid)}
            />
          ))}
        </div>
      )}

      {showCreate && <CreateDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
