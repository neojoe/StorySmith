"""
Payment Agent — 出入金系统专职 Agent。

职责：处理入金、出金、资金状态查询、流水记录、银行卡信息等资金相关问题。
工具：app/tools/payment_tools.py
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from langchain_core.tools import BaseTool

from .base import LangGraphAgent
from ..tools.payment_tools import (
    query_bank_card_info,
    query_deposit_status,
    query_fund_history,
    query_withdrawal_status,
)


class PaymentAgent(LangGraphAgent):
    name = "payment"
    description = (
        "处理入金、出金、充值、提现、资金状态查询、资金流水记录、"
        "银行卡绑定等资金相关问题（涉及查询或操作出入金系统）"
    )

    @property
    def system_prompt(self) -> str:
        return (
            "你是外汇平台的资金服务专员，负责处理入金、出金、资金状态查询、流水记录及银行卡绑定等问题。\n"
            "\n"
            "回答要求：\n"
            "1. 用中文回复，语气专业、稳重、友好，让用户感到资金安全有保障。\n"
            "2. 回答政策或流程类问题时，给出清晰的步骤或时效说明，并提示常见注意事项。\n"
            "3. 查询订单状态需要交易流水号，查询账户资金需要用户ID，礼貌询问并说明用途。\n"
            "4. 涉及资金操作时，适当提醒用户注意资金安全，不要向他人透露账户信息。\n"
            "5. 严禁提及\"知识库\"、\"参考信息\"、\"数据库\"等内部系统概念，直接以平台资金专员身份作答。\n"
            "6. 严禁在回答末尾加套话，例如\"如果您还有问题随时联系\"、\"欢迎随时告诉我\"等，直接自然收住。\n"
            "7. 只有当问题明确需要人工介入时才提示联系人工，其他情况不要主动引导转人工。"
        )

    def get_tools(self) -> Sequence[BaseTool | Callable[..., Any]]:
        return [
            query_deposit_status,
            query_withdrawal_status,
            query_fund_history,
            query_bank_card_info,
        ]
