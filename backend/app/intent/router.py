"""
意图路由器。

启动流程：
  1. __init__ 触发 `import app.agents`，所有 Agent 模块被导入，
     __init_subclass__ 自动将每个 Agent 写入 Registry。
  2. 从 Registry 读取 {name: description}，初始化 IntentClassifier。
  3. 每次 route() 调用时，先分类意图，再从 Registry 取对应 Agent 执行。
  4. 意图未匹配或置信度低时，交由 GeneralAgent 兜底回答。

新增 Agent 只需：
  - 新建 app/agents/xxx_agent.py，定义 name / description
  - 在 app/agents/__init__.py 中 import 该模块
  无需修改 router.py 或 classifier.py 的任何代码。
"""

from collections.abc import AsyncIterator

from loguru import logger

from ..agents.general_agent import GeneralAgent
from .classifier import IntentClassifier, IntentResult

_LOW_CONFIDENCE_THRESHOLD = 0.5


class IntentRouter:
    def __init__(self) -> None:
        # 触发所有 Agent 模块导入 → __init_subclass__ 完成自动注册
        from .. import agents  # noqa: F401

        from ..agents.registry import get_agent_descriptions
        descriptions = get_agent_descriptions()

        if not descriptions:
            raise RuntimeError(
                "No agents registered. "
                "Make sure agent modules are imported in app/agents/__init__.py."
            )

        self._classifier = IntentClassifier(descriptions)
        # GeneralAgent 不进注册表，由 router 直接持有，作为兜底
        self._general_agent = GeneralAgent()
        logger.info(f"ready, registered agents: {sorted(descriptions.keys())}")

    async def route(self, query: str, session_id: str = "") -> tuple[str, str]:
        """
        识别意图并路由到对应 Agent 执行。
        无法匹配时由 GeneralAgent 兜底。

        Returns:
            (answer, intent_name)
        """
        result: IntentResult = await self._classifier.classify(query)

        # 意图未知或置信度低 → GeneralAgent 兜底
        if result.intent == "unknown" or result.confidence < _LOW_CONFIDENCE_THRESHOLD:
            logger.warning(
                f"fallback to GeneralAgent — intent={result.intent!r} "
                f"confidence={result.confidence:.2f} reason={result.reason!r}"
            )
            answer = await self._general_agent.run(query, session_id=session_id)
            return answer, "general"

        from ..agents.registry import get_agent
        agent = get_agent(result.intent)

        # Registry 里找不到对应 Agent（理论上不会发生）→ GeneralAgent 兜底
        if agent is None:
            logger.error(
                f"agent not found in registry for intent={result.intent!r}, "
                f"fallback to GeneralAgent"
            )
            answer = await self._general_agent.run(query, session_id=session_id)
            return answer, "general"

        logger.info(f"dispatching to agent={result.intent!r}")
        answer = await agent.run(query, session_id=session_id)
        return answer, result.intent

    async def stream_route(
        self, query: str, session_id: str = ""
    ) -> tuple[str, AsyncIterator[str]]:
        """
        识别意图后，返回 (intent_name, token_stream)。
        意图分类同步完成，调用方可先拿到 intent 再开始消费流。
        """
        result: IntentResult = await self._classifier.classify(query)

        if result.intent == "unknown" or result.confidence < _LOW_CONFIDENCE_THRESHOLD:
            logger.warning(
                f"stream fallback to GeneralAgent — intent={result.intent!r} "
                f"confidence={result.confidence:.2f}"
            )
            return "general", self._general_agent.stream(query, session_id=session_id)

        from ..agents.registry import get_agent
        agent = get_agent(result.intent)

        if agent is None:
            logger.error(f"agent not found for intent={result.intent!r}, fallback")
            return "general", self._general_agent.stream(query, session_id=session_id)

        logger.info(f"stream dispatching to agent={result.intent!r}")
        return result.intent, agent.stream(query, session_id=session_id)
