#!/bin/bash
set -e

CONTAINER_NAME="ai-customer-service"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }

if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log_warn "容器 '${CONTAINER_NAME}' 不存在，无需停止"
  exit 0
fi

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log_info "停止容器 '${CONTAINER_NAME}'..."
  docker stop "${CONTAINER_NAME}"
  log_info "容器已停止"
else
  log_warn "容器 '${CONTAINER_NAME}' 已处于停止状态"
fi

log_info "移除容器 '${CONTAINER_NAME}'..."
docker rm "${CONTAINER_NAME}"
log_info "容器已移除（镜像和挂载数据保留）"
