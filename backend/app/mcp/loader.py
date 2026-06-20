"""
MCP Tool 加载器。

从 app/config/mcp.json 读取 MCP server 配置，在 app 启动时通过
MultiServerMCPClient 加载工具列表并缓存，供各 Agent 按需挂载。

工具对象（BaseTool）在被 Agent 实际调用时才建立 HTTP 连接，
因此不存在长连接管理问题（避免 anyio cancel-scope 跨 task 的错误）。

配置文件不存在或内容为空时，静默跳过（不影响正常启动）。
单个 MCP server 连接失败时，记录警告并跳过，不影响其他 server。

=== 使用方式 ===

1. app 启动时（main.py lifespan）：
      await MCPToolLoader.initialize()

2. Agent get_tools() 里按需取：
      from app.mcp.loader import MCPToolLoader
      mcp_tools = MCPToolLoader.get_tools(["firecrawl"])   # 指定 server
      mcp_tools = MCPToolLoader.get_tools()                # 全部

3. app 关闭时（main.py lifespan）：
      await MCPToolLoader.shutdown()

=== 配置文件位置 ===
      app/config/mcp.json   ← 默认路径（与 Cursor mcp.json 格式相同）
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from langchain_core.tools import BaseTool
from loguru import logger


# ---------------------------------------------------------------------------
# mcp.json 解析
# ---------------------------------------------------------------------------

def _parse_mcp_json(path: str | Path) -> dict[str, Any]:
    """
    读取并解析 mcp.json。
    文件不存在、内容为空或格式错误时返回空 dict，不抛异常。
    """
    p = Path(path)
    if not p.exists():
        logger.info(f"config file not found: {p}, skipping")
        return {}

    try:
        text = p.read_text(encoding="utf-8").strip()
        if not text:
            logger.info(f"config file is empty: {p}, skipping")
            return {}
        data = json.loads(text)
        servers = data.get("mcpServers", {})
        if not servers:
            logger.info(f"no mcpServers entries in {p}, skipping")
        return servers
    except json.JSONDecodeError as e:
        logger.warning(f"failed to parse {p}: {e}, skipping")
        return {}


def _to_connection(name: str, cfg: dict[str, Any]) -> dict[str, Any] | None:
    """
    将 mcp.json 单个 server 配置转换为 MultiServerMCPClient 连接格式。

    mcp.json type 字段 → langchain_mcp_adapters transport 字段映射：
      http / remote → streamable_http（自动降级到 sse）
      sse           → sse
      stdio / 默认  → stdio
      studio        → None（跳过）
    """
    server_type = cfg.get("type", "stdio")

    if server_type == "studio":
        logger.debug(f"'{name}' type=studio is Cursor-specific, skipped")
        return None

    if server_type in ("http", "remote"):
        url = cfg.get("url")
        if not url:
            logger.warning(f"'{name}' missing url, skipped")
            return None
        conn: dict[str, Any] = {"transport": "streamable_http", "url": url}
        if cfg.get("headers"):
            conn["headers"] = cfg["headers"]
        return conn

    if server_type == "sse":
        url = cfg.get("url")
        if not url:
            logger.warning(f"'{name}' missing url, skipped")
            return None
        conn = {"transport": "sse", "url": url}
        if cfg.get("headers"):
            conn["headers"] = cfg["headers"]
        return conn

    # stdio（默认）
    command: str = cfg.get("command", "")
    if not command:
        logger.warning(f"'{name}' missing command, skipped")
        return None

    args: list[str] = cfg.get("args", [])
    if " " in command and not args:
        parts = command.split()
        command, args = parts[0], parts[1:]

    env = {**os.environ, **cfg.get("env", {})}
    return {"transport": "stdio", "command": command, "args": args, "env": env}


# ---------------------------------------------------------------------------
# MCPToolLoader
# ---------------------------------------------------------------------------

class MCPToolLoader:
    """
    MCP Tool 单例管理器。

    生命周期：
      initialize()  ← FastAPI lifespan 启动时调用（异步）
      get_tools()   ← Agent get_tools() 里同步调用（直接读缓存）
      shutdown()    ← FastAPI lifespan 关闭时调用（异步，目前为 no-op）
    """

    # server_name -> [LangChain BaseTool]
    _tools: dict[str, list[BaseTool]] = {}

    # mcp.json 默认路径：项目根目录下的 app/config/mcp.json
    DEFAULT_CONFIG_PATH: Path = Path(__file__).parent.parent / "config" / "mcp.json"

    @classmethod
    async def initialize(cls, config_path: str | Path | None = None) -> None:
        """
        读取 mcp.json，通过 MultiServerMCPClient 加载各 server 的工具列表并缓存。
        config_path 为 None 时使用 app/config/mcp.json。
        任何单个 server 失败不影响整体启动。
        """
        from langchain_mcp_adapters.client import MultiServerMCPClient

        path = Path(config_path) if config_path else cls.DEFAULT_CONFIG_PATH
        servers = _parse_mcp_json(path)

        if not servers:
            logger.info("no servers to initialize")
            return

        logger.info(f"initializing {len(servers)} server(s): {list(servers)}")

        for name, cfg in servers.items():
            conn = _to_connection(name, cfg)
            if conn is None:
                continue
            try:
                client = MultiServerMCPClient({name: conn})
                tools = await client.get_tools(server_name=name)
                if tools:
                    cls._tools[name] = tools
                    logger.info(f"'{name}' ready, {len(tools)} tool(s) loaded")
                else:
                    logger.debug(f"'{name}' connected but has no tools")
            except Exception as e:
                logger.warning(f"'{name}' failed to load tools: {type(e).__name__}: {e}")

    @classmethod
    async def shutdown(cls) -> None:
        """清理缓存（MultiServerMCPClient 不维持长连接，无需显式关闭）。"""
        cls._tools.clear()
        logger.info("MCPToolLoader cleared")

    @classmethod
    def get_tools(cls, server_names: list[str] | None = None) -> list[BaseTool]:
        """
        同步获取工具列表（直接读内存缓存），供 Agent get_tools() 调用。

        Args:
            server_names: 指定 server 名称列表；None 表示返回所有 server 的工具。

        Returns:
            LangChain BaseTool 列表；未找到 server 或未初始化时返回空列表。
        """
        if not cls._tools:
            logger.debug("no tools loaded (not initialized or all servers failed)")
            return []

        if server_names is None:
            return [t for tools in cls._tools.values() for t in tools]

        result: list[BaseTool] = []
        for name in server_names:
            if name not in cls._tools:
                logger.debug(f"server '{name}' not available, skipping")
                continue
            result.extend(cls._tools[name])
        return result

    @classmethod
    def get_tool_by_name(cls, tool_name: str) -> BaseTool | None:
        """
        按工具名查找并返回对应的 LangChain BaseTool。

        遍历所有已连接 server 的工具，返回第一个 name 匹配的工具。
        未找到时返回 None。

        用法示例：
            search_tool = MCPToolLoader.get_tool_by_name("tavily_search")
            if search_tool:
                return [search_tool]
        """
        for tools in cls._tools.values():
            for t in tools:
                if t.name == tool_name:
                    return t
        logger.debug(f"tool '{tool_name}' not found in any connected server")
        return None

    @classmethod
    def available_servers(cls) -> list[str]:
        """返回已成功连接的 MCP server 名称列表。"""
        return list(cls._tools.keys())

    @classmethod
    def is_initialized(cls) -> bool:
        """是否已完成初始化（即使没有任何可用 server 也算已初始化）。"""
        return True  # shutdown 之前永远为 True
