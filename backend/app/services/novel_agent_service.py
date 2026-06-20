"""Novel Agent Service — 基于 novel-generator Skill + LangChain create_agent 的 AI 小说创作服务。

工作空间隔离：
    user_id    = f"{user_id}_{project_id}"
    memory_dir = agent_databases/novel-agent/{user_id}_{project_id}/memory/

.learnings/ 目录结构：
    memory/
    └── .learnings/
        ├── CHARACTERS.md   ← 人物档案
        ├── LOCATIONS.md    ← 地点档案
        ├── PLOT_POINTS.md  ← 情节转折
        ├── STORY_BIBLE.md  ← 世界观设定
        └── ERRORS.md       ← 生成错误日志
"""
from __future__ import annotations

import asyncio
import json
import os as _os
import time
from pathlib import Path
from typing import AsyncGenerator, Optional

from langchain.agents import create_agent
from langchain.agents.middleware import ContextEditingMiddleware
from langgraph.checkpoint.memory import MemorySaver
from loguru import logger

from ..agents.skill_middleware import SkillMiddleware
from ..core.config import get_settings
from .novel_prompts import (
    _clean_chapter_title,
    finalize_chapter_storage_text,
    normalize_novel_language,
    normalize_project_title,
)

# ── 常量 ───────────────────────────────────────────────────────────────────────
_AGENT_NAME = "novel-agent"
_PROJECT_ROOT = Path(
    _os.environ.get("NOVEL_PROJECT_ROOT", "")
).resolve() if _os.environ.get("NOVEL_PROJECT_ROOT") else Path(__file__).resolve().parents[3]
_AGENT_DB_ROOT = _PROJECT_ROOT / "agent_databases"
_SKILL_NAME = "novel-generator"
_SKILL_DIR = _PROJECT_ROOT / ".agents" / "skills" / _SKILL_NAME

# session_id → { agent, config, project_id, user_id, generation_mode }
_active_sessions: dict[str, dict] = {}
_active_task_runners: dict[str, asyncio.Task] = {}


# ── System Prompt ──────────────────────────────────────────────────────────────

def _normalize_generation_mode(mode: str | None) -> str:
    return "full_book" if str(mode or "").strip() == "full_book" else "guided_first_chapter"


def _build_system_prompt(generation_mode: str = "guided_first_chapter") -> str:
    """为小说 Agent 提供 skill 使用约束和本系统工具映射说明。"""
    mode = _normalize_generation_mode(generation_mode)
    mode_rules = """
- 首次收到用户的创作需求时，可以先完成设定补全、大纲、章节规划，但**正文只生成第一章**。
- 不要在首次回复中连续生成第二章及之后的正文。
- 后续章节默认通过与用户的持续交互逐章生成；当用户明确要求“继续下一章/写第N章”时，再生成对应章节正文。
""".strip() if mode == "guided_first_chapter" else """
- 首次收到用户的创作需求时，应先完成设定补全、大纲和章节规划，然后从第一章开始逐章写作。
- 在整本自动模式下，你的目标是配合后台调度把**所有未完成章节**依次写完，而不是只停在第一章。
- 每一轮只专注处理当前目标章节；写完并保存后，再进入下一章。
""".strip()
    return f"""
你是一个专门负责 AI 小说创作的 Agent。

当前任务场景固定为小说策划与写作，因此**优先使用 Skills 机制**，不要自行发明流程。
在开始处理创作任务后，优先读取并遵循 `read_skill("{_SKILL_NAME}")` 的完整说明，
按其中的“提示词完善 → 大纲规划 → 逐章生成 → 记忆维护 → 定稿”流程执行。

## 创作节奏要求

- 当前创作模式：`{mode}`。
{mode_rules}
- 第一章正文和后续章节正文都必须满足项目里配置的最低字数要求；**未达到最低字数时，不算完成**。
- 如果 `save_chapter_content` 返回“尚未达到最低字数”，你必须继续补写**当前这一章**，并再次调用 `save_chapter_content`，直到达标后才能结束当前回合。
- 当某章尚未达到最低字数时，不要向用户说“这一章已经完成”，只能说“正在继续补写”。
- 当用户要求“重新规划章节”时，不要重复追加旧章节；应使用 `save_chapters` 的覆盖能力，全量覆盖或只重排未写章节。
- 当用户要求“补某一章/重写某一章的章节大纲”时，只更新该章节，不要重排整本章节列表；应使用 `save_chapter_outline`。
- 当用户要求“检查一致性/检查连续性”时，先调用只读工具读取项目上下文和相关章节内容，再给出结构化问题清单。
- 除非用户明确要求“直接修复并保存”，否则一致性检查默认先报告问题与建议，不要直接覆盖正文。
- 所有要展示给用户、或保存到数据库的大纲、章节标题、章节概要、正文，统一使用简体中文。
- 调用 `save_chapter_content` 时，`content` 必须是纯中文正文（分段用换行）；禁止 HTML/XML 标签、禁止 Markdown 代码围栏（```）包裹正文、禁止输出 `&lt;p&gt;` 这类转义标签。
- 不要夹杂 long arc、character arc、hook、payoff、foreshadowing 这类英文策划术语，必须改写成中文表达。
- 正文里不允许夹杂任何英文单词、英文短语、拉丁字母缩写或其它外语碎片；即使是气氛描写、比喻、拟声、旁白、心理活动，也必须全部写成自然中文。
- 像 `inked`、`streaked`、`Chapter`、`boss fight`、`OK`、`hint` 这种词，在正文中都视为违规；一旦想到英文表达，必须先翻译成中文再输出。
- 如果要生成书名，必须使用单个主标题，不要使用“主标题：副标题”结构，不要带“书名：”前缀。
- 书名尽量控制在 4 到 12 个字之间，要有吸引力和传播感，优先体现冲突、命运、危机、权谋、身份反转或强悬念。
- 当项目目标章节数是 N 时，章节规划必须覆盖完整目标数量；如果是首次规划，就保存完整的 N 章；如果是保留前文后重排，只保存“剩余应补齐”的章节数，不能只保存 1 章草草结束。

不要依赖长期记忆工具来维护小说设定一致性；本系统的连续性维护以项目数据库和 `.learnings/` 文件为准。

## 本系统专用工具映射

本系统通过以下工具将创作内容直接保存到数据库，**不需要输出到 output/ 文件夹**：

| 工具 | 对应 Skill 阶段 | 说明 |
|------|----------------|------|
| `update_project_info` | 第一步提示词完善后 | 保存书名、类型、背景、人设、角色关系、核心剧情、写作风格、补充知识、计划章节数、每章最低字数等基本设定 |
| `save_outline` | 第二步大纲确认后 | 保存完整的全局大纲（含力量体系、卷章结构） |
| `save_chapters` | 第二步大纲后 | 保存或重排章节列表（标题 + 梗概） |
| `save_chapter_outline` | 单章调整/补章 | 保存某一章的标题与章节大纲，不影响其他章节 |
| `save_chapter_content` | 第三步逐章写作 | 保存每章正文内容 |
| `finalize_novel` | 第五步完成定稿 | 将项目状态标记为「已完成」 |
| `get_project_status` | 任意阶段 | 查看当前项目状态（已保存内容、进度） |
| `read_project_context` | 巡检/续写前 | 读取项目设定、大纲、章节规划、摘要与完成状态 |
| `read_chapter_content` | 单章巡检/续写前 | 读取某一章正文与元数据 |
| `read_chapter_bundle` | 多章巡检/衔接检查 | 批量读取一段章节正文 |

`.learnings/` 记忆文件通过以下工具管理（路径与 SKILL.md 一致）：

| 工具 | 说明 |
|------|------|
| `write_learnings(filename, content)` | 写入/更新 `.learnings/` 中的记忆文件 |
| `read_learnings(filename)` | 读取 `.learnings/` 中的记忆文件 |
| `list_learnings()` | 列出所有记忆文件 |

**重要**：每章写作前先调用 `read_learnings` 读取 CHARACTERS.md、LOCATIONS.md、PLOT_POINTS.md；
每章写作后调用 `write_learnings` 更新对应文件。
"""


# ── Tool builder ───────────────────────────────────────────────────────────────

def _build_tools(project_id: str, memory_dir: Path):
    """创建与项目绑定的数据库操作工具 + .learnings/ 记忆工具。"""
    from langchain_core.tools import tool

    learnings_dir = memory_dir / ".learnings"
    learnings_dir.mkdir(parents=True, exist_ok=True)

    # 从 skill 的 .learnings/ 模板复制初始文件（若不存在）
    skill_learnings = _SKILL_DIR / ".learnings"
    for fname in ["CHARACTERS.md", "LOCATIONS.md", "PLOT_POINTS.md", "STORY_BIBLE.md", "ERRORS.md"]:
        dest = learnings_dir / fname
        if not dest.exists():
            src = skill_learnings / fname
            if src.exists():
                raw = src.read_bytes()
                text = None
                for enc in ("utf-8-sig", "utf-8", "gbk", "gb18030"):
                    try:
                        text = raw.decode(enc)
                        break
                    except (UnicodeDecodeError, LookupError):
                        continue
                dest.write_text(text or "", encoding="utf-8")
            else:
                # 兜底模板
                defaults = {
                    "CHARACTERS.md":  "# 角色档案\n\n记录所有已出场角色的信息，每次生成新章节前必读。\n\n**更新规则**：新角色出场时添加，角色状态变化时更新，角色死亡时标记。\n\n---\n",
                    "LOCATIONS.md":   "# 地点档案\n\n记录所有已出现的地点，每次生成新章节前必读。\n\n**更新规则**：新地点出现时添加。\n\n---\n",
                    "PLOT_POINTS.md": "# 情节转折点\n\n记录所有关键情节，防止前后矛盾。\n\n**更新规则**：关键情节发生后立即记录。\n\n---\n",
                    "STORY_BIBLE.md": "# 世界观设定\n\n记录世界观规则和力量体系，保持设定一致性。\n\n**更新规则**：发现新设定时立即写入。\n\n---\n",
                    "ERRORS.md":      "# 生成错误日志\n\n记录生成过程中出现的问题，用于优化后续创作。\n\n**更新规则**：生成失败、质量不达标、连贯性问题时记录。\n\n---\n",
                }
                dest.write_text(defaults.get(fname, f"# {fname}\n"), encoding="utf-8")

    def _clip(text: str, limit: int) -> str:
        text = str(text or "").strip()
        if len(text) <= limit:
            return text
        return text[:limit].rstrip() + "\n...(已截断)"

    # ── 数据库工具 ──────────────────────────────────────────────────────────────

    @tool
    async def get_project_status() -> str:
        """获取当前小说项目的状态：大纲、章节列表、各章节完成情况。"""
        from ..db import novel_db
        project = await novel_db.get_project(project_id)
        if not project:
            return "项目不存在"
        chapters = await novel_db.get_chapters(project_id)
        min_words = int(project.get("min_chapter_word_count", 2000) or 2000)
        lines = [
            f"**标题**: {project.get('title', '')}",
            f"**类型**: {project.get('genre', '')}",
            f"**状态**: {project.get('status', 'draft')}",
            f"**计划章节数**: {project.get('target_chapter_count', 10)}",
            f"**每章最低字数**: {project.get('min_chapter_word_count', 2000)}",
            f"**大纲**: {'已生成（' + str(len(project.get('outline', ''))) + '字）' if project.get('outline') else '未生成'}",
            f"**章节数**: {len(chapters)}",
        ]
        if chapters:
            lines.append("\n章节列表：")
            for ch in chapters:
                current_words = int(ch.get("word_count", 0) or 0)
                done = "✅" if current_words >= min_words else "⬜"
                lines.append(
                    f"  {done} 第{ch['order_num']}章《{ch['title']}》"
                    f"({current_words}/{min_words}字)"
                )
        return "\n".join(lines)

    @tool
    async def read_project_context(
        include_outline: bool = True,
        include_chapters: bool = True,
        include_summaries: bool = True,
    ) -> str:
        """读取项目核心上下文：基础设定、全局大纲、章节规划、摘要与完成状态。"""
        from ..db import novel_db
        project = await novel_db.get_project(project_id)
        if not project:
            return "项目不存在"
        chapters = await novel_db.get_chapters(project_id)
        min_words = int(project.get("min_chapter_word_count", 2000) or 2000)
        lines = [
            "【项目基础设定】",
            f"标题：{project.get('title', '')}",
            f"类型：{project.get('genre', '')}",
            f"主角名：{project.get('protagonist_name', '') or '（未填写）'}",
            f"背景：{project.get('background', '') or '（未填写）'}",
            f"人物：{project.get('characters', '') or '（未填写）'}",
            f"关系：{project.get('relationships', '') or '（未填写）'}",
            f"核心剧情：{project.get('plot', '') or '（未填写）'}",
            f"写作风格：{project.get('style', '') or '（未填写）'}",
            f"知识库：{project.get('knowledge_base', '') or '（未填写）'}",
            f"计划章节数：{project.get('target_chapter_count', 10)}",
            f"每章最低字数：{min_words}",
            f"项目状态：{project.get('status', 'draft')}",
        ]
        if include_outline:
            outline = str(project.get("outline") or "").strip()
            lines.extend(["", "【全局大纲】", outline if outline else "（尚未生成）"])
        if include_chapters:
            lines.extend(["", "【章节规划与完成状态】"])
            if not chapters:
                lines.append("（暂无章节）")
            else:
                for ch in chapters:
                    current_words = int(ch.get("word_count", 0) or 0)
                    status = "已达标" if current_words >= min_words else "未达标"
                    lines.append(
                        f"第{ch.get('order_num', 0)}章《{ch.get('title', '')}》"
                        f"｜{current_words}/{min_words}字｜{status}"
                    )
                    lines.append(f"概要：{str(ch.get('outline') or '').strip() or '（无）'}")
                    if include_summaries:
                        lines.append(f"摘要：{str(ch.get('summary') or '').strip() or '（无）'}")
                    lines.append("")
        return "\n".join(lines).strip()

    @tool
    async def read_chapter_content(chapter_order: int, max_chars: int = 6000) -> str:
        """读取某一章的正文全文与元数据，可用于检查偏纲、衔接和人物一致性。"""
        from ..db import novel_db
        chapters = await novel_db.get_chapters(project_id)
        target = next((c for c in chapters if int(c.get("order_num", 0) or 0) == chapter_order), None)
        if not target:
            return f"未找到第 {chapter_order} 章。"
        content = _clip(str(target.get("content") or ""), max(1000, min(int(max_chars or 6000), 12000)))
        return "\n".join([
            f"【第{target.get('order_num', 0)}章《{target.get('title', '')}》】",
            f"字数：{int(target.get('word_count', 0) or 0)}",
            f"状态：{target.get('status', 'draft')}",
            f"概要：{str(target.get('outline') or '').strip() or '（无）'}",
            f"摘要：{str(target.get('summary') or '').strip() or '（无）'}",
            "",
            "【正文】",
            content or "（暂无正文）",
        ])

    @tool
    async def read_chapter_bundle(start_order: int, end_order: int, max_chars_per_chapter: int = 4000) -> str:
        """批量读取连续多章内容，适用于检查相邻章节衔接、时间线和人物状态连续性。"""
        from ..db import novel_db
        if end_order < start_order:
            return "参数错误：end_order 不能小于 start_order。"
        chapters = await novel_db.get_chapters(project_id)
        selected = [
            ch for ch in chapters
            if start_order <= int(ch.get("order_num", 0) or 0) <= end_order
        ]
        if not selected:
            return f"未找到第 {start_order} 到第 {end_order} 章。"
        limit = max(800, min(int(max_chars_per_chapter or 4000), 8000))
        blocks = []
        for ch in selected:
            blocks.append("\n".join([
                f"【第{ch.get('order_num', 0)}章《{ch.get('title', '')}》】",
                f"概要：{str(ch.get('outline') or '').strip() or '（无）'}",
                f"摘要：{str(ch.get('summary') or '').strip() or '（无）'}",
                "正文：",
                _clip(str(ch.get('content') or ''), limit) or "（暂无正文）",
            ]))
        return "\n\n".join(blocks)

    @tool
    async def update_project_info(
        title: str = "",
        genre: str = "",
        protagonist_name: str = "",
        background: str = "",
        characters: str = "",
        relationships: str = "",
        plot: str = "",
        style: str = "",
        knowledge_base: str = "",
        target_chapter_count: int = 0,
        min_chapter_word_count: int = 0,
    ) -> str:
        """更新小说项目的基本设定（对应 Skill 第一步提示词完善后调用）。只传入需要修改的字段，其余留空。"""
        from ..db import novel_db
        updates = {}
        if title:      updates["title"] = normalize_project_title(title)
        if genre:      updates["genre"] = genre
        if protagonist_name: updates["protagonist_name"] = normalize_novel_language(protagonist_name).replace("\n", " ").strip()[:20]
        if background: updates["background"] = normalize_novel_language(background)
        if characters: updates["characters"] = normalize_novel_language(characters)
        if relationships: updates["relationships"] = normalize_novel_language(relationships)
        if plot:       updates["plot"] = normalize_novel_language(plot)
        if style:      updates["style"] = normalize_novel_language(style)
        if knowledge_base: updates["knowledge_base"] = normalize_novel_language(knowledge_base)
        if target_chapter_count > 0: updates["target_chapter_count"] = target_chapter_count
        if min_chapter_word_count > 0: updates["min_chapter_word_count"] = min_chapter_word_count
        if not updates:
            return "没有提供任何更新字段"
        await novel_db.update_project(project_id, updates)
        return f"项目基本设定已保存：{list(updates.keys())}"

    @tool
    async def save_outline(outline: str) -> str:
        """将全局大纲保存到项目（对应 Skill 第二步完成后调用）。
        outline: 完整的大纲文本，包含力量体系、卷章结构、关键转折点。"""
        from ..db import novel_db
        normalized_outline = normalize_novel_language(outline)
        await novel_db.update_project(project_id, {"outline": normalized_outline})
        return f"大纲已保存（{len(normalized_outline)} 字）。请继续生成章节列表。"

    @tool
    async def save_chapters(
        chapters_json: str,
        mode: str = "auto",
        start_order: int = 1,
    ) -> str:
        """保存或重排章节列表（对应 Skill 第二步大纲确认后调用）。
        chapters_json: JSON 数组，每项含 title（章节标题）和 outline（本章梗概，100-200字）。
        mode: auto | replace_all | replace_future
        start_order: 当 mode=replace_future 时，表示从第几章开始替换后续章节。
        示例：[{"title": "雨夜重生", "outline": "主角在车祸后重生，回到高中..."}, ...]"""
        from ..db import novel_db
        project = await novel_db.get_project(project_id)
        try:
            items = json.loads(chapters_json)
        except json.JSONDecodeError as e:
            return f"JSON 格式错误：{e}。请确保是合法的 JSON 数组。"
        if not isinstance(items, list):
            return "格式错误：chapters_json 必须是 JSON 数组"
        if not items:
            return "章节列表为空，请至少提供 1 个章节。"
        if mode not in {"auto", "replace_all", "replace_future"}:
            return "mode 仅支持 auto、replace_all、replace_future。"

        normalized_items: list[dict] = []
        for i, item in enumerate(items, 1):
            if not isinstance(item, dict):
                return f"第 {i} 项格式错误：每个章节都必须是对象。"
            raw_title = item.get("title", f"第{i}章")
            clean_title = _clean_chapter_title(str(raw_title)) or f"第{i}节转折"
            normalized_items.append({
                "title": clean_title,
                "outline": normalize_novel_language(str(item.get("outline", ""))),
                "order_num": i,
            })

        existing_chapters = await novel_db.get_chapters(project_id)
        written_orders = [
            int(ch.get("order_num") or 0)
            for ch in existing_chapters
            if str(ch.get("content") or "").strip()
        ]
        target_count = int((project or {}).get("target_chapter_count", len(normalized_items)) or len(normalized_items))

        if mode == "replace_all" or (mode == "auto" and not written_orders):
            if target_count > 0 and len(normalized_items) != target_count:
                return (
                    f"章节数不符合要求：当前项目计划总章节数为 {target_count} 章，"
                    f"但本次只提供了 {len(normalized_items)} 章。"
                    "请重新生成并一次性提供完整章节规划后再调用 save_chapters。"
                )
            await novel_db.replace_chapters(project_id, normalized_items)
            return f"已覆盖保存 {len(normalized_items)} 个章节规划。请按 Skill 第三步「逐章生成」模板开始写作。"

        effective_start = max(1, int(start_order or 1))
        if written_orders:
            effective_start = max(effective_start, max(written_orders) + 1)
        preserved_count = max(0, effective_start - 1)
        expected_future_count = max(0, target_count - preserved_count)
        if expected_future_count > 0 and len(normalized_items) != expected_future_count:
            return (
                f"后续章节数不符合要求：当前项目计划总章节数为 {target_count} 章，"
                f"前 {preserved_count} 章已保留，因此本次应提供剩余 {expected_future_count} 章，"
                f"但实际只提供了 {len(normalized_items)} 章。"
                "请重新生成完整的后续章节规划后再调用 save_chapters。"
            )

        remapped_items = [
            {
                **item,
                "order_num": effective_start + idx,
            }
            for idx, item in enumerate(normalized_items)
        ]
        await novel_db.replace_future_chapters(project_id, effective_start, remapped_items)

        return (
            f"已保留前 {preserved_count} 章，并从第 {effective_start} 章开始重排后续共 "
            f"{len(remapped_items)} 章。请继续按当前章节顺序逐章写作。"
        )

    @tool
    async def save_chapter_outline(chapter_order: int, title: str, outline: str) -> str:
        """保存某一章的标题与章节大纲，不影响其他章节。
        chapter_order: 章节序号（从1开始）。
        title: 更新后的章节标题。
        outline: 更新后的章节大纲/梗概。"""
        from ..db import novel_db
        chapters = await novel_db.get_chapters(project_id)
        target = next((c for c in chapters if int(c.get("order_num", 0) or 0) == chapter_order), None)
        if not target:
            return f"未找到第 {chapter_order} 章，无法保存单章大纲。"
        clean_title = _clean_chapter_title(str(title or "").strip()) or str(target.get("title") or f"第{chapter_order}章")
        outline_text = normalize_novel_language(str(outline or "").strip())
        await novel_db.update_chapter(
            target["id"],
            {
                "title": clean_title,
                "outline": outline_text,
            },
        )
        return f"第 {chapter_order} 章的大纲已保存：标题《{clean_title}》。"

    @tool
    async def save_chapter_content(chapter_order: int, content: str) -> str:
        """保存指定章节的正文内容（对应 Skill 第三步每章写完后调用）。
        chapter_order: 章节序号（从1开始）。content: 章节正文（2000-3000字）。"""
        from ..db import novel_db
        project = await novel_db.get_project(project_id)
        chapters = await novel_db.get_chapters(project_id)
        target = next((c for c in chapters if c.get("order_num") == chapter_order), None)
        if not target:
            return f"未找到第 {chapter_order} 章，请先调用 save_chapters 创建章节列表。"
        min_words = int((project or {}).get("min_chapter_word_count", 2000) or 2000)
        existing_content = str(target.get("content") or "")
        incoming_content = finalize_chapter_storage_text(content, str(target.get("title", "")))

        # 如果 Agent 第二次提交的是“续写片段”而非整章全文，则自动拼接到已暂存内容后面。
        if existing_content.strip():
            existing_prefix = existing_content[:200].strip()
            if incoming_content and existing_prefix and not incoming_content.startswith(existing_prefix):
                merged_content = existing_content.rstrip() + "\n\n" + incoming_content.lstrip()
            else:
                merged_content = incoming_content
        else:
            merged_content = incoming_content

        word_count = len(merged_content)
        reached_target = word_count >= min_words
        await novel_db.update_chapter(
            target["id"],
            {
                "content": merged_content,
                "word_count": word_count,
                "status": "generated" if reached_target else "draft",
            },
        )
        if reached_target:
            return (
                f"第 {chapter_order} 章正文已保存并达标（{word_count}/{min_words} 字）。"
                " 当前章节已完成。记得更新 .learnings/ 记忆文件。"
            )
        return (
            f"第 {chapter_order} 章正文已暂存，但当前仅 {word_count}/{min_words} 字，尚未达到最低字数要求。"
            f"请继续补写**同一章**正文，不要切到下一章；补写完成后再次调用 "
            f"save_chapter_content(chapter_order={chapter_order}, content='新增补写内容')。"
        )

    @tool
    async def finalize_novel() -> str:
        """所有章节写完后调用，完成定稿（对应 Skill 第五步）。"""
        from ..db import novel_db
        await novel_db.update_project(project_id, {"status": "published"})
        return "小说已定稿！项目状态已更新为「已发布」。感谢使用 novel-generator。"

    # ── .learnings/ 记忆工具（与 SKILL.md 第四步记忆管理对应）─────────────────────

    @tool
    def write_learnings(filename: str, content: str) -> str:
        """写入/更新 .learnings/ 记忆文件（对应 Skill 第四步写入时机）。
        filename: CHARACTERS.md / LOCATIONS.md / PLOT_POINTS.md / STORY_BIBLE.md / ERRORS.md。
        content: 完整的文件内容（会覆盖原内容）。"""
        safe_name = Path(filename).name
        fpath = learnings_dir / safe_name
        fpath.write_text(content, encoding="utf-8")
        return f"{safe_name} 已更新（{len(content)} 字）。"

    @tool
    def read_learnings(filename: str) -> str:
        """读取 .learnings/ 记忆文件（每章写作前必须调用）。
        filename: CHARACTERS.md / LOCATIONS.md / PLOT_POINTS.md / STORY_BIBLE.md / ERRORS.md。"""
        safe_name = Path(filename).name
        fpath = learnings_dir / safe_name
        if not fpath.exists():
            return f"{safe_name} 尚未创建。"
        return fpath.read_text(encoding="utf-8")

    @tool
    def list_learnings() -> str:
        """列出 .learnings/ 中的所有记忆文件及大小（可用于确认记忆状态）。"""
        files = list(learnings_dir.glob("*.md"))
        if not files:
            return ".learnings/ 目录为空。"
        lines = [f"- {f.name}（{f.stat().st_size} 字节）" for f in sorted(files)]
        return "\n".join(lines)

    return [
        get_project_status,
        read_project_context,
        read_chapter_content,
        read_chapter_bundle,
        update_project_info,
        save_outline,
        save_chapters,
        save_chapter_outline,
        save_chapter_content,
        finalize_novel,
        write_learnings,
        read_learnings,
        list_learnings,
    ]


# ── Session management ─────────────────────────────────────────────────────────

async def create_session(
    session_id: str,
    project_id: str,
    user_id: str,
    generation_mode: str = "guided_first_chapter",
) -> None:
    """创建并缓存基于 create_agent + SkillMiddleware 的小说 Agent。

    middleware 栈：
        SkillMiddleware        — 注入 read_skill / list_skill_files 工具
        ContextEditingMiddleware — 自动清理旧工具输出，节省 token
    """
    if session_id in _active_sessions:
        return

    combined_uid = f"{user_id}_{project_id}"
    settings = get_settings()

    memory_dir = _AGENT_DB_ROOT / _AGENT_NAME / combined_uid / "memory"
    memory_dir.mkdir(parents=True, exist_ok=True)

    tools = _build_tools(project_id, memory_dir)
    normalized_mode = _normalize_generation_mode(generation_mode)
    system_prompt = _build_system_prompt(normalized_mode)

    from langchain_openai import ChatOpenAI
    novel_api_key = settings.NOVEL_OPENAI_API_KEY or settings.OPENAI_API_KEY
    novel_base_url = settings.NOVEL_OPENAI_BASE_URL or settings.OPENAI_BASE_URL or None
    novel_model = settings.NOVEL_OPENAI_MODEL or "gpt-4o-mini"
    llm = ChatOpenAI(
        model=novel_model,
        api_key=novel_api_key,
        base_url=novel_base_url,
        streaming=True,
    )

    agent = create_agent(
        model=llm,
        tools=tools,
        system_prompt=system_prompt,
        middleware=[
            SkillMiddleware(_PROJECT_ROOT),
            ContextEditingMiddleware(),
        ],
        checkpointer=MemorySaver(),
    )

    config = {"configurable": {"thread_id": session_id}, "recursion_limit": 100}

    _active_sessions[session_id] = {
        "agent": agent,
        "config": config,
        "project_id": project_id,
        "user_id": user_id,
        "generation_mode": normalized_mode,
    }
    logger.info(
        f"Novel agent session created: {session_id} "
        f"→ project={project_id}, skill={_SKILL_NAME}, "
        f"mode={normalized_mode}, workspace={_AGENT_DB_ROOT}/{_AGENT_NAME}/{combined_uid}/"
    )


def get_session(session_id: str) -> Optional[dict]:
    return _active_sessions.get(session_id)


def remove_session(session_id: str) -> None:
    _active_sessions.pop(session_id, None)


async def chat_stream(session_id: str, message: str) -> AsyncGenerator[str, None]:
    """通过 SSE 流式返回 Agent 的回复。"""
    try:
        async for payload in iter_chat_events(session_id, message):
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    except Exception as exc:
        logger.exception(f"Agent stream error for session {session_id}")
        yield f'data: {json.dumps({"type": "error", "message": str(exc)}, ensure_ascii=False)}\n\n'


async def iter_chat_events(session_id: str, message: str) -> AsyncGenerator[dict, None]:
    """迭代 Agent 对话事件，用于 SSE 和后台任务两种模式复用。"""
    session = _active_sessions.get(session_id)
    if not session:
        yield {"type": "error", "message": "会话不存在或已过期，请刷新页面重建会话"}
        return

    agent = session["agent"]
    config = session["config"]

    try:
        seen_tool_ids: set[str] = set()

        async for event in agent.astream_events(
            {"messages": [{"role": "user", "content": message}]},
            config=config,
            version="v2",
        ):
            event_type = event.get("event", "")
            parent_ids = event.get("parent_ids", [])

            if event_type == "on_chat_model_stream":
                metadata = event.get("metadata", {})
                node_name = metadata.get("langgraph_node", "")
                # Only capture tokens from the main "model" node (confirmed from langchain.agents.factory).
                # Excludes any model calls nested inside tools (e.g. memory summarization).
                if node_name == "model" or (not node_name and len(parent_ids) <= 2):
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content"):
                        content = chunk.content
                        if isinstance(content, str):
                            text = content
                        elif isinstance(content, list):
                            text = "".join(
                                b.get("text", "") if isinstance(b, dict) else str(b)
                                for b in content
                            )
                        else:
                            text = ""
                        if text:
                            yield {"type": "token", "content": text}

            elif event_type == "on_tool_start":
                tool_name = event.get("name", "")
                run_id = event.get("run_id", tool_name)
                if run_id not in seen_tool_ids:
                    seen_tool_ids.add(run_id)
                    tool_input = event.get("data", {}).get("input", {})
                    summary = str(tool_input)
                    if len(summary) > 120:
                        summary = summary[:120] + "…"
                    yield {"type": "tool_start", "name": tool_name, "input": summary}

            elif event_type == "on_tool_end":
                tool_name = event.get("name", "")
                output = str(event.get("data", {}).get("output", ""))
                if len(output) > 200:
                    output = output[:200] + "…"
                yield {"type": "tool_end", "name": tool_name, "result": output}

        yield {"type": "done"}

    except Exception as exc:
        logger.exception(f"Agent stream error for session {session_id}")
        yield {"type": "error", "message": str(exc)}


def get_task_runner(task_id: str) -> Optional[asyncio.Task]:
    runner = _active_task_runners.get(task_id)
    if runner and runner.done():
        _active_task_runners.pop(task_id, None)
        return None
    return runner


async def start_chat_task(task_id: str, session_id: str, message: str) -> None:
    if get_task_runner(task_id):
        return
    runner = asyncio.create_task(_run_chat_task(task_id, session_id, message))
    _active_task_runners[task_id] = runner


async def cancel_chat_task(task_id: str) -> bool:
    runner = get_task_runner(task_id)
    if not runner:
        return False
    runner.cancel()
    return True


async def _run_chat_task(task_id: str, session_id: str, message: str) -> None:
    from ..db import novel_db

    assistant_content = ""
    tool_events: list[dict] = []
    last_flush = 0.0

    async def flush_task_state(status: Optional[str] = None, error_message: str = "", finished: bool = False) -> None:
        payload = {
            "assistant_content": assistant_content,
            "tool_events": json.dumps(tool_events, ensure_ascii=False),
        }
        if status:
            payload["status"] = status
        if error_message:
            payload["error_message"] = error_message
        if finished:
            payload["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        await novel_db.update_agent_task(task_id, payload)

    async def find_underfilled_chapter(project_id: str) -> Optional[dict]:
        project = await novel_db.get_project(project_id)
        if not project:
            return None
        min_words = int(project.get("min_chapter_word_count", 2000) or 2000)
        chapters = await novel_db.get_chapters(project_id)
        candidates = [
            ch for ch in chapters
            if (ch.get("content") or "").strip() and int(ch.get("word_count", 0) or 0) < min_words
        ]
        if not candidates:
            return None
        candidates.sort(key=lambda ch: ch.get("order_num", 0), reverse=True)
        chapter = candidates[0]
        return {**chapter, "_target_words": min_words}

    async def find_next_unwritten_chapter(project_id: str) -> Optional[dict]:
        project = await novel_db.get_project(project_id)
        if not project:
            return None
        min_words = int(project.get("min_chapter_word_count", 2000) or 2000)
        chapters = await novel_db.get_chapters(project_id)
        candidates = [
            ch for ch in chapters
            if not str(ch.get("content") or "").strip()
        ]
        if not candidates:
            return None
        candidates.sort(key=lambda ch: int(ch.get("order_num", 0) or 0))
        chapter = candidates[0]
        return {**chapter, "_target_words": min_words}

    try:
        task_row = await novel_db.get_agent_task(task_id)
        if not task_row:
            return

        db_session = await novel_db.get_session(session_id)
        if not db_session:
            await novel_db.update_agent_task(task_id, {
                "status": "failed",
                "error_message": "会话不存在",
                "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            })
            return

        if not get_session(session_id):
            await create_session(
                session_id,
                db_session["project_id"],
                db_session["user_id"],
                db_session.get("generation_mode", "guided_first_chapter"),
            )

        await novel_db.update_session(session_id, {"status": "active"})
        await novel_db.update_agent_task(task_id, {
            "status": "running",
            "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        })

        project_id = db_session["project_id"]
        generation_mode = _normalize_generation_mode(db_session.get("generation_mode"))
        round_messages = [message]
        max_rounds = 80 if generation_mode == "full_book" else 6
        for continuation_round in range(max_rounds):
            current_message = round_messages[-1]
            async for payload in iter_chat_events(session_id, current_message):
                if payload.get("type") == "token":
                    assistant_content += payload.get("content", "")
                    now = time.monotonic()
                    if now - last_flush >= 0.8:
                        last_flush = now
                        await flush_task_state()
                elif payload.get("type") in {"tool_start", "tool_end"}:
                    tool_events.append(payload)
                    await flush_task_state()
                elif payload.get("type") == "error":
                    await flush_task_state(
                        status="failed",
                        error_message=payload.get("message", "未知错误"),
                        finished=True,
                    )
                    return
                elif payload.get("type") == "done":
                    break

            underfilled = await find_underfilled_chapter(project_id)
            if underfilled:
                if continuation_round >= max_rounds - 1:
                    await flush_task_state(
                        status="failed",
                        error_message=(
                            f"章节《{underfilled.get('title', '')}》仍未达到最低字数要求："
                            f"{underfilled.get('word_count', 0)}/{underfilled.get('_target_words', 2000)} 字。"
                        ),
                        finished=True,
                    )
                    return

                continuation_prompt = (
                    f"继续补写第 {underfilled.get('order_num')} 章《{underfilled.get('title', '')}》。\n"
                    f"当前字数：{underfilled.get('word_count', 0)}，目标至少：{underfilled.get('_target_words', 2000)}。\n"
                    "只补写当前这一章的新增正文，不要总结，不要切下一章。\n"
                    f"补写完成后，调用 save_chapter_content(chapter_order={underfilled.get('order_num')}, content='新增补写内容') 保存新增内容。"
                )
                assistant_content += (
                    f"\n\n[系统自动续写] 当前章节《{underfilled.get('title', '')}》"
                    f"字数不足，正在继续补写至 {underfilled.get('_target_words', 2000)} 字以上。\n"
                )
                await flush_task_state()
                round_messages.append(continuation_prompt)
                continue

            if generation_mode != "full_book":
                await flush_task_state(status="completed", finished=True)
                return

            next_unwritten = await find_next_unwritten_chapter(project_id)
            if not next_unwritten:
                await flush_task_state(status="completed", finished=True)
                return

            if continuation_round >= max_rounds - 1:
                await flush_task_state(
                    status="failed",
                    error_message=(
                        f"整本自动创作未能在限制轮次内完成，当前停留在第 "
                        f"{next_unwritten.get('order_num')} 章《{next_unwritten.get('title', '')}》。"
                    ),
                    finished=True,
                )
                return

            continuation_prompt = (
                f"继续创作第 {next_unwritten.get('order_num')} 章《{next_unwritten.get('title', '')}》的正文。\n"
                f"本章最低字数：{next_unwritten.get('_target_words', 2000)}。\n"
                f"本章大纲：{str(next_unwritten.get('outline') or '').strip() or '（暂无）'}\n"
                "请参考已保存的项目设定、全局大纲、章节规划，以及已完成章节正文，只写当前这一章。\n"
                "不要改写前文，不要跳到下一章，不要输出章节标题。\n"
                f"完成后调用 save_chapter_content(chapter_order={next_unwritten.get('order_num')}, content='完整正文') 保存。"
            )
            assistant_content += (
                f"\n\n[系统自动推进] 当前已完成前序章节，正在继续生成第 "
                f"{next_unwritten.get('order_num')} 章《{next_unwritten.get('title', '')}》。\n"
            )
            await flush_task_state()
            round_messages.append(continuation_prompt)
    except asyncio.CancelledError:
        await novel_db.update_agent_task(task_id, {
            "status": "cancelled",
            "assistant_content": assistant_content,
            "tool_events": json.dumps(tool_events, ensure_ascii=False),
            "error_message": "任务已取消",
            "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        })
        raise
    except Exception as exc:
        logger.exception(f"Agent background task error: {task_id}")
        await novel_db.update_agent_task(task_id, {
            "status": "failed",
            "assistant_content": assistant_content,
            "tool_events": json.dumps(tool_events, ensure_ascii=False),
            "error_message": str(exc),
            "finished_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        })
    finally:
        _active_task_runners.pop(task_id, None)
