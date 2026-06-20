"""
MySQL 连接池单例管理器。

生命周期：
  setup()    ← FastAPI lifespan 启动时调用
  get_pool() ← Repository 获取连接池
  shutdown() ← FastAPI lifespan 关闭时调用

配置项（.env）：
  MYSQL_HOST         — 主机地址（为空则跳过初始化）
  MYSQL_PORT         — 端口，默认 3306
  MYSQL_USER         — 用户名
  MYSQL_PASSWORD     — 密码
  MYSQL_DATABASE     — 数据库名
  MYSQL_POOL_MIN     — 连接池最小连接数，默认 2
  MYSQL_POOL_MAX     — 连接池最大连接数，默认 10
  MYSQL_CONNECT_TIMEOUT — 连接超时秒数，默认 10
"""

from __future__ import annotations

import aiomysql
from loguru import logger

from ..core.config import get_settings

# 全局连接池单例
_pool: aiomysql.Pool | None = None


async def setup() -> None:
    """初始化 MySQL 连接池。MYSQL_HOST 未配置时静默跳过。"""
    global _pool

    s = get_settings()
    if not s.MYSQL_HOST:
        logger.info("db: MYSQL_HOST not configured, MySQL disabled")
        return

    try:
        _pool = await aiomysql.create_pool(
            host=s.MYSQL_HOST,
            port=s.MYSQL_PORT,
            user=s.MYSQL_USER,
            password=s.MYSQL_PASSWORD,
            db=s.MYSQL_DATABASE,
            charset="utf8mb4",
            autocommit=False,
            minsize=s.MYSQL_POOL_MIN,
            maxsize=s.MYSQL_POOL_MAX,
            connect_timeout=s.MYSQL_CONNECT_TIMEOUT,
            # 自动 ping 失效连接，避免 "MySQL has gone away"
            echo=False,
        )
        logger.info(
            f"db: MySQL pool ready "
            f"({s.MYSQL_HOST}:{s.MYSQL_PORT}/{s.MYSQL_DATABASE}, "
            f"pool={s.MYSQL_POOL_MIN}~{s.MYSQL_POOL_MAX})"
        )
    except Exception as e:
        logger.error(f"db: MySQL pool setup failed — {type(e).__name__}: {e}")
        _pool = None


async def shutdown() -> None:
    """关闭连接池，释放所有连接。"""
    global _pool

    if _pool is not None:
        _pool.close()
        await _pool.wait_closed()
        _pool = None
        logger.info("db: MySQL pool closed")


def get_pool() -> aiomysql.Pool | None:
    """获取当前连接池单例。未初始化时返回 None。"""
    return _pool


def is_ready() -> bool:
    """判断连接池是否可用。"""
    return _pool is not None
