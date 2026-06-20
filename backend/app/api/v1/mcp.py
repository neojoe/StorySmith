"""
MCP 管理 API。

- GET  /api/v1/mcp/config   — 读取当前 mcp.json 配置
- PUT  /api/v1/mcp/config   — 保存新配置并重新连接所有 MCP server
- GET  /api/v1/mcp/servers  — 查询已连接服务器及其工具列表
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from ...mcp.loader import MCPToolLoader

router = APIRouter()


class McpConfigRequest(BaseModel):
    config: dict  # 完整的 mcp.json 内容，如 {"mcpServers": {...}}


@router.get("/mcp/config", summary="读取 MCP 配置文件")
async def get_mcp_config():
    """返回当前 app/config/mcp.json 的内容。文件不存在时返回空配置。"""
    path = MCPToolLoader.DEFAULT_CONFIG_PATH
    if not path.exists():
        return {"config": {"mcpServers": {}}}
    try:
        raw = path.read_text(encoding="utf-8").strip()
        data = json.loads(raw) if raw else {"mcpServers": {}}
        return {"config": data}
    except Exception as e:
        logger.warning(f"failed to read config: {e}")
        raise HTTPException(status_code=500, detail=f"读取配置失败: {e}")


@router.put("/mcp/config", summary="保存 MCP 配置并重新连接")
async def put_mcp_config(body: McpConfigRequest):
    """
    将新配置写入 mcp.json，断开现有连接后重新初始化所有 MCP server。
    返回成功连接的 server 列表和工具总数。
    """
    path = MCPToolLoader.DEFAULT_CONFIG_PATH
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(body.config, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.info(f"config saved to {path}")
    except Exception as e:
        logger.warning(f"failed to write config: {e}")
        raise HTTPException(status_code=500, detail=f"保存配置失败: {e}")

    await MCPToolLoader.shutdown()
    await MCPToolLoader.initialize()

    connected = MCPToolLoader.available_servers()
    total = sum(len(v) for v in MCPToolLoader._tools.values())
    logger.info(f"reload done, connected={connected}, tools={total}")
    return {
        "ok": True,
        "connected_servers": connected,
        "total_tools": total,
    }


@router.get("/mcp/servers", summary="查询已连接 MCP 服务器及工具列表")
async def get_mcp_servers():
    """返回所有已连接 MCP server 的信息，包括每个工具的名称、描述和参数结构。"""
    servers = []
    for server_name, tools in MCPToolLoader._tools.items():
        tools_info = []
        for t in tools:
            schema: dict | None = None
            try:
                if t.args_schema is not None:
                    schema = t.args_schema.model_json_schema()
            except Exception:
                pass
            tools_info.append({
                "name": t.name,
                "description": t.description or "",
                "schema": schema,
            })
        servers.append({
            "server": server_name,
            "tool_count": len(tools),
            "tools": tools_info,
        })

    return {
        "servers": servers,
        "connected_count": len(servers),
        "total_tools": sum(s["tool_count"] for s in servers),
    }
