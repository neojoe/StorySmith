"""
WorkflowLog — 工作流节点日志数据模型。

对应数据库表 cs_workflow_logs，字段与 Dify SSE 事件字段一一对应：
  trace_id          ← workflow_run_id（整条消息所有节点共享）
  node_execution_id ← data.id（node_started / node_finished 的配对键）
  node_id           ← data.node_id（Dify 内部节点 ID）
  node_name         ← data.title（节点显示名称）
  node_type         ← data.node_type（llm / code / if-else / ...）
  node_order        ← data.index（节点在流程中的执行顺序）
  status            ← started / success / failed / skipped

建表 SQL 见 docs/sql/cs_workflow_logs.sql
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

# 与数据库 ENUM 对齐
NodeStatus = Literal["started", "success", "failed", "skipped"]


@dataclass
class WorkflowLog:
    """工作流节点日志，一个实例对应表中一行记录。

    必填字段（node_started 事件即可填充）：
        trace_id, session_id, node_name, node_order, status

    可选字段（node_finished 事件补全）：
        message_id, elapsed_time, outputs, error_message, finished_at
    """

    # ── 必填 ──────────────────────────────────────────────────────────
    trace_id: str
    session_id: str
    node_name: str
    node_order: int
    status: NodeStatus

    # ── 可选：节点标识 ────────────────────────────────────────────────
    message_id: str = ""
    node_type: str = ""
    node_id: str = ""
    node_execution_id: str = ""       # node_started/finished 配对键
    parent_node_id: str = ""

    # ── 可选：时序 ────────────────────────────────────────────────────
    started_at: datetime | None = None
    finished_at: datetime | None = None
    elapsed_time: float | None = None  # 秒，来自 node_finished.elapsed_time

    # ── 可选：数据 ────────────────────────────────────────────────────
    inputs: dict | None = None
    outputs: dict | None = None
    error_message: str | None = None

    # ── 数据库自动生成 ────────────────────────────────────────────────
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    # ------------------------------------------------------------------
    # 工厂方法：从 Dify SSE 事件 dict 构造实例
    # ------------------------------------------------------------------

    @classmethod
    def from_node_started(
        cls,
        event: dict,
        session_id: str,
        message_id: str = "",
        node_order: int = 0,
    ) -> WorkflowLog:
        """从 Dify node_started 事件构造日志（status=started）。

        Args:
            event:      完整的 SSE 事件 dict（含顶层 workflow_run_id 和 data）
            session_id: 业务层的会话 ID
            message_id: 可选，此时通常还未产生（message_end 后补全）
            node_order: 节点执行序号，由调用方自维护递增计数器传入；
                        不依赖 Dify 的 data.index（部分版本该字段对所有节点都为 1）
        """
        data = event.get("data", {})
        started_ts = data.get("created_at")
        return cls(
            trace_id=event.get("workflow_run_id", ""),
            session_id=session_id,
            message_id=message_id,
            node_name=data.get("title", ""),
            node_type=data.get("node_type", ""),
            node_id=data.get("node_id", ""),
            node_execution_id=data.get("id", ""),
            parent_node_id=data.get("predecessor_node_id") or "",
            node_order=node_order,
            status="started",
            started_at=(
                datetime.utcfromtimestamp(started_ts)
                if isinstance(started_ts, (int, float))
                else datetime.utcnow()
            ),
        )

    @classmethod
    def _map_dify_status(cls, dify_status: str) -> NodeStatus:
        """将 Dify status 字符串映射到本表的 NodeStatus。

        Dify 返回值：succeeded / failed / skipped
        本表枚举：    success  / failed / skipped
        """
        mapping: dict[str, NodeStatus] = {
            "succeeded": "success",
            "success":   "success",
            "failed":    "failed",
            "skipped":   "skipped",
        }
        return mapping.get(dify_status, "failed")

    def apply_node_finished(self, event: dict, message_id: str = "") -> None:
        """用 node_finished 事件数据原地更新当前实例（status / 耗时 / 输入输出）。

        Args:
            event:      完整的 SSE 事件 dict
            message_id: 如已知则一并更新
        """
        data = event.get("data", {})
        finished_ts = data.get("finished_at")

        self.status = self._map_dify_status(data.get("status", ""))
        self.elapsed_time = data.get("elapsed_time")
        self.inputs = data.get("inputs")
        self.outputs = data.get("outputs")
        self.error_message = data.get("error") or None
        self.finished_at = (
            datetime.utcfromtimestamp(finished_ts)
            if isinstance(finished_ts, (int, float))
            else datetime.utcnow()
        )
        if message_id:
            self.message_id = message_id

    def __repr__(self) -> str:
        return (
            f"WorkflowLog(trace={self.trace_id!r}, node={self.node_name!r}, "
            f"order={self.node_order}, status={self.status!r})"
        )
