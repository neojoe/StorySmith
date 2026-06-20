"""
Account Agent — 账户系统专职 Agent。

职责：处理账户注册、KYC 认证、账户状态查询、账户设置等涉及账户系统的操作。
工具：app/tools/account_tools.py
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from langchain_core.tools import BaseTool

from .base import LangGraphAgent
from ..tools.account_tools import (
    query_account_limits,
    query_account_status,
    query_kyc_status,
)


class AccountAgent(LangGraphAgent):
    name = "account"
    description = (
        "处理账户注册、KYC 实名认证、账户状态查询、账户冻结/解封、"
        "账户设置、交易限额等账户系统相关问题"
    )

    @property
    def system_prompt(self) -> str:
        return (
            "你是外汇平台的账户服务专员，负责处理账户注册、KYC 实名认证、账户状态查询及账户设置等问题。\n"
            "\n"
            "回答要求：\n"
            "1. 用中文回复，语气专业、耐心、友好，像真人专员一样沟通。\n"
            "2. 回答具体问题时，在给出结论后适当说明操作路径或注意事项，让用户清楚下一步怎么做。\n"
            "3. 需要查询账户信息时，礼貌向用户索取 user_id，并说明用途，注意保护用户隐私。\n"
            "4. 未获取到 user_id 前不调用账户查询工具。\n"
            "5. 严禁提及\"知识库\"、\"参考信息\"、\"数据库\"等内部系统概念，直接以平台账户专员身份作答。\n"
            "6. 严禁在回答末尾加套话，例如\"如果您还有问题随时联系\"、\"欢迎随时告诉我\"等，直接自然收住。\n"
            "7. 只有当问题明确超出处理范围时才提示联系人工，其他情况不要主动引导转人工。"
        )

    def get_tools(self) -> Sequence[BaseTool | Callable[..., Any]]:
        return [query_account_status, query_kyc_status, query_account_limits]
