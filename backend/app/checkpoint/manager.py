"""
Checkpoint 单例管理器。

生命周期：
  setup()           ← FastAPI lifespan 启动时调用
  get_checkpointer() ← Agent _build_graph() 里获取单例
  shutdown()        ← FastAPI lifespan 关闭时调用

backend 对应关系：
  none/""  → None（无记忆）
  memory   → InMemorySaver（进程内存）
  sqlite   → AsyncSqliteSaver（文件）
  postgres → AsyncPostgresSaver（数据库）
"""

from __future__ import annotations

from contextlib import AsyncExitStack
from typing import Any

from loguru import logger

# 全局单例
_checkpointer: Any = None
_exit_stack: AsyncExitStack | None = None


async def setup() -> None:
    """根据配置初始化 checkpointer。应在 app 启动时（lifespan）调用一次。"""
    global _checkpointer, _exit_stack

    from ..core.config import get_settings
    s = get_settings()
    backend = s.CHECKPOINT_BACKEND.lower().strip()

    # ── 无记忆 ────────────────────────────────────────────────────────────
    if not backend or backend == "none":
        logger.info("checkpoint: disabled (stateless mode)")
        return

    # ── 内存存储 ──────────────────────────────────────────────────────────
    if backend == "memory":
        from langgraph.checkpoint.memory import InMemorySaver
        _checkpointer = InMemorySaver()
        logger.info("checkpoint: InMemorySaver (memory, resets on restart)")
        return

    # ── 持久化后端（需要 AsyncExitStack 管理连接生命周期）─────────────────
    _exit_stack = AsyncExitStack()
    await _exit_stack.__aenter__()

    try:
        if backend == "sqlite":
            from .sqlite import create_sqlite_saver
            _checkpointer = await create_sqlite_saver(s.CHECKPOINT_SQLITE_PATH, _exit_stack)
            logger.info(f"checkpoint: SQLite ({s.CHECKPOINT_SQLITE_PATH})")

        elif backend == "postgres":
            if not s.CHECKPOINT_POSTGRES_URL:
                logger.warning(
                    "checkpoint: CHECKPOINT_POSTGRES_URL not set, falling back to none"
                )
                await _exit_stack.__aexit__(None, None, None)
                _exit_stack = None
                return
            from .postgres import create_postgres_saver
            _checkpointer = await create_postgres_saver(s.CHECKPOINT_POSTGRES_URL, _exit_stack)
            logger.info("checkpoint: PostgreSQL")

        else:
            logger.warning(f"checkpoint: unknown backend {backend!r}, disabled")
            await _exit_stack.__aexit__(None, None, None)
            _exit_stack = None

    except Exception as e:
        logger.error(f"checkpoint: setup failed ({type(e).__name__}: {e}), disabled")
        try:
            await _exit_stack.__aexit__(None, None, None)
        except Exception:
            pass
        _exit_stack = None
        _checkpointer = None


async def shutdown() -> None:
    """关闭 checkpointer 连接，释放资源。应在 app 关闭时（lifespan）调用。"""
    global _checkpointer, _exit_stack

    if _exit_stack is not None:
        try:
            await _exit_stack.__aexit__(None, None, None)
        except Exception as e:
            logger.debug(f"checkpoint: exit_stack close error: {e}")
        _exit_stack = None

    _checkpointer = None
    logger.info("checkpoint: shutdown complete")


def get_checkpointer() -> Any:
    """获取当前 checkpointer 单例。未配置时返回 None。"""
    return _checkpointer
