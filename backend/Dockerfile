FROM python:3.12-slim

WORKDIR /app

# 基础环境变量
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 安装系统依赖（部分 Python 包编译时需要 gcc）
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc && \
    rm -rf /var/lib/apt/lists/*

# 优先复制依赖文件，充分利用 Docker 层缓存
COPY requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

# 复制项目代码
COPY app/ ./app/

# 创建运行时所需目录
#   logs/   — Loguru 日志文件
#   memory/ — SQLite checkpoint 默认路径（CHECKPOINT_SQLITE_PATH=./memory/checkpoints.db）
#   chroma_db/ — Chroma 向量库持久化目录
RUN mkdir -p logs memory chroma_db app/static

EXPOSE 8080

# 以项目根目录为工作目录启动，保证 app.main 的 sys.path 修正逻辑正常工作
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
