"""
Checkpoint 管理包。

统一管理 LangGraph checkpointer 的生命周期，供 Agent 按需引用。

支持的后端（通过 .env CHECKPOINT_BACKEND 配置）：
  none     — 不启用，每次请求无记忆（默认）
  memory   — InMemorySaver，进程存活期间有记忆，重启丢失
  sqlite   — AsyncSqliteSaver，本地文件持久化（单机生产）
  postgres — AsyncPostgresSaver，数据库持久化（多机生产）

=== 使用方式 ===

1. app/main.py lifespan 里：
      from app.checkpoint import setup, shutdown
      await setup()    # 启动时
      await shutdown() # 关闭时

2. Agent _build_graph() 里按需引入：
      from app.checkpoint import get_checkpointer
      checkpointer = get_checkpointer()
      graph = ...
      return graph.compile(checkpointer=checkpointer)
"""

from .manager import get_checkpointer, setup, shutdown

__all__ = ["setup", "shutdown", "get_checkpointer"]
