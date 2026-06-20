"""Skill middleware for LangChain create_agent.

Injects `read_skill` and `list_skill_files` tools into every model call,
mirroring the `enable_skills=True` behaviour of the private deepagents package.

Usage:
    from langchain.agents import create_agent
    from langchain.agents.middleware import ContextEditingMiddleware
    from app.agents.skill_middleware import SkillMiddleware

    agent = create_agent(
        model=llm,
        tools=my_tools,
        system_prompt="...",
        middleware=[
            SkillMiddleware(project_root=Path("/app")),
            ContextEditingMiddleware(),
        ],
        checkpointer=MemorySaver(),
    )
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path

from langchain_core.tools import tool
from langchain.agents.middleware.types import (
    AgentMiddleware,
    AgentState,
    ContextT,
    ModelRequest,
    ModelResponse,
    ResponseT,
)


class SkillMiddleware(AgentMiddleware[AgentState[ResponseT], ContextT, ResponseT]):
    """Inject read_skill / list_skill_files tools into every model call.

    The two tools let the agent dynamically read SKILL.md workbooks stored
    under ``<project_root>/.agents/skills/<skill_name>/``.  This mirrors the
    ``enable_skills=True`` switch from the deepagents factory, but is
    implemented as a standard LangChain middleware so it composes cleanly with
    ``create_agent``.

    The tools are built once at construction time and appended to whatever
    tools are already in the request, deduplicating by name so re-entrant
    calls are safe.
    """

    def __init__(self, project_root: Path) -> None:
        super().__init__()
        self._skill_tools = _build_skill_tools(project_root)
        self._skill_tool_names = {t.name for t in self._skill_tools}

    # ── helpers ──────────────────────────────────────────────────────────────

    def _merged_tools(self, request: ModelRequest[ContextT]) -> list:
        existing = {
            t.name if hasattr(t, "name") else t.get("name", "")
            for t in request.tools
        }
        extra = [t for t in self._skill_tools if t.name not in existing]
        return [*request.tools, *extra]

    # ── sync ─────────────────────────────────────────────────────────────────

    def wrap_model_call(
        self,
        request: ModelRequest[ContextT],
        handler: Callable[[ModelRequest[ContextT]], ModelResponse[ResponseT]],
    ) -> ModelResponse[ResponseT]:
        return handler(request.override(tools=self._merged_tools(request)))

    # ── async ─────────────────────────────────────────────────────────────────

    async def awrap_model_call(
        self,
        request: ModelRequest[ContextT],
        handler: Callable[[ModelRequest[ContextT]], Awaitable[ModelResponse[ResponseT]]],
    ) -> ModelResponse[ResponseT]:
        return await handler(request.override(tools=self._merged_tools(request)))


# ── Tool factory (module-level so tools are created once per SkillMiddleware instance)

def _build_skill_tools(project_root: Path) -> list:
    skills_root = project_root / ".agents" / "skills"

    @tool
    def read_skill(skill_name: str) -> str:
        """Read the SKILL.md workbook for the given skill.

        Call this at the start of any task to load the step-by-step workflow
        defined in the skill. The skill name must match a directory under
        .agents/skills/.

        Args:
            skill_name: Name of the skill directory (e.g. "novel-generator").

        Returns:
            Full contents of SKILL.md, or an error message if not found.
        """
        skill_md = skills_root / skill_name / "SKILL.md"
        if not skill_md.exists():
            available = [d.name for d in skills_root.iterdir() if d.is_dir()] if skills_root.exists() else []
            hint = f"  Available skills: {available}" if available else "  No skills directory found."
            return f"Skill '{skill_name}' not found.\n{hint}"
        return skill_md.read_text(encoding="utf-8")

    @tool
    def list_skill_files(skill_name: str) -> str:
        """List all files inside a skill directory.

        Useful for discovering reference documents, templates, and example
        files that accompany a skill's SKILL.md.

        Args:
            skill_name: Name of the skill directory.

        Returns:
            Newline-separated list of relative file paths, or an error message.
        """
        skill_dir = skills_root / skill_name
        if not skill_dir.exists():
            return f"Skill '{skill_name}' not found."
        files = sorted(f for f in skill_dir.rglob("*") if f.is_file())
        if not files:
            return f"Skill '{skill_name}' exists but contains no files."
        return "\n".join(str(f.relative_to(skill_dir)) for f in files)

    return [read_skill, list_skill_files]


__all__ = ["SkillMiddleware"]
