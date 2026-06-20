"""
General Agent — 通用兜底 Agent。

职责：
  - 处理意图识别置信度低或无法匹配专职 Agent 的问题
  - 通过 tavily_search 工具搜索实时信息（新闻、行情等）
  - 必要时引导用户转接人工客服

注意：
  name="" 使其不参与意图分类路由，
  仅由 IntentRouter 在 fallback 时直接调用。
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from langchain.agents.middleware.types import AgentMiddleware, AgentState, before_model
from langchain_core.messages import trim_messages
from langchain_core.tools import BaseTool
from loguru import logger

from .base import LangGraphAgent
from ..tools.general_tools import collect_feedback, escalate_to_human


class GeneralAgent(LangGraphAgent):
    name = ""
    description = ""

    @property
    def system_prompt(self) -> str:
        return (
            "你是外汇平台的智能客服助手，能够处理各类交易、账户、资金及平台使用相关的问题。\n"
            "\n"
            "## 工具使用\n"
            "你拥有联网搜索工具 tavily_search，可以搜索互联网上的实时信息。\n"
            "当用户询问新闻、时事、市场动态、汇率走势等需要最新信息的问题时，\n"
            "你必须主动调用 tavily_search 进行搜索，获取最新结果后再回答。\n"
            "不要凭记忆猜测时事类问题的答案，一定要先搜索再回复。\n"
            "\n"
            "## 回答风格\n"
            "1. 用中文回复，像一个真人客服同事在聊天，自然、专业、有温度。\n"
            "2. 直接切入主题回答问题，不要用\"简短回答：\"\"结论：\"\"要点梳理：\"等标签式开头。\n"
            "3. 不要出现\"您给出的时间\"\"根据搜索结果\"\"基于多家媒体报道\"等暴露工作流程的措辞，\n"
            "   直接用自然语言陈述事实即可。\n"
            "4. 回答时适当补充背景信息或操作建议，内容充实但不啰嗦。\n"
            "5. 严禁提及\"知识库\"\"参考信息\"\"数据库\"\"搜索工具\"等内部概念，以平台客服身份直接作答。\n"
            "6. 严禁在回答末尾加套话，例如\"如果您还有问题随时联系\"\"欢迎随时告诉我\"等，直接自然收住。\n"
            "7. 只有当问题明确超出 AI 服务范围时，才提供转接人工客服的选项，不要在每条回答末尾都提。"
        )

    def get_tools(self) -> Sequence[BaseTool | Callable[..., Any]]:
        from ..mcp.loader import MCPToolLoader

        tool = MCPToolLoader.get_tool_by_name("tavily_search")
        if tool is not None:
            return [tool]

        logger.debug("tavily_search unavailable, falling back to built-in tools")
        return [escalate_to_human, collect_feedback]

    def get_middleware(self) -> list[AgentMiddleware]:
        @before_model
        def trim_history(state: AgentState, runtime) -> dict:
            trimmed = trim_messages(
                state["messages"],
                max_tokens=20,
                token_counter=len,
                strategy="last",
                include_system=True,
                start_on="human",
                allow_partial=False,
            )
            return {"messages": trimmed}

        return [trim_history]
