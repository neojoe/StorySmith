"""
Payment Agent 工具集。

包含：入金/出金状态查询、资金流水、银行卡信息等出入金系统相关工具。
接入真实出入金后台 API 时，替换 TODO 部分即可，接口签名保持不变。
"""

from langchain_core.tools import tool
from loguru import logger


@tool
def query_deposit_status(transaction_id: str) -> str:
    """查询指定入金订单的处理状态。需要提供交易流水号（transaction_id）。"""
    logger.debug(f"txn_id={transaction_id!r}")
    # TODO: 接入出入金后台 API
    # 示例：
    #   from app.tools._payment_client import PaymentAPIClient
    #   data = await PaymentAPIClient(...).get_deposit_status(transaction_id)
    #   return f"入金单状态：{data['status']}，预计到账时间：{data['eta']}"
    return f"[占位] 入金单 {transaction_id}：处理中，预计 2 小时内到账（待接入 API）"


@tool
def query_withdrawal_status(transaction_id: str) -> str:
    """查询指定出金订单的处理状态。需要提供交易流水号（transaction_id）。"""
    logger.debug(f"txn_id={transaction_id!r}")
    # TODO: 接入出入金后台 API
    return f"[占位] 出金单 {transaction_id}：已提交银行，1-3 个工作日到账（待接入 API）"


@tool
def query_fund_history(user_id: str) -> str:
    """查询用户最近的资金流水记录（入金/出金历史）。需要提供用户ID。"""
    logger.debug(f"user_id={user_id!r}")
    # TODO: 接入资金记录查询 API
    return f"[占位] 用户 {user_id} 的最近 5 条资金记录：（待接入 API）"


@tool
def query_bank_card_info(user_id: str) -> str:
    """查询用户绑定的银行卡/收款账户信息。需要提供用户ID。"""
    logger.debug(f"user_id={user_id!r}")
    # TODO: 接入银行卡信息查询 API
    return f"[占位] 用户 {user_id} 绑定的收款账户：尾号 6789 工商银行（待接入 API）"
