"""
FAQ Agent 工具集。

包含：知识库检索、App 操作指引等纯知识性查询工具。
接入真实向量库/文档库时，替换 TODO 部分即可，接口签名保持不变。
"""

from langchain_core.tools import tool
from loguru import logger


@tool
def search_knowledge_base(query: str) -> str:
    """搜索外汇交易知识库，回答外汇常识、平台规则、费率、交易品种等问题。"""
    logger.debug(f"query={query!r}")
    # TODO: 接入向量库（Chroma / Milvus / Pinecone 等）做 RAG 相似度检索
    # 示例：
    #   from app.tools._rag_retriever import RAGRetriever
    #   docs = RAGRetriever().search(query, top_k=5)
    #   return "\n".join(d["content"] for d in docs)
    return f"[知识库占位] 关于 '{query}' 的检索结果：（待接入向量库）"


@tool
def get_app_guide(feature: str) -> str:
    """获取 App 操作指引，例如：下载安装、注册开户、MT4/MT5 功能使用说明。"""
    logger.debug(f"feature={feature!r}")
    # TODO: 接入静态 FAQ 文档库或 CMS
    return f"[App指引占位] '{feature}' 的操作步骤：（待接入文档库）"
