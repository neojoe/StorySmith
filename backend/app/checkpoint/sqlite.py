"""
SQLite Checkpoint 后端。

依赖：langgraph-checkpoint-sqlite
安装：pip install langgraph-checkpoint-sqlite
"""

from __future__ import annotations

from contextlib import AsyncExitStack
from pathlib import Path


async def create_sqlite_saver(path: str, stack: AsyncExitStack):
    """
    创建并返回 AsyncSqliteSaver 实例。

    Args:
        path:  SQLite 数据库文件路径（如 "./checkpoints.db"）
        stack: AsyncExitStack，用于管理 saver 的生命周期

    Returns:
        AsyncSqliteSaver 实例
    """
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    # 确保目录存在
    db_path = Path(path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    saver = await stack.enter_async_context(
        AsyncSqliteSaver.from_conn_string(str(db_path))
    )
    return saver
