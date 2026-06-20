import sys
from contextlib import asynccontextmanager
from pathlib import Path

# ── sys.path 修正 ──────────────────────────────────────────────────────────────
# 用 `python app/main.py` 启动时，Python 会把 app/ 加入 sys.path[0]。
# 这会导致 `from mcp import ...` 解析到本地的 app/mcp/ 而非已安装的 mcp 包。
# 解决方案：确保项目根目录在 sys.path 里，并移除多余的 app/ 条目。
_APP_DIR  = Path(__file__).parent          # …/ai_customer_service/app
_ROOT_DIR = _APP_DIR.parent                # …/ai_customer_service

for _p in [str(_APP_DIR), str(_APP_DIR) + "\\"]:
    while _p in sys.path:
        sys.path.remove(_p)

if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))
# ───────────────────────────────────────────────────────────────────────────────

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger

from app.api.v1 import chat as chat_v1
from app.api.v1 import mcp as mcp_v1
from app.api.v1 import novel as novel_v1
from app.api.v1 import novel_agent as novel_agent_v1
from app.api.v1 import novel_idea as novel_idea_v1
from app.core.config import get_settings
from app.core.logging import setup_logging

_STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("AI Customer Service starting up...")

    # 启动时连接所有 MCP server（配置文件不存在时静默跳过）
    from app.mcp.loader import MCPToolLoader
    await MCPToolLoader.initialize()
    if MCPToolLoader.available_servers():
        logger.info(f"MCP servers ready: {MCPToolLoader.available_servers()}")
    else:
        logger.info("MCP: no servers connected (config missing or all failed)")

    # 启动时初始化 checkpoint（CHECKPOINT_BACKEND=none 时静默跳过）
    from app.checkpoint import setup as setup_checkpoint, shutdown as shutdown_checkpoint
    await setup_checkpoint()

    # 启动时初始化 PostgreSQL 连接池（PG_HOST 未配置时静默跳过）
    from app.db.pg_manager import setup as setup_pg, shutdown as shutdown_pg
    await setup_pg()

    # 启动时建表（Novel DB — 优先 PG，无 PG 时降级 SQLite）
    from app.db.novel_db import init_db as init_novel_db
    await init_novel_db()

    yield

    # 关闭时依次释放：PG 连接池、checkpoint 连接、MCP 连接
    await shutdown_pg()
    await MCPToolLoader.shutdown()
    await shutdown_checkpoint()
    logger.info("AI Novel shutting down.")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.APP_NAME,
        description="StorySmith API — AI Agent 驱动的小说与剧本全流程创作平台",
        version="1.0.0",
        debug=settings.DEBUG,
        lifespan=lifespan,
    )

    # CORS：允许本地开发和从 file:// 直接打开 HTML 时的跨域请求
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(chat_v1.router, prefix="/api/v1", tags=["chat"])
    app.include_router(mcp_v1.router, prefix="/api/v1", tags=["mcp"])
    app.include_router(novel_v1.router, prefix="/api/v1", tags=["novel"])
    app.include_router(novel_agent_v1.router, prefix="/api/v1", tags=["novel-agent"])
    app.include_router(novel_idea_v1.router, prefix="/api/v1", tags=["novel-ideas"])

    # 静态文件（前端页面）
    _STATIC_DIR.mkdir(exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    async def root():
        return RedirectResponse(url="/static/index.html")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8080,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
