"""
FAQ Agent — 常见问题与知识库问答专职 Agent。

职责：回答外汇常识、平台规则、App 使用等纯知识性问题，无需查询系统。
工具：app/tools/faq_tools.py
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from langchain_core.tools import BaseTool

from .base import LangGraphAgent
from ..tools.faq_tools import get_app_guide, search_knowledge_base


class FAQAgent(LangGraphAgent):
    name = "faq"
    description = (
        "回答平台规则、账户类型、交易品种参数、App下载/使用、注册流程等"
        "平台内部知识性常见问题（不涉及实时新闻、市场行情或时事动态）"
    )

    @property
    def system_prompt(self) -> str:
        return (
            "你是外汇平台的专业客服顾问，熟悉平台规则、交易产品、账户类型和外汇基础知识。\n"
            "\n"
            "回答要求：\n"
            "1. 用中文回复，语气专业、亲切、自然，像真人客服一样沟通，不要像在朗读文档。\n"
            "2. 在准确回答核心问题的基础上，适当补充相关背景、注意事项或实用建议，让回答更有价值。\n"
            "3. 如果用户同时问了多个问题，逐条清晰作答。\n"
            "4. 严禁提及\"知识库\"、\"参考信息\"、\"数据库\"等内部系统概念，直接以平台客服身份作答。\n"
            "5. 严禁在回答末尾加套话结尾，例如：\"如果您还有问题随时联系\"、\"欢迎随时告诉我\"、\n"
            "   \"请随时联系人工客服\"、\"如需进一步帮助请联系\"等，这类结尾一律不要写，直接自然收住。\n"
            "6. 只有当问题明确超出你的能力范围时，才可以提示用户联系人工；其他情况不要主动引导转人工。"
        )

    def get_tools(self) -> Sequence[BaseTool | Callable[..., Any]]:
        return [search_knowledge_base, get_app_guide]
