"""Novel generation platform — Pydantic request/response schemas."""
from __future__ import annotations

from typing import Optional, List
from pydantic import BaseModel, Field


# ── Chapter ────────────────────────────────────────────────────────────────────

class ChapterOut(BaseModel):
    id: str
    project_id: str
    order_num: int
    title: str
    outline: str = ""
    content: str = ""
    summary: str = ""
    word_count: int = 0
    status: str = "draft"
    created_at: str
    updated_at: str


class ChapterCreate(BaseModel):
    title: str
    order_num: int
    outline: str = ""


class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    outline: Optional[str] = None
    content: Optional[str] = None
    summary: Optional[str] = None
    status: Optional[str] = None


# ── Novel Project ──────────────────────────────────────────────────────────────

class NovelProjectCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="小说标题")
    genre: str = Field(default="urbanReborn", description="小说类型")
    protagonist_name: str = Field(default="", description="主角名，便于后续发布到番茄等平台")
    background: str = Field(default="", description="世界观/背景设定")
    characters: str = Field(default="", description="人物设定")
    relationships: str = Field(default="", description="角色关系")
    plot: str = Field(default="", description="核心剧情")
    style: str = Field(default="", description="写作风格")
    knowledge_base: str = Field(default="", description="知识库/补充信息")
    outline_prompt: str = Field(default="", description="自定义大纲提示词（空则用类型默认）")
    chapter_prompt: str = Field(default="", description="自定义章节提示词")
    content_prompt: str = Field(default="", description="自定义正文提示词")
    target_chapter_count: int = Field(default=10, ge=1, le=500, description="计划总章节数")
    min_chapter_word_count: int = Field(default=2000, ge=200, le=20000, description="每章最低字数")
    model: str = Field(default="gpt-5-nano", description="使用的LLM模型")
    temperature: float = Field(default=0.8, ge=0.0, le=2.0)
    source: str = Field(default="manual", description="创建来源: manual | agent")


class NovelProjectUpdate(BaseModel):
    title: Optional[str] = None
    genre: Optional[str] = None
    protagonist_name: Optional[str] = None
    background: Optional[str] = None
    characters: Optional[str] = None
    relationships: Optional[str] = None
    plot: Optional[str] = None
    style: Optional[str] = None
    knowledge_base: Optional[str] = None
    outline: Optional[str] = None
    outline_prompt: Optional[str] = None
    chapter_prompt: Optional[str] = None
    content_prompt: Optional[str] = None
    target_chapter_count: Optional[int] = Field(default=None, ge=1, le=500)
    min_chapter_word_count: Optional[int] = Field(default=None, ge=200, le=20000)
    model: Optional[str] = None
    temperature: Optional[float] = None
    status: Optional[str] = None


class NovelProjectOut(BaseModel):
    id: str
    title: str
    genre: str
    protagonist_name: str = ""
    background: str
    characters: str
    relationships: str
    plot: str
    style: str
    knowledge_base: str
    outline: str
    outline_prompt: str
    chapter_prompt: str
    content_prompt: str
    target_chapter_count: int = 10
    min_chapter_word_count: int = 2000
    model: str
    temperature: float
    status: str
    generation_status: str = "idle"
    generation_error: str = ""
    generation_started_at: str = ""
    generation_finished_at: str = ""
    generation_step: str = ""
    generation_current: int = 0
    generation_total: int = 0
    generation_label: str = ""
    source: str = "manual"
    total_word_count: int = 0
    chapter_count: int = 0
    published_at: str = ""
    created_at: str
    updated_at: str


class NovelProjectDetail(NovelProjectOut):
    """Project with chapters list."""
    chapters: List[ChapterOut] = []


# ── Generation Requests ────────────────────────────────────────────────────────

class GenerateOutlineRequest(BaseModel):
    """Request body for streaming outline generation."""
    custom_prompt: Optional[str] = Field(
        default=None, description="完全覆盖默认提示词（None 则用类型模板）"
    )


class GenerateChaptersRequest(BaseModel):
    """Request body for streaming chapter-list generation."""
    chapter_count: Optional[int] = Field(default=None, ge=1, le=500, description="期望章节数；为空时使用项目默认值")
    custom_prompt: Optional[str] = None


class GenerateContentRequest(BaseModel):
    """Request body for streaming chapter-content generation."""
    min_word_count: Optional[int] = Field(default=None, ge=200, le=20000, description="本章最低字数；为空时使用项目默认值")
    custom_prompt: Optional[str] = None


class StartProjectGenerationRequest(BaseModel):
    """Start a persisted background generation task for a manual project."""
    generation_mode: str = Field(default="guided_first_chapter", description="创作模式：guided_first_chapter | full_book")


class GenerateSummaryRequest(BaseModel):
    """Re-generate (or first-generate) the structural summary for a chapter."""
    pass  # chapter content is read server-side from the chapter row


class FinalizeRequest(BaseModel):
    """Mark a project as published and compute aggregated stats."""
    pass  # all data is read server-side from chapters


class GeneratePromptsRequest(BaseModel):
    """Trigger AI reverse-engineering of prompts from project settings."""
    pass  # project settings are read server-side from the project row


class GenerateSettingsRequest(BaseModel):
    """AI 一键生成故事设定 — protagonist_name / background / characters / relationships / plot / style."""
    concept: str = Field(
        ..., min_length=2, max_length=500,
        description="故事创意简述，用1-3句话描述你的故事想法",
    )


class OptimizeRequest(BaseModel):
    """Right-click optimization / polish."""
    text: str = Field(..., min_length=1, description="待优化的选中文本")
    operation: str = Field(..., description="操作名称，如：深化冲突、增加伏笔、去AI味…")
    context: Optional[str] = Field(default=None, description="额外上下文（如当前大纲）")
    model: str = Field(default="gpt-5-nano")
    temperature: float = Field(default=0.8)


# ── Genre Template ─────────────────────────────────────────────────────────────

class GenreTemplateOut(BaseModel):
    key: str
    name: str
    outline_prompt: str
    chapter_prompt: str
    content_prompt: str
    optimize_operations: List[str]


# ── Agent Session ───────────────────────────────────────────────────────────────

class AgentSessionCreate(BaseModel):
    """Create a new agent-driven novel session."""
    user_id: str = Field(default="default", description="用户ID，用于隔离 Agent 工作空间")
    genre: str = Field(default="urbanReborn", description="小说类型（可选，Agent 会在对话中确认）")
    target_chapter_count: int = Field(default=10, ge=1, le=500, description="计划总章节数")
    first_chapter_min_word_count: int = Field(default=2000, ge=200, le=20000, description="第一章最低字数")
    generation_mode: str = Field(default="guided_first_chapter", description="创作模式：guided_first_chapter | full_book")


class ExistingProjectAgentSessionCreate(BaseModel):
    """Create or reuse an agent session for an existing project."""
    user_id: str = Field(default="default", description="用户ID，用于隔离 Agent 工作空间")
    generation_mode: str = Field(default="guided_first_chapter", description="创作模式：guided_first_chapter | full_book")


class AgentSessionOut(BaseModel):
    id: str
    project_id: str
    user_id: str
    status: str
    stage: str
    generation_mode: str = "guided_first_chapter"
    created_at: str
    updated_at: str


class AgentChatRequest(BaseModel):
    """Send a message to the agent."""
    message: str = Field(..., min_length=1, description="用户消息")


class AgentTaskOut(BaseModel):
    id: str
    session_id: str
    project_id: str
    task_type: str = "agent_chat"
    status: str
    user_message: str
    assistant_content: str = ""
    tool_events: List[dict] = Field(default_factory=list)
    error_message: str = ""
    created_at: str
    updated_at: str
    started_at: str = ""
    finished_at: str = ""


# ── Idea Session ────────────────────────────────────────────────────────────────

class IdeaSessionCreate(BaseModel):
    """Create a new AI inspiration session."""
    user_id: str = Field(default="default", description="用户ID，用于隔离灵感 Agent 工作空间")


class IdeaSessionOut(BaseModel):
    id: str
    user_id: str
    status: str
    created_at: str
    updated_at: str


class IdeaTaskOut(BaseModel):
    id: str
    session_id: str
    task_type: str = "idea_chat"
    status: str
    user_message: str
    assistant_content: str = ""
    tool_events: List[dict] = Field(default_factory=list)
    error_message: str = ""
    created_at: str
    updated_at: str
    started_at: str = ""
    finished_at: str = ""
