# AI Customer Service — 外汇平台智能客服

基于 LLM 的外汇平台智能客服服务，能够自动识别用户意图并路由到对应专职客服 Agent，支持 FAQ 知识问答、账户查询、出入金咨询等场景，提供同步、流式（SSE）、WebSocket 三种对话接口。

---

## 部署

### 环境要求

- Python 3.12+

### 安装与启动

```bash
# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env  # 编辑 .env，填写 API Key 等必要配置

# 启动服务
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

启动后访问 `http://localhost:8080` 打开前端页面，API 文档见 `http://localhost:8080/docs`。

### Docker 部署

```bash
# 构建镜像
docker build -t ai-customer-service .

# 运行容器
docker run -d \
  --name ai-cs \
  -p 8080:8080 \
  -v $(pwd)/.env:/app/.env:ro \
  -v $(pwd)/chroma_db:/app/chroma_db \
  -v $(pwd)/memory:/app/memory \
  -v $(pwd)/logs:/app/logs \
  ai-customer-service
```

容器默认监听 `8080` 端口。

### Nginx 配置参考

```nginx
upstream ai_customer_service {
    server 127.0.0.1:8080;
    keepalive 32;
}

server {
    listen 12345;
    listen [::]:12345;
    server_name domain.com;

    # WebSocket 接口
    location /api/v1/chat/ws {
        proxy_pass http://ai_customer_service;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_connect_timeout 60s;
        proxy_read_timeout  3600s;
        proxy_send_timeout  3600s;
    }

}
```

### 主要配置项（`.env`）

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | LLM API Key |
| `OPENAI_BASE_URL` | API 地址，支持任意 OpenAI 兼容接口 |
| `LLM_MODEL` | 主模型，格式 `gpt-4o` |
| `AGENT_MODE` | `router`（意图路由）或直接指定 Agent 名称 |
| `CHECKPOINT_BACKEND` | 对话记忆后端：`none` / `memory` / `sqlite` / `postgres` |
| `DIFY_API_URL` / `DIFY_API_KEY` | 接入 Dify 工作流时配置 |
