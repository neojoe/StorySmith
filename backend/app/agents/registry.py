"""
Agent 注册中心。

注册流程（全自动，无需手动调用）：
  1. 子类在 BaseAgent 里通过 __init_subclass__ 写入 _REGISTRY
  2. app/agents/__init__.py 导入所有 Agent 模块，触发注册
  3. IntentRouter 初始化时 `import app.agents`，确保注册完成

扩展方式：
  - 新建 app/agents/xxx_agent.py，继承 BaseAgent，定义 name / description
  - 在 app/agents/__init__.py 中 import 该模块即可，无需修改其他代码
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    from .base import BaseAgent

# name -> agent class（在 import 时由 __init_subclass__ 写入）
_REGISTRY: dict[str, type[BaseAgent]] = {}

# name -> agent 单例（延迟初始化）
_INSTANCES: dict[str, BaseAgent] = {}


def get_agent_descriptions() -> dict[str, str]:
    """返回所有已注册 Agent 的 {name: description} 映射。"""
    return {name: cls.description for name, cls in _REGISTRY.items()}


def get_agent(name: str) -> BaseAgent | None:
    """按名称获取 Agent 单例（首次访问时延迟初始化）。"""
    if name not in _INSTANCES:
        cls = _REGISTRY.get(name)
        if cls is None:
            logger.warning(f"agent not found: {name!r}")
            return None
        _INSTANCES[name] = cls()
        logger.debug(f"instantiated agent: {name!r}")
    return _INSTANCES[name]


def list_agents() -> list[str]:
    """返回所有已注册的 Agent 名称列表。"""
    return list(_REGISTRY.keys())
