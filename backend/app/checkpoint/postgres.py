"""
PostgreSQL Checkpoint 后端。

依赖：langgraph-checkpoint-postgres
安装：pip install langgraph-checkpoint-postgres

连接串格式（.env CHECKPOINT_POSTGRES_URL）：
  postgresql+psycopg://user:password@host:5432/dbname
"""

from __future__ import annotations

from contextlib import AsyncExitStack


async def create_postgres_saver(url: str, stack: AsyncExitStack):
    """
    创建并返回 AsyncPostgresSaver 实例，自动建表。

    Args:
        url:   PostgreSQL 连接串
        stack: AsyncExitStack，用于管理 saver 的生命周期

    Returns:
        AsyncPostgresSaver 实例
    """
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    saver = await stack.enter_async_context(
        AsyncPostgresSaver.from_conn_string(url)
    )
    # 首次运行自动建表（已存在则跳过）
    await saver.setup()
    return saver
