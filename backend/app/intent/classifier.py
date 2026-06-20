"""
意图分类器。

prompt 在初始化时从 Agent Registry 动态生成，因此新增/删除 Agent
后无需修改任何分类器代码，意图列表会自动同步。
"""

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from loguru import logger
from pydantic import BaseModel, Field

from ..core.config import get_settings


# ---------------------------------------------------------------------------
# 结构化输出 Schema
# ---------------------------------------------------------------------------

class IntentResult(BaseModel):
    intent: str = Field(
        description="匹配的 Agent 名称（小写），或 'unknown' 表示无法识别"
    )
    confidence: float = Field(ge=0.0, le=1.0, description="置信度（0~1）")
    reason: str = Field(description="分类依据的简要说明")


# ---------------------------------------------------------------------------
# 动态构建 System Prompt
# ---------------------------------------------------------------------------

def _build_system_prompt(agent_descriptions: dict[str, str]) -> str:
    """
    根据已注册 Agent 的 name / description 动态生成分类 prompt。
    新增 Agent 后 prompt 自动包含新的选项。
    """
    lines = [
        "你是外汇平台智能客服的意图识别专家。",
        "根据用户问题，将其分类到以下 Agent 之一；若无匹配则返回 'unknown'。",
        "",
        "可用 Agent：",
    ]
    for name, desc in agent_descriptions.items():
        lines.append(f"  - {name}: {desc}")
    lines.append("  - unknown: 无法理解或完全超出外汇平台服务范围的问题")
    lines.extend([
        "",
        "分类原则：",
        "  - 涉及新闻、时事、市场行情、汇率走势、国际局势等需要实时信息的问题 → unknown",
        "  - 闲聊、打招呼、问时间等非业务问题 → unknown",
        "  - 仅当问题明确属于平台内部规则、操作流程等静态知识时才归类为 faq",
        "",
        "要求：",
        "  1. intent 字段必须是上述名称之一（小写），不得返回其他值",
        "  2. 根据用户问题语义准确判断，给出 0~1 之间的置信度",
        "  3. reason 字段简要说明分类理由",
    ])
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 分类器
# ---------------------------------------------------------------------------

class IntentClassifier:
    def __init__(self, agent_descriptions: dict[str, str]) -> None:
        s = get_settings()
        llm = ChatOpenAI(
            model=s.INTENT_MODEL,
            api_key=s.OPENAI_API_KEY,
            base_url=s.OPENAI_BASE_URL,
            temperature=0,
        )
        system_prompt = _build_system_prompt(agent_descriptions)
        self._valid_intents: set[str] = set(agent_descriptions.keys()) | {"unknown"}

        self._chain = (
            ChatPromptTemplate.from_messages(
                [("system", system_prompt), ("human", "{query}")]
            )
            | llm.with_structured_output(IntentResult)
        )
        logger.info(
            f"initialized, valid intents: {sorted(self._valid_intents)}"
        )

    async def classify(self, query: str) -> IntentResult:
        logger.info(f"classifying: {query[:80]!r}")
        result: IntentResult = await self._chain.ainvoke({"query": query})

        # 防御：LLM 返回了未知 intent 时强制降级
        if result.intent not in self._valid_intents:
            logger.warning(
                f"LLM returned unknown intent={result.intent!r}, fallback to 'unknown'"
            )
            result = IntentResult(
                intent="unknown",
                confidence=0.0,
                reason=f"LLM returned unregistered intent: {result.intent!r}",
            )

        logger.info(
            f"result={result.intent} confidence={result.confidence:.2f} "
            f"reason={result.reason!r}"
        )
        return result
