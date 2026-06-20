"""Novel genre prompt templates.

Synthesises the best ideas from three reference projects:
- AI-automatically-generates-novels: 12-genre templates, variable system, ###fenge chapter separator
- MuMuAINovel: character consistency hints, foreshadow notes
- AI_NovelGenerator: structured / typed output guidance

Each genre provides three-tier prompts (outline / chapters / content) plus
a list of right-click optimisation operations.  Variable placeholders follow
the ${varname} convention used by the original projects.
"""
from __future__ import annotations

import html as html_stdlib
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional


# ── Data model ─────────────────────────────────────────────────────────────────

@dataclass
class GenreTemplate:
    key: str
    name: str
    outline_prompt: str
    chapter_prompt: str
    content_prompt: str
    optimize_operations: List[str] = field(default_factory=list)


# ── System prompts shared across all genres ────────────────────────────────────

LANGUAGE_STYLE_RULES = (
    "语言要求：统一使用简体中文，不要使用繁体中文，不要夹杂 long arc、character arc、hook、payoff、"
    "foreshadowing 等英文策划术语；正文、梗概、设定里也不要夹杂任何英文单词、英文短语或其它外语碎片；"
    "如需表达，必须改写为中文，如“长期主线 / 人物成长线 / 章末钩子 / 伏笔回收 / 伏笔”。"
)

BOOK_TITLE_RULES = (
    "书名要求：如果需要生成书名，必须使用单个主标题，不要写成“主标题：副标题”或“xx-xx”结构；"
    "不要带“书名：”“标题：”这类前缀，不要加书名号；尽量控制在 4 到 12 个字之间；"
    "标题要有吸引力、记忆点和传播感，优先体现冲突、命运、身份反转、危机、权谋、悬念等钩子；"
    "避免使用“归途、开始、新生、序章、终局、余波”这类过泛、过虚或像副标题的词。"
)


def normalize_novel_language(text: str) -> str:
    """Lightly normalize stored novel text to simplified-Chinese-friendly wording."""
    import re

    if not text:
        return ""

    normalized = str(text)

    trad_to_simplified = str.maketrans({
        "體": "体",
        "綱": "纲",
        "總": "总",
        "結": "结",
        "構": "构",
        "風": "风",
        "對": "对",
        "話": "话",
        "續": "续",
        "書": "书",
        "國": "国",
        "門": "门",
        "開": "开",
        "戰": "战",
        "後": "后",
        "為": "为",
        "與": "与",
        "這": "这",
        "個": "个",
        "題": "题",
        "標": "标",
        "轉": "转",
        "鋪": "铺",
        "陳": "陈",
        "懸": "悬",
        "線": "线",
        "綫": "线",
        "劇": "剧",
        "劃": "划",
        "關": "关",
        "係": "系",
        "層": "层",
        "實": "实",
        "節": "节",
        "點": "点",
        "鉤": "钩",
        "雙": "双",
        "語": "语",
        "讀": "读",
        "寫": "写",
        "觸": "触",
        "覺": "觉",
        "愛": "爱",
        "龍": "龙",
        "眾": "众",
        "壓": "压",
    })
    normalized = normalized.translate(trad_to_simplified)

    replacements = [
        (r"\blong\s*arc\b", "长期主线"),
        (r"\bcharacter\s*arc\b", "人物成长线"),
        (r"\bhook\b", "钩子"),
        (r"\bpayoff\b", "伏笔回收"),
        (r"\bforeshadowing\b", "伏笔"),
        (r"\bforeshadow\b", "伏笔"),
        (r"\bplot\s*twist\b", "反转"),
        (r"\bmain\s*line\b", "主线"),
    ]
    for pattern, replacement in replacements:
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)

    structural_replacements = [
        (r"(?im)\bten\s+chapters?\s+outline\s*[:：]\s*", "\n\n章节规划：\n"),
        (r"(?im)\bchapters?\s+outline\s*[:：]\s*", "\n\n章节规划：\n"),
        (r"(?im)\bchapter\s+outline\s*[:：]\s*", "\n\n章节规划：\n"),
    ]
    for pattern, replacement in structural_replacements:
        normalized = re.sub(pattern, replacement, normalized)

    normalized = normalized.replace('""', "")
    normalized = normalized.replace("“”", "")
    normalized = normalized.replace("‘’", "")

    normalized = re.sub(r"[ \t]+\n", "\n", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    normalized = re.sub(r"：\s*\n", "：\n", normalized)

    return normalized


def normalize_project_title(raw: str) -> str:
    """Normalize generated project titles into a single attractive main title."""
    import re

    title = normalize_novel_language(raw or "").strip()
    if not title:
        return ""

    title = title.splitlines()[0].strip()
    title = re.sub(r"^\s*(书名|标题|小说名)\s*[：:]\s*", "", title)
    title = title.strip("《》\"'“”‘’[]()（） ")

    parts = [
        p.strip("《》\"'“”‘’[]()（） ")
        for p in re.split(r"\s*[：:｜|／/]\s*", title)
        if p.strip("《》\"'“”‘’[]()（） ")
    ]
    if not parts:
        parts = [title]

    generic_words = {"归途", "开始", "新生", "序章", "终章", "终局", "余波", "前传", "后记"}
    hook_chars = set("乱劫火局命血夜诡逆王帝战杀权谋局城狱天坠焰")

    def _score(part: str) -> int:
        compact = re.sub(r"\s+", "", part)
        score = 0
        length = len(compact)
        if 4 <= length <= 8:
            score += 6
        elif 2 <= length <= 12:
            score += 3
        else:
            score -= 2
        if compact in generic_words:
            score -= 8
        score += sum(1 for ch in compact if ch in hook_chars) * 2
        if re.search(r"(之|令|录|局|劫|乱|夜|城|狱|火|命|战|谋|王|帝)", compact):
            score += 2
        if re.search(r"(第.+[章卷部]|序章|终章)", compact):
            score -= 6
        return score

    best = max(parts, key=_score)
    best = re.sub(r"\s+", "", best)
    best = best.strip("《》\"'“”‘’[]()（） ")
    best = re.sub(r"[：:｜|／/].*$", "", best)
    return best[:16].strip()

SYSTEM_OUTLINE = (
    "你是一位资深网络小说策划专家，擅长构建吸引人的故事架构。\n"
    "回复要求：结构清晰、冲突突出、人物立体、伏笔合理。直接输出大纲内容，不要多余说明。\n"
    f"{LANGUAGE_STYLE_RULES}\n"
    f"{BOOK_TITLE_RULES}"
)

SYSTEM_CHAPTERS = (
    "你是一位专业网络小说章节策划。请将大纲拆分为章节列表。\n\n"
    f"{LANGUAGE_STYLE_RULES}\n\n"
    "【严格格式要求】\n"
    "0. 章节数量必须严格符合要求，不允许偷懒只写 1 章或少量样例章\n"
    "1. 每章之间必须用 ###fenge 单独一行分隔，格式完全固定，不能有任何变体\n"
    "2. 每章第一行是纯文本章节标题，例如：雨夜重生、撕碎羞辱、她主动靠近\n"
    "   ⚠️ 标题行绝对不能使用 # 开头的 markdown 格式\n"
    "   ⚠️ 标题不要带“第1章 / 第一章 / Chapter 1”这类章节序号前缀，系统会单独显示章号\n"
    "   ⚠️ 标题要有吸引力、冲突感或钩子感，避免“重生归来、故事开始、新的生活”这类过于平直的泛标题\n"
    "3. 标题后面换行，写该章节的核心剧情概要（100~200字）\n"
    "4. 不要输出任何序言、解释、总结，只输出章节内容\n\n"
    "正确示例（严格遵循此格式）：\n"
    "雨夜重生\n"
    "本章概要内容...\n"
    "###fenge\n"
    "撕碎羞辱\n"
    "本章概要内容...\n"
    "###fenge\n"
    "她主动靠近\n"
    "本章概要内容..."
)

SYSTEM_CONTENT = """\
你是一位深耕网络文学十年的签约作家，专写让读者停不下来的爽文正文。

━━━ 【零、输出规则】 ━━━
只输出正文内容本身，不要输出任何额外包装信息，包括但不限于：
- 不要输出章节标题
- 不要输出“第一章/第1章/Chapter 1”
- 不要输出摘要、分隔线、导语、说明、总结
- 不要输出引用块、元信息块、目录样式内容
- 统一使用简体中文，不要使用繁体中文
- 不要夹杂 long arc、character arc、hook、payoff 等英文策划术语
- 不要夹杂任何英文单词、英文短语、英文感叹词、拉丁字母缩写或其它外语碎片；整章正文必须是自然、完整、可直接阅读的中文
- 像 inked、streaked、Chapter、boss、hint、OK、hello、bye 这类英文内容都禁止出现；如果脑中先浮现英文表达，必须先翻译成中文再写出
- 正文必须是可直接阅读的中文叙事：段落之间用空行分隔；禁止输出 HTML/XML（如 <p>、<div>、<span>）、禁止 Markdown 代码围栏（```）包裹正文、禁止输出 &lt; &gt; 这类转义标签字符串

━━━ 【一、字数与结构】 ━━━
每章 2000～3000 字。全章必须包含至少：
 · 3 处以上人物对话（附神情/动作细节，不能只有台词）
 · 2 处内心独白或心理活动（展示主角真实想法、盘算、情绪波动）
 · 1 处感官细节（视觉/听觉/嗅觉/触觉/温度 任选，让场景可感知）
 · 1 个章末钩子（悬念、反转、意外、或下一章的引子，让读者翻页）

━━━ 【二、写作核心 — 用场景说话，不用报告叙述】 ━━━
⚠️ 最重要的原则：写"正在发生的场景"，而不是"对发生事情的总结"。

✅ 正确示例（沉浸感）：
  陆衡把账本翻到最后一页，食指沿着数字一格一格划过去。
  灯光昏黄，算盘珠子碰出的声音在空屋子里显得格外清晰。
  他深吸一口气，抬头，对面的林清宁正用一双平静的眼睛看他。
  "钱够了，"她说，"但不是你想的那种够。"

❌ 错误示例（报告感）：
  他先从日用品、口粮类的小额货物做起，最初的利润来自错配的供需与快速的周转。
  这种做法虽然利润微薄，但建立了稳定的现金流基础。

关键区别：✅ 用具体动作、对话、细节呈现；❌ 用概括性语句总结事件。

━━━ 【三、人物写法 — 立体有温度】 ━━━
① 主角要有内心独白：
   展示他/她在想什么、判断什么、担心什么——哪怕只是一两句心里话
   例：（他没说出口，但心里已经把这个人的底细摸了个大概。）

② 对话要有性格，不能人人说话一个腔调：
   强势的人说话简短有力；紧张的人说话带停顿；深算的人话里有弦外之音

③ 配角要有存在感：
   每个出场的配角都要有一个独特的细节——一个习惯动作、一句口癖、一个表情

━━━ 【四、节奏控制 — 张弛有度】 ━━━
句级节奏：
 · 紧张/冲突场景：短句，每句 5～15 字，段落 2～3 行
 · 铺垫/环境描写：长句，细节丰富，节奏舒缓
 · 关键转折前：突然用一个极短句单独成段（三到五个字）强调节奏断点

章级节奏（爽文节奏公式，写每章时判断当前位置）：
 · 每 1-2 章：小打脸（碾压小角色、获得小收获、小突破）
 · 每 3-5 章：中打脸（击败阶段性对手、突破等级瓶颈）
 · 每 8-12 章：大高潮（翻转局势、揭示真相、大规模碾压）
 · 每 15-20 章：卷终决战（解决卷级矛盾、主角阶段性质变）

━━━ 【五、上下文衔接】 ━━━
如果提供了前情内容：
① 本章开头必须与上章结尾无缝衔接，不能跳跃或矛盾
② 上一章的悬念或伏笔本章必须有推进或呼应
③ 人物称谓、关系、状态前后一致

━━━ 【六、禁止列表（AI痕迹）】 ━━━
禁用词：此外、至关重要、彰显、增强、培养、格局（抽象用法）、宝贵的、充满活力的、开创性的
禁用句式：
 · "这不仅是…更是…" → 直接说核心
 · "象征着/彰显了/反映了…" → 删除，让读者自己感受
 · "未来充满希望" → 用具体情节结尾
 · 三项并列排比 → 改为两项
 · 过度破折号（—）→ 改用逗号或句号
 · 不要写“章末，”“chapter 的尾声”“本章来到尾声”这类作者总结口吻或元叙事标签
 · 不要写“正在被重新喂养”“被重新定义”“命运被重新定义”这类空泛翻译腔
 · 不要用“尾声”直接告诉读者结尾到了，要用场景自然收束

直接输出正文，不加任何说明或标题。\
"""

SYSTEM_OPTIMIZE = (
    "你是一位专业的网络小说润色专家。请对用户提供的文本进行优化改写。"
    "只输出改写后的文本，不要输出任何说明或前缀。"
    "输出为连续中文正文，段落用换行分隔；不要输出 HTML 标签、不要 Markdown 代码围栏。"
)

# 专用于"去AI味"操作的 humanizer 规则集（基于 humanizer-zh 项目）
SYSTEM_HUMANIZE = (
    "你是一位文字编辑，专门识别和去除AI生成文本的痕迹，使文字更自然、更有人味。\n\n"
    "【5条核心原则】\n"
    "1. 删除填充短语 — 去掉开场白和强调性拐杖词\n"
    "2. 打破公式结构 — 避免二元对比、戏剧性分段、修辞性设置\n"
    "3. 变化节奏 — 混合句子长度。两项优于三项。段落结尾要多样化\n"
    "4. 信任读者 — 直接陈述事实，跳过软化、辩解和手把手引导\n"
    "5. 删金句 — 如果听起来像可引用的语句，重写它\n\n"
    "【必须消除的AI模式】\n"
    "▸ 内容模式\n"
    "  · 夸大意义：'作为…的证明''标志着…关键时刻''彰显了其重要性' → 改为具体陈述\n"
    "  · 宣传性语言：'充满活力的''令人叹为观止的''宝贵的体验' → 改为具体细节\n"
    "  · 模糊归因：'专家认为''观察者指出''行业报告显示' → 给出具体来源或删除\n"
    "  · 句末-ing式分析：'象征着/彰显了/反映了/确保了…' → 直接删除\n"
    "  · 通用积极结论：'未来充满希望''激动人心的时代' → 改为具体计划或情节\n\n"
    "▸ 语言/语法模式\n"
    "  · 禁用AI高频词：此外、至关重要、深入探讨、彰显、持久的、增强、培养、\n"
    "    突出（动词）、格局（抽象）、关键性的、展示、宝贵的、充满活力的\n"
    "  · 否定式排比：'不仅仅是…而是…' → 直接说核心\n"
    "  · 三段式排比：'紧张、激烈、充满张力' → 改为两项或四项\n"
    "  · 刻意换词：同一人物/事物在相邻句用不同词指称 → 保持统一称谓\n"
    "  · 过度破折号（—）→ 改用逗号或句号\n\n"
    "▸ 风格模式\n"
    "  · 不必要的粗体 → 删除格式标记\n"
    "  · 表情符号 → 删除\n\n"
    "【注入灵魂 — 让文字鲜活】\n"
    "  · 有观点：不要只报告事实，让叙述者对事件有反应\n"
    "  · 变化节奏：短促的句子。然后是需要时间展开的长句\n"
    "  · 承认复杂性：人物有复杂感受，不要非黑即白\n"
    "  · 对感受要具体：不是'这令人担忧'，而是描述具体的担忧场景\n\n"
    "处理流程：识别所有问题片段 → 逐一重写 → 保留核心含义和情节 → 只输出改写后的正文，不加任何说明。"
)

# ── Chapter Summary (Smart Context) ───────────────────────────────────────────

SYSTEM_SUMMARIZER = (
    "你是专业的网络小说章节分析师，擅长从章节内容中快速提炼结构化的核心信息。\n"
    "输出要求：\n"
    "1. 严格控制在150字以内\n"
    "2. 覆盖三个维度：关键事件（发生了什么）、人物状态变化（主要变化或决定）、"
    "未解悬念（留下了哪些钩子/伏笔）\n"
    "3. 语言简洁客观，用于AI续写时的上下文参考\n"
    "4. 只输出摘要本身，不要任何前缀或额外说明"
)


def build_summary_prompt(chapter_title: str, content: str) -> str:
    """Build the prompt for generating a chapter's structural summary.

    We truncate the content to 3000 chars to avoid bloated prompts — the
    opening and closing scenes carry most of the plot-relevant information.
    """
    excerpt = content[:3000] if len(content) > 3000 else content
    return (
        f"章节标题：{chapter_title}\n\n"
        f"章节内容：\n{excerpt}\n\n"
        "请提炼本章核心摘要（150字以内），覆盖：\n"
        "1. 关键事件（本章发生了什么重要情节）\n"
        "2. 人物状态（主角/关键配角的变化、决定或情绪转折）\n"
        "3. 未解悬念（本章埋下的伏笔或留白，供后续章节追踪）"
    )


# ── Genre templates ────────────────────────────────────────────────────────────

_GENRES: List[GenreTemplate] = [

    GenreTemplate(
        key="urbanReborn",
        name="都市重生",
        outline_prompt=(
            "作为资深小说策划，请基于以下设定创作一个都市重生故事大纲：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n剧情：${plot}\n"
            "知识库：${knowledge_base}\n\n"
            "要求：\n"
            "1. 设定吸引人的重生契机与主角初始困境\n"
            "2. 规划 3~5 个重大事业/感情转折点\n"
            "3. 设计商战与感情双线并行，互相推进\n"
            "4. 突出重生者的信息优势与打脸节点\n"
            "5. 结局要有爽感，人物成长弧完整"
        ),
        chapter_prompt=(
            "基于以下大纲，将故事拆分为章节列表（共${chapter_count}章左右）：\n\n"
            "${outline}\n\n"
            "每章重点规划：职场布局与人脉积累、感情线推进、商业机遇、敌我力量对比、个人成长节点。\n"
            "每章标题简洁有力，概要突出本章核心爽点。"
        ),
        content_prompt=(
            "基于以下设定和章节大纲，创作本章正文：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n"
            "本章大纲：${chapter_outline}\n知识库：${knowledge_base}\n\n"
            "写作重点（必须体现）：\n"
            "① 商战细节要专业且具体——价格数字、谈判台词、文件细节，让读者信服\n"
            "② 至少一段主角内心独白，展示他的信息优势和心理盘算\n"
            "③ 对话要凸显身份/财富差距——用语气、用词、态度而非直接说明\n"
            "④ 用具体场景呈现情节，不要用概括性叙述代替场景描写\n"
            "⑤ 本章结尾留一个让读者翻章的钩子"
        ),
        optimize_operations=["深化冲突", "增加伏笔", "完善人物动机", "强化感情线",
                              "优化节奏", "扩充细节", "提升高潮", "商战升级", "装逼打脸", "去AI味"],
    ),

    GenreTemplate(
        key="fantasySystem",
        name="玄幻系统修仙",
        outline_prompt=(
            "作为系统修仙文策划，请基于以下设定创作玄幻修仙故事大纲：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n剧情：${plot}\n"
            "知识库：${knowledge_base}\n\n"
            "要求：\n"
            "1. 设定独特的修炼/系统体系，境界划分清晰\n"
            "2. 规划 4~6 个境界突破关键点与大战节点\n"
            "3. 设计系统机缘、奇遇、装逼打脸节点\n"
            "4. 突出主角逆天改命、碾压天才的爽感\n"
            "5. 伏笔合理，反转有力，世界观自洽"
        ),
        chapter_prompt=(
            "基于以下大纲，将故事拆分为章节列表（共${chapter_count}章左右）：\n\n"
            "${outline}\n\n"
            "每章重点规划：系统/修炼推进、奇遇机缘、战斗碾压、势力格局变化、境界突破铺垫。"
        ),
        content_prompt=(
            "基于以下设定和章节大纲，创作本章正文：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n"
            "本章大纲：${chapter_outline}\n知识库：${knowledge_base}\n\n"
            "写作重点（必须体现）：\n"
            "① 战斗/修炼场景用短句和具体动作描写，让读者身临其境，禁止抽象概括\n"
            "② 系统面板以角色视角自然看到，带主角的心理反应（惊喜/淡定/计算）\n"
            "③ 主角对话要有压迫感，配角的反应要具体（表情、动作、声音变化）\n"
            "④ 至少一处感官细节描写（战场气味、灵气波动的感觉、破空声）\n"
            "⑤ 本章结尾留一个让读者翻章的钩子"
        ),
        optimize_operations=["境界突破", "战斗升级", "系统奖励", "增加机缘", "道心考验",
                              "势力对抗", "装逼打脸", "伏笔设计", "强化战斗", "去AI味"],
    ),

    GenreTemplate(
        key="urbanCultivation",
        name="都市修仙",
        outline_prompt=(
            "作为都市修仙策划，请基于以下设定创作都市修仙故事大纲：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n剧情：${plot}\n"
            "知识库：${knowledge_base}\n\n"
            "要求：\n"
            "1. 设定独特修炼体系与都市隐世背景\n"
            "2. 规划修仙与都市生活的双线矛盾与融合\n"
            "3. 设计正邪势力冲突，突出道心考验\n"
            "4. 机缘自然合理，战斗有层次感\n"
            "5. 仙凡矛盾与感情线并行推进"
        ),
        chapter_prompt=(
            "基于以下大纲，将故事拆分为章节列表（共${chapter_count}章左右）：\n\n"
            "${outline}\n\n"
            "每章重点规划：修炼进境、仙凡冲突、机缘获得、敌我力量变化、道心历练。"
        ),
        content_prompt=(
            "基于以下设定和章节大纲，创作本章正文：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n"
            "本章大纲：${chapter_outline}\n知识库：${knowledge_base}\n\n"
            "写作重点（必须体现）：\n"
            "① 仙凡转换要用细节体现，不要直接说明——用普通人看到修仙者时的反应来对比\n"
            "② 修炼感受要具象（经脉的灼热感、灵气如流水、某个穴位忽然通了的瞬间）\n"
            "③ 至少一段主角独白，体现他对仙道/世俗的看法或当下情绪\n"
            "④ 对话要有玄意，不能口水化；动作描写要有质感\n"
            "⑤ 本章结尾留一个让读者翻章的钩子"
        ),
        optimize_operations=["深化修炼", "仙凡冲突", "强化战斗", "增添机缘",
                              "道心考验", "势力对抗", "法宝炼制", "感情升华", "去AI味"],
    ),

    GenreTemplate(
        key="dominantCEO",
        name="霸总",
        outline_prompt=(
            "作为霸总文策划，请基于以下设定创作都市霸总故事大纲：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n剧情：${plot}\n"
            "知识库：${knowledge_base}\n\n"
            "要求：\n"
            "1. 设定强大商业帝国与隐藏身份背景\n"
            "2. 规划 3~5 个关键商战与感情危机节点\n"
            "3. 设计权势与爱情双线，豪门恩怨纠葛\n"
            "4. 霸总人设立体：强势外表下的深情与脆弱\n"
            "5. 结局圆满，虐恋有度，商战胜利"
        ),
        chapter_prompt=(
            "基于以下大纲，将故事拆分为章节列表（共${chapter_count}章左右）：\n\n"
            "${outline}\n\n"
            "每章重点规划：商业布局、感情纠葛推进、权力较量升级、家族势力变化、个人成长体现。"
        ),
        content_prompt=(
            "基于以下设定和章节大纲，创作本章正文：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n"
            "本章大纲：${chapter_outline}\n知识库：${knowledge_base}\n\n"
            "写作重点（必须体现）：\n"
            "① 霸总的强势用行动而非台词体现——他如何进房间、如何看人、手势、沉默\n"
            "② 感情描写要细腻：眼神接触、心跳、不自觉的小动作，比直接说爱意更动人\n"
            "③ 豪门场景要有具体细节（陈设、气味、服饰材质），而不是笼统的'奢华'\n"
            "④ 对话要有权力张力——谁占主导，谁让步，谁藏着话\n"
            "⑤ 本章结尾留一个让读者翻章的钩子"
        ),
        optimize_operations=["商业布局", "豪门对抗", "霸道追爱", "家族纷争",
                              "商战反转", "感情危机", "身世之谜", "复仇布局", "强化气场", "去AI味"],
    ),

    GenreTemplate(
        key="apocalypticSystem",
        name="末日系统",
        outline_prompt=(
            "作为末日系统文策划，请基于以下设定创作末日生存故事大纲：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n剧情：${plot}\n"
            "知识库：${knowledge_base}\n\n"
            "要求：\n"
            "1. 设定独特末日背景与系统规则\n"
            "2. 规划 4~6 个关键生存/进化节点\n"
            "3. 设计系统成长线与末日生存双线\n"
            "4. 突出主角危机应对智慧与系统优势\n"
            "5. 团队建设与势力扩张有层次感"
        ),
        chapter_prompt=(
            "基于以下大纲，将故事拆分为章节列表（共${chapter_count}章左右）：\n\n"
            "${outline}\n\n"
            "每章重点规划：系统任务、生存危机、进化突破、资源争夺、势力冲突。"
        ),
        content_prompt=(
            "基于以下设定和章节大纲，创作本章正文：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n"
            "本章大纲：${chapter_outline}\n知识库：${knowledge_base}\n\n"
            "写作重点（必须体现）：\n"
            "① 末日氛围靠细节：腐烂的气味、废弃建筑的声音、人群眼神中的恐惧和怀疑\n"
            "② 危机要用实时场景描写，不要总结——读者应该跟主角同步体验紧迫感\n"
            "③ 系统提示要带主角的实时反应（心跳加速/冷静分析/惊喜），不能只贴数据\n"
            "④ 生存决策要展示主角思维过程（快速内心盘算，两三句即可）\n"
            "⑤ 本章结尾留一个让读者翻章的钩子"
        ),
        optimize_operations=["系统升级", "危机升级", "资源争夺", "进化突破",
                              "团队建设", "怪物狩猎", "势力冲突", "末日探索", "去AI味"],
    ),

    GenreTemplate(
        key="invincibleHero",
        name="无敌流",
        outline_prompt=(
            "作为无敌文策划，请基于以下设定创作无敌流故事大纲：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n剧情：${plot}\n"
            "知识库：${knowledge_base}\n\n"
            "要求：\n"
            "1. 设定独特的强大体系，主角起点极强或快速暴强\n"
            "2. 规划 4~6 个实力暴涨与碾压节点\n"
            "3. 设计装逼打脸、底牌释放的爽感节点\n"
            "4. 塑造无敌气质：淡然从容，睥睨天下\n"
            "5. 即使无敌也要有情感/使命驱动"
        ),
        chapter_prompt=(
            "基于以下大纲，将故事拆分为章节列表（共${chapter_count}章左右）：\n\n"
            "${outline}\n\n"
            "每章重点规划：实力展示方式、碾压对手过程、底牌释放时机、强者态度塑造、无敌气质体现。"
        ),
        content_prompt=(
            "基于以下设定和章节大纲，创作本章正文：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n"
            "本章大纲：${chapter_outline}\n知识库：${knowledge_base}\n\n"
            "写作重点（必须体现）：\n"
            "① 主角的强大要让旁观者反应来烘托——震惊、颤抖、沉默、退步的配角比战斗描写更有冲击力\n"
            "② 装逼打脸要有铺垫：先让对方嚣张，再用一个细节反转，最后主角淡然\n"
            "③ 主角台词要惜字如金——话越少越有压迫感\n"
            "④ 战斗用短句快节奏；等待/压制场景用一两个长句慢镜头\n"
            "⑤ 本章结尾留一个让读者翻章的钩子"
        ),
        optimize_operations=["实力暴涨", "强者碾压", "底牌尽出", "势力臣服",
                              "装逼打脸", "霸道镇压", "威压全场", "称霸天下", "去AI味"],
    ),

    GenreTemplate(
        key="orientalFantasy",
        name="东方玄幻",
        outline_prompt=(
            "作为东方玄幻策划，请基于以下设定创作东方玄幻故事大纲：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n剧情：${plot}\n"
            "知识库：${knowledge_base}\n\n"
            "要求：\n"
            "1. 设定融合东方美学的独特修炼体系\n"
            "2. 规划大境界划分与天道演变\n"
            "3. 设计问道求索与争锋双线\n"
            "4. 突出东方文化底蕴：天道、因果、轮回\n"
            "5. 史诗感强，格局宏大，意境优美"
        ),
        chapter_prompt=(
            "基于以下大纲，将故事拆分为章节列表（共${chapter_count}章左右）：\n\n"
            "${outline}\n\n"
            "每章重点规划：修炼体系展现、东方元素融入、势力格局变化、天地大道感悟、史诗级战斗。"
        ),
        content_prompt=(
            "基于以下设定和章节大纲，创作本章正文：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n"
            "本章大纲：${chapter_outline}\n知识库：${knowledge_base}\n\n"
            "写作重点（必须体现）：\n"
            "① 东方意境要用具体意象表达，而非堆砌形容词（枯叶、残剑、一句半截的诗更胜'磅礴大气'）\n"
            "② 大道感悟要通过一个具体触发事件引发，不能凭空顿悟\n"
            "③ 至少一段主角内心的道心活动或对天地的感知\n"
            "④ 对话要有古意和意境，引用或化用古诗词意象加分\n"
            "⑤ 本章结尾留一个让读者翻章的钩子"
        ),
        optimize_operations=["问道天地", "神通大战", "势力争锋", "仙缘机遇",
                              "大道感悟", "天劫考验", "因果轮回", "天道变化", "去AI味"],
    ),

    GenreTemplate(
        key="regretFlow",
        name="后悔流",
        outline_prompt=(
            "作为后悔流策划，请基于以下设定创作催泪后悔文故事大纲：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n剧情：${plot}\n"
            "知识库：${knowledge_base}\n\n"
            "要求：\n"
            "1. 设定令人心痛的核心遗憾点，强化情感冲击\n"
            "2. 规划 3~5 个愧疚升级与弥补节点\n"
            "3. 设计情感与救赎双线\n"
            "4. 细腻的心理描写与催泪场景\n"
            "5. 结局留有余味，或圆满或遗憾，情感真挚"
        ),
        chapter_prompt=(
            "基于以下大纲，将故事拆分为章节列表（共${chapter_count}章左右）：\n\n"
            "${outline}\n\n"
            "每章重点规划：情感创伤体现、愧疚心理、挽回行动、心理状态变化、救赎节点。"
        ),
        content_prompt=(
            "基于以下设定和章节大纲，创作本章正文：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n"
            "本章大纲：${chapter_outline}\n知识库：${knowledge_base}\n\n"
            "写作重点（必须体现）：\n"
            "① 后悔/愧疚不要直接说，用具体细节体现（他摸着那件没来得及送出的礼物…）\n"
            "② 情感爆发前要有铺垫，用克制的行为描写积累情绪，让爆发更有力量\n"
            "③ 对话要有留白——有些话说了一半，有些泪水没提，读者自己填\n"
            "④ 至少一处记忆闪回，用对比加深现在的遗憾\n"
            "⑤ 本章结尾留一个让读者翻章的钩子"
        ),
        optimize_operations=["深化后悔", "愧疚折磨", "情感爆发", "心理转变",
                              "记忆闪回", "救赎时刻", "原谅契机", "情感修复", "去AI味"],
    ),

    GenreTemplate(
        key="alternateHistory",
        name="历史架空",
        outline_prompt=(
            "作为历史架空策划，请基于以下设定创作架空历史故事大纲：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n剧情：${plot}\n"
            "知识库：${knowledge_base}\n\n"
            "要求：\n"
            "1. 设定合理的历史分歧点，建立自洽世界观\n"
            "2. 规划 3~5 个历史走向改变的关键节点\n"
            "3. 设计权谋与民生变革双线\n"
            "4. 历史细节考究，政治博弈精妙\n"
            "5. 主角借历史先知优势运筹帷幄"
        ),
        chapter_prompt=(
            "基于以下大纲，将故事拆分为章节列表（共${chapter_count}章左右）：\n\n"
            "${outline}\n\n"
            "每章重点规划：历史背景还原、政治博弈、军事战略、民生变革、历史走向改变。"
        ),
        content_prompt=(
            "基于以下设定和章节大纲，创作本章正文：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n"
            "本章大纲：${chapter_outline}\n知识库：${knowledge_base}\n\n"
            "写作重点（必须体现）：\n"
            "① 历史细节要具体真实——官制、礼仪、器物、食物，任一细节的准确都能建立信任感\n"
            "② 权谋要用行动体现，不要直接写'他心思深沉'，要写他做了什么\n"
            "③ 主角的先知优势通过具体预判体现（他知道三个月后这个人会…所以现在…）\n"
            "④ 对话符合时代语境，人物有各自的立场和隐藏议程\n"
            "⑤ 本章结尾留一个让读者翻章的钩子"
        ),
        optimize_operations=["历史转折", "权谋博弈", "军事战略", "变法改革",
                              "外交较量", "科技革新", "势力消长", "历史影响", "去AI味"],
    ),

    GenreTemplate(
        key="brainHole",
        name="脑洞网文",
        outline_prompt=(
            "作为脑洞文策划，请基于以下设定创作天马行空的故事大纲：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n剧情：${plot}\n"
            "知识库：${knowledge_base}\n\n"
            "要求：\n"
            "1. 设定独特到令人拍案叫绝的世界观\n"
            "2. 规划 3~5 个惊人创意梗点和颠覆性反转\n"
            "3. 逻辑自洽，细节自圆其说\n"
            "4. 人物特异，反套路但合情理\n"
            "5. 让读者惊呼'还能这样写！'"
        ),
        chapter_prompt=(
            "基于以下大纲，将故事拆分为章节列表（共${chapter_count}章左右）：\n\n"
            "${outline}\n\n"
            "每章重点规划：创意点展现、逻辑自洽性、反转设计感、人物特异性、世界新奇感。"
        ),
        content_prompt=(
            "基于以下设定和章节大纲，创作本章正文：\n"
            "背景：${background}\n人物：${characters}\n关系：${relationships}\n"
            "本章大纲：${chapter_outline}\n知识库：${knowledge_base}\n\n"
            "写作重点（必须体现）：\n"
            "① 脑洞要通过角色的具体反应和行动体现，而不是大段世界观说明\n"
            "② 每次创意梗出现时，先让读者有一拍懵，再解释——顺序很重要\n"
            "③ 逻辑自洽要通过细节埋下：之前出现过的设定，在此处收回来用\n"
            "④ 人物反应要夸张但合理，配角的惊讶/迷惑/接受过程要写出来\n"
            "⑤ 本章结尾必须有一个让读者拍桌子的反转或悬念"
        ),
        optimize_operations=["设定解密", "逆天改命", "脑洞升级", "身份反转",
                              "规则突破", "时空交错", "终极真相", "崩坏重构", "去AI味"],
    ),
]

# ── Public API ─────────────────────────────────────────────────────────────────

_GENRE_MAP: Dict[str, GenreTemplate] = {g.key: g for g in _GENRES}


def list_genres() -> List[GenreTemplate]:
    return list(_GENRES)


def get_genre(key: str) -> GenreTemplate:
    """Return genre template by key, falling back to first genre."""
    return _GENRE_MAP.get(key, _GENRES[0])


def substitute_variables(prompt: str, project: dict,
                         chapter: Optional[dict] = None,
                         extra: Optional[dict] = None) -> str:
    """Replace ${varname} placeholders with actual project / chapter values."""
    vars_: dict = {
        "protagonist_name": project.get("protagonist_name", ""),
        "background":    project.get("background", ""),
        "characters":    project.get("characters", ""),
        "relationships": project.get("relationships", ""),
        "plot":          project.get("plot", ""),
        "style":         project.get("style", ""),
        "outline":       project.get("outline", ""),
        "knowledge_base": project.get("knowledge_base", ""),
        "target_chapter_count": str(project.get("target_chapter_count", 10)),
        "min_chapter_word_count": str(project.get("min_chapter_word_count", 2000)),
    }
    if chapter:
        vars_["chapter_outline"] = chapter.get("outline", "")
        vars_["chapter_title"]   = chapter.get("title", "")
    if extra:
        vars_.update(extra)
    for k, v in vars_.items():
        prompt = prompt.replace(f"${{{k}}}", v)
    return prompt


def build_outline_prompt(project: dict, custom_prompt: Optional[str] = None) -> str:
    """Build the outline generation prompt."""
    genre = get_genre(project.get("genre", "urbanReborn"))
    base = custom_prompt or project.get("outline_prompt") or genre.outline_prompt
    return substitute_variables(base, project) + f"\n\n补充硬性要求：{LANGUAGE_STYLE_RULES}"


def build_chapter_prompt(project: dict, chapter_count: int = 10,
                         custom_prompt: Optional[str] = None) -> str:
    """Build the chapter-list generation prompt."""
    genre = get_genre(project.get("genre", "urbanReborn"))
    base = custom_prompt or project.get("chapter_prompt") or genre.chapter_prompt
    filled = substitute_variables(base, project, extra={"chapter_count": str(chapter_count)})
    return (
        filled
        + f"\n\n补充硬性要求：{LANGUAGE_STYLE_RULES}"
        + f"\n- 本次必须输出恰好 {chapter_count} 章完整章节规划，不能只给 1 章示例或若干样例章。"
    )


def build_content_prompt(project: dict, chapter: dict,
                         custom_prompt: Optional[str] = None,
                         prev_chapter: Optional[dict] = None,
                         all_prev_summaries: Optional[List[dict]] = None,
                         min_word_count: Optional[int] = None) -> str:
    """Build the chapter-content generation prompt.

    Context injection layers (ordered from broad to narrow):

    1. 【智能上文追踪】— Compact structural summaries of ALL previous chapters.
       Gives the LLM a full-story bird's-eye view: who did what, which plot
       threads are active, what foreshadowing has been laid.

    2. 【前情衔接】— The immediately preceding chapter's outline + last ~400 chars
       of prose for seamless scene-level continuity.
    """
    genre = get_genre(project.get("genre", "urbanReborn"))
    base = custom_prompt or project.get("content_prompt") or genre.content_prompt
    prompt = substitute_variables(
        base,
        project,
        chapter=chapter,
        extra={"min_chapter_word_count": str(min_word_count or project.get("min_chapter_word_count", 2000))},
    )
    prompt += f"\n\n【语言硬性要求】\n{LANGUAGE_STYLE_RULES}"
    prompt += (
        "\n- 本章正文必须全篇只使用简体中文，不允许夹杂任何英文单词、英文短语、英文拟声、"
        "拉丁字母缩写或其它外语碎片。"
        "\n- 一旦想到 inked、streaked、Chapter、boss、hint、OK 之类英文表达，必须先翻译成自然中文，再继续写作。"
    )

    target_words = int(min_word_count or project.get("min_chapter_word_count", 2000) or 2000)
    prompt += (
        "\n\n【篇幅要求】\n"
        f"- 本章正文最终不少于 {target_words} 字\n"
        "- 如果剧情尚未展开充分，不要草草收尾，应继续推进场景、对话、冲突和钩子\n"
        "- 不要为了凑字数空转，必须保持剧情递进和人物状态一致"
    )

    # ── Layer 1: Smart full-history context (summaries of all prior chapters) ──
    if all_prev_summaries:
        summary_lines = ["\n\n【智能上文追踪 — 前情进展全览】"]
        summary_lines.append(
            "（以下是每章核心摘要，用于保持全局一致性、伏笔衔接与人物状态追踪）"
        )
        for s in all_prev_summaries:
            if s.get("summary"):
                summary_lines.append(
                    f"第{s['order_num']}章「{s['title']}」：{s['summary']}"
                )
        if len(summary_lines) > 2:
            prompt += "\n".join(summary_lines)

    # ── Layer 2: Immediate predecessor tail for scene-level continuity ─────────
    if prev_chapter:
        prev_order = prev_chapter.get("order_num", "")
        prev_title = prev_chapter.get("title", "")
        prev_outline = prev_chapter.get("outline", "").strip()
        prev_content = (prev_chapter.get("content") or "").strip()
        prev_tail = prev_content[-400:] if prev_content else ""

        lines = [f"\n\n【前情衔接 — 第{prev_order}章「{prev_title}」】"]
        if prev_outline:
            lines.append(f"上一章大纲：{prev_outline}")
        if prev_tail:
            lines.append(f"\n上一章结尾片段（请从此处自然续接）：\n{prev_tail}")
        lines.append(
            "\n衔接要求：\n"
            "① 本章开头需与上文情境、人物状态无缝衔接，不能出现时间/场景跳跃\n"
            "② 上一章的悬念或伏笔在本章需有明确推进或呼应\n"
            "③ 保持人物性格、称谓、关系前后一致"
        )
        prompt += "\n".join(lines)

    return prompt


def build_optimize_prompt(text: str, operation: str,
                          context: Optional[str] = None) -> str:
    """Build the right-click optimisation prompt."""
    parts = [f"请对以下文本执行「{operation}」操作：\n\n{text}"]
    if context:
        parts.append(f"\n\n参考上下文：\n{context}")
    return "\n".join(parts)


def _clean_chapter_title(raw: str) -> str:
    """Normalize a chapter title for storage/display."""
    import re
    title = normalize_novel_language(re.sub(r"^#+\s*", "", raw).strip())
    title = re.sub(r"^\s*(第\s*[零一二三四五六七八九十百千万\d]+\s*章[：:\s\-、.]*)", "", title)
    title = re.sub(r"^\s*(chapter\s*\d+[\s:：\-、.]*)", "", title, flags=re.I)
    return title.strip()


def strip_content_heading(raw: str, chapter_title: str = "") -> str:
    """Remove auto-generated title/heading/meta lines from chapter body."""
    import re

    text = normalize_novel_language((raw or "").strip())
    if not text:
        return ""

    lines = text.splitlines()

    def _drop_leading_meta(src: list[str]) -> list[str]:
        idx = 0
        while idx < len(src):
            line = src[idx].strip()
            if not line:
                idx += 1
                continue
            if line.startswith(">"):
                idx += 1
                continue
            if re.match(r"^\*\*?(本章概要|本章爽点|情绪曲线|章末钩子)", line):
                idx += 1
                continue
            if re.fullmatch(r"[-—_]{3,}", line):
                idx += 1
                continue
            break
        return src[idx:]

    lines = _drop_leading_meta(lines)
    if not lines:
        return ""

    first = lines[0].strip().lstrip("#").strip()
    normalized_first = _clean_chapter_title(first)
    normalized_title = _clean_chapter_title(chapter_title)

    if normalized_first and (
        normalized_first == normalized_title
        or re.fullmatch(r"第\s*[零一二三四五六七八九十百千万\d]+\s*章.*", first)
        or re.fullmatch(r"chapter\s*\d+.*", first, flags=re.I)
    ):
        lines = lines[1:]
        lines = _drop_leading_meta(lines)

    return "\n".join(lines).strip()


def _looks_like_markup_or_escaped_tags(s: str) -> bool:
    if not s:
        return False
    if "&lt;" in s or "&gt;" in s or "&amp;lt;" in s or "&amp;gt;" in s:
        return True
    # 数字实体形式的尖括号（模型偶发输出 &#60;p&#62;）
    if re.search(r"(?i)&#x3c;|&#60;|&#x3e;|&#62;", s):
        return True
    if re.search(r"</[a-zA-Z][a-z0-9]*\s*>", s):
        return True
    if re.search(r"<p\b", s, re.I) or re.search(r"<div\b", s, re.I):
        return True
    if s.lstrip().startswith("```"):
        return True
    return False


_ENTITY_LIKE_TAG_RX: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(?i)&lt;\s*/?\s*p\s*&gt;"), ""),
    (re.compile(r"(?i)&lt;\s*br\s*[^&]*?&gt;"), "\n"),
    (re.compile(r"(?i)&lt;\s*/\s*div\s*&gt;"), "\n"),
    (re.compile(r"(?i)&lt;\s*div\b[^&]*?&gt;"), "\n"),
    (re.compile(r"(?i)&lt;\s*/\s*span\s*&gt;"), ""),
    (re.compile(r"(?i)&lt;\s*span\b[^&]*?&gt;"), ""),
    # 专门针对用户反复出现的模式：外层真实 <p> 包裹大量 &lt;p&gt;...&lt;/p&gt;&lt;div class=“br“&gt;
    (re.compile(r'(?i)^<p>\s*(?:&lt;[^&>]*&gt;)+'), ""),
    (re.compile(r'(?i)</p>\s*$'), ""),
]


def _strip_entity_spelled_html_tags(t: str) -> str:
    """剥掉以字面量 ``&lt;...&gt;`` 形式出现在正文里的常见 HTML 片段（不依赖先 html.unescape）。
    同时处理用户反复出现的模式：外层 <p> 包裹大量 &lt;p&gt;...&lt;/p&gt;&lt;div class=“br“&gt;"""
    if not t or "&lt;" not in t and "<p>" not in t:
        return t
    for _ in range(12):
        prev = t
        for rx, repl in _ENTITY_LIKE_TAG_RX:
            t = rx.sub(repl, t)
        if t == prev:
            break
    return t.strip()


def _strip_html_tags_to_newlines(t: str) -> str:
    """把常见作家后台 / 模型输出的 HTML 标签换成换行，再剥掉剩余尖括号标签。"""
    if "<" not in t or ">" not in t:
        return t
    t = re.sub(r"(?i)</p\s*>", "\n\n", t)
    t = re.sub(r"(?i)<p\b[^>]*>", "", t)
    t = re.sub(r"(?i)<br\s*/?>", "\n", t)
    # class=br / class = "br " / 含 br 的 div（含空格写法）
    t = re.sub(r"(?i)<div\b[^>]*\bbr\b[^>]*>", "\n", t)
    t = re.sub(r"(?i)</div\s*>", "\n", t)
    t = re.sub(r"(?i)<h[1-6][^>]*>", "\n\n", t)
    t = re.sub(r"(?i)</h[1-6]\s*>", "\n\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    return html_stdlib.unescape(t)


def strip_markup_to_plain_prose(raw: str, *, _depth: int = 0) -> str:
    """将模型/粘贴来源中的 HTML、实体转义、Markdown 围栏等转为库内存储用纯文本。

    存库统一为纯文本 + 换行分段；对外发布（如阅文）再由 ``content_to_editor_html`` 转 HTML。
    """
    t = (raw or "").strip()
    if not t:
        return ""

    t = t.translate(
        str.maketrans(
            {
                "\u201c": '"',
                "\u201d": '"',
                "\u2018": "'",
                "\u2019": "'",
                "\uff1c": "<",
                "\uff1e": ">",
            }
        )
    )

    if t.lstrip().startswith("```"):
        first = t.find("\n")
        last = t.rfind("```")
        if first != -1 and last > first:
            t = t[first + 1 : last].strip()

    # 先剥字面量 ``&lt;...&gt;``，避免与外层真实 ``<p>`` 交错时偶发残留
    t = _strip_entity_spelled_html_tags(t)

    if not _looks_like_markup_or_escaped_tags(t):
        return t

    # 实体可能套多层，反复 decode 直到稳定
    for _ in range(12):
        nxt = html_stdlib.unescape(t)
        if nxt == t:
            break
        t = nxt.strip()

    t = _strip_entity_spelled_html_tags(t)

    # 剥标签；若仍像 HTML/实体（偶发残留），再跑 1～2 轮
    for _ in range(4):
        if "<" in t and ">" in t:
            t = _strip_html_tags_to_newlines(t)
        if "&lt;" in t or "&amp;lt;" in t:
            t = html_stdlib.unescape(t).strip()
        else:
            break

    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    out = t.strip()

    # 套娃 / 半解码残留：最多再收束两轮（避免与「a < b」误判：仍由 _looks_like 约束）
    if _depth < 2 and _looks_like_markup_or_escaped_tags(out):
        return strip_markup_to_plain_prose(out, _depth=_depth + 1)
    return out


def finalize_chapter_storage_text(raw: str, chapter_title: str = "") -> str:
    """章节正文入库前统一管线：语言规范化 → 剥离 HTML/实体 → 去标题行 → 去元叙事套话。"""
    t = normalize_novel_language((raw or "").strip())
    t = strip_markup_to_plain_prose(t)
    t = strip_content_heading(t, chapter_title)
    return clean_generated_prose(t)


def clean_generated_prose(raw: str) -> str:
    """Remove obvious meta narration and translation artifacts from chapter prose."""
    import re

    text = normalize_novel_language((raw or "").strip())
    if not text:
        return ""

    prefix_patterns = [
        r"(?im)(^|\n)\s*章末[，,：:\s]*",
        r"(?im)(^|\n)\s*本章(?:来到)?尾声[，,：:\s]*",
        r"(?im)(^|\n)\s*(?:chapter|本chapter|这一chapter|此chapter)\s*(?:的)?(?:尾声|结尾)[，,：:\s]*",
        r"(?im)(^|\n)\s*(?:这一章|此章)(?:的)?(?:尾声|结尾)[，,：:\s]*",
    ]
    for pattern in prefix_patterns:
        text = re.sub(pattern, r"\1", text)

    replacements = [
        ("正在被重新喂养", "正在被重新唤醒"),
        ("被重新喂养", "被重新唤醒"),
    ]
    for old, new in replacements:
        text = text.replace(old, new)

    text = re.sub(r"(?i)\bchapter\b", "章节", text)
    text = re.sub(r"(?i)\b(?:ok|okay|hello|bye|hi)\b", "", text)
    text = re.sub(r"(?<![A-Za-z])[A-Za-z]+(?:[-'][A-Za-z]+)*(?![A-Za-z])", "", text)
    text = re.sub(r"[ ]{2,}", " ", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _parts_to_chapters(parts: List[str]) -> List[dict]:
    chapters: List[dict] = []
    for i, part in enumerate(parts, start=1):
        lines = part.strip().split("\n", 1)
        title = _clean_chapter_title(lines[0])
        outline = normalize_novel_language(lines[1].strip()) if len(lines) > 1 else ""
        if title:
            chapters.append({"order_num": i, "title": title, "outline": outline})
    return chapters


def parse_chapters(text: str) -> List[dict]:
    """Parse a chapter list produced by the LLM into structured dicts.

    Tries three strategies in order of preference:
    1. ###fenge separator  (canonical format we request)
    2. Markdown headings   (### 第X章 …) — LLMs often ignore the separator rule
    3. Chinese chapter numbers pattern (第X章 …) on their own line
    Returns an empty list only if none of the strategies yield ≥ 2 chapters.
    """
    import re

    text = text.strip()

    # ── Strategy 1: ###fenge ──────────────────────────────────────────────────
    if "###fenge" in text:
        parts = [p.strip() for p in text.split("###fenge") if p.strip()]
        chapters = _parts_to_chapters(parts)
        if len(chapters) >= 2:
            return chapters

    # ── Strategy 2: Markdown heading "### 第X章" ──────────────────────────────
    # Split just before each "### " that starts a chapter heading
    md_parts = re.split(r"(?m)^(?=#{1,3}\s*第)", text)
    md_parts = [p.strip() for p in md_parts if p.strip()]
    if len(md_parts) >= 2:
        return _parts_to_chapters(md_parts)

    # ── Strategy 3: Bare "第X章" line used as chapter break ───────────────────
    bare_parts = re.split(r"(?m)^(?=第[零一二三四五六七八九十百\d]+章)", text)
    bare_parts = [p.strip() for p in bare_parts if p.strip()]
    if len(bare_parts) >= 2:
        return _parts_to_chapters(bare_parts)

    # ── Fallback: treat entire text as a single chapter ───────────────────────
    return _parts_to_chapters([text]) if text else []


# ── AI 反推提示词 (Prompt Reverse-Engineering) ─────────────────────────────────

SYSTEM_SETTINGS_GENERATOR = """\
你是专业的AI网络小说策划师，擅长将用户的创意快速扩展为完整的故事设定。

输出规则：
- 严格输出合法JSON对象，不输出任何额外文字
- 格式：{"protagonist_name": "...", "background": "...", "characters": "...", "relationships": "...", "plot": "...", "style": "..."}
- 所有字段值中不能包含JSON特殊字符（引号用单引号或中文引号替代）

各字段要求：
- protagonist_name（主角名）：2-5个中文字符，适合该题材，便于后续发布到小说平台
- background（世界观/背景）：150-300字，描述时代背景、社会环境、世界规则、核心矛盾
- characters（人物设定）：150-300字，主角和2-3个关键配角的姓名、性格、身份、背景
- relationships（角色关系）：80-150字，主要角色之间的关系网络、亲疏远近、矛盾纠葛
- plot（核心剧情）：150-300字，主线矛盾、主要冲突节点、故事走向、结局预期
- style（写作风格）：50-100字，语言风格、叙事节奏、情感基调、阅读体验
"""


def build_settings_generation_prompt(genre_name: str, concept: str) -> str:
    """Build the user prompt for AI-assisted story settings generation."""
    return (
        f"请为以下【{genre_name}】类型的小说生成完整的故事设定：\n\n"
        f"【故事创意简述】\n{concept}\n\n"
        f"请根据该类型的受众喜好和爽点规律，将这个创意扩展为详细的世界观、人物、关系、剧情和风格设定。\n"
        f"同时生成一个适合作为平台建书信息的主角名。设定要有具体细节，不能空洞。"
    )


def extract_generated_settings(text: str) -> dict:
    """Parse JSON settings from LLM response, stripping code fences if present."""
    import json
    import re

    cleaned = text.strip()
    if "```json" in cleaned:
        m = re.search(r"```json\s*(.*?)```", cleaned, re.DOTALL)
        if m:
            cleaned = m.group(1).strip()
    elif "```" in cleaned:
        m = re.search(r"```\s*(.*?)```", cleaned, re.DOTALL)
        if m:
            cleaned = m.group(1).strip()
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if m:
        cleaned = m.group(0)

    data = json.loads(cleaned)
    keys = ["protagonist_name", "background", "characters", "relationships", "plot", "style"]
    return {k: str(data.get(k, "")) for k in keys}


SYSTEM_PROMPT_ENGINEER = """\
你是顶级AI网络小说提示词工程师，专门为AI大模型设计高转化率的小说生成提示词。

任务：基于用户提供的小说设定，量身定制三层提示词体系。

设计原则：
1. 高度个性化 — 完全契合该小说的具体设定，绝对不能是通用模板
2. 结果驱动 — 明确告诉AI目标、质量标准和爽点设计
3. 使用占位变量 — 在合理位置嵌入以下变量（用 ${} 包裹）：
   ${background}  ${characters}  ${relationships}  ${plot}  ${style}
   ${outline}  ${chapter_outline}  ${knowledge_base}  ${chapter_count}
   ${target_chapter_count}  ${min_chapter_word_count}
4. 类型契合 — 深度结合该类型的读者爽点和行文规律
5. 层次递进 — 大纲宏观把控 → 章节中观规划 → 正文微观落地

严格输出格式（合法JSON，不输出任何额外文字）：
{
  "outline_prompt": "大纲提示词，500-800字",
  "chapter_prompt": "章节提示词，300-500字",
  "content_prompt": "正文提示词，400-600字"
}
"""


def build_prompts_meta_prompt(project: dict) -> str:
    """Build the user prompt for AI-assisted prompt generation.

    Feeds the project's settings to a meta-LLM call that generates
    three customised generation prompts (outline / chapter / content).
    """
    genre = get_genre(project.get("genre", "urbanReborn"))
    lines = [
        f"请为以下小说量身定制专属的三层提示词体系：",
        f"",
        f"【小说类型】{genre.name}",
        f"【世界观/背景】{project.get('background') or '（未填写）'}",
        f"【人物设定】{project.get('characters') or '（未填写）'}",
        f"【角色关系】{project.get('relationships') or '（未填写）'}",
        f"【核心剧情】{project.get('plot') or '（未填写）'}",
        f"【写作风格】{project.get('style') or '（未填写）'}",
        f"【补充知识库】{project.get('knowledge_base') or '（无）'}",
        f"【计划章节数】{project.get('target_chapter_count') or 10}",
        f"【每章最低字数】{project.get('min_chapter_word_count') or 2000}",
        f"",
        f"该类型读者最期待的爽点：{', '.join(genre.optimize_operations[:5])}",
        f"",
        f"请针对以上设定，生成三个高质量、个性化、可直接投入使用的提示词。",
        f"确保提示词中包含 ${{outline}}、${{background}}、${{characters}} 等占位变量。",
    ]
    return "\n".join(lines)


def extract_generated_prompts(text: str) -> dict:
    """Extract the three prompts from the LLM's JSON response.

    Handles markdown code blocks, leading/trailing noise, and partial JSON.
    Returns a dict with keys: outline_prompt, chapter_prompt, content_prompt.
    """
    import json
    import re

    cleaned = text.strip()

    # Strip markdown code fences
    if "```json" in cleaned:
        m = re.search(r"```json\s*(.*?)```", cleaned, re.DOTALL)
        if m:
            cleaned = m.group(1).strip()
    elif "```" in cleaned:
        m = re.search(r"```\s*(.*?)```", cleaned, re.DOTALL)
        if m:
            cleaned = m.group(1).strip()

    # Try to extract the JSON object even if there's surrounding text
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if m:
        cleaned = m.group(0)

    data = json.loads(cleaned)
    return {
        "outline_prompt": str(data.get("outline_prompt", "")),
        "chapter_prompt": str(data.get("chapter_prompt", "")),
        "content_prompt": str(data.get("content_prompt", "")),
    }


