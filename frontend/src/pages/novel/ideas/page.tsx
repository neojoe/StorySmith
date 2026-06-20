import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Select } from "antd";
import { Bot, Copy, Lightbulb, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { AgentChatPanel } from "@/components/novel/agent-chat-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/hooks/use-feedback";
import { useIdeaChat } from "@/hooks/use-idea-chat";
import { novelService } from "@/services/novel-service";
import { NOVEL_GENRES, GENRE_NAME_MAP } from "@/constants/novel-genres";

const IDEA_SECTION_ALIASES = {
  direction: ["故事方向"],
  synopsis: ["故事梗概", "剧情梗概"],
  titles: ["书名候选", "标题候选"],
  prompt: ["创作输入", "可直接用于创作", "可直接复制", "可复制", "故事创作输入要点"],
} as const;

type IdeaSectionKey = keyof typeof IDEA_SECTION_ALIASES;

function detectIdeaHeading(line: string): { key: IdeaSectionKey; inline: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  for (const [key, aliases] of Object.entries(IDEA_SECTION_ALIASES) as Array<[IdeaSectionKey, readonly string[]]>) {
    for (const alias of aliases) {
      const markdownMatch = trimmed.match(new RegExp(`^#{1,6}\\s*${alias}\\s*$`));
      if (markdownMatch) {
        return { key, inline: "" };
      }

      const fullWidthMatch = trimmed.match(new RegExp(`^【${alias}】\\s*(.*)$`));
      if (fullWidthMatch) {
        return { key, inline: fullWidthMatch[1]?.trim() ?? "" };
      }

      const squareBracketMatch = trimmed.match(new RegExp(`^\\[${alias}\\]\\s*(.*)$`));
      if (squareBracketMatch) {
        return { key, inline: squareBracketMatch[1]?.trim() ?? "" };
      }

      const colonMatch = trimmed.match(new RegExp(`^${alias}[：:]\\s*(.*)$`));
      if (colonMatch) {
        return { key, inline: colonMatch[1]?.trim() ?? "" };
      }
    }
  }

  return null;
}

function extractLatestIdeaPayload(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const sections: Record<IdeaSectionKey, string[]> = {
    direction: [],
    synopsis: [],
    titles: [],
    prompt: [],
  };

  let currentKey: IdeaSectionKey | null = null;
  for (const line of normalized.split("\n")) {
    const heading = detectIdeaHeading(line);
    if (heading) {
      currentKey = heading.key;
      if (heading.inline) {
        sections[currentKey].push(heading.inline);
      }
      continue;
    }

    if (currentKey) {
      sections[currentKey].push(line);
    }
  }

  const payload = {
    direction: sections.direction.join("\n").trim(),
    synopsis: sections.synopsis.join("\n").trim(),
    titles: sections.titles.join("\n").trim(),
    prompt: sections.prompt.join("\n").trim(),
  };

  if (!payload.direction && !payload.synopsis && !payload.titles && !payload.prompt && normalized) {
    payload.direction = normalized;
  }

  return {
    direction: payload.direction,
    synopsis: payload.synopsis,
    titles: payload.titles,
    prompt: payload.prompt,
  };
}

function ResultCard({
  title,
  value,
  onCopy,
}: {
  title: string;
  value: string;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">{title}</CardTitle>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onCopy(value, title)}
          disabled={!value.trim()}
          className="h-7 gap-1 text-xs"
        >
          <Copy className="h-3.5 w-3.5" />
          复制
        </Button>
      </CardHeader>
      <CardContent>
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-neutral-700 dark:text-neutral-200">
          {value.trim() || "等待生成…"}
        </div>
      </CardContent>
    </Card>
  );
}

export function NovelIdeasPage() {
  const navigate = useNavigate();
  const feedback = useFeedback();
  const [searchParams] = useSearchParams();
  const existingSid = searchParams.get("sid");

  const [sessionId, setSessionId] = useState<string | null>(existingSid);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState("orientalImmortal");
  const [bootPrompt, setBootPrompt] = useState("");

  const {
    messages,
    isSending,
    sendMessage,
    stop,
    appendAssistantMessage,
  } = useIdeaChat(sessionId);

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((msg) => msg.role === "assistant" && msg.content.trim()),
    [messages],
  );
  const latestIdea = useMemo(
    () => extractLatestIdeaPayload(lastAssistant?.content ?? ""),
    [lastAssistant?.content],
  );

  const handleCopy = async (text: string, label: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      feedback.success("复制成功", `已复制${label}。`);
    } catch {
      feedback.error("复制失败", "浏览器未能完成复制，请手动选择后复制。");
    }
  };

  const handleSeedSend = async () => {
    const text = bootPrompt.trim();
    if (!text || isSending || isCreatingSession) return;

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      setIsCreatingSession(true);
      try {
        const session = await novelService.createIdeaSession({ user_id: "default" });
        activeSessionId = session.id;
        setSessionId(session.id);
        navigate(`/novel/ideas?sid=${session.id}`, { replace: true });
      } catch {
        appendAssistantMessage("连接失败，请刷新页面重试。");
        setIsCreatingSession(false);
        return;
      }
      setIsCreatingSession(false);
    }

    const genreName = GENRE_NAME_MAP[selectedGenre] ?? selectedGenre;
    const firstPrompt = [
      "请基于以下信息生成开书灵感：",
      `- 作品分类：${genreName}`,
      `- 作品描述：${text}`,
      "- 必须严格使用这 4 个标题输出：`【故事方向】`、`【故事梗概】`、`【书名候选】`、`【创作输入】`。",
      "- 不要输出“使用建议”“补充说明”“可复制”等额外标题。",
      "- `【创作输入】` 里请给出一段能直接交给小说创作 Agent 的完整输入。",
      "- 全部使用简体中文，避免英文策划术语。",
      "- 偏网文风格，要有强冲突、强悬念、强传播感。",
    ].join("\n");

    setBootPrompt("");
    await sendMessage(firstPrompt, activeSessionId);
  };

  const quickActions = [
    { label: "来一版故事方向", prompt: "请来一版新的开书灵感，并严格按【故事方向】【故事梗概】【书名候选】【创作输入】4 个标题输出。" },
    { label: "更强冲突", prompt: "在上一版基础上，把核心冲突、背叛感和反转感再加强一版，并严格按【故事方向】【故事梗概】【书名候选】【创作输入】输出。" },
    { label: "更有爽感", prompt: "在上一版基础上，把逆袭感、打脸感和传播感再加强一版，并严格按【故事方向】【故事梗概】【书名候选】【创作输入】输出。" },
    { label: "重新生成", prompt: "请完全换一个新方向，重新生成，并严格按【故事方向】【故事梗概】【书名候选】【创作输入】输出，不要增加其它标题。" },
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600">
            <Lightbulb className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">AI 灵感</p>
            <p className="text-xs text-neutral-400">
              {isCreatingSession ? "初始化中…" : sessionId ? `会话 ${sessionId.slice(0, 8)}…` : "准备中"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/novel")} className="h-7 text-xs">
            返回小说工厂
          </Button>
        </div>
      </div>

      <div className="grid flex-1 overflow-hidden lg:grid-cols-[minmax(0,1.25fr)_420px]">
        <div className="flex min-h-0 flex-col overflow-hidden border-r border-neutral-200 dark:border-neutral-700">
          {!sessionId && (
            <div className="flex flex-1 items-center justify-center p-6">
              <Card className="w-full max-w-2xl">
                <CardHeader>
                  <CardTitle className="text-lg">开始生成灵感</CardTitle>
                  <p className="text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                    先选一个作品分类，再写下你的故事想法。只有在你点击按钮后，系统才会创建会话并开始生成。
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">作品分类</p>
                    <Select
                      value={selectedGenre}
                      onChange={setSelectedGenre}
                      size="large"
                      showSearch
                      className="w-full"
                      popupMatchSelectWidth={false}
                      placeholder="请选择作品分类"
                      optionFilterProp="label"
                      options={NOVEL_GENRES.map((genre) => ({
                        value: genre.key,
                        label: genre.name,
                      }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">作品描述</p>
                    <textarea
                      value={bootPrompt}
                      onChange={(e) => setBootPrompt(e.target.value)}
                      rows={7}
                      placeholder="输入内容越详细，生成的故事越完整。例如：主角本是王朝嫡皇子，一夜宫变后坠崖逃生，与敌国公主从相互试探到隐秘结盟，最终复国反杀。"
                      className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                    />
                    <div className="flex items-center justify-between text-xs text-neutral-400">
                      <span>内容仅供创作参考，请自行甄别和调整。</span>
                      <span>{bootPrompt.length}/500</span>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSeedSend} disabled={!bootPrompt.trim() || isCreatingSession} className="gap-2">
                      {isCreatingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      生成灵感
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {sessionId && (
            <>
              <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-neutral-700 dark:bg-neutral-900">
                <div className="grid gap-3">
                  <Input
                    label="先丢一个模糊想法"
                    placeholder="例如：架空乱世，皇子复国，敌国公主假背叛，权谋反杀"
                    value={bootPrompt}
                    onChange={(e) => setBootPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSeedSend()}
                    hint="这里适合一句话方向、题材关键词、主角设定、你想要的风格。"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSeedSend} disabled={!bootPrompt.trim() || isSending} className="gap-2">
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      继续生成
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setBootPrompt("架空乱世，皇子复国，敌国公主假背叛，后期还有更大幕后黑手，整体要强钩子、强反转、强爽感。")}
                      disabled={isSending}
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      填入示例
                    </Button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1">
                <AgentChatPanel
                  sessionId={sessionId}
                  messages={messages}
                  isSending={isSending}
                  onSend={sendMessage}
                  onStop={stop}
                  title="灵感对话"
                  subtitle="对话式迭代故事方向、梗概与书名，支持多轮重写"
                  quickActions={quickActions}
                  placeholder="继续告诉我你想强化什么，比如：更黑暗、更爽、更偏权谋、更像番茄爆款…"
                />
              </div>
            </>
          )}
        </div>

        <div className="min-h-0 overflow-y-auto bg-neutral-50 p-4 dark:bg-neutral-950/30">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary-500" />
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">本轮结果提取</p>
          </div>

          <div className="grid gap-4">
            <ResultCard title="故事方向" value={latestIdea.direction} onCopy={handleCopy} />
            <ResultCard title="故事梗概" value={latestIdea.synopsis} onCopy={handleCopy} />
            <ResultCard title="书名候选" value={latestIdea.titles} onCopy={handleCopy} />
            <ResultCard title="创作输入" value={latestIdea.prompt} onCopy={handleCopy} />

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">使用建议</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                <p>这里不会自动带入创作页，先保持独立使用。</p>
                <p>你可以直接复制“创作输入”，再手动粘贴到 `AI Agent 创作` 或 `自定义创作`。</p>
                <p>如果想继续迭代，就在左侧直接追问，比如“把女主改成敌国女将”“结局更虐一点”。</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
