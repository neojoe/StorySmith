"""
BaseRepository — 数据库访问抽象基类。

封装：
  - 连接获取与自动释放（asynccontextmanager）
  - DictCursor 统一返回 dict
  - execute / fetchone / fetchall / executemany 公共方法
  - transaction() 上下文管理器（异常自动 rollback）

子类继承后只需关注 SQL 语句和参数组装，无需重复写连接管理和错误处理。

异常策略：
  - 连接池未就绪 → 抛出 DBNotReadyError（调用方决定降级还是中断）
  - SQL 执行失败 → 原样向上抛出（调用方决定重试/告警/忽略）
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

import aiomysql
from loguru import logger

from .manager import get_pool


class DBNotReadyError(RuntimeError):
    """连接池尚未初始化或已关闭时抛出，供上层优雅降级。"""


class BaseRepository:
    """所有 Repository 的公共基类。

    使用方式：
        class MyRepo(BaseRepository):
            async def find_by_id(self, id: int) -> dict | None:
                return await self.fetchone("SELECT * FROM t WHERE id=%s", (id,))
    """

    # ------------------------------------------------------------------
    # 内部：连接上下文
    # ------------------------------------------------------------------

    @asynccontextmanager
    async def _conn(self):
        """从连接池取一条连接，用完后自动释放回池。"""
        pool = get_pool()
        if pool is None:
            raise DBNotReadyError("MySQL pool is not initialized")
        async with pool.acquire() as conn:
            yield conn

    # ------------------------------------------------------------------
    # 公共方法：读
    # ------------------------------------------------------------------

    async def fetchone(
        self,
        sql: str,
        args: tuple[Any, ...] | None = None,
    ) -> dict[str, Any] | None:
        """执行查询，返回第一行（dict）或 None。"""
        async with self._conn() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, args)
                return await cur.fetchone()

    async def fetchall(
        self,
        sql: str,
        args: tuple[Any, ...] | None = None,
    ) -> list[dict[str, Any]]:
        """执行查询，返回所有行（list[dict]）。"""
        async with self._conn() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, args)
                return await cur.fetchall()

    # ------------------------------------------------------------------
    # 公共方法：写
    # ------------------------------------------------------------------

    async def execute(
        self,
        sql: str,
        args: tuple[Any, ...] | None = None,
        *,
        autocommit: bool = True,
    ) -> int:
        """执行 INSERT / UPDATE / DELETE。

        Returns:
            INSERT 时返回 lastrowid；UPDATE/DELETE 返回 rowcount。
        """
        async with self._conn() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, args)
                if autocommit:
                    await conn.commit()
                return cur.lastrowid or cur.rowcount

    async def executemany(
        self,
        sql: str,
        args_list: list[tuple[Any, ...]],
        *,
        autocommit: bool = True,
    ) -> int:
        """批量执行（INSERT 多行等），返回影响行数。"""
        if not args_list:
            return 0
        async with self._conn() as conn:
            async with conn.cursor() as cur:
                await cur.executemany(sql, args_list)
                if autocommit:
                    await conn.commit()
                return cur.rowcount

    # ------------------------------------------------------------------
    # 显式事务上下文
    # ------------------------------------------------------------------

    @asynccontextmanager
    async def transaction(self):
        """显式事务上下文，异常时自动 rollback。

        用法：
            async with self.transaction() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(...)
                    await cur.execute(...)
                # 正常退出 → commit
                # 抛出异常 → rollback
        """
        async with self._conn() as conn:
            try:
                await conn.begin()
                yield conn
                await conn.commit()
                logger.debug("db: transaction committed")
            except Exception:
                await conn.rollback()
                logger.debug("db: transaction rolled back")
                raise
