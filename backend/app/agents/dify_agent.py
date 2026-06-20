"""
Dify Agent — 通过远程 Dify API 执行对话。

直接继承 BaseAgent（不使用 LangGraph），
自行实现 run() / stream() 调用 Dify REST API。

配置项（.env）：
  DIFY_API_URL  — Dify chat-messages 端点
  DIFY_API_KEY  — Dify 应用的 API Key

工作流节点日志：
  stream_events() 在内存中聚合所有节点事件，流正常结束后一次性批量写入
  cs_workflow_logs 表（仅需 1 次 DB 操作）。MySQL 未配置时静默跳过。
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
from loguru import logger

from .base import BaseAgent
from ..core.config import get_settings


class DifyAgent(BaseAgent):
    name = "dify"
    description = "通过 Dify 平台执行复杂工作流或对话任务（如报告生成、文档分析等）"

    def __init__(self) -> None:
        s = get_settings()
        self._api_url = s.DIFY_API_URL
        self._api_key = s.DIFY_API_KEY
        if not self._api_url or not self._api_key:
            logger.warning("[DifyAgent] DIFY_API_URL or DIFY_API_KEY not configured")
        logger.debug(f"initialized, url={self._api_url!r}")

    def _build_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    def _build_payload(self, query: str, response_mode: str = "blocking",
                       user: str = "ai-customer-service") -> dict:
        return {
            "inputs": {},
            "query": query,
            "response_mode": response_mode,
            "user": user,
        }

    async def run(self, query: str, **kwargs: Any) -> str:
        """同步模式调用 Dify API，返回完整回复。"""
        logger.info(f"run query={query[:80]!r}")
        payload = self._build_payload(query, response_mode="blocking")
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    self._api_url,
                    headers=self._build_headers(),
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                answer = data.get("answer", "")
                logger.info(f"got answer, len={len(answer)}")
                return answer
        except Exception as e:
            logger.exception(f"run error: {e}")
            return "抱歉，Dify 服务暂时无法响应，请稍后再试。"

    async def stream(self, query: str, **kwargs: Any) -> AsyncIterator[str]:
        """流式模式调用 Dify API，逐 token yield。"""
        logger.info(f"stream query={query[:80]!r}")
        payload = self._build_payload(query, response_mode="streaming")
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream(
                    "POST",
                    self._api_url,
                    headers=self._build_headers(),
                    json=payload,
                ) as resp:
                    resp.raise_for_status()
                    buf = ""
                    async for raw in resp.aiter_text():
                        buf += raw
                        while "\n" in buf:
                            line, buf = buf.split("\n", 1)
                            line = line.strip()
                            if not line or not line.startswith("data: "):
                                continue
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                return
                            try:
                                chunk = json.loads(data_str)
                            except json.JSONDecodeError:
                                continue
                            event = chunk.get("event")
                            if event == "message":
                                answer = chunk.get("answer", "")
                                if answer:
                                    yield answer
                            elif event == "message_end":
                                return
        except Exception as e:
            logger.exception(f"stream error: {e}")
            yield "抱歉，Dify 服务暂时无法响应，请稍后再试。"

    async def stream_events(self, query: str, **kwargs: Any) -> AsyncIterator[dict]:
        """流式模式调用 Dify API，yield 结构化事件 dict。

        事件类型（对外 yield）：
          {"type": "token",          "content": "..."}          — LLM 文字 token
          {"type": "human_transfer", "form_token": "...",
           "node_title": "...", "form_content": "...",
           "actions": [...], "expiration_time": ...}             — 转人工节点触发

        工作流节点日志（内部行为，对调用方透明）：
          - 流式期间在内存 _node_buffer 中聚合 node_started / node_finished 事件
          - 流正常结束（message_end）时：补填 message_id → 一次性批量写入 DB
          - 流中断（stop / 断连）时：写入已完成节点的数据（status=started 的节点跳过）
          - MySQL 未配置时静默跳过，不影响主流程
        """
        logger.info(f"stream_events query={query[:80]!r}")
        session_id: str = kwargs.get("session_id", "")
        payload = self._build_payload(query, response_mode="streaming")

        # ── 内存缓冲：node_execution_id → WorkflowLog ──────────────────
        from ..db.models.workflow_log import WorkflowLog
        from ..db.repositories.workflow_log_repo import WorkflowLogRepository

        node_buffer: dict[str, WorkflowLog] = {}
        node_order_counter = 0   # 自维护递增序号，不依赖 Dify 的 index 字段
        repo = WorkflowLogRepository()

        async def _flush(message_id: str = "") -> None:
            """将内存中已完成的节点批量写入数据库，started 状态（未配对）跳过。"""
            completed = [
                log for log in node_buffer.values()
                if log.status != "started"
            ]
            if not completed:
                return
            if message_id:
                for log in completed:
                    log.message_id = message_id
            await repo.insert_batch(completed)

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream(
                    "POST",
                    self._api_url,
                    headers=self._build_headers(),
                    json=payload,
                ) as resp:
                    resp.raise_for_status()
                    buf = ""
                    async for raw in resp.aiter_text():
                        buf += raw
                        while "\n" in buf:
                            line, buf = buf.split("\n", 1)
                            line = line.strip()
                            if not line or not line.startswith("data: "):
                                continue
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                await _flush()
                                return
                            try:
                                chunk = json.loads(data_str)
                            except json.JSONDecodeError:
                                continue

                            event = chunk.get("event")

                            # ── 工作流节点日志收集（内部，不 yield）──────
                            if event == "node_started":
                                node_order_counter += 1
                                log = WorkflowLog.from_node_started(
                                    chunk, session_id, node_order=node_order_counter
                                )
                                node_buffer[log.node_execution_id] = log

                            elif event == "node_finished":
                                exec_id = chunk.get("data", {}).get("id", "")
                                if exec_id in node_buffer:
                                    node_buffer[exec_id].apply_node_finished(chunk)

                            # ── 对外 yield 的事件 ────────────────────────
                            elif event == "message":
                                answer = chunk.get("answer", "")
                                if answer:
                                    yield {"type": "token", "content": answer}

                            elif event == "human_input_required":
                                d = chunk.get("data", {})
                                # 转人工前先把已完成节点落库
                                await _flush()
                                yield {
                                    "type": "human_transfer",
                                    "form_token": d.get("form_token", ""),
                                    "node_title": d.get("node_title", "人工介入"),
                                    "form_content": d.get("form_content", ""),
                                    "actions": [
                                        {"id": a["id"], "title": a["title"]}
                                        for a in d.get("actions", [])
                                    ],
                                    "expiration_time": d.get("expiration_time"),
                                }
                                return  # 转人工后结束本次流

                            elif event == "message_end":
                                # 流正常结束：补填 message_id，一次性批量写入
                                message_id = chunk.get("message_id", "")
                                await _flush(message_id)
                                return

        except Exception as e:
            logger.exception(f"stream_events error: {e}")
            # 异常时尝试写入已收集的已完成节点，尽量不丢数据
            try:
                await _flush()
            except Exception:
                pass
            yield {"type": "token", "content": "抱歉，Dify 服务暂时无法响应，请稍后再试。"}
