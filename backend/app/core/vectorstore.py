"""
Chroma 向量库单例。

从 Settings 读取 persist_directory 和 collection_name，
懒加载并缓存 Chroma 实例，供各 Agent 调用 _rag_search。

向量库不存在或读取失败时静默返回 None，不影响 Agent 正常运行。
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import TYPE_CHECKING

from loguru import logger

# project root = ai_customer_service/
_ROOT = Path(__file__).parent.parent.parent

# custom_llm.py 在项目根目录，确保可被 import
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

if TYPE_CHECKING:
    from langchain_chroma import Chroma

_vectordb: "Chroma | None" = None


def get_vectordb() -> "Chroma | None":
    """
    懒加载返回 Chroma 实例。
    向量库目录不存在、集合为空或 import 失败时返回 None。
    """
    global _vectordb
    if _vectordb is not None:
        return _vectordb

    try:
        from langchain_chroma import Chroma
        from custom_llm import DoubaoEmbedding  # noqa: PLC0415
        from .config import get_settings

        s = get_settings()
        persist_dir = Path(s.CHROMA_PERSIST_DIR)
        if not persist_dir.is_absolute():
            persist_dir = _ROOT / persist_dir

        if not persist_dir.exists():
            logger.warning(f"persist_dir not found: {persist_dir}, RAG disabled")
            return None

        _vectordb = Chroma(
            persist_directory=str(persist_dir),
            collection_name=s.CHROMA_COLLECTION,
            embedding_function=DoubaoEmbedding(),
            collection_metadata={"hnsw:space": "cosine"},
        )
        count = _vectordb._collection.count()
        logger.info(f"loaded collection={s.CHROMA_COLLECTION!r}, docs={count}")
        return _vectordb

    except Exception as e:
        logger.warning(f"init failed, RAG disabled: {e}")
        return None
