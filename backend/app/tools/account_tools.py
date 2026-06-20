"""
Account Agent 工具集。

包含：账户状态查询、KYC 认证进度、账户限额等账户系统相关工具。
接入真实 CRM API 时，替换 TODO 部分即可，接口签名保持不变。
"""

from langchain_core.tools import tool
from loguru import logger


@tool
def query_account_status(user_id: str) -> str:
    """查询用户账户的当前状态（正常、冻结、待审核等）。需要提供用户ID。"""
    logger.debug(f"user_id={user_id!r}")
    # TODO: 接入 CRM API
    # 示例：
    #   from app.tools._account_client import AccountAPIClient
    #   client = AccountAPIClient(...)
    #   data = await client.get_account_status(user_id)
    #   return f"账户状态：{data['status']}"
    return f"[占位] 用户 {user_id} 的账户状态：正常（待接入 CRM API）"


@tool
def query_kyc_status(user_id: str) -> str:
    """查询用户 KYC 实名认证的当前进度和状态。需要提供用户ID。"""
    logger.debug(f"user_id={user_id!r}")
    # TODO: 接入 KYC 系统 API
    return f"[占位] 用户 {user_id} 的 KYC 状态：审核中，预计 1-3 个工作日（待接入 API）"


@tool
def query_account_limits(user_id: str) -> str:
    """查询用户账户的交易限额、出入金限额等权限信息。需要提供用户ID。"""
    logger.debug(f"user_id={user_id!r}")
    # TODO: 接入权限/限额查询 API
    return f"[占位] 用户 {user_id} 的账户限额：单笔出金上限 10,000 USD（待接入 API）"
