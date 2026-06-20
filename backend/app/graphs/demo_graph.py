"""
Demo LangGraph 图 — 展示如何用 StateGraph 手动构建 Agent。

本文件是一个参考模板，演示了 LangGraph 的核心概念：
  - 定义 State（消息列表）
  - 创建节点（LLM 调用、工具调用）
  - 定义边（条件路由）
  - 编译为 CompiledStateGraph

其他同事新增 LangGraph Agent 时，可复制本文件并修改：
  1. 替换 system_prompt
  2. 替换 tools 列表
  3. 按需添加更多节点和边（如审批节点、人工介入节点等）

=== 使用方式 ===
  from app.graphs.demo_graph import build_graph
  graph = build_graph(model_name="gpt-4.1", system_prompt="...", tools=[...])
"""

from __future__ import annotations

from typing import Any, Literal, Sequence

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, MessagesState, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode

from ..core.config import get_settings


def build_graph(
    system_prompt: str,
    tools: Sequence[BaseTool],
    model_name: str | None = None,
) -> CompiledStateGraph:
    """
    构建一个标准的 ReAct 风格 LangGraph Agent。

    流程:  START → agent(LLM) ─┬─ 有 tool_calls → tools → agent(LLM)
                                └─ 无 tool_calls → END

    Args:
        system_prompt: Agent 角色描述
        tools:         可用工具列表
        model_name:    LLM 模型名，None 则使用 Settings 默认值

    Returns:
        编译好的 CompiledStateGraph，可直接 ainvoke / astream_events
    """
    s = get_settings()
    if model_name is None:
        model_name = s.LLM_MODEL.split(":")[-1] if ":" in s.LLM_MODEL else s.LLM_MODEL

    llm = ChatOpenAI(
        model=model_name,
        api_key=s.OPENAI_API_KEY,
        base_url=s.OPENAI_BASE_URL,
    )

    if tools:
        llm = llm.bind_tools(tools)

    # ── 节点定义 ──────────────────────────────────────────────────────

    async def agent_node(state: MessagesState) -> dict[str, Any]:
        """LLM 推理节点：注入 system_prompt 后调用 LLM。"""
        messages = state["messages"]
        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [SystemMessage(content=system_prompt)] + messages
        response = await llm.ainvoke(messages)
        return {"messages": [response]}

    def should_continue(state: MessagesState) -> Literal["tools", "__end__"]:
        """条件边：判断 LLM 是否发起了工具调用。"""
        last = state["messages"][-1]
        if isinstance(last, AIMessage) and last.tool_calls:
            return "tools"
        return "__end__"

    # ── 图构建 ────────────────────────────────────────────────────────

    graph = StateGraph(MessagesState)

    graph.add_node("agent", agent_node)
    graph.set_entry_point("agent")

    if tools:
        tool_node = ToolNode(tools)
        tool_node._handle_tool_errors = True
        graph.add_node("tools", tool_node)
        graph.add_conditional_edges("agent", should_continue)
        graph.add_edge("tools", "agent")
    else:
        graph.add_edge("agent", END)

    return graph.compile()
