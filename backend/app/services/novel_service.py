"""Novel generation service.

Provides async generators that stream LLM tokens for each of the three
generation stages (outline / chapters / content) plus an optimise helper.
Each generator yields SSE-formatted strings ready for StreamingResponse.

Design notes
------------
* Uses langchain_openai.ChatOpenAI with streaming=True — same dependency
  already in requirements.txt.
* Accumulates the full text while streaming so it can be persisted when done.
* Chapter-list parsing uses the ###fenge separator convention from the
  AI-automatically-generates-novels reference project.
* The `model` field on each project is passed verbatim to ChatOpenAI; users
  can point OPENAI_BASE_URL at any OpenAI-compatible endpoint (DeepSeek,
  Qwen, Claude-via-proxy …).
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import AsyncGenerator, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from loguru import logger
from pydantic import SecretStr

from ..core.config import get_settings
from ..db import novel_db
from .novel_prompts import (
    SYSTEM_CHAPTERS,
    SYSTEM_CONTENT,
    SYSTEM_HUMANIZE,
    SYSTEM_OPTIMIZE,
    SYSTEM_OUTLINE,
    SYSTEM_PROMPT_ENGINEER,
    SYSTEM_SETTINGS_GENERATOR,
    SYSTEM_SUMMARIZER,
    build_chapter_prompt,
    build_content_prompt,
    build_optimize_prompt,
    build_outline_prompt,
    build_prompts_meta_prompt,
    build_settings_generation_prompt,
    build_summary_prompt,
    finalize_chapter_storage_text,
    extract_generated_prompts,
    extract_generated_settings,
    parse_chapters,
    normalize_novel_language,
)

# ── Helpers ────────────────────────────────────────────────────────────────────

_active_project_generation_runners: dict[str, asyncio.Task] = {}


def _sse(payload: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _make_llm(model: str, temperature: float) -> ChatOpenAI:
    settings = get_settings()
    # Prefer NOVEL_OPENAI_API_KEY (real OpenAI) if configured; fall back to
    # the shared proxy key used by the customer-service agent.
    api_key = settings.NOVEL_OPENAI_API_KEY or settings.OPENAI_API_KEY
    base_url = settings.NOVEL_OPENAI_BASE_URL if settings.NOVEL_OPENAI_API_KEY else settings.OPENAI_BASE_URL
    return ChatOpenAI(
        model=model,
        api_key=SecretStr(api_key) if api_key else None,
        base_url=base_url,
        temperature=temperature,
        streaming=True,
    )


async def _stream_llm(
    system: str,
    user_prompt: str,
    model: str,
    temperature: float,
) -> AsyncGenerator[str, None]:
    """Yield raw text chunks from the LLM."""
    llm = _make_llm(model, temperature)
    messages = [SystemMessage(content=system), HumanMessage(content=user_prompt)]
    async for chunk in llm.astream(messages):
        content = chunk.content
        if isinstance(content, str) and content:
            yield content


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _normalize_generation_mode(mode: str | None) -> str:
    return "full_book" if mode == "full_book" else "guided_first_chapter"


async def _consume_sse_stream(stream: AsyncGenerator[str, None]) -> None:
    async for chunk in stream:
        if not chunk.startswith("data: "):
            continue
        try:
            payload = json.loads(chunk[6:].strip())
        except Exception:
            continue
        if payload.get("type") == "error":
            raise RuntimeError(str(payload.get("message") or "生成失败"))


def get_project_generation_runner(project_id: str) -> Optional[asyncio.Task]:
    runner = _active_project_generation_runners.get(project_id)
    if runner and runner.done():
        _active_project_generation_runners.pop(project_id, None)
        return None
    return runner


async def start_project_generation_task(project_id: str, generation_mode: str) -> None:
    if get_project_generation_runner(project_id):
        return
    runner = asyncio.create_task(_run_project_generation_task(project_id, generation_mode))
    _active_project_generation_runners[project_id] = runner


async def _run_project_generation_task(project_id: str, generation_mode: str) -> None:
    mode = _normalize_generation_mode(generation_mode)
    started_at = _now_iso()
    try:
        await novel_db.update_project(project_id, {
            "generation_status": "running",
            "generation_error": "",
            "generation_started_at": started_at,
            "generation_finished_at": "",
            "generation_step": "outline",
            "generation_current": 0,
            "generation_total": 0,
            "generation_label": "正在生成大纲",
        })

        project = await novel_db.get_project(project_id)
        if not project:
            raise RuntimeError("项目不存在，无法启动后台生成。")

        await _consume_sse_stream(stream_outline(project))

        project = await novel_db.get_project(project_id)
        if not project:
            raise RuntimeError("项目不存在，无法继续后台生成。")

        chapter_count = int(project.get("target_chapter_count", 10) or 10)
        await novel_db.update_project(project_id, {
            "generation_step": "chapters",
            "generation_label": f"正在规划 {chapter_count} 章",
        })
        await _consume_sse_stream(stream_chapters(project, chapter_count))

        project = await novel_db.get_project(project_id)
        chapters = await novel_db.get_chapters(project_id)
        if not project or not chapters:
            raise RuntimeError("章节规划生成完成，但未获取到可继续写作的章节。")

        chapters_to_generate = chapters if mode == "full_book" else chapters[:1]
        total = len(chapters_to_generate)
        if total == 0:
            raise RuntimeError("没有可生成正文的章节。")

        for idx, chapter in enumerate(chapters_to_generate, start=1):
            await novel_db.update_project(project_id, {
                "generation_step": "content",
                "generation_current": idx,
                "generation_total": total,
                "generation_label": f"第 {chapter.get('order_num', idx)} 章：{chapter.get('title', '')}",
            })
            latest_project = await novel_db.get_project(project_id)
            if not latest_project:
                raise RuntimeError("项目不存在，无法继续生成正文。")
            await _consume_sse_stream(
                stream_content(
                    latest_project,
                    chapter,
                    min_word_count=int(latest_project.get("min_chapter_word_count", 2000) or 2000),
                ),
            )

        await novel_db.update_project(project_id, {
            "generation_status": "idle",
            "generation_error": "",
            "generation_finished_at": _now_iso(),
            "generation_step": "",
            "generation_current": 0,
            "generation_total": 0,
            "generation_label": "",
        })
    except asyncio.CancelledError:
        await novel_db.update_project(project_id, {
            "generation_status": "failed",
            "generation_error": "后台生成已取消。",
            "generation_finished_at": _now_iso(),
            "generation_step": "",
            "generation_label": "",
        })
        raise
    except Exception as exc:
        logger.exception(f"[novel] project background generation error: {project_id}")
        await novel_db.update_project(project_id, {
            "generation_status": "failed",
            "generation_error": str(exc),
            "generation_finished_at": _now_iso(),
            "generation_step": "",
            "generation_label": "",
        })
    finally:
        _active_project_generation_runners.pop(project_id, None)


# ── Chapter summary (Smart Context) ───────────────────────────────────────────


async def _generate_chapter_summary(chapter: dict, model: str) -> str:
    """Call the LLM (non-streaming) to produce a ≤150-char structural summary.

    Returns an empty string on failure so callers can treat it as best-effort.
    """
    content = (chapter.get("content") or "").strip()
    if not content:
        return ""
    try:
        settings = get_settings()
        api_key = settings.NOVEL_OPENAI_API_KEY or settings.OPENAI_API_KEY
        base_url = (
            settings.NOVEL_OPENAI_BASE_URL
            if settings.NOVEL_OPENAI_API_KEY
            else settings.OPENAI_BASE_URL
        )
        llm = ChatOpenAI(
            model=model,
            api_key=SecretStr(api_key) if api_key else None,
            base_url=base_url,
            temperature=0.3,
            streaming=False,
        )
        prompt = build_summary_prompt(chapter.get("title", ""), content)
        messages = [SystemMessage(content=SYSTEM_SUMMARIZER), HumanMessage(content=prompt)]
        result = await llm.ainvoke(messages)
        return str(result.content).strip()
    except Exception as exc:
        logger.warning(f"[novel] summary generation failed for chapter {chapter.get('id')}: {exc}")
        return ""


# ── Outline generation ─────────────────────────────────────────────────────────


async def stream_outline(
    project: dict,
    custom_prompt: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Stream outline tokens, persist the completed text to the project."""
    prompt = build_outline_prompt(project, custom_prompt)
    model = project.get("model", "gpt-5-nano")
    temperature = float(project.get("temperature", 0.8))

    full_text = ""
    try:
        async for token in _stream_llm(SYSTEM_OUTLINE, prompt, model, temperature):
            full_text += token
            yield _sse({"type": "token", "content": token})
    except Exception as exc:
        logger.error(f"[novel] outline generation error: {exc}")
        yield _sse({"type": "error", "message": str(exc)})
        return

    # Persist outline
    normalized_outline = normalize_novel_language(full_text)
    await novel_db.update_project(project["id"], {"outline": normalized_outline, "status": "draft"})
    yield _sse({"type": "done", "data": {"outline": normalized_outline}})


# ── Chapter-list generation ────────────────────────────────────────────────────


async def stream_chapters(
    project: dict,
    chapter_count: int = 10,
    custom_prompt: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Stream chapter-list tokens, then parse and persist chapters."""
    prompt = build_chapter_prompt(project, chapter_count, custom_prompt)
    model = project.get("model", "gpt-5-nano")
    temperature = float(project.get("temperature", 0.8))

    full_text = ""
    try:
        async for token in _stream_llm(SYSTEM_CHAPTERS, prompt, model, temperature):
            full_text += token
            yield _sse({"type": "token", "content": token})
    except Exception as exc:
        logger.error(f"[novel] chapter generation error: {exc}")
        yield _sse({"type": "error", "message": str(exc)})
        return

    # Parse and persist chapters
    chapters_data = parse_chapters(full_text)
    if chapters_data:
        saved = await novel_db.replace_chapters(project["id"], chapters_data)
        yield _sse({"type": "done", "data": {"chapters": saved}})
    else:
        yield _sse({"type": "done", "data": {"chapters": [], "raw": full_text}})


# ── Chapter-content generation ─────────────────────────────────────────────────


async def stream_content(
    project: dict,
    chapter: dict,
    custom_prompt: Optional[str] = None,
    min_word_count: Optional[int] = None,
) -> AsyncGenerator[str, None]:
    """Stream content tokens for a single chapter, persist when done.

    Smart Context layers injected into the prompt:
      1. All previous chapter summaries  → global story state / foreshadowing
      2. Previous chapter tail (~400 chars) → immediate scene continuity

    After the prose is saved, a structural summary is auto-generated and stored
    so subsequent chapters can reference it.
    """
    order_num = chapter.get("order_num", 1)

    # ── Fetch sibling chapters for context ────────────────────────────────────
    prev_chapter: Optional[dict] = None
    all_prev_summaries = []
    if order_num and order_num > 1:
        try:
            all_chapters = await novel_db.get_chapters(project["id"])
            prev_chapter = next(
                (c for c in all_chapters if c.get("order_num") == order_num - 1),
                None,
            )
            # Collect summaries from ALL chapters that come before this one
            all_prev_summaries = [
                c for c in all_chapters
                if c.get("order_num", 0) < order_num and c.get("summary")
            ]
            # Sort by order_num for readability in the prompt
            all_prev_summaries.sort(key=lambda c: c.get("order_num", 0))
        except Exception as exc:
            logger.warning(f"[novel] could not fetch prev chapters for context: {exc}")

    prompt = build_content_prompt(
        project,
        chapter,
        custom_prompt,
        prev_chapter=prev_chapter,
        all_prev_summaries=all_prev_summaries or None,
        min_word_count=min_word_count,
    )
    model = project.get("model", "gpt-5-nano")
    temperature = float(project.get("temperature", 0.8))

    full_text = ""
    try:
        async for token in _stream_llm(SYSTEM_CONTENT, prompt, model, temperature):
            full_text += token
            yield _sse({"type": "token", "content": token})
    except Exception as exc:
        logger.error(f"[novel] content generation error: {exc}")
        yield _sse({"type": "error", "message": str(exc)})
        return

    # ── Persist prose ─────────────────────────────────────────────────────────
    clean_text = finalize_chapter_storage_text(full_text, chapter.get("title", ""))
    await novel_db.update_chapter(chapter["id"], {"content": clean_text, "status": "generated"})

    # ── Auto-generate structural summary (Smart Context feature) ──────────────
    summary = await _generate_chapter_summary({**chapter, "content": clean_text}, model)
    if summary:
        await novel_db.update_chapter(chapter["id"], {"summary": summary})

    yield _sse({"type": "done", "data": {
        "word_count": len(clean_text),
        "summary": summary,
        "clean_content": clean_text,
    }})


# ── Chapter summary — manual regeneration (SSE) ───────────────────────────────


async def stream_summarize_chapter(
    chapter: dict,
    model: str,
) -> AsyncGenerator[str, None]:
    """SSE: (re-)generate and save a chapter's structural summary.

    Streams the summary tokens as they arrive so the UI can show progress,
    then persists and emits a done event with the final summary text.
    """
    content = (chapter.get("content") or "").strip()
    if not content:
        yield _sse({"type": "error", "message": "该章节还没有正文，无法生成摘要"})
        return

    prompt = build_summary_prompt(chapter.get("title", ""), content)
    summary_text = ""
    try:
        async for token in _stream_llm(SYSTEM_SUMMARIZER, prompt, model, temperature=0.3):
            summary_text += token
            yield _sse({"type": "token", "content": token})
    except Exception as exc:
        logger.error(f"[novel] summary stream error: {exc}")
        yield _sse({"type": "error", "message": str(exc)})
        return

    await novel_db.update_chapter(chapter["id"], {"summary": summary_text.strip()})
    yield _sse({"type": "done", "data": {"summary": summary_text.strip()}})


# ── Text optimisation ──────────────────────────────────────────────────────────


async def stream_generate_settings(
    project: dict,
    concept: str,
) -> AsyncGenerator[str, None]:
    """AI 一键生成故事设定 — analyse concept + genre → stream JSON → persist settings.

    Generates: protagonist_name / background / characters / relationships / plot / style.
    Tokens are streamed for visual feedback; parsed and auto-saved on completion.
    """
    from app.services.novel_prompts import get_genre
    genre = get_genre(project.get("genre", "urbanReborn"))
    user_prompt = build_settings_generation_prompt(genre.name, concept)
    model = project.get("model", "gpt-5-nano")
    temperature = 0.85  # slightly higher for creative settings generation

    full_text = ""
    try:
        async for token in _stream_llm(SYSTEM_SETTINGS_GENERATOR, user_prompt, model, temperature):
            full_text += token
            yield _sse({"type": "token", "content": token})
    except Exception as exc:
        logger.error(f"[novel] settings generation error: {exc}")
        yield _sse({"type": "error", "message": str(exc)})
        return

    # Parse JSON and persist
    try:
        settings = extract_generated_settings(full_text)
        updates = {k: v for k, v in settings.items() if v}
        if updates:
            await novel_db.update_project(project["id"], updates)
        yield _sse({"type": "done", "data": settings})
    except Exception as exc:
        logger.error(f"[novel] settings parse error: {exc}")
        yield _sse({
            "type": "error",
            "message": f"设定解析失败：{exc}。请检查模型输出并手动复制内容。",
        })


async def stream_generate_prompts(
    project: dict,
) -> AsyncGenerator[str, None]:
    """AI反推提示词 — analyse project settings → stream JSON → persist 3 custom prompts.

    The LLM outputs a JSON object with outline_prompt / chapter_prompt / content_prompt.
    Tokens are streamed for visual feedback; the complete JSON is parsed and saved when done.
    """
    meta_prompt = build_prompts_meta_prompt(project)
    model = project.get("model", "gpt-5-nano")
    # Slightly lower temperature for more structured/reliable JSON output
    temperature = 0.6

    full_text = ""
    try:
        async for token in _stream_llm(SYSTEM_PROMPT_ENGINEER, meta_prompt, model, temperature):
            full_text += token
            yield _sse({"type": "token", "content": token})
    except Exception as exc:
        logger.error(f"[novel] prompts generation error: {exc}")
        yield _sse({"type": "error", "message": str(exc)})
        return

    # Parse JSON and persist
    try:
        prompts = extract_generated_prompts(full_text)
        updates = {k: v for k, v in prompts.items() if v}
        if updates:
            await novel_db.update_project(project["id"], updates)
        yield _sse({"type": "done", "data": prompts})
    except Exception as exc:
        logger.error(f"[novel] prompts parse error: {exc}")
        yield _sse({
            "type": "error",
            "message": f"提示词解析失败：{exc}。请检查模型输出格式并手动复制。",
        })


async def stream_optimize(
    text: str,
    operation: str,
    context: Optional[str],
    model: str = "gpt-5-nano",
    temperature: float = 0.8,
) -> AsyncGenerator[str, None]:
    """Stream optimised text for right-click operations.

    '去AI味' uses the full humanizer-zh ruleset (SYSTEM_HUMANIZE) for precise
    pattern-by-pattern rewriting.  All other operations use the generic
    SYSTEM_OPTIMIZE system prompt.
    """
    system = SYSTEM_HUMANIZE if operation == "去AI味" else SYSTEM_OPTIMIZE
    prompt = build_optimize_prompt(text, operation, context)
    try:
        async for token in _stream_llm(system, prompt, model, temperature):
            yield _sse({"type": "token", "content": token})
    except Exception as exc:
        logger.error(f"[novel] optimize error: {exc}")
        yield _sse({"type": "error", "message": str(exc)})
        return
    yield _sse({"type": "done", "data": {}})
