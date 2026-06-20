"""Novel Agent API — endpoints for AI-agent-driven novel creation.

Route prefix: /api/v1/novel/agent  (registered in app/main.py)

Endpoints
---------
  POST   /sessions                    create a new agent session + novel project
  GET    /sessions/{sid}              get session info
  POST   /sessions/{sid}/chat         SSE: send message, stream agent response
  DELETE /sessions/{sid}              terminate session
"""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from ...db import novel_db
from ...schemas.novel import (
    AgentChatRequest,
    AgentSessionCreate,
    ExistingProjectAgentSessionCreate,
    AgentSessionOut,
    AgentTaskOut,
    NovelProjectOut,
)
from ...services import novel_agent_service, novel_prompts

router = APIRouter(prefix="/novel/agent", tags=["novel-agent"])

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}


async def _normalize_project_title(project: dict) -> dict:
    title = str(project.get("title") or "").strip()
    if not title or title == "AI 创作中…":
        return project

    normalized_title = novel_prompts.normalize_project_title(title)
    if not normalized_title or normalized_title == title:
        return project

    updated = await novel_db.update_project(project["id"], {"title": normalized_title})
    return updated or {**project, "title": normalized_title}


# ── Session CRUD ───────────────────────────────────────────────────────────────

@router.post("/sessions", response_model=AgentSessionOut, status_code=status.HTTP_201_CREATED)
async def create_agent_session(body: AgentSessionCreate):
    """Create a new agent session and its associated novel project."""
    # 1. Create the novel project with source="agent"
    project = await novel_db.create_project({
        "title": "AI 创作中…",
        "genre": body.genre,
        "source": "agent",
        "target_chapter_count": body.target_chapter_count,
        "min_chapter_word_count": body.first_chapter_min_word_count,
    })
    project_id = project["id"]

    # 2. Create session record in DB
    session_id = str(uuid.uuid4())
    session = await novel_db.create_session(
        session_id,
        project_id,
        body.user_id,
        body.generation_mode,
    )

    # 3. Initialise the in-memory agent
    await novel_agent_service.create_session(
        session_id,
        project_id,
        body.user_id,
        body.generation_mode,
    )

    return AgentSessionOut(**session)


@router.post("/projects/{pid}/session", response_model=AgentSessionOut)
async def create_or_reuse_project_agent_session(pid: str, body: ExistingProjectAgentSessionCreate):
    """Create or reuse an agent session for an existing novel project."""
    project = await novel_db.get_project(pid)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    existing_session = await novel_db.get_latest_session_by_project(pid)
    if existing_session:
        if not novel_agent_service.get_session(existing_session["id"]):
            await novel_agent_service.create_session(
                existing_session["id"],
                pid,
                existing_session["user_id"],
                existing_session.get("generation_mode", "guided_first_chapter"),
            )
        await novel_db.update_session(existing_session["id"], {"status": "active"})
        refreshed = await novel_db.get_session(existing_session["id"])
        return AgentSessionOut(**(refreshed or existing_session))

    session_id = str(uuid.uuid4())
    session = await novel_db.create_session(
        session_id,
        pid,
        body.user_id,
        body.generation_mode,
    )
    await novel_agent_service.create_session(
        session_id,
        pid,
        body.user_id,
        body.generation_mode,
    )
    return AgentSessionOut(**session)


@router.get("/sessions/{sid}", response_model=AgentSessionOut)
async def get_agent_session(sid: str):
    """Get session metadata."""
    session = await novel_db.get_session(sid)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return AgentSessionOut(**session)


@router.delete("/sessions/{sid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent_session(sid: str):
    """Terminate a session (removes from memory; project remains in DB)."""
    novel_agent_service.remove_session(sid)
    await novel_db.delete_session(sid)


# ── Chat (SSE streaming) ───────────────────────────────────────────────────────

@router.post("/sessions/{sid}/chat")
async def agent_chat(sid: str, body: AgentChatRequest):
    """Send a message to the agent and stream the response as SSE."""
    # Ensure session exists in DB
    db_session = await novel_db.get_session(sid)
    if not db_session:
        raise HTTPException(status_code=404, detail="会话不存在")

    # Re-create in-memory agent if server was restarted
    if not novel_agent_service.get_session(sid):
        await novel_agent_service.create_session(
            sid,
            db_session["project_id"],
            db_session["user_id"],
            db_session.get("generation_mode", "guided_first_chapter"),
        )

    # Update session stage timestamp
    await novel_db.update_session(sid, {"status": "active"})

    return StreamingResponse(
        novel_agent_service.chat_stream(sid, body.message),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


def _agent_task_out(row: dict) -> AgentTaskOut:
    tool_events = row.get("tool_events", "[]")
    if isinstance(tool_events, str):
        try:
            tool_events = json.loads(tool_events)
        except json.JSONDecodeError:
            tool_events = []
    return AgentTaskOut(**{**row, "tool_events": tool_events})


async def _normalize_agent_task_state(row: dict) -> dict:
    if row.get("status") not in {"pending", "running"}:
        return row
    if novel_agent_service.get_task_runner(row["id"]):
        return row
    updated = await novel_db.update_agent_task(row["id"], {
        "status": "failed",
        "error_message": "服务重启或任务中断，请重新发起本次创作。",
        "finished_at": row.get("finished_at") or row.get("updated_at") or "",
    })
    return updated or row


@router.post("/sessions/{sid}/tasks", response_model=AgentTaskOut, status_code=status.HTTP_201_CREATED)
async def create_agent_task(sid: str, body: AgentChatRequest):
    """创建后台 Agent 创作任务。"""
    db_session = await novel_db.get_session(sid)
    if not db_session:
        raise HTTPException(status_code=404, detail="会话不存在")

    task_row = await novel_db.create_agent_task(sid, db_session["project_id"], body.message)
    await novel_agent_service.start_chat_task(task_row["id"], sid, body.message)
    return _agent_task_out(task_row)


@router.get("/sessions/{sid}/tasks/latest", response_model=AgentTaskOut)
async def get_latest_agent_task(sid: str):
    """获取该会话最近一次后台任务。"""
    db_session = await novel_db.get_session(sid)
    if not db_session:
        raise HTTPException(status_code=404, detail="会话不存在")
    task_row = await novel_db.get_latest_agent_task(sid)
    if not task_row:
        raise HTTPException(status_code=404, detail="暂无任务")
    task_row = await _normalize_agent_task_state(task_row)
    return _agent_task_out(task_row)


@router.get("/tasks/{task_id}", response_model=AgentTaskOut)
async def get_agent_task(task_id: str):
    """查询后台 Agent 任务状态。"""
    task_row = await novel_db.get_agent_task(task_id)
    if not task_row:
        raise HTTPException(status_code=404, detail="任务不存在")
    task_row = await _normalize_agent_task_state(task_row)
    return _agent_task_out(task_row)


@router.post("/tasks/{task_id}/cancel", response_model=AgentTaskOut)
async def cancel_agent_task(task_id: str):
    """取消正在执行的后台 Agent 任务。"""
    task_row = await novel_db.get_agent_task(task_id)
    if not task_row:
        raise HTTPException(status_code=404, detail="任务不存在")

    if task_row.get("status") in {"completed", "failed", "cancelled"}:
        return _agent_task_out(task_row)

    cancelled = await novel_agent_service.cancel_chat_task(task_id)
    if not cancelled:
        updated = await novel_db.update_agent_task(task_id, {
            "status": "cancelled",
            "error_message": "任务已取消",
        })
        return _agent_task_out(updated or task_row)

    refreshed = await novel_db.get_agent_task(task_id)
    return _agent_task_out(refreshed or task_row)


# ── Convenience: get linked project ───────────────────────────────────────────

@router.get("/sessions/{sid}/project", response_model=NovelProjectOut)
async def get_session_project(sid: str):
    """Return the novel project linked to this agent session."""
    session = await novel_db.get_session(sid)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    project = await novel_db.get_project(session["project_id"])
    if not project:
        raise HTTPException(status_code=404, detail="关联项目不存在")
    project = await _normalize_project_title(project)
    return NovelProjectOut(**project)


@router.get("/projects/{pid}/latest-session", response_model=AgentSessionOut)
async def get_latest_project_session(pid: str):
    """Return the latest agent session linked to a project."""
    project = await novel_db.get_project(pid)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    session = await novel_db.get_latest_session_by_project(pid)
    if not session:
        raise HTTPException(status_code=404, detail="该项目暂无 Agent 会话")
    return AgentSessionOut(**session)
