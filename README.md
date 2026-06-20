<div align="center">

<img src="https://img.shields.io/badge/语言-简体中文-blue" alt="语言" />

# StorySmith

**AI Agent 驱动的小说与剧本全流程创作平台**

[English](./README_EN.md) | 简体中文

[![Python](https://img.shields.io/badge/Python-3.11+-3776ab?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.116+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![LangChain](https://img.shields.io/badge/LangChain-1.2+-1c3c3c)](https://www.langchain.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

</div>

---

## 目录

- [项目简介](#项目简介)
- [演示](#演示)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
  - [Docker 部署（推荐）](#docker-部署推荐)
  - [本地开发](#本地开发)
- [环境变量](#环境变量)
- [API 文档](#api-文档)
- [路线图](#路线图)

---

## 项目简介

StorySmith 是一个开源的 AI 辅助小说与剧本创作平台，核心能力由 AI Agent 提供。支持从大纲到章节的全流程创作，并内置 AI 灵感对话、类型风格管理等功能。

> **开源版说明**：平台发布（番茄、阅文等）与 AI 漫剧功能属于商业版特性，开源版中已移除后端实现，前端入口保留但处于禁用状态。

---

## 演示

<video src="https://github.com/user-attachments/assets/6675d535-e9e1-441f-89cf-bc756f8e0b8d" controls width="100%"></video>

---

## 功能特性

| 功能 | 状态 | 说明 |
|------|------|------|
| AI 小说创作 | ✅ 已开放 | 大纲 → 章节全流程创作，轻量 / 全书 / Agent 对话三种模式 |
| AI 灵感创作 | ✅ 已开放 | 多轮对话式创意激发，生成故事方向、人物设定、世界观等 |
| 数据概览 | ✅ 已开放 | 项目统计、字数跟踪、创作进度看板 |
| AI 漫剧工厂 | 🔒 敬请期待 | 图文分镜、语音合成（商业版功能） |
| 平台发布 | 🔒 敬请期待 | 一键发布至各大小说平台（商业版功能） |

---

## 技术栈

**后端**

- [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) — 异步 Web 框架
- [LangChain](https://www.langchain.com/) + [LangGraph](https://langchain-ai.github.io/langgraph/) — AI Agent 编排
- [OpenAI SDK](https://github.com/openai/openai-python) — 兼容 OpenAI 接口（可接 Azure / 代理 / Qwen 等）
- [MCP](https://modelcontextprotocol.io/) — 模型上下文协议工具扩展
- SQLite / PostgreSQL — 数据持久化

**前端**

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 8](https://vitejs.dev/)
- [Ant Design 6](https://ant.design/) — UI 组件库
- [Tailwind CSS 4](https://tailwindcss.com/) — 原子化样式
- [Zustand](https://zustand-demo.pmnd.rs/) + [TanStack Query](https://tanstack.com/query) — 状态管理

---

## 目录结构

```
storysmith/
├── backend/                 # FastAPI 后端
│   ├── app/
│   │   ├── agents/          # Skill 中间件（SkillMiddleware）
│   │   ├── api/v1/          # API 路由（chat / novel / novel_agent / novel_idea / mcp）
│   │   ├── services/        # 业务逻辑（小说生成、Agent 服务、灵感服务）
│   │   ├── db/              # 数据库操作（SQLite / PostgreSQL）
│   │   ├── schemas/         # Pydantic 数据模型
│   │   ├── core/            # 配置、日志、公共工具
│   │   ├── mcp/             # MCP 工具加载器
│   │   └── checkpoint/      # LangGraph 对话记忆持久化
│   ├── tests/               # 单元测试
│   └── requirements.txt
├── frontend/                # React 前端
│   └── src/
│       ├── pages/           # 路由页面（home / dashboard / novel / drama / platform）
│       ├── components/      # 公共组件（layout / ui）
│       ├── hooks/           # 自定义 Hook
│       ├── services/        # API 调用层
│       ├── stores/          # Zustand 状态
│       ├── i18n/            # 国际化（中 / 英）
│       └── types/           # TypeScript 类型定义
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── nginx.conf
├── docker-compose.yml
└── .env.example
```

---

## 快速开始

### Docker 部署（推荐）

**前置条件**：安装 [Docker](https://www.docker.com/) 和 [Docker Compose](https://docs.docker.com/compose/)

```bash
# 1. 克隆项目
git clone https://github.com/neojoe/StorySmith.git
cd storysmith

# 2. 复制并编辑环境变量
cp .env.example .env
# 填写 OPENAI_API_KEY 和 OPENAI_BASE_URL

# 3. 启动所有服务
docker-compose up -d

# 4. 查看日志
docker-compose logs -f
```

启动后访问 [http://localhost:3000](http://localhost:3000)

---

### 本地开发

**后端**

```bash
cd backend

# 创建虚拟环境（Python 3.11+）
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp ../.env.example .env

# 启动开发服务器（热重载）
python app/main.py
# 后端运行在 http://localhost:8080
```

**前端**

```bash
cd frontend

npm install
npm run dev
# 前端运行在 http://localhost:5173
```

---

## 环境变量

复制 `.env.example` 为 `.env`，关键配置如下：

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `OPENAI_API_KEY` | ✅ | — | OpenAI 兼容 API Key |
| `OPENAI_BASE_URL` | ✅ | `https://api.openai.com/v1` | API 地址（可指向代理或 Qwen 等） |
| `LLM_MODEL` | ✅ | `gpt-4o-mini` | 对话主模型 |
| `NOVEL_OPENAI_MODEL` | — | `gpt-4o` | 小说生成专用模型（留空则复用上方） |
| `CHECKPOINT_BACKEND` | — | `sqlite` | 对话记忆持久化：`none` / `sqlite` / `postgres` |
| `FRONTEND_PORT` | — | `3000` | 前端对外端口 |

完整说明见 [.env.example](.env.example)

---

## API 文档

后端启动后，访问以下地址查看交互式 API 文档：

- **Swagger UI**：[http://localhost:8080/docs](http://localhost:8080/docs)
- **ReDoc**：[http://localhost:8080/redoc](http://localhost:8080/redoc)

---

## 路线图

- [ ] AI 漫剧工厂（开源版）
- [ ] 更多 LLM 提供商适配（Claude / Gemini）
- [ ] 小说导出（EPUB / PDF / TXT）
- [ ] 用户系统与项目权限管理
- [ ] MCP 工具市场

---

<div align="center">

如果这个项目对你有帮助，欢迎点一个 ⭐

[提交 Issue](https://github.com/neojoe/StorySmith/issues) · [贡献代码](https://github.com/neojoe/StorySmith/pulls)

<br/>

MIT License © 2026 StorySmith

</div>
