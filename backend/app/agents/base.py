"""
Agent 基类体系。

两层结构：
  BaseAgent       — 所有 Agent 的抽象接口（注册、路由、通用工具）
  LangGraphAgent  — 基于 LangGraph 的 Agent 实现（LLM + 工具调用）

子类选择继承哪一层：
  - 使用 LangChain/LangGraph 执行的 Agent → 继承 LangGraphAgent
  - 调用外部 API（Dify 等）的 Agent     → 继承 BaseAgent
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Callable, Sequence
from datetime import datetime
from typing import Any

from langchain.agents.middleware.types import AgentMiddleware
from langchain_core.messages import HumanMessage
from langchain_core.tools import BaseTool
from langgraph.graph.state import CompiledStateGraph
from loguru import logger

from ..core.config import get_settings


# ══════════════════════════════════════════════════════════════════════
# 第一层：BaseAgent — 纯抽象接口
# ══════════════════════════════════════════════════════════════════════

class BaseAgent(ABC):
    """所有 Agent 的抽象基类。

    职责：
      - 定义 name / description，通过 __init_subclass__ 自动注册到 Registry
      - 声明 run() / stream() 接口，供 Router 统一调用
      - 提供 _rag_search() 工具方法，子类按需调用

    子类必须实现：
      - run(query)   → 返回完整回复
      - stream(query) → 逐 token yield 回复
    """

    name: str = ""
    description: str = ""

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if cls.name and cls.description:
            from .registry import _REGISTRY
            _REGISTRY[cls.name] = cls
            logger.debug(f"auto-registered agent: {cls.name!r}")

    @abstractmethod
    async def run(self, query: str, **kwargs: Any) -> str:
        """执行 Agent，返回完整回复文本。"""
        ...

    @abstractmethod
    async def stream(self, query: str, **kwargs: Any) -> AsyncIterator[str]:
        """流式执行 Agent，逐 token yield 回复内容。"""
        ...
        yield  # noqa: make it a valid async generator for type checking

    # ------------------------------------------------------------------
    # 工具方法（子类按需调用，不强制使用）
    # ------------------------------------------------------------------

    def _rag_search(self, query: str) -> str:
        """在向量库中检索相关文档，返回上下文字符串。

        无结果或失败时返回空字符串，不影响 Agent 正常运行。
        """
        try:
            from ..core.vectorstore import get_vectordb

            vectordb = get_vectordb()
            if vectordb is None:
                return ""

            import warnings

            s = get_settings()
            with warnings.catch_warnings():
                warnings.filterwarnings(
                    "ignore", message="Relevance scores must be between 0 and 1"
                )
                results = vectordb.similarity_search_with_relevance_scores(
                    query,
                    k=s.RAG_TOP_K,
                    score_threshold=s.RAG_SCORE_THRESHOLD,
                )
            if not results:
                logger.debug("RAG: no results above threshold")
                return ""

            logger.debug(f"RAG: {len(results)} docs retrieved")
            return "\n\n".join(doc.page_content for doc, _ in results)

        except Exception as e:
            logger.warning(f"RAG search error: {e}")
            return ""


# ══════════════════════════════════════════════════════════════════════
# 第二层：LangGraphAgent — LangGraph 实现
# ══════════════════════════════════════════════════════════════════════

class LangGraphAgent(BaseAgent):
    """基于 LangGraph 的 Agent 基类。

    在 BaseAgent 基础上提供：
      - system_prompt / get_tools() 抽象接口
      - __init__() 自动构建 LangGraph 图
      - run() / stream() 默认实现（RAG + LLM 调用）
      - _invoke / _astream / _build_content 内部方法

    子类只需定义 name、description、system_prompt、get_tools() 即可。
    如需自定义图，override _build_graph()。
    如需特殊前/后处理，override run() / stream()。
    """

    @property
    @abstractmethod
    def system_prompt(self) -> str:
        """Agent 的角色 system prompt。"""
        ...

    @abstractmethod
    def get_tools(self) -> Sequence[BaseTool | Callable[..., Any]]:
        """返回该 Agent 使用的工具列表。"""
        ...

    def get_middleware(self) -> list[AgentMiddleware]:
        """返回该 Agent 使用的中间件列表，默认无中间件。

        子类可 override 此方法添加 SummarizationMiddleware、
        HumanInTheLoopMiddleware 等任意 AgentMiddleware。
        """
        return []

    def __init__(self) -> None:
        s = get_settings()
        model_name = s.LLM_MODEL.split(":")[-1] if ":" in s.LLM_MODEL else s.LLM_MODEL
        self._model_name = model_name
        self._graph: CompiledStateGraph = self._build_graph()
        logger.debug(f"initialized (model={model_name!r})")

    # ------------------------------------------------------------------
    # 图构建（子类可 override 替换为自定义 LangGraph 图）
    # ------------------------------------------------------------------

    def _build_graph(self) -> CompiledStateGraph:
        """使用 langchain.agents.create_agent 构建标准 ReAct Agent。

        子类可 override 此方法使用 StateGraph 手动构建图。
        """
        from langchain.agents import create_agent
        from langchain_openai import ChatOpenAI

        s = get_settings()
        llm = ChatOpenAI(
            model=self._model_name,
            api_key=s.OPENAI_API_KEY,
            base_url=s.OPENAI_BASE_URL,
        )

        from ..checkpoint import get_checkpointer

        tools = [t for t in self.get_tools() if t is not None]
        graph = create_agent(
            model=llm,
            tools=tools,
            system_prompt=self.system_prompt,
            checkpointer=get_checkpointer(),
            middleware=self.get_middleware(),
        )

        try:
            graph.nodes["tools"].bound._handle_tool_errors = True
        except (KeyError, AttributeError):
            pass

        return graph

    # ------------------------------------------------------------------
    # 执行入口（默认带 RAG，子类可 override 插入自定义逻辑）
    # ------------------------------------------------------------------

    async def run(self, query: str, **kwargs: Any) -> str:
        """RAG 检索 + LLM 调用，返回完整回复。"""
        logger.info(f"run query={query[:80]!r}")
        context = self._rag_search(query)
        return await self._invoke(query, context=context, **kwargs)

    async def stream(self, query: str, **kwargs: Any) -> AsyncIterator[str]:
        """RAG 检索 + LLM 流式调用，逐 token yield。"""
        logger.info(f"stream query={query[:80]!r}")
        context = self._rag_search(query)
        async for chunk in self._astream(query, context=context, **kwargs):
            yield chunk

    # ------------------------------------------------------------------
    # 内部方法
    # ------------------------------------------------------------------

    @staticmethod
    def _build_content(query: str, context: str = "") -> str:
        """拼装发给 LLM 的完整消息，注入当前时间和 RAG 上下文。"""
        now = datetime.now().strftime("%Y年%m月%d日 %A %H:%M")
        parts = [f"[当前时间：{now}]"]
        if context:
            parts.append(
                "以下是与用户问题相关的背景信息，仅供参考，请勿在回复中提及这些信息的来源：\n"
                + context
            )
        parts.append(f"用户问题：{query}")
        return "\n\n".join(parts)

    async def _astream(self, query: str, context: str = "", **kwargs: Any) -> AsyncIterator[str]:
        """调用 LangGraph astream_events，逐 token yield。"""
        content = self._build_content(query, context)
        session_id = kwargs.get("session_id", "")
        config = {"configurable": {"thread_id": session_id}} if session_id else {}
        try:
            async for event in self._graph.astream_events(
                {"messages": [HumanMessage(content=content)]},
                config,
                version="v2",
            ):
                if event["event"] == "on_chat_model_stream":
                    chunk = event["data"]["chunk"]
                    if isinstance(chunk.content, str) and chunk.content:
                        yield chunk.content
        except Exception as e:
            logger.exception(f"stream error: {e}")
            yield "抱歉，处理您的请求时出现问题，请稍后再试。"

    async def _invoke(self, query: str, context: str = "", **kwargs: Any) -> str:
        """调用 LangGraph Agent，返回最终 AI 消息内容。"""
        content = self._build_content(query, context)
        session_id = kwargs.get("session_id", "")
        config = {"configurable": {"thread_id": session_id}} if session_id else {}
        try:
            result = await self._graph.ainvoke(
                {"messages": [HumanMessage(content=content)]},
                config,
            )
            messages = result.get("messages", [])
            return messages[-1].content if messages else ""
        except Exception as e:
            logger.exception(f"invoke error: {e}")
            return "抱歉，处理您的请求时出现问题，请稍后再试。"
