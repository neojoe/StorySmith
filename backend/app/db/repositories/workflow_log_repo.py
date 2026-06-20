"""
WorkflowLogRepository — cs_workflow_logs 表的增删改查。

表结构（严格对齐，共 9 个字段）：
  id, trace_id, session_id, message_id,
  node_name, node_order, status,
  input_data, output_data
"""

from __future__ import annotations

import json
from typing import Any

from loguru import logger

from ..base import BaseRepository, DBNotReadyError
from ..models.workflow_log import WorkflowLog


class WorkflowLogRepository(BaseRepository):

    # ------------------------------------------------------------------
    # 写：批量一次性写入（流结束后调用，整个工作流只产生 1 次 DB 操作）
    # ------------------------------------------------------------------

    async def insert_batch(self, logs: list[WorkflowLog]) -> int:
        """流结束后一次性批量写入全部节点日志。

        Args:
            logs: 内存中聚合完整的 WorkflowLog 列表

        Returns:
            实际写入的行数（失败返回 0，不抛异常）。
        """
        if not logs:
            return 0
        sql = """
            INSERT INTO cs_workflow_logs
              (trace_id, session_id, message_id,
               node_name, node_order, status,
               input_data, output_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        args_list = [
            (
                log.trace_id,
                log.session_id,
                log.message_id or "",
                log.node_name,
                log.node_order,
                log.status,
                json.dumps(log.inputs,  ensure_ascii=False) if log.inputs  else None,
                json.dumps(log.outputs, ensure_ascii=False) if log.outputs else None,
            )
            for log in logs
        ]
        try:
            rows = await self.executemany(sql, args_list)
            logger.info(
                f"workflow_log insert_batch: {rows} rows written, "
                f"trace={logs[0].trace_id!r}"
            )
            return rows
        except DBNotReadyError:
            logger.warning("workflow_log insert_batch: DB not ready, skipped")
            return 0
        except Exception as e:
            logger.warning(f"workflow_log insert_batch failed: {e}")
            return 0

    # ------------------------------------------------------------------
    # 读
    # ------------------------------------------------------------------

    async def query_by_trace(self, trace_id: str) -> list[dict[str, Any]]:
        """按 trace_id 查询该条消息的全部节点日志，按执行顺序排序。"""
        return await self.fetchall(
            "SELECT * FROM cs_workflow_logs WHERE trace_id = %s ORDER BY node_order",
            (trace_id,),
        )

    async def query_by_session(
        self,
        session_id: str,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """按 session_id 查询最近的节点日志。"""
        return await self.fetchall(
            """
            SELECT * FROM cs_workflow_logs
            WHERE session_id = %s
            ORDER BY id DESC
            LIMIT %s
            """,
            (session_id, limit),
        )

    async def query_by_message(self, message_id: str) -> list[dict[str, Any]]:
        """按 message_id 查询该消息的全部节点日志。"""
        return await self.fetchall(
            "SELECT * FROM cs_workflow_logs WHERE message_id = %s ORDER BY node_order",
            (message_id,),
        )
