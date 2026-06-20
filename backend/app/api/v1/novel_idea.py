"""AI inspiration API — independent chat-style idea generation."""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException, status

from ...db import novel_db
from ...schemas.novel import AgentChatRequest, IdeaSessionCreate, IdeaSessionOut, IdeaTaskOut
from ...services import novel_idea_agent_service

router = APIRouter(prefix="/novel/ideas", tags=["novel-ideas"])


def _idea_task_out(row: dict) -> IdeaTaskOut:
    tool_events = row.get("tool_events", "[]")
    if isinstance(tool_events, str):
        try:
            tool_events = json.loads(tool_events)
        except json.JSONDecodeError:
            tool_events = []
    return IdeaTaskOut(**{**row, "tool_events": tool_events})


async def _normalize_idea_task_state(row: dict) -> dict:
    if row.get("status") not in {"pending", "running"}:
        return row
    if novel_idea_agent_service.get_task_runner(row["id"]):
        return row
    updated = await novel_db.update_idea_task(row["id"], {
        "status": "failed",
        "error_message": "服务重启或任务中断，请重新发起本次生成。",
        "finished_at": row.get("finished_at") or row.get("updated_at") or "",
    })
    return updated or row


@router.post("/sessions", response_model=IdeaSessionOut, status_code=status.HTTP_201_CREATED)
async def create_idea_session(body: IdeaSessionCreate):
    session_id = str(uuid.uuid4())
    session = await novel_db.create_idea_session(session_id, body.user_id)
    await novel_idea_agent_service.create_session(session_id, body.user_id)
    return IdeaSessionOut(**session)


@router.get("/sessions/{sid}", response_model=IdeaSessionOut)
async def get_idea_session(sid: str):
    session = await novel_db.get_idea_session(sid)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return IdeaSessionOut(**session)


@router.delete("/sessions/{sid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_idea_session(sid: str):
    novel_idea_agent_service.remove_session(sid)
    await novel_db.delete_idea_session(sid)


@router.post("/sessions/{sid}/tasks", response_model=IdeaTaskOut, status_code=status.HTTP_201_CREATED)
async def create_idea_task(sid: str, body: AgentChatRequest):
    db_session = await novel_db.get_idea_session(sid)
    if not db_session:
        raise HTTPException(status_code=404, detail="会话不存在")

    if not novel_idea_agent_service.get_session(sid):
        await novel_idea_agent_service.create_session(sid, db_session["user_id"])

    task_row = await novel_db.create_idea_task(sid, body.message)
    await novel_idea_agent_service.start_chat_task(task_row["id"], sid, body.message)
    return _idea_task_out(task_row)


@router.get("/sessions/{sid}/tasks/latest", response_model=IdeaTaskOut)
async def get_latest_idea_task(sid: str):
    db_session = await novel_db.get_idea_session(sid)
    if not db_session:
        raise HTTPException(status_code=404, detail="会话不存在")
    task_row = await novel_db.get_latest_idea_task(sid)
    if not task_row:
        raise HTTPException(status_code=404, detail="暂无任务")
    task_row = await _normalize_idea_task_state(task_row)
    return _idea_task_out(task_row)


@router.get("/tasks/{task_id}", response_model=IdeaTaskOut)
async def get_idea_task(task_id: str):
    task_row = await novel_db.get_idea_task(task_id)
    if not task_row:
        raise HTTPException(status_code=404, detail="任务不存在")
    task_row = await _normalize_idea_task_state(task_row)
    return _idea_task_out(task_row)


@router.post("/tasks/{task_id}/cancel", response_model=IdeaTaskOut)
async def cancel_idea_task(task_id: str):
    task_row = await novel_db.get_idea_task(task_id)
    if not task_row:
        raise HTTPException(status_code=404, detail="任务不存在")

    if task_row.get("status") in {"completed", "failed", "cancelled"}:
        return _idea_task_out(task_row)

    cancelled = await novel_idea_agent_service.cancel_chat_task(task_id)
    if not cancelled:
        updated = await novel_db.update_idea_task(task_id, {
            "status": "cancelled",
            "error_message": "任务已取消",
        })
        return _idea_task_out(updated or task_row)

    refreshed = await novel_db.get_idea_task(task_id)
    return _idea_task_out(refreshed or task_row)
