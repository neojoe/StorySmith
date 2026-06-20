<div align="center">

<img src="https://img.shields.io/badge/language-English-blue" alt="language" />

# StorySmith

**Full-pipeline novel & script creation platform powered by AI Agents**

[简体中文](./README.md) | English

[![Python](https://img.shields.io/badge/Python-3.11+-3776ab?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.116+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![LangChain](https://img.shields.io/badge/LangChain-1.2+-1c3c3c)](https://www.langchain.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

<br/>

<video src="https://github.com/neojoe/StorySmith/raw/main/docs/demo.mp4" controls width="100%"></video>

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Docker (Recommended)](#docker-recommended)
  - [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [API Docs](#api-docs)
- [Roadmap](#roadmap)

---

## Overview

**StorySmith** is an open-source AI-powered platform for novel and script creation. Its core capabilities are driven by AI Agents built with LangChain and LangGraph, supporting the full creative workflow from outlines to chapters. It also includes an AI inspiration chat, genre & style management, and a real-time streaming workspace.

> **Open-Source Note**: Platform publishing (e.g. Fanqie, Yuewen) and AI Drama features are commercial-only. Their backend logic has been removed in this release; the frontend buttons remain visible but are disabled.

---

## Features

| Feature | Status | Description |
|---------|:------:|-------------|
| AI Novel Studio | ✅ Available | Full workflow: outline → chapters. Lightweight / full-book auto / Agent-driven modes |
| AI Inspiration | ✅ Available | Multi-turn conversational brainstorming for story ideas, characters, world-building |
| Dashboard | ✅ Available | Project stats, word count tracking, and creation progress board |
| AI Drama Factory | 🔒 Coming Soon | Storyboard generation and voice synthesis (commercial feature) |
| Platform Publishing | 🔒 Coming Soon | One-click publish to major novel platforms (commercial feature) |

---

## Tech Stack

**Backend**

- [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) — Async web framework
- [LangChain](https://www.langchain.com/) + [LangGraph](https://langchain-ai.github.io/langgraph/) — AI Agent orchestration
- [OpenAI SDK](https://github.com/openai/openai-python) — OpenAI-compatible API (Azure / proxies / Qwen supported)
- [MCP](https://modelcontextprotocol.io/) — Model Context Protocol tool extensions
- SQLite / PostgreSQL — Data persistence

**Frontend**

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 8](https://vitejs.dev/)
- [Ant Design 6](https://ant.design/) — UI component library
- [Tailwind CSS 4](https://tailwindcss.com/) — Utility-first CSS
- [Zustand](https://zustand-demo.pmnd.rs/) + [TanStack Query](https://tanstack.com/query) — State management

---

## Project Structure

```
storysmith/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── agents/          # Skill middleware (SkillMiddleware)
│   │   ├── api/v1/          # API routes (chat / novel / novel_agent / novel_idea / mcp)
│   │   ├── services/        # Business logic (novel generation, agent, inspiration)
│   │   ├── db/              # Database layer (SQLite / PostgreSQL)
│   │   ├── schemas/         # Pydantic models
│   │   ├── core/            # Config, logging, shared utilities
│   │   ├── mcp/             # MCP tool loader
│   │   └── checkpoint/      # LangGraph memory persistence
│   ├── tests/               # Unit tests
│   └── requirements.txt
├── frontend/                # React frontend
│   └── src/
│       ├── pages/           # Route pages (home / dashboard / novel / drama / platform)
│       ├── components/      # Shared components (layout / ui)
│       ├── hooks/           # Custom hooks
│       ├── services/        # API client layer
│       ├── stores/          # Zustand stores
│       ├── i18n/            # Internationalization (zh / en)
│       └── types/           # TypeScript type definitions
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── nginx.conf
├── docker-compose.yml
└── .env.example
```

---

## Getting Started

### Docker (Recommended)

**Prerequisites**: Install [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

```bash
# 1. Clone the repository
git clone https://github.com/neojoe/StorySmith.git
cd storysmith

# 2. Copy and configure environment variables
cp .env.example .env
# Fill in OPENAI_API_KEY and OPENAI_BASE_URL

# 3. Start all services
docker-compose up -d

# 4. Follow logs
docker-compose logs -f
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Local Development

**Backend**

```bash
cd backend

# Create virtual environment (Python 3.11+)
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp ../.env.example .env

# Start dev server (hot reload)
python app/main.py
# Backend runs at http://localhost:8080
```

**Frontend**

```bash
cd frontend

npm install
npm run dev
# Frontend runs at http://localhost:5173
```

---

## Environment Variables

Copy `.env.example` to `.env`. Key settings:

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `OPENAI_API_KEY` | ✅ | — | OpenAI-compatible API key |
| `OPENAI_BASE_URL` | ✅ | `https://api.openai.com/v1` | API endpoint (proxies / Qwen / Azure supported) |
| `LLM_MODEL` | ✅ | `gpt-4o-mini` | Primary chat model |
| `NOVEL_OPENAI_MODEL` | — | `gpt-4o` | Dedicated novel model (falls back to above if empty) |
| `CHECKPOINT_BACKEND` | — | `sqlite` | Memory backend: `none` / `sqlite` / `postgres` |
| `FRONTEND_PORT` | — | `3000` | External port for the frontend |

See [.env.example](.env.example) for the full reference.

---

## API Docs

Once the backend is running, visit:

- **Swagger UI**: [http://localhost:8080/docs](http://localhost:8080/docs)
- **ReDoc**: [http://localhost:8080/redoc](http://localhost:8080/redoc)

---

## Roadmap

- [ ] Open-source AI Drama Factory
- [ ] More LLM provider adapters (Claude / Gemini)
- [ ] Novel export (EPUB / PDF / TXT)
- [ ] User system and project permissions
- [ ] MCP tool marketplace

---

<div align="center">

If this project helps you, please consider giving it a ⭐

[Submit an Issue](https://github.com/neojoe/StorySmith/issues) · [Contributing](https://github.com/neojoe/StorySmith/pulls)

<br/>

MIT License © 2026 StorySmith

</div>
