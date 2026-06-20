"""
app.db — MySQL 数据库访问层。

对外暴露：
  setup()    — 初始化连接池（FastAPI lifespan 启动时调用）
  shutdown() — 关闭连接池（FastAPI lifespan 关闭时调用）
  is_ready() — 判断连接池是否可用
  get_pool() — 获取底层 aiomysql.Pool（Repository 内部使用）
"""

from .manager import get_pool, is_ready, setup, shutdown

__all__ = ["setup", "shutdown", "is_ready", "get_pool"]
