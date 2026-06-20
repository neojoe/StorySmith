"""
PostgreSQL 连接池单例管理器（asyncpg）。

生命周期：
  setup()    ← FastAPI lifespan 启动时调用
  get_pool() ← 业务层获取连接池
  shutdown() ← FastAPI lifespan 关闭时调用

配置项（.env）：
  PG_HOST       — 主机地址（为空则跳过初始化）
  PG_PORT       — 端口，默认 15432
  PG_USER       — 用户名
  PG_PASSWORD   — 密码
  PG_DATABASE   — 数据库名
  PG_POOL_MIN   — 连接池最小连接数，默认 2
  PG_POOL_MAX   — 连接池最大连接数，默认 10
"""
from __future__ import annotations

import asyncpg
from loguru import logger

from ..core.config import get_settings

_pool: asyncpg.Pool | None = None


async def setup() -> None:
    """初始化 PostgreSQL 连接池。PG_HOST 未配置时静默跳过。"""
    global _pool

    s = get_settings()
    if not s.PG_HOST:
        logger.info("pg: PG_HOST not configured, PostgreSQL disabled")
        return

    try:
        _pool = await asyncpg.create_pool(
            host=s.PG_HOST,
            port=s.PG_PORT,
            user=s.PG_USER,
            password=s.PG_PASSWORD,
            database=s.PG_DATABASE,
            min_size=s.PG_POOL_MIN,
            max_size=s.PG_POOL_MAX,
            command_timeout=30,
        )
        logger.info(
            f"pg: PostgreSQL pool ready "
            f"({s.PG_HOST}:{s.PG_PORT}/{s.PG_DATABASE}, "
            f"pool={s.PG_POOL_MIN}~{s.PG_POOL_MAX})"
        )
    except Exception as e:
        logger.error(f"pg: PostgreSQL pool setup failed — {type(e).__name__}: {e}")
        _pool = None


async def shutdown() -> None:
    """关闭连接池，释放所有连接。"""
    global _pool

    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("pg: PostgreSQL pool closed")


def get_pool() -> asyncpg.Pool:
    """获取连接池。未初始化时抛出 RuntimeError。"""
    if _pool is None:
        raise RuntimeError(
            "PostgreSQL pool is not initialized. "
            "Make sure PG_HOST is configured and pg_manager.setup() has been called."
        )
    return _pool


def is_ready() -> bool:
    """判断连接池是否可用。"""
    return _pool is not None
