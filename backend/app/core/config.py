from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

# 项目根目录（ai_customer_service/），无论从哪里启动都能找到 .env
_ROOT = Path(__file__).parent.parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "StorySmith"
    DEBUG: bool = False

    # LLM — 客服 Agent（可指向代理/Qwen/Azure 等兼容接口）
    # 新版 create_agent 支持 "provider:model" 格式，如 "openai:gpt-4o"
    # 也可直接传 ChatOpenAI 实例；INTENT_MODEL 仅用于意图识别（ChatOpenAI）
    OPENAI_API_KEY: str
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "openai:gpt-4o"
    INTENT_MODEL: str = "gpt-4o-mini"

    # LLM — 小说生成专用（直接调用 OpenAI；留空则回退到上方 OPENAI_* 配置）
    NOVEL_OPENAI_API_KEY: str = ""
    NOVEL_OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    NOVEL_OPENAI_MODEL: str = "gpt-4o-mini"

    # Agent 模式
    # "router" — 默认，走意图识别 + 路由
    # 其他值   — 直接走对应 agent name（跳过意图识别），如 "dify"、"faq"
    AGENT_MODE: str = "router"

    # Checkpoint（对话记忆）
    # none     — 无记忆，每次请求独立（默认，不改变现有行为）
    # memory   — InMemorySaver，进程存活期间有记忆，重启丢失
    # sqlite   — SQLite 文件持久化，需安装 langgraph-checkpoint-sqlite
    # postgres — PostgreSQL 持久化，需安装 langgraph-checkpoint-postgres
    CHECKPOINT_BACKEND: str = "none"
    CHECKPOINT_SQLITE_PATH: str = "./checkpoints.db"
    CHECKPOINT_POSTGRES_URL: str = ""

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = "logs"

    # Dify（远程 Agent 调用）
    DIFY_API_URL: str = ""
    DIFY_API_KEY: str = ""

    # WebSocket
    # WS_IDLE_TIMEOUT: 连接空闲超时秒数，超时后服务端主动断开；0 表示不超时
    WS_IDLE_TIMEOUT: int = 300

    # PostgreSQL（小说元数据等关系型存储；PG_HOST 为空则禁用）
    PG_HOST: str = ""
    PG_PORT: int = 15432
    PG_USER: str = "admin"
    PG_PASSWORD: str = ""
    PG_DATABASE: str = "mydb"
    PG_POOL_MIN: int = 2
    PG_POOL_MAX: int = 10

    # MySQL
    MYSQL_HOST: str = ""
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = ""
    MYSQL_PASSWORD: str = ""
    MYSQL_DATABASE: str = ""
    MYSQL_POOL_MIN: int = 2
    MYSQL_POOL_MAX: int = 10
    MYSQL_CONNECT_TIMEOUT: int = 10

    # Vector Store (Chroma)
    CHROMA_PERSIST_DIR: str = "./chroma_db"
    CHROMA_COLLECTION: str = "faq"
    RAG_SCORE_THRESHOLD: float = 0.6
    RAG_TOP_K: int = 5

    # Drama factory — image generation
    # 默认走 OpenAI gpt-image-1.5（文生图 + 图生图，且支持 input_fidelity=high）。
    # 画幅由 project.aspect_ratio 在调用时通过 options 传入，由 provider 映射成 size。
    # 旧版 flow2api/Gemini 仍可用，把 DRAMA_IMAGE_PROVIDER 改成 "flow2api" 并改 model 即可。
    DRAMA_IMAGE_PROVIDER: str = "openai"
    DRAMA_IMAGE_API_KEY: str = ""
    DRAMA_IMAGE_BASE_URL: str = ""
    DRAMA_IMAGE_MODEL: str = "gpt-image-1.5"

    # Drama factory — video generation
    DRAMA_VIDEO_PROVIDER: str = "flow2api"
    DRAMA_VIDEO_API_KEY: str = ""
    DRAMA_VIDEO_BASE_URL: str = ""
    DRAMA_VIDEO_MODEL: str = "veo_3_1_i2v_lite_portrait"
    DRAMA_VIDEO_POLL_INTERVAL: float = 2.0
    DRAMA_VIDEO_TIMEOUT_SECONDS: int = 180
    DRAMA_COPILOT_TIMEOUT_SECONDS: int = 12

    # Drama factory — flow2api/free2api gateway
    DRAMA_FLOW2API_BASE_URL: str = ""
    DRAMA_FLOW2API_API_KEY: str = ""
    DRAMA_FLOW2API_STREAM: bool = False
    DRAMA_FLOW2API_TIMEOUT_SECONDS: int = 180

    model_config = {
        "env_file": str(_ROOT / ".env"),
        "env_file_encoding": "utf-8",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
