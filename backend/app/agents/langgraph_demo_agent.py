"""
LangGraph Demo Agent — 演示如何将自定义 LangGraph 图接入路由系统。

继承 LangGraphAgent，通过 override _build_graph() 使用自定义图。
run() / stream() 继承默认实现（RAG + LLM），无需重写。

=== 新增 LangGraph Agent 的步骤 ===
1. 在 app/graphs/ 下创建 xxx_graph.py，实现 build_graph() 函数
2. 复制本文件，修改 name / description / system_prompt / get_tools()
3. 在 _build_graph() 里调用你的 build_graph()
4. 在 app/agents/__init__.py 中 import 新模块
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from langchain_core.tools import BaseTool, tool
from langgraph.graph.state import CompiledStateGraph
from loguru import logger

from .base import LangGraphAgent
from ..core.config import get_settings


# ── Demo 工具（实际使用时替换为业务工具） ─────────────────────────────

@tool
def get_exchange_rate(base_currency: str, target_currency: str) -> str:
    """查询两种货币之间的模拟汇率。"""
    rates = {
        ("USD", "CNY"): 7.24,
        ("EUR", "USD"): 1.08,
        ("GBP", "USD"): 1.27,
        ("USD", "JPY"): 154.5,
    }
    key = (base_currency.upper(), target_currency.upper())
    rate = rates.get(key)
    if rate:
        return f"1 {base_currency.upper()} = {rate} {target_currency.upper()}"
    reverse = rates.get((key[1], key[0]))
    if reverse:
        return f"1 {base_currency.upper()} = {1/reverse:.4f} {target_currency.upper()}"
    return f"暂无 {base_currency.upper()}/{target_currency.upper()} 的汇率数据"


@tool
def calculate_profit(lots: float, entry_price: float, exit_price: float,
                     pip_value: float = 10.0) -> str:
    """计算外汇交易盈亏。lots=手数, pip_value=每点价值（默认标准手10美元/点）。"""
    pips = (exit_price - entry_price) * 10000
    profit = pips * lots * pip_value
    return f"盈亏计算：{pips:.1f} 点 × {lots} 手 = {profit:.2f} USD"


# ── Agent 定义 ───────────────────────────────────────────────────────

class LangGraphDemoAgent(LangGraphAgent):
    name = "demo"
    description = "LangGraph 演示 Agent，支持汇率查询和盈亏计算（仅做开发参考）"

    @property
    def system_prompt(self) -> str:
        return (
            "你是一个外汇交易助手（Demo），可以查询汇率和计算交易盈亏。\n"
            "当用户询问汇率时，使用 get_exchange_rate 工具查询。\n"
            "当用户询问盈亏时，使用 calculate_profit 工具计算。\n"
            "用中文回答，语气简洁专业。"
        )

    def get_tools(self) -> Sequence[BaseTool | Callable[..., Any]]:
        return [get_exchange_rate, calculate_profit]

    def _build_graph(self) -> CompiledStateGraph:
        """使用自定义 LangGraph 图替换默认的 create_agent。"""
        from ..graphs.demo_graph import build_graph

        logger.debug("building custom graph")
        return build_graph(
            system_prompt=self.system_prompt,
            tools=list(self.get_tools()),
            model_name=self._model_name,
        )
