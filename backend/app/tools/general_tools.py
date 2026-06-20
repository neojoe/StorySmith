"""
General Agent 工具集。

通用兜底工具：用于处理无法被专职 Agent 识别的问题。
包含：人工客服转接引导、问题反馈收集等。
"""

from langchain_core.tools import tool
from loguru import logger


@tool
def escalate_to_human(reason: str) -> str:
    """当问题超出 AI 能力范围时，引导用户转接人工客服。"""
    logger.info(f"escalate reason={reason!r}")
    # TODO: 接入工单系统或在线客服系统（如 Zendesk、Freshdesk 等）
    return (
        "已为您记录问题，人工客服将在工作时间（周一至周五 9:00-18:00）"
        "优先处理您的请求，请留意客服的回复。"
    )


@tool
def collect_feedback(issue_description: str) -> str:
    """收集用户反馈或建议，记录到问题反馈系统。"""
    logger.info(f"feedback issue={issue_description!r}")
    # TODO: 接入工单/反馈系统
    return f'已收到您的反馈："{issue_description}"，感谢您的建议，我们会持续改进服务。'
