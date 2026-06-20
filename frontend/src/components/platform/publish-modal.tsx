import { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox, Form, Input, Modal, Select, Tag, Spin } from "antd";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Plus,
  SendHorizonal,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { platformService } from "@/services/platform-service";
import { usePlatformStore, PLATFORM_USER_IDS } from "@/stores/platform-store";
import type {
  FanqieBookInfo,
  FanqieWorkCategory,
  PlatformType,
  PublishMode,
  QimaoBookInfo,
  YuewenBookInfo,
  YuewenWorkCategory,
} from "@/types/platform";
import { PLATFORM_LABELS } from "@/types/platform";
import type { Chapter } from "@/types/novel";

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 剥掉章节标题里已有的"第X章"前缀（数字或中文数字均支持），
 * 只保留标题名称部分，避免发送到番茄时出现"第1章 第二章 ..."的双重编号。
 * 例：
 *   "第二章 夜市控盘与初步胜利" → "夜市控盘与初步胜利"
 *   "第12章 开端"              → "开端"
 *   "序章"                    → "序章"（无前缀时原样返回）
 */
function stripChapterPrefix(title: string): string {
  return title.replace(/^第[一二三四五六七八九十百千万\d]+章\s*/, "").trim() || title;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  bookTitle: string;
  chapters: Chapter[];
}

// ── 进度状态 ─────────────────────────────────────────────────────────────────

type Stage = "platform" | "config" | "select" | "publishing" | "done" | "error";

interface ChapterResult {
  chapterId: string;
  title: string;
  status: "pending" | "running" | "ok" | "error";
  msg?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

type BookTarget = "new" | "existing";
type ExistingBook = FanqieBookInfo | YuewenBookInfo | QimaoBookInfo;

const PLATFORM_OPTIONS: Array<{
  type: PlatformType;
  description: string;
}> = [
  {
    type: "fanqie",
    description: "支持新建书籍、发布到已有书籍，并可选择直接发布或保存草稿",
  },
  {
    type: "yuewen",
    description: "支持起点 / 阅文账号登录、新建作品、发布到已有作品，并可选择直接发布或保存草稿",
  },
  {
    type: "qimao",
    description: "通过手机号验证码登录，仅支持向已有已过审书籍直接发布章节",
  },
];

function getPlatformUserId(platform: PlatformType) {
  return PLATFORM_USER_IDS[platform];
}

function isFanqieBook(book: ExistingBook): book is FanqieBookInfo {
  return "book_name" in book;
}

function getBookTitle(book: ExistingBook) {
  return isFanqieBook(book) ? book.book_name : book.title;
}

function isQimaoBook(book: ExistingBook): book is QimaoBookInfo {
  return "can_publish_directly" in book;
}

function getBookStatus(platform: PlatformType, book: ExistingBook) {
  if (platform === "fanqie" && isFanqieBook(book)) {
    return book.creation_status === 2 ? "已完结" : "连载中";
  }
  if (platform === "qimao" && isQimaoBook(book)) {
    return book.status || "可直接发布";
  }
  return (book as YuewenBookInfo).status || "未知状态";
}

function isCompletedBook(platform: PlatformType, book: ExistingBook) {
  if (platform === "fanqie" && isFanqieBook(book)) {
    return book.creation_status === 2;
  }
  if (platform === "qimao" && isQimaoBook(book)) {
    return !book.can_publish_directly;
  }
  return getBookStatus(platform, book) === "已完结";
}

export function PublishModal({ open, onClose, bookTitle, chapters }: Props) {
  const { fanqie, yuewen, qimao } = usePlatformStore();
  const [form] = Form.useForm();
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const savedFormValues = useRef<Record<string, unknown>>({});

  const [step, setStep] = useState<Stage>("platform");
  const [platform, setPlatform] = useState<PlatformType | null>(null);
  const [mode, setMode] = useState<PublishMode>("publish");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<ChapterResult[]>([]);
  const [globalError, setGlobalError] = useState<string>("");

  // 「新建 / 已有书籍」模式
  const [bookTarget, setBookTarget] = useState<BookTarget>("new");
  const [existingBooks, setExistingBooks] = useState<ExistingBook[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<string>("");
  const [coverAssetId, setCoverAssetId] = useState<string>("");
  const [coverFilename, setCoverFilename] = useState<string>("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [fanqieWorkCategories, setFanqieWorkCategories] = useState<FanqieWorkCategory[]>([]);
  const [yuewenWorkCategories, setYuewenWorkCategories] = useState<YuewenWorkCategory[]>([]);
  const [loadingWorkCategories, setLoadingWorkCategories] = useState(false);
  const [categoryRetryKey, setCategoryRetryKey] = useState(0);

  const abortRef = useRef(false);
  const watchedFanqieGender = (Form.useWatch("fanqie_gender", form) ?? 1) as 1 | 2;
  const watchedYuewenFreetype = String(Form.useWatch("yuewen_freetype", form) ?? "1") as "1" | "2";
  const watchedYuewenCategoryId = (Form.useWatch("yuewen_category_id", form) ?? "") as string;
  const selectedYuewenCategory = useMemo(
    () => yuewenWorkCategories.find((item) => item.category_id === watchedYuewenCategoryId),
    [yuewenWorkCategories, watchedYuewenCategoryId],
  );
  const retryLoadCategories = () => {
    setGlobalError("");
    setCategoryRetryKey((k) => k + 1);
  };

  const loadExistingBooks = async (targetPlatform: PlatformType) => {
    setLoadingBooks(true);
    try {
      const list = await platformService.getBookList(targetPlatform, getPlatformUserId(targetPlatform));
      setExistingBooks(list);
      setSelectedBookId(list.length > 0 ? list[0].book_id : "");
      if (list.length === 0 && targetPlatform === "qimao") {
        setGlobalError("未找到可直接发布的七猫作品，请确认该书已过审且当前账号具备发布权限");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setGlobalError(`加载书籍列表失败：${msg}`);
      setExistingBooks([]);
      setSelectedBookId("");
    } finally {
      setLoadingBooks(false);
    }
  };

  // 打开时重置
  useEffect(() => {
    if (open) {
      setStep("platform");
      setPlatform(null);
      setSelectedIds(new Set(chapters.map((c) => c.id)));
      setResults([]);
      setGlobalError("");
      setBookTarget("new");
      setSelectedBookId("");
      setExistingBooks([]);
      setCoverAssetId("");
      setCoverFilename("");
      setCoverUploading(false);
      setFanqieWorkCategories([]);
      setYuewenWorkCategories([]);
      setLoadingWorkCategories(false);
      setCategoryRetryKey(0);
      abortRef.current = false;
      form.setFieldsValue({
        fanqie_book_name: bookTitle,
        fanqie_abstract: "",
        fanqie_gender: 1,
        fanqie_category: undefined,
        yuewen_title: bookTitle,
        yuewen_intro: "",
        yuewen_freetype: "1",
        yuewen_category_id: undefined,
        yuewen_subcategory_id: undefined,
      });
    }
  }, [open, bookTitle, chapters, form]);

  const handlePlatformSelect = (nextPlatform: PlatformType) => {
    setPlatform(nextPlatform);
    setBookTarget(nextPlatform === "qimao" ? "existing" : "new");
    setMode("publish");
    setStep("config");
    setGlobalError("");
    if (nextPlatform === "qimao") {
      void loadExistingBooks(nextPlatform);
    }
  };

  useEffect(() => {
    if (!open || !platform || bookTarget !== "new" || platform === "qimao") {
      return;
    }

    let cancelled = false;
    const loadWorkCategories = async () => {
      setLoadingWorkCategories(true);
      try {
        if (platform === "fanqie") {
          const categories = await platformService.getFanqieWorkCategories(
            getPlatformUserId(platform),
            watchedFanqieGender,
          );
          if (cancelled) return;
          setFanqieWorkCategories(categories);
          const currentValue = form.getFieldValue("fanqie_category");
          if (currentValue && !categories.some((item) => item.name === currentValue)) {
            form.setFieldValue("fanqie_category", undefined);
          }
          if (categories.length === 0) {
            setGlobalError("未获取到主分类，请重试");
          } else {
            setGlobalError("");
          }
        } else {
          const categories = await platformService.getYuewenWorkTypes(
            getPlatformUserId(platform),
            watchedYuewenFreetype,
          );
          if (cancelled) return;
          setYuewenWorkCategories(categories);
          const currentCategoryId = form.getFieldValue("yuewen_category_id");
          const currentSubcategoryId = form.getFieldValue("yuewen_subcategory_id");
          const selectedCategory = categories.find((item) => item.category_id === currentCategoryId);
          if (currentCategoryId && !selectedCategory) {
            form.setFieldsValue({
              yuewen_category_id: undefined,
              yuewen_subcategory_id: undefined,
            });
          } else if (
            currentSubcategoryId &&
            !selectedCategory?.subcategories.some((item) => item.subcategory_id === currentSubcategoryId)
          ) {
            form.setFieldValue("yuewen_subcategory_id", undefined);
          }
          setGlobalError("");
        }
      } catch (e: unknown) {
        if (cancelled) return;
        if (platform === "fanqie") {
          setFanqieWorkCategories([]);
          form.setFieldValue("fanqie_category", undefined);
        } else {
          setYuewenWorkCategories([]);
          form.setFieldsValue({
            yuewen_category_id: undefined,
            yuewen_subcategory_id: undefined,
          });
        }
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === "object" && e !== null && "message" in e
              ? String((e as { message: unknown }).message)
              : String(e);
        setGlobalError(`加载主分类失败：${msg}`);
      } finally {
        if (!cancelled) setLoadingWorkCategories(false);
      }
    };

    void loadWorkCategories();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, platform, bookTarget, watchedFanqieGender, watchedYuewenFreetype, form, categoryRetryKey]);

  // 切换到「已有书籍」时拉取书单
  const handleSwitchTarget = async (target: BookTarget) => {
    setBookTarget(target);
    if (target === "existing" && platform && existingBooks.length === 0) {
      await loadExistingBooks(platform);
    }
  };

  const selectedChapters = chapters.filter((c) => selectedIds.has(c.id));

  // ── Step 1: 配置 ──────────────────────────────────────────────────────────

  const handleConfigNext = async () => {
    if (!platform) return;
    if (coverUploading) {
      setGlobalError("封面上传中，请稍候");
      return;
    }
    if (bookTarget === "new") {
      if (platform === "qimao") {
        setGlobalError("七猫当前仅支持在已有已过审书籍下直接发布章节");
        return;
      }
      await form.validateFields(
        platform === "fanqie"
          ? ["fanqie_book_name", "fanqie_abstract", "fanqie_category"]
          : ["yuewen_title", "yuewen_intro", "yuewen_category_id", "yuewen_subcategory_id"],
      );
      savedFormValues.current = form.getFieldsValue();
    } else {
      if (!selectedBookId) {
        setGlobalError("请选择一本已有书籍");
        return;
      }
      setGlobalError("");
    }
    setStep("select");
  };

  const handleCoverSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      setGlobalError("封面仅支持 jpg/jpeg/png 格式");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setGlobalError("封面大小不能超过 5MB");
      return;
    }

    setGlobalError("");
    setCoverUploading(true);
    try {
      const uploaded = await platformService.uploadCover(getPlatformUserId("fanqie"), file);
      setCoverAssetId(uploaded.asset_id);
      setCoverFilename(uploaded.filename);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCoverAssetId("");
      setCoverFilename("");
      setGlobalError(`封面上传失败：${msg}`);
    } finally {
      setCoverUploading(false);
    }
  };

  // ── Step 2: 章节选择 ──────────────────────────────────────────────────────

  const toggleChapter = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === chapters.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(chapters.map((c) => c.id)));
    }
  };

  // ── Step 3: 发布 ─────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!platform || selectedChapters.length === 0) return;
    setGlobalError("");
    setStep("publishing");
    abortRef.current = false;

    const values = savedFormValues.current;
    const userId = getPlatformUserId(platform);

    // 初始化进度列表
    setResults(
      selectedChapters.map((c) => ({
        chapterId: c.id,
        title: c.title,
        status: "pending",
      })),
    );

    // 1. 获取目标 book_id（新建 or 已有）
    let targetBookId = "";
    if (bookTarget === "new") {
      try {
        const bookRes = platform === "fanqie"
          ? await platformService.createBook(platform, userId, {
              book_name: values.fanqie_book_name as string,
              abstract: values.fanqie_abstract as string,
              gender: values.fanqie_gender as 1 | 2,
              category: values.fanqie_category as string,
              cover_asset_id: coverAssetId || undefined,
            })
          : await platformService.createBook(platform, userId, {
              title: values.yuewen_title as string,
              intro: values.yuewen_intro as string,
              category_id: values.yuewen_category_id as string,
              subcategory_id: values.yuewen_subcategory_id as string,
              site: 5,
            });
        if (!bookRes.success) {
          throw new Error(bookRes.message || "创建书籍失败");
        }
        if (!bookRes.book_id) {
          setGlobalError(
            `${bookRes.message || "新书可能已创建成功，但未能自动获取 book_id"}。\n请返回上一步，选择「发布到已有书籍」，刷新书籍列表即可看到新书。`,
          );
          setStep("error");
          return;
        }
        targetBookId = bookRes.book_id;
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === "object" && e !== null && "message" in e
              ? String((e as { message: unknown }).message)
              : String(e);
        setGlobalError(platform === "fanqie"
          ? `创建书籍失败：${msg}。\n提示：番茄小说每天只能新建 1 部作品，如今天已创建过，请返回选择「发布到已有书籍」。`
          : `创建作品失败：${msg}`);
        setStep("error");
        return;
      }
    } else {
      targetBookId = selectedBookId;
    }

    // 2. 计算本次发布的起始章节序号（已有书籍需要续接）
    let startIdx = 0;
    if (platform === "fanqie" && bookTarget === "existing") {
      const book = existingBooks.find((b) => b.book_id === targetBookId);
      startIdx = book && isFanqieBook(book) ? (book.chapter_count ?? 0) : 0;
    }

    // 3. 逐章发布
    for (let i = 0; i < selectedChapters.length; i++) {
      if (abortRef.current) break;

      const ch = selectedChapters[i];
      const chapterNumber = startIdx + i + 1;
      const chapterTitle = platform === "fanqie"
        ? `第${chapterNumber}章 ${stripChapterPrefix(ch.title || "未命名章节")}`
        : (ch.title?.trim() || `第${i + 1}章`);

      setResults((prev) =>
        prev.map((r) =>
          r.chapterId === ch.id ? { ...r, status: "running" } : r,
        ),
      );

      try {
        const res = await platformService.createChapter(platform, userId, {
          book_id: targetBookId,
          title: chapterTitle,
          content: ch.content ?? "",
          auto_publish: mode === "publish",
        });

        setResults((prev) =>
          prev.map((r) =>
            r.chapterId === ch.id
              ? {
                  ...r,
                  status: res.success ? "ok" : "error",
                  msg: res.success ? undefined : res.message,
                }
              : r,
          ),
        );
      } catch (e: unknown) {
        const errMsg = e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
            ? String((e as { message: unknown }).message)
            : String(e);
        setResults((prev) =>
          prev.map((r) =>
            r.chapterId === ch.id
              ? { ...r, status: "error", msg: errMsg }
              : r,
          ),
        );
      }

      if (i < selectedChapters.length - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    if (!abortRef.current) setStep("done");
  };

  const handleClose = () => {
    abortRef.current = true;
    onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────

    const isConnected = platform === "fanqie"
    ? fanqie.isConnected
    : platform === "yuewen"
      ? yuewen.isConnected
      : platform === "qimao"
        ? qimao.isConnected
        : false;
  const currentPlatformLabel = platform ? PLATFORM_LABELS[platform] : "平台";
  const progressStages: Stage[] = ["platform", "config", "select", "publishing"];
  const currentStageIndex = progressStages.indexOf(step);

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      width={520}
      closable={step !== "publishing"}
      maskClosable={step !== "publishing"}
      title={
        <div className="flex items-center gap-2 text-base font-semibold">
          <Upload className="h-4 w-4 text-primary-600" />
          {platform ? `发布到${currentPlatformLabel}` : "发布到平台"}
        </div>
      }
    >
      {step === "platform" ? (
        <div>
          <div className="mb-4">
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              选择发布平台
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              先选择目标平台，再进入该平台的发布配置流程
            </p>
          </div>

          <div className="space-y-3">
            {PLATFORM_OPTIONS.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => handlePlatformSelect(item.type)}
                className="w-full rounded-xl border border-neutral-200 p-4 text-left transition-colors
                  hover:border-primary-300 hover:bg-primary-50/70 dark:border-neutral-700
                  dark:hover:border-primary-700 dark:hover:bg-primary-950/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {PLATFORM_LABELS[item.type]}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                      {item.description}
                    </p>
                  </div>
                  <Tag color="processing" className="m-0">已接入</Tag>
                </div>
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs text-neutral-400">
            后续新增平台时，将在这里统一选择入口。
          </p>
        </div>
      ) : !isConnected ? (
        /* 账号未连接提示 */
        <div className="py-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-warning-400" />
          <p className="font-medium text-neutral-700 dark:text-neutral-300">
            尚未登录{currentPlatformLabel}账号
          </p>
          <p className="mt-1 text-sm text-neutral-400">
            请先在「平台账号」页面登录后再发布
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep("platform")}>
              返回选择平台
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* 步骤指示器 */}
          {step !== "done" && step !== "error" && (
            <div className="mb-5 flex items-center gap-2 text-xs text-neutral-400">
              {progressStages.map((s, idx, arr) => (
                <span key={s} className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                      step === s
                        ? "bg-primary-600 text-white"
                        : currentStageIndex > idx
                          ? "bg-success-500 text-white"
                          : "bg-neutral-200 text-neutral-500 dark:bg-neutral-700"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className={step === s ? "text-primary-600 font-medium" : ""}>
                    {s === "platform"
                      ? "选择平台"
                      : s === "config"
                        ? "书籍配置"
                        : s === "select"
                          ? "选择章节"
                          : "发布中"}
                  </span>
                  {idx < arr.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-neutral-300" />
                  )}
                </span>
              ))}
            </div>
          )}

          {/* ── Step 1: 书籍配置 ── */}
          {step === "config" && (
            <div>
              {/* 新建 / 已有书籍 切换 */}
              <div className="mb-4 flex rounded-lg border border-neutral-200 p-1 dark:border-neutral-700">
                {((platform === "qimao" ? ["existing"] : ["new", "existing"]) as BookTarget[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleSwitchTarget(t)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
                      bookTarget === t
                        ? "bg-primary-600 text-white shadow-sm"
                        : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                    }`}
                  >
                    {t === "new" ? (
                      <><Plus className="h-3.5 w-3.5" />新建书籍</>
                    ) : (
                      <><BookOpen className="h-3.5 w-3.5" />发布到已有书籍</>
                    )}
                  </button>
                ))}
              </div>

              {platform === "qimao" && (
                <div className="mb-4 rounded-lg bg-primary-50 px-3 py-2 text-xs leading-5 text-primary-700 dark:bg-primary-950/20 dark:text-primary-300">
                  七猫当前仅支持向已有已过审书籍直接发布章节，列表中只展示检测到可直接发布权限的作品。
                </div>
              )}

              {/* 新建书籍表单 */}
              {bookTarget === "new" && (
                <Form form={form} layout="vertical" size="middle">
                  {platform === "fanqie" ? (
                    <>
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                        className="hidden"
                        onChange={handleCoverSelect}
                      />
                      <Form.Item
                        label="书名"
                        name="fanqie_book_name"
                        rules={[{ required: true, message: "请输入书名" }]}
                      >
                        <Input placeholder="书名" />
                      </Form.Item>
                      <Form.Item
                        label="简介"
                        name="fanqie_abstract"
                        rules={[
                          { required: true, message: "请输入简介" },
                          { min: 50, message: "番茄小说要求简介不少于 50 字" },
                        ]}
                      >
                        <Input.TextArea rows={3} showCount maxLength={500} placeholder="请输入 50-500 字的作品简介…" />
                      </Form.Item>
                      <div className="grid grid-cols-2 gap-3">
                        <Form.Item label="频道" name="fanqie_gender">
                          <Select options={[{ value: 1, label: "男频" }, { value: 2, label: "女频" }]} />
                        </Form.Item>
                        <Form.Item
                          label="主分类"
                          name="fanqie_category"
                          rules={[{ required: true, message: "请选择主分类" }]}
                        >
                          <Select
                            loading={loadingWorkCategories}
                            placeholder={loadingWorkCategories ? "加载主分类中…" : "请选择主分类"}
                            options={fanqieWorkCategories.map((item) => ({ value: item.name, label: item.name }))}
                            onOpenChange={(open) => {
                              if (open && !loadingWorkCategories && fanqieWorkCategories.length === 0) {
                                retryLoadCategories();
                              }
                            }}
                            notFoundContent={
                              loadingWorkCategories ? (
                                <Spin size="small" />
                              ) : (
                                <div className="flex flex-col items-center gap-2 py-2">
                                  <span className="text-xs text-neutral-400">暂无可选分类</span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={retryLoadCategories}
                                  >
                                    重试加载
                                  </Button>
                                </div>
                              )
                            }
                          />
                        </Form.Item>
                      </div>
                      <Form.Item label="封面图">
                        <div className="rounded-lg border border-dashed border-neutral-300 p-3 dark:border-neutral-700">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                                {coverFilename || "未上传封面"}
                              </p>
                              <p className="mt-1 text-xs text-neutral-400">
                                支持 jpg/jpeg/png，大小不超过 5MB
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              {coverFilename && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setCoverAssetId("");
                                    setCoverFilename("");
                                  }}
                                >
                                  移除
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={coverUploading}
                                onClick={() => coverInputRef.current?.click()}
                              >
                                <Upload className="h-3.5 w-3.5" />
                                {coverUploading ? "上传中…" : coverFilename ? "重新上传" : "选择封面"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Form.Item>
                    </>
                  ) : (
                    <>
                      <Form.Item
                        label="作品名"
                        name="yuewen_title"
                        rules={[{ required: true, message: "请输入作品名" }]}
                      >
                        <Input placeholder="作品名" />
                      </Form.Item>
                      <Form.Item
                        label="简介"
                        name="yuewen_intro"
                        rules={[{ required: true, message: "请输入简介" }]}
                      >
                        <Input.TextArea rows={3} placeholder="用于创建阅文作品的简介…" />
                      </Form.Item>
                      <div className="grid grid-cols-2 gap-3">
                        <Form.Item label="频道" name="yuewen_freetype">
                          <Select options={[{ value: "1", label: "男频" }, { value: "2", label: "女频" }]} />
                        </Form.Item>
                        <Form.Item
                          label="主分类"
                          name="yuewen_category_id"
                          rules={[{ required: true, message: "请选择主分类" }]}
                        >
                          <Select
                            loading={loadingWorkCategories}
                            placeholder={loadingWorkCategories ? "加载主分类中…" : "请选择主分类"}
                            options={yuewenWorkCategories.map((item) => ({
                              value: item.category_id,
                              label: item.category_name,
                            }))}
                            onChange={() => {
                              form.setFieldValue("yuewen_subcategory_id", undefined);
                            }}
                            onOpenChange={(open) => {
                              if (open && !loadingWorkCategories && yuewenWorkCategories.length === 0) {
                                retryLoadCategories();
                              }
                            }}
                          />
                        </Form.Item>
                      </div>
                      <Form.Item
                        label="子分类"
                        name="yuewen_subcategory_id"
                        rules={[{ required: true, message: "请选择子分类" }]}
                      >
                        <Select
                          disabled={!selectedYuewenCategory}
                          placeholder={selectedYuewenCategory ? "请选择子分类" : "请先选择主分类"}
                          options={(selectedYuewenCategory?.subcategories ?? []).map((item) => ({
                            value: item.subcategory_id,
                            label: item.subcategory_name,
                          }))}
                        />
                      </Form.Item>
                    </>
                  )}
                  <Form.Item label="发布模式" className="mb-0">
                    <div className="flex gap-3">
                      {(["publish", "draft"] as PublishMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMode(m)}
                          className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                            mode === m
                              ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-400"
                              : "border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-neutral-700"
                          }`}
                        >
                          {m === "publish" ? "直接发布" : "保存草稿"}
                        </button>
                      ))}
                    </div>
                  </Form.Item>
                  {globalError && (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="flex-1 text-xs text-danger-500">{globalError}</p>
                      {globalError.includes("加载主分类失败") && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={loadingWorkCategories}
                          onClick={retryLoadCategories}
                        >
                          重试
                        </Button>
                      )}
                      {globalError === "未获取到主分类，请重试" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={loadingWorkCategories}
                          onClick={retryLoadCategories}
                        >
                          重试
                        </Button>
                      )}
                    </div>
                  )}
                </Form>
              )}

              {/* 已有书籍选择 */}
              {bookTarget === "existing" && (
                <div>
                  {loadingBooks ? (
                    <div className="flex h-32 items-center justify-center">
                      <Spin tip="加载书单…" />
                    </div>
                  ) : existingBooks.length === 0 ? (
                    <div className="flex h-32 flex-col items-center justify-center gap-2 text-neutral-400">
                      <BookOpen className="h-8 w-8 opacity-40" />
                      <p className="text-sm">暂无书籍，请先在{currentPlatformLabel}创作平台创建</p>
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                      {existingBooks.map((book) => {
                        const isCompleted = platform ? isCompletedBook(platform, book) : false;
                        const isSelected = selectedBookId === book.book_id;
                        const title = getBookTitle(book);
                        const statusText = platform ? getBookStatus(platform, book) : "未知状态";
                        return (
                          <button
                            key={book.book_id}
                            type="button"
                            disabled={isCompleted}
                            onClick={() => !isCompleted && setSelectedBookId(book.book_id)}
                            className={`flex w-full items-center gap-3 border-b border-neutral-100 px-3 py-2.5 text-left transition-colors last:border-0
                              dark:border-neutral-800
                              ${isCompleted
                                ? "cursor-not-allowed opacity-40"
                                : isSelected
                                  ? "bg-primary-50 dark:bg-primary-950/30"
                                  : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                              }`}
                          >
                            <div
                              className={`h-4 w-4 flex-shrink-0 rounded-full border-2 transition-colors ${
                                isSelected && !isCompleted
                                  ? "border-primary-600 bg-primary-600"
                                  : "border-neutral-300"
                              }`}
                            />
                            <span className="flex-1 truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
                              {title}
                            </span>
                            {platform === "fanqie" && isFanqieBook(book) && (
                              <span className="flex-shrink-0 text-xs text-neutral-400">
                                {book.chapter_count ?? 0}章
                              </span>
                            )}
                            {platform === "qimao" && isQimaoBook(book) && book.client_name && (
                              <span className="flex-shrink-0 text-xs text-neutral-400">
                                {book.client_name}
                              </span>
                            )}
                            <Tag
                              color={isCompleted ? "default" : "processing"}
                              className="flex-shrink-0 text-xs"
                            >
                              {statusText}
                            </Tag>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 已有书籍时也可以选发布模式 */}
                  <div className="mt-3 flex gap-3">
                    {((platform === "qimao" ? ["publish"] : ["publish", "draft"]) as PublishMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                          mode === m
                            ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-400"
                            : "border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-neutral-700"
                        }`}
                      >
                        {m === "publish" ? "直接发布" : "保存草稿"}
                      </button>
                    ))}
                  </div>

                  {globalError && (
                    <p className="mt-2 text-xs text-danger-500">{globalError}</p>
                  )}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("platform")}>
                  上一步
                </Button>
                <Button
                  size="sm"
                  disabled={
                    (bookTarget === "new" && (loadingWorkCategories || coverUploading)) ||
                    (bookTarget === "existing" && existingBooks.length === 0 && !loadingBooks) ||
                    !platform
                  }
                  onClick={handleConfigNext}
                >
                  下一步
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: 章节选择 ── */}
          {step === "select" && (
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-neutral-500">选择要发布的章节</span>
                <button
                  onClick={toggleAll}
                  className="text-primary-600 hover:underline text-xs"
                >
                  {selectedIds.size === chapters.length ? "取消全选" : "全选"}
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                {chapters.map((ch, idx) => (
                  <label
                    key={ch.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-neutral-100
                      px-3 py-2.5 transition-colors last:border-0
                      hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
                  >
                    <Checkbox
                      checked={selectedIds.has(ch.id)}
                      onChange={() => toggleChapter(ch.id)}
                    />
                    <span className="min-w-[2rem] text-xs text-neutral-400">
                      第{idx + 1}章
                    </span>
                    <span className="flex-1 truncate text-sm text-neutral-700 dark:text-neutral-300">
                      {ch.title}
                    </span>
                    {ch.content ? (
                      <span className="text-xs text-neutral-400">
                        {ch.content.length}字
                      </span>
                    ) : (
                      <Tag color="warning" className="text-xs">无正文</Tag>
                    )}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                已选 {selectedIds.size} / {chapters.length} 章
              </p>
              <div className="mt-4 flex justify-between gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("config")}>
                  上一步
                </Button>
                <Button
                  size="sm"
                  disabled={selectedIds.size === 0}
                  onClick={handlePublish}
                >
                  <SendHorizonal className="h-3.5 w-3.5" />
                  开始发布
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: 发布进度 ── */}
          {step === "publishing" && (
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                正在发布，请勿关闭窗口…
              </div>
              {globalError && (
                <div className="mb-3 rounded-lg bg-danger-50 p-3 text-sm text-danger-600 dark:bg-danger-900/20">
                  {globalError}
                </div>
              )}
              <ChapterProgressList results={results} />
            </div>
          )}

          {/* ── 完成 ── */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle2 className="h-12 w-12 text-success-500" />
              <div className="text-center">
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                  发布完成
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  {results.filter((r) => r.status === "ok").length} 章成功，
                  {results.filter((r) => r.status === "error").length} 章失败
                </p>
              </div>
              <ChapterProgressList results={results} />
              <Button className="w-full" onClick={handleClose}>
                关闭
              </Button>
            </div>
          )}

          {/* ── 错误 ── */}
          {step === "error" && (
            <div className="py-4 text-center">
              <AlertCircle className="mx-auto mb-3 h-10 w-10 text-danger-500" />
              <p className="font-medium text-neutral-700 dark:text-neutral-300">
                发布失败
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-danger-500">{globalError}</p>
              <div className="mt-5 flex flex-col items-center gap-2">
                {bookTarget === "new" && (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setStep("config");
                      handleSwitchTarget("existing");
                    }}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    改为发布到已有书籍
                  </Button>
                )}
                <div className="flex gap-3">
                  <Button variant="outline" size="sm" onClick={handleClose}>
                    关闭
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setStep("config")}>
                    重新配置
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ── 章节进度列表子组件 ────────────────────────────────────────────────────────

function ChapterProgressList({ results }: { results: ChapterResult[] }) {
  if (results.length === 0) return null;

  return (
    <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
      {results.map((r) => (
        <div
          key={r.chapterId}
          className="flex items-center gap-3 border-b border-neutral-100 px-3 py-2.5
            last:border-0 dark:border-neutral-800"
        >
          <StatusIcon status={r.status} />
          <span className="flex-1 truncate text-sm text-neutral-700 dark:text-neutral-300">
            {r.title}
          </span>
          {r.msg && (
            <span className="max-w-[140px] truncate text-xs text-danger-500" title={r.msg}>
              {r.msg}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusIcon({ status }: { status: ChapterResult["status"] }) {
  if (status === "pending")
    return <span className="h-4 w-4 rounded-full border-2 border-neutral-200" />;
  if (status === "running")
    return <Loader2 className="h-4 w-4 animate-spin text-primary-500" />;
  if (status === "ok")
    return <CheckCircle2 className="h-4 w-4 text-success-500" />;
  return <AlertCircle className="h-4 w-4 text-danger-500" />;
}
