"""Novel generation API — CRUD + SSE streaming endpoints.

Route prefix: /api/v1/novel  (registered in app/main.py)

Endpoints
---------
Projects (CRUD):
  GET    /projects                          list all
  POST   /projects                          create
  GET    /projects/{pid}                    get with chapters
  PUT    /projects/{pid}                    update fields
  DELETE /projects/{pid}                    delete + cascade chapters

Chapters (within a project):
  GET    /projects/{pid}/chapters           list chapters
  POST   /projects/{pid}/chapters           add single chapter
  PUT    /projects/{pid}/chapters/{cid}     update chapter
  DELETE /projects/{pid}/chapters/{cid}     delete chapter

Generation (SSE streaming):
  POST   /projects/{pid}/outline/generate                          stream outline
  POST   /projects/{pid}/chapters/generate                         stream chapter-list → auto-save
  POST   /projects/{pid}/chapters/{cid}/content/generate           stream content → auto-save + auto-summarise
  POST   /projects/{pid}/chapters/{cid}/summary/generate           stream chapter summary → auto-save

Utilities:
  POST   /optimize                          stream optimised text
  GET    /genres                            genre template catalogue
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from ...core.config import get_settings
from ...db import novel_db
from ...schemas.novel import (
    ChapterCreate,
    ChapterOut,
    ChapterUpdate,
    FinalizeRequest,
    GenerateChaptersRequest,
    GenerateContentRequest,
    GenerateOutlineRequest,
    GeneratePromptsRequest,
    GenerateSettingsRequest,
    GenerateSummaryRequest,
    GenreTemplateOut,
    NovelProjectCreate,
    NovelProjectDetail,
    NovelProjectOut,
    NovelProjectUpdate,
    OptimizeRequest,
    StartProjectGenerationRequest,
)
from ...services import novel_prompts, novel_service

router = APIRouter(prefix="/novel", tags=["novel"])

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_project_or_404(pid: str) -> dict:
    project = await novel_db.get_project(pid)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project {pid!r} not found")
    return project


async def _get_chapter_or_404(cid: str) -> dict:
    chapter = await novel_db.get_chapter(cid)
    if not chapter:
        raise HTTPException(status_code=404, detail=f"Chapter {cid!r} not found")
    return chapter


async def _normalize_project_title(project: dict) -> dict:
    title = str(project.get("title") or "").strip()
    if not title or title == "AI 创作中…":
        return project

    normalized_title = novel_prompts.normalize_project_title(title)
    if not normalized_title or normalized_title == title:
        return project

    updated = await novel_db.update_project(project["id"], {"title": normalized_title})
    return updated or {**project, "title": normalized_title}


async def _normalize_project_text(project: dict) -> dict:
    updates: Dict[str, str] = {}

    title = str(project.get("title") or "").strip()
    if title and title != "AI 创作中…":
        normalized_title = novel_prompts.normalize_project_title(title)
        if normalized_title and normalized_title != title:
            updates["title"] = normalized_title

    outline = str(project.get("outline") or "")
    normalized_outline = novel_prompts.normalize_novel_language(outline).strip()
    if normalized_outline != outline:
        updates["outline"] = normalized_outline

    if not updates:
        return project

    updated = await novel_db.update_project(project["id"], updates)
    return updated or {**project, **updates}


def _sanitize_chapter_content(row: dict) -> dict:
    """Read-time safety net: strip markup from chapter content that was stored
    before the finalize pipeline existed, so the frontend always gets plain text."""
    content = row.get("content") or ""
    if not content:
        return row
    if not novel_prompts._looks_like_markup_or_escaped_tags(content):
        return row
    clean = novel_prompts.strip_markup_to_plain_prose(content)
    if clean == content:
        return row
    return {**row, "content": clean, "word_count": len(clean)}


def _project_detail(project: dict, chapters: list[dict]) -> NovelProjectDetail:
    chapters = [_sanitize_chapter_content(c) for c in chapters]
    return NovelProjectDetail(**{**project, "chapters": [ChapterOut(**c) for c in chapters]})


# ── Genre catalogue ────────────────────────────────────────────────────────────

@router.get("/genres", response_model=List[GenreTemplateOut], summary="获取所有类型模板")
async def list_genres() -> List[GenreTemplateOut]:
    return [
        GenreTemplateOut(
            key=g.key,
            name=g.name,
            outline_prompt=g.outline_prompt,
            chapter_prompt=g.chapter_prompt,
            content_prompt=g.content_prompt,
            optimize_operations=g.optimize_operations,
        )
        for g in novel_prompts.list_genres()
    ]


# ── Project CRUD ───────────────────────────────────────────────────────────────

@router.get("/projects", response_model=List[NovelProjectOut], summary="获取小说项目列表")
async def list_projects() -> List[NovelProjectOut]:
    rows = await novel_db.list_projects()
    normalized_rows = [await _normalize_project_text(r) for r in rows]
    return [NovelProjectOut(**r) for r in normalized_rows]


@router.post(
    "/projects",
    response_model=NovelProjectOut,
    status_code=status.HTTP_201_CREATED,
    summary="新建小说项目",
)
async def create_project(body: NovelProjectCreate) -> NovelProjectOut:
    row = await novel_db.create_project(body.model_dump())
    row = await _normalize_project_text(row)
    return NovelProjectOut(**row)


@router.get("/projects/{pid}", response_model=NovelProjectDetail, summary="获取项目详情（含章节）")
async def get_project(pid: str) -> NovelProjectDetail:
    project = await _normalize_project_text(await _get_project_or_404(pid))
    chapters = await novel_db.get_chapters(pid)
    return _project_detail(project, chapters)


@router.put("/projects/{pid}", response_model=NovelProjectOut, summary="更新项目字段")
async def update_project(pid: str, body: NovelProjectUpdate) -> NovelProjectOut:
    await _get_project_or_404(pid)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    row = await novel_db.update_project(pid, updates)
    normalized = await _normalize_project_text(row or {"id": pid, **updates})
    return NovelProjectOut(**normalized)  # type: ignore[arg-type]


@router.delete(
    "/projects/{pid}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除项目（含所有章节）",
)
async def delete_project(pid: str) -> None:
    await _get_project_or_404(pid)
    await novel_db.delete_project(pid)


@router.post(
    "/projects/{pid}/finalize",
    response_model=NovelProjectOut,
    summary="定稿：将项目标记为已发布，统计总字数和章节数",
)
async def finalize_project(pid: str, body: FinalizeRequest) -> NovelProjectOut:
    """Mark the project as published and compute aggregated stats.

    Sets status='published', total_word_count, chapter_count, published_at.
    At least one chapter with content is required.
    """
    await _get_project_or_404(pid)
    chapters = await novel_db.get_chapters(pid)
    has_content = any(c.get("content") for c in chapters)
    if not has_content:
        raise HTTPException(
            status_code=422,
            detail="至少需要一章有正文内容才能定稿",
        )
    row = await novel_db.finalize_project(pid)
    normalized = await _normalize_project_text(row or {"id": pid})
    return NovelProjectOut(**normalized)  # type: ignore[arg-type]


# ── Chapter CRUD ───────────────────────────────────────────────────────────────

@router.get(
    "/projects/{pid}/chapters",
    response_model=List[ChapterOut],
    summary="获取章节列表",
)
async def list_chapters(pid: str) -> List[ChapterOut]:
    await _get_project_or_404(pid)
    rows = await novel_db.get_chapters(pid)
    return [ChapterOut(**_sanitize_chapter_content(r)) for r in rows]


@router.post(
    "/projects/{pid}/chapters",
    response_model=ChapterOut,
    status_code=status.HTTP_201_CREATED,
    summary="添加单章",
)
async def create_chapter(pid: str, body: ChapterCreate) -> ChapterOut:
    await _get_project_or_404(pid)
    row = await novel_db.create_chapter({"project_id": pid, **body.model_dump()})
    return ChapterOut(**row)


@router.put(
    "/projects/{pid}/chapters/{cid}",
    response_model=ChapterOut,
    summary="更新章节字段",
)
async def update_chapter(pid: str, cid: str, body: ChapterUpdate) -> ChapterOut:
    await _get_project_or_404(pid)
    chapter = await _get_chapter_or_404(cid)
    if chapter.get("project_id") != pid:
        raise HTTPException(status_code=404, detail=f"Chapter {cid!r} not found in project {pid!r}")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "content" in updates and updates["content"] is not None:
        title_for_heading = (
            str(updates["title"]) if updates.get("title") is not None else str(chapter.get("title") or "")
        )
        updates["content"] = novel_prompts.finalize_chapter_storage_text(
            updates["content"],
            title_for_heading,
        )
    row = await novel_db.update_chapter(cid, updates)
    if not row:
        raise HTTPException(status_code=404, detail=f"Chapter {cid!r} not found")
    return ChapterOut(**_sanitize_chapter_content(row))


@router.delete(
    "/projects/{pid}/chapters/{cid}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除章节",
)
async def delete_chapter(pid: str, cid: str) -> None:
    await _get_project_or_404(pid)
    await novel_db.delete_chapter(cid)


# ── SSE Generation ─────────────────────────────────────────────────────────────

@router.post("/projects/{pid}/outline/generate", summary="流式生成大纲 (SSE)")
async def generate_outline(pid: str, body: GenerateOutlineRequest) -> StreamingResponse:
    project = await _get_project_or_404(pid)
    return StreamingResponse(
        novel_service.stream_outline(project, body.custom_prompt),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/projects/{pid}/generation/start", response_model=NovelProjectOut, summary="启动自定义创作后台生成任务")
async def start_project_generation(pid: str, body: StartProjectGenerationRequest) -> NovelProjectOut:
    project = await _get_project_or_404(pid)
    if project.get("generation_status") == "running":
        raise HTTPException(status_code=409, detail="当前项目已有后台生成任务正在进行中")

    mode = "full_book" if body.generation_mode == "full_book" else "guided_first_chapter"
    updated = await novel_db.update_project(pid, {
        "generation_status": "running",
        "generation_error": "",
        "generation_started_at": "",
        "generation_finished_at": "",
        "generation_step": "queued",
        "generation_current": 0,
        "generation_total": 0,
        "generation_label": "任务已启动",
    })
    await novel_service.start_project_generation_task(pid, mode)
    normalized = await _normalize_project_text(updated or project)
    return NovelProjectOut(**normalized)


@router.post("/projects/{pid}/chapters/generate", summary="流式生成章节列表 (SSE)")
async def generate_chapters(pid: str, body: GenerateChaptersRequest) -> StreamingResponse:
    project = await _get_project_or_404(pid)
    chapter_count = body.chapter_count or int(project.get("target_chapter_count", 10))
    return StreamingResponse(
        novel_service.stream_chapters(project, chapter_count, body.custom_prompt),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post(
    "/projects/{pid}/chapters/{cid}/content/generate",
    summary="流式生成章节正文 (SSE)",
)
async def generate_content(
    pid: str, cid: str, body: GenerateContentRequest
) -> StreamingResponse:
    project = await _get_project_or_404(pid)
    chapter = await _get_chapter_or_404(cid)
    if chapter["project_id"] != pid:
        raise HTTPException(status_code=400, detail="Chapter does not belong to this project")
    return StreamingResponse(
        novel_service.stream_content(
            project,
            chapter,
            body.custom_prompt,
            min_word_count=body.min_word_count,
        ),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post(
    "/projects/{pid}/chapters/{cid}/summary/generate",
    summary="流式(重新)生成章节摘要 — 智能上文追踪功能 (SSE)",
)
async def generate_chapter_summary(
    pid: str, cid: str, body: GenerateSummaryRequest
) -> StreamingResponse:
    """SSE: Generate (or re-generate) a chapter's structural summary.

    The summary is persisted to novel_chapters.summary after generation and
    will be injected as context when generating all subsequent chapters.
    """
    project = await _get_project_or_404(pid)
    chapter = await _get_chapter_or_404(cid)
    if chapter["project_id"] != pid:
        raise HTTPException(status_code=400, detail="Chapter does not belong to this project")
    if not chapter.get("content"):
        raise HTTPException(status_code=422, detail="该章节还没有正文，无法生成摘要")
    model = project.get("model", "gpt-5-nano")
    return StreamingResponse(
        novel_service.stream_summarize_chapter(chapter, model),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/projects/{pid}/settings/generate", summary="AI一键生成故事设定：根据创意简述自动生成背景/人物/关系/剧情/风格 (SSE)")
async def generate_settings(pid: str, body: GenerateSettingsRequest) -> StreamingResponse:
    project = await _get_project_or_404(pid)
    return StreamingResponse(
        novel_service.stream_generate_settings(project, body.concept),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/projects/{pid}/prompts/generate", summary="AI反推提示词：根据小说设定自动生成三层提示词 (SSE)")
async def generate_prompts(pid: str, body: GeneratePromptsRequest) -> StreamingResponse:
    project = await _get_project_or_404(pid)
    return StreamingResponse(
        novel_service.stream_generate_prompts(project),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.get("/models", summary="获取可用 GPT 模型列表（从 OpenAI API 动态拉取）")
async def list_models() -> List[Dict[str, Any]]:
    """Fetch the model list from OpenAI and return GPT chat models sorted by id."""
    settings = get_settings()
    api_key = settings.NOVEL_OPENAI_API_KEY or settings.OPENAI_API_KEY
    base_url = (
        settings.NOVEL_OPENAI_BASE_URL
        if settings.NOVEL_OPENAI_API_KEY
        else settings.OPENAI_BASE_URL
    )
    # Normalise base_url (strip trailing slash, ensure /v1 suffix)
    base_url = base_url.rstrip("/")
    models_url = f"{base_url}/models"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                models_url,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI models API error: {exc.response.status_code}",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch models: {exc}") from exc

    # Filter to GPT chat models only
    # Keep: gpt-4*, gpt-3.5-turbo (chat versions), o1*, o3*, o4*
    # Exclude: instruct, audio, tts, whisper, dall-e, embedding, realtime, preview-old
    _EXCLUDE = re.compile(
        r"instruct|audio|tts|whisper|dall|embed|realtime|moderat|babbage|davinci|ada|curie",
        re.IGNORECASE,
    )
    _INCLUDE = re.compile(r"^(gpt-|o1|o3|o4)", re.IGNORECASE)

    models = [
        {"id": m["id"], "created": m.get("created", 0)}
        for m in data.get("data", [])
        if _INCLUDE.match(m["id"]) and not _EXCLUDE.search(m["id"])
    ]
    # Sort: newest first (by created timestamp), then alphabetically
    models.sort(key=lambda m: (-m["created"], m["id"]))
    return models


@router.post(
    "/projects/{pid}/chapters/cleanup",
    summary="批量清洗项目所有章节正文中的 HTML/实体残留",
)
async def cleanup_chapter_content(pid: str) -> dict:
    """Re-process every chapter's content through strip_markup_to_plain_prose
    and persist the clean version.  Idempotent — safe to call repeatedly."""
    await _get_project_or_404(pid)
    chapters = await novel_db.get_chapters(pid)
    cleaned = 0
    for ch in chapters:
        content = ch.get("content") or ""
        if not content:
            continue
        clean = novel_prompts.strip_markup_to_plain_prose(content)
        if clean != content:
            await novel_db.update_chapter(ch["id"], {"content": clean, "word_count": len(clean)})
            cleaned += 1
    return {"total": len(chapters), "cleaned": cleaned}


@router.post(
    "/chapters/cleanup-all",
    summary="批量清洗所有项目所有章节正文中的 HTML/实体残留",
)
async def cleanup_all_chapters() -> dict:
    projects = await novel_db.list_projects()
    total_cleaned = 0
    total_chapters = 0
    for proj in projects:
        chapters = await novel_db.get_chapters(proj["id"])
        total_chapters += len(chapters)
        for ch in chapters:
            content = ch.get("content") or ""
            if not content:
                continue
            clean = novel_prompts.strip_markup_to_plain_prose(content)
            if clean != content:
                await novel_db.update_chapter(ch["id"], {"content": clean, "word_count": len(clean)})
                total_cleaned += 1
    return {"total_chapters": total_chapters, "cleaned": total_cleaned}


@router.post("/optimize", summary="流式优化/润色文本 (SSE)")
async def optimize_text(body: OptimizeRequest) -> StreamingResponse:
    return StreamingResponse(
        novel_service.stream_optimize(
            body.text,
            body.operation,
            body.context,
            body.model,
            body.temperature,
        ),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
