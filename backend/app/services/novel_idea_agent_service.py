"""AI inspiration agent service — 基于 story-writer Skill + LangChain create_agent."""
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

_AGENT_NAME = "novel-idea-agent"
_PROJECT_ROOT = Path(
    _os.environ.get("NOVEL_PROJECT_ROOT", "")
).resolve() if _os.environ.get("NOVEL_PROJECT_ROOT") else Path(__file__).resolve().parents[3]
_AGENT_DB_ROOT = _PROJECT_ROOT / "agent_databases"
_SKILL_NAME = "story-writer"

_active_sessions: dict[str, dict] = {}
_active_task_runners: dict[str, asyncio.Task] = {}


def _build_system_prompt() -> str:
    return f"""
你是一个专门负责生成小说灵感、故事方向和故事梗概的 AI Agent。

当前场景不是直接写整本小说，而是先帮助用户反复打磨“开书灵感”。
你必须优先使用 Skills 机制，不要绕开它。

在开始处理用户需求后，第一步优先读取并遵循 `read_skill("{_SKILL_NAME}")` 的完整说明；
如果需要脚本或模板，再结合 `list_skill_files("{_SKILL_NAME}")` 和 `execute_code` 使用。

你的职责：
1. 生成适合网文创作的故事方向
2. 生成可直接用于开书的故事梗概
3. 提供有吸引力的书名候选
4. 当用户要求“再来一版 / 更黑暗 / 更爽 / 更偏女频 / 更偏权谋”时，在上一轮基础上继续迭代

写作要求：
- 全部使用简体中文
- 禁止输出英文策划术语，如 long arc、hook、payoff、foreshadowing 等
- 风格要直接、好懂、适合中文网文创作
- 结果要强调冲突、反转、人物关系、爽点、钩子和传播感
- 如果用户信息不足，先合理补全，不要反复追问细枝末节
- 若生成书名，优先给 3-5 个候选，控制在 4-12 个字，避免“主标题：副标题”

每次正式产出时，必须严格按下面格式返回，方便前端分区展示与复制：

【故事方向】
<1-2 段，偏创作指令，可直接给小说创作 Agent>

【故事梗概】
<1-3 段，偏成品简介/剧情摘要>

【书名候选】
1. 书名A
2. 书名B
3. 书名C

【创作输入】
<把最适合直接交给小说创作 Agent 的整段输入整理成一段完整内容>

输出约束：
- 标题必须逐字使用：`【故事方向】`、`【故事梗概】`、`【书名候选】`、`【创作输入】`
- 不要输出 `【可直接复制】`、`【可复制】`、`【使用建议】`、`【补充说明】` 等其它标题
- 如果某部分内容较少，也要保留该标题，正文可以精简，但不要省略标题
- `【创作输入】` 必须是一段可直接交给小说创作 Agent 的完整输入，不要写解释性前言
""".strip()


async def create_session(session_id: str, user_id: str) -> None:
    """创建并缓存基于 create_agent + SkillMiddleware 的灵感 Agent。

    middleware 栈：
        SkillMiddleware          — 注入 read_skill / list_skill_files（story-writer skill）
        ContextEditingMiddleware — 自动清理旧工具输出，节省 token
    """
    if session_id in _active_sessions:
        return

    settings = get_settings()

    from langchain_openai import ChatOpenAI
    api_key = settings.NOVEL_OPENAI_API_KEY or settings.OPENAI_API_KEY
    base_url = settings.NOVEL_OPENAI_BASE_URL or settings.OPENAI_BASE_URL or None
    model_name = settings.NOVEL_OPENAI_MODEL or "gpt-4o-mini"
    llm = ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=base_url,
        streaming=True,
    )

    agent = create_agent(
        model=llm,
        tools=[],
        system_prompt=_build_system_prompt(),
        middleware=[
            SkillMiddleware(_PROJECT_ROOT),
            ContextEditingMiddleware(),
        ],
        checkpointer=MemorySaver(),
    )

    config = {"configurable": {"thread_id": session_id}, "recursion_limit": 80}
    _active_sessions[session_id] = {
        "agent": agent,
        "config": config,
        "user_id": user_id,
    }
    logger.info(f"Idea agent session created: {session_id} → user={user_id}, skill={_SKILL_NAME}")


def get_session(session_id: str) -> Optional[dict]:
    return _active_sessions.get(session_id)


def remove_session(session_id: str) -> None:
    _active_sessions.pop(session_id, None)


async def iter_chat_events(session_id: str, message: str) -> AsyncGenerator[dict, None]:
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
        logger.exception(f"Idea agent stream error for session {session_id}")
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
        await novel_db.update_idea_task(task_id, payload)

    try:
        await novel_db.update_idea_task(task_id, {
            "status": "running",
            "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "error_message": "",
        })
        await novel_db.update_idea_session(session_id, {"status": "active"})

        async for payload in iter_chat_events(session_id, message):
            event_type = payload.get("type")
            if event_type == "token":
                assistant_content += payload.get("content", "")
                await flush_task_state()
            elif event_type in {"tool_start", "tool_end"}:
                tool_events.append(payload)
                await flush_task_state()
            elif event_type == "error":
                await flush_task_state(status="failed", error_message=payload.get("message", "任务执行失败"), finished=True)
                return
            elif event_type == "done":
                await flush_task_state(status="completed", finished=True)
                return
    except asyncio.CancelledError:
        await flush_task_state(status="cancelled", error_message="任务已取消", finished=True)
        raise
    except Exception as exc:
        logger.exception(f"Idea task failed: {task_id}")
        await flush_task_state(status="failed", error_message=str(exc), finished=True)
    finally:
        _active_task_runners.pop(task_id, None)
