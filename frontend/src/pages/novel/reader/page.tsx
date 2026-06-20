import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  List,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/shared/loading-spinner";
import { useProject, useDeleteProject } from "@/hooks/use-novel";
import { GENRE_NAME_MAP } from "@/constants/novel-genres";
import type { Chapter } from "@/types/novel";

// ── Chapter list sidebar ───────────────────────────────────────────────────────

interface SidebarProps {
  chapters: Chapter[];
  currentIdx: number;
  onSelect: (idx: number) => void;
  onClose: () => void;
}

function ChapterSidebar({ chapters, currentIdx, onSelect, onClose }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-white shadow-xl
      dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-700">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b
        border-neutral-200 dark:border-neutral-700 px-4">
        <span className="font-semibold text-neutral-900 dark:text-neutral-100">目录</span>
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Chapter list */}
      <ol className="flex-1 overflow-y-auto p-2">
        {chapters.map((ch, idx) => (
          <li key={ch.id}>
            <button
              onClick={() => {
                onSelect(idx);
                onClose();
              }}
              className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                idx === currentIdx
                  ? "bg-primary-50 text-primary-700 font-medium dark:bg-primary-950/40 dark:text-primary-400"
                  : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              <span className="line-clamp-2">
                <span className="mr-2 text-xs text-neutral-400">{ch.order_num}.</span>
                {ch.title}
              </span>
              {ch.word_count > 0 && (
                <span className="mt-0.5 block text-xs text-neutral-400">
                  {ch.word_count.toLocaleString()} 字
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

// ── Delete confirm dialog ──────────────────────────────────────────────────────

interface DeleteDialogProps {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

function DeleteDialog({ title, onConfirm, onCancel, isPending }: DeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          删除小说
        </h3>
        <p className="mt-2 text-sm text-neutral-500">
          确认删除「{title}」？该操作将同时删除所有章节内容，且不可撤销。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            取消
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={isPending}
            className="gap-1"
          >
            <Trash2 className="h-3 w-3" />
            {isPending ? "删除中…" : "确认删除"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Reader page ────────────────────────────────────────────────────────────────

export function ReaderPage() {
  const { id: pid = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(pid);
  const { mutate: deleteProject, isPending: isDeleting } = useDeleteProject();

  const [currentIdx, setCurrentIdx] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const chapters: Chapter[] = project?.chapters ?? [];
  const currentChapter = chapters[currentIdx];

  // Reset to first chapter when project changes
  useEffect(() => {
    setCurrentIdx(0);
  }, [pid]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && currentIdx > 0) setCurrentIdx((i) => i - 1);
      if (e.key === "ArrowRight" && currentIdx < chapters.length - 1)
        setCurrentIdx((i) => i + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentIdx, chapters.length]);

  if (!pid) { navigate("/novel"); return null; }
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

  const chaptersWithContent = chapters.filter((c) => c.content);
  const totalWords = project.total_word_count > 0
    ? project.total_word_count
    : chapters.reduce((s, c) => s + (c.word_count ?? 0), 0);

  const handleDelete = () => {
    deleteProject(pid, {
      onSuccess: () => navigate("/novel"),
    });
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* ── Fixed top bar ─────────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-12 items-center gap-3
        border-b border-neutral-200 bg-white/95 px-4 shadow-sm backdrop-blur-sm
        dark:border-neutral-700 dark:bg-neutral-900/95">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/novel")}
          className="gap-1 text-neutral-500"
        >
          <ArrowLeft className="h-4 w-4" />
          书库
        </Button>

        <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />

        <button
          onClick={() => setShowSidebar((s) => !s)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-neutral-600
            hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <List className="h-4 w-4" />
          目录
        </button>

        {/* Title */}
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <BookOpen className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate font-semibold text-neutral-900 dark:text-neutral-100">
            {project.title}
          </span>
          <Badge variant="default" className="hidden shrink-0 text-xs sm:inline-flex">
            {GENRE_NAME_MAP[project.genre] ?? project.genre}
          </Badge>
        </div>

        {/* Stats */}
        <div className="hidden items-center gap-3 text-xs text-neutral-400 sm:flex">
          <span>{chaptersWithContent.length} 章</span>
          <span>{totalWords.toLocaleString()} 字</span>
        </div>

        {/* Edit & Delete */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/novel/${pid}`)}
          className="h-7 gap-1 text-xs"
        >
          编辑
        </Button>
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="rounded p-1.5 text-neutral-400 hover:bg-danger-50 hover:text-danger-500
            dark:hover:bg-danger-950"
          aria-label="删除小说"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      {/* ── Fixed chapter sub-header ──────────────────────────────────────── */}
      <div className="fixed inset-x-0 top-12 z-10 border-b border-neutral-200 bg-white/95
        px-6 py-3 backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <p className="text-xs text-neutral-400">
              第 {currentIdx + 1} 章 / 共 {chapters.length} 章
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-neutral-900 dark:text-neutral-100">
              {currentChapter?.title ?? "（无章节）"}
            </h2>
          </div>
          {currentChapter?.word_count > 0 && (
            <span className="text-xs text-neutral-400">
              {currentChapter.word_count.toLocaleString()} 字
            </span>
          )}
        </div>
      </div>

      {/* ── Scrollable content (padded away from fixed bars) ──────────────── */}
      {/* top-12 header + ~64px chapter header = ~124px; bottom nav = 56px */}
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-[124px]">
        {currentChapter?.content ? (
          <article className="text-[16px] leading-8 text-neutral-800 dark:text-neutral-200">
            {currentChapter.content.split("\n\n").map((para, i) => (
              <p key={i} className="mb-5">
                {para}
              </p>
            ))}
          </article>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-neutral-400">
            <BookOpen className="h-10 w-10 opacity-30" />
            <p className="text-sm">本章暂无正文内容</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/novel/${pid}`)}
            >
              前往工作台生成
            </Button>
          </div>
        )}
      </main>

      {/* ── Fixed bottom navigation ───────────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200
        bg-white/95 backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-center gap-6 px-6">
          {/* Prev */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentIdx((i) => i - 1)}
            disabled={currentIdx === 0}
            className="w-28 gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            上一章
          </Button>

          {/* Chapter dots / progress */}
          <div className="flex flex-1 items-center justify-center gap-1.5">
            {chapters.length <= 15 ? (
              chapters.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIdx(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentIdx
                      ? "w-5 bg-primary-600 dark:bg-primary-400"
                      : "w-2 bg-neutral-300 hover:bg-neutral-400 dark:bg-neutral-600"
                  }`}
                />
              ))
            ) : (
              <span className="text-sm text-neutral-500">
                {currentIdx + 1} / {chapters.length}
              </span>
            )}
          </div>

          {/* Next */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentIdx((i) => i + 1)}
            disabled={currentIdx >= chapters.length - 1}
            className="w-28 gap-1"
          >
            下一章
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </nav>

      {/* Keyboard hint — sits just above the bottom nav */}
      <div className="fixed bottom-14 right-4 hidden items-center gap-1.5 rounded-full
        bg-neutral-100/80 px-2.5 py-1 text-[10px] text-neutral-400 backdrop-blur-sm
        dark:bg-neutral-800/80 sm:flex">
        <ArrowLeft className="h-3 w-3" />
        <span>/</span>
        <ArrowRight className="h-3 w-3" />
        键翻章
      </div>

      {/* Sidebar overlay */}
      {showSidebar && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/30"
            onClick={() => setShowSidebar(false)}
          />
          <ChapterSidebar
            chapters={chapters}
            currentIdx={currentIdx}
            onSelect={setCurrentIdx}
            onClose={() => setShowSidebar(false)}
          />
        </>
      )}

      {/* Delete dialog */}
      {showDeleteDialog && (
        <DeleteDialog
          title={project.title}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
          isPending={isDeleting}
        />
      )}
    </div>
  );
}
