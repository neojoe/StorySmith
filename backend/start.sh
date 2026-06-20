#!/bin/bash
set -e

IMAGE_NAME="ai-customer-service"
CONTAINER_NAME="ai-customer-service"
PORT=12001
ENV_FILE=".env"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

if [ ! -f "$ENV_FILE" ]; then
  log_error ".env 文件不存在，请先创建并配置环境变量"
  exit 1
fi

OPENAI_API_KEY_VAL=$(grep -E '^OPENAI_API_KEY=' "$ENV_FILE" | cut -d '=' -f2-)
if [ -z "$OPENAI_API_KEY_VAL" ]; then
  log_error "OPENAI_API_KEY 未配置，请在 .env 中设置"
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log_warn "容器 '${CONTAINER_NAME}' 已在运行，跳过启动"
  log_info "访问地址：http://localhost:${PORT}"
  exit 0
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log_info "移除已停止的容器 '${CONTAINER_NAME}'"
  docker rm "${CONTAINER_NAME}"
fi

log_info "构建镜像 '${IMAGE_NAME}'..."
docker build -t "${IMAGE_NAME}" .
log_info "镜像构建完成"

mkdir -p logs memory chroma_db

log_info "启动容器 '${CONTAINER_NAME}'..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${PORT}:${PORT}" \
  --env-file "${ENV_FILE}" \
  -v "$(pwd)/logs:/app/logs" \
  -v "$(pwd)/memory:/app/memory" \
  -v "$(pwd)/chroma_db:/app/chroma_db" \
  "${IMAGE_NAME}"

log_info "等待服务启动..."
MAX_WAIT=30
COUNT=0
until curl -sf "http://localhost:${PORT}/api/v1/health" > /dev/null 2>&1 || [ $COUNT -ge $MAX_WAIT ]; do
  sleep 1
  COUNT=$((COUNT + 1))
  echo -n "."
done
echo ""

if [ $COUNT -ge $MAX_WAIT ]; then
  log_warn "服务未在 ${MAX_WAIT}s 内就绪，请查看日志：docker logs ${CONTAINER_NAME}"
else
  log_info "服务已就绪"
fi

log_info "访问地址：http://localhost:${PORT}"
log_info "查看日志：docker logs -f ${CONTAINER_NAME}"
