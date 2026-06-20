"""Novel data access layer — PostgreSQL via asyncpg.

All functions are fully async (native asyncpg, no asyncio.to_thread).
Falls back to SQLite only when PG is unavailable (PG_HOST not set).

Tables
------
  novel_projects  — one row per novel project
  novel_chapters  — one row per chapter, FK → novel_projects

Parameter placeholders use the asyncpg convention: $1, $2, …
RETURNING * is used on INSERT/UPDATE so we always get back the full row.
"""
from __future__ import annotations

import asyncio
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from loguru import logger

# ── Backend detection ──────────────────────────────────────────────────────────
# pg_manager.is_ready() is checked at call time so the fallback kicks in
# if the PG pool failed during startup.

def _use_pg() -> bool:
    try:
        from .pg_manager import is_ready
        return is_ready()
    except Exception:
        return False


# ── DDL ────────────────────────────────────────────────────────────────────────

_DDL = """
CREATE TABLE IF NOT EXISTS novel_projects (
    id                  TEXT        PRIMARY KEY,
    title               TEXT        NOT NULL,
    genre               TEXT        NOT NULL    DEFAULT 'urbanReborn',
    protagonist_name    TEXT        NOT NULL    DEFAULT '',
    background          TEXT        NOT NULL    DEFAULT '',
    characters          TEXT        NOT NULL    DEFAULT '',
    relationships       TEXT        NOT NULL    DEFAULT '',
    plot                TEXT        NOT NULL    DEFAULT '',
    style               TEXT        NOT NULL    DEFAULT '',
    knowledge_base      TEXT        NOT NULL    DEFAULT '',
    outline             TEXT        NOT NULL    DEFAULT '',
    outline_prompt      TEXT        NOT NULL    DEFAULT '',
    chapter_prompt      TEXT        NOT NULL    DEFAULT '',
    content_prompt      TEXT        NOT NULL    DEFAULT '',
    target_chapter_count INTEGER    NOT NULL    DEFAULT 10,
    min_chapter_word_count INTEGER  NOT NULL    DEFAULT 2000,
    model               TEXT        NOT NULL    DEFAULT 'gpt-5-nano',
    temperature         REAL        NOT NULL    DEFAULT 0.8,
    status              TEXT        NOT NULL    DEFAULT 'draft',
    generation_status   TEXT        NOT NULL    DEFAULT 'idle',
    generation_error    TEXT        NOT NULL    DEFAULT '',
    generation_started_at TEXT      NOT NULL    DEFAULT '',
    generation_finished_at TEXT     NOT NULL    DEFAULT '',
    generation_step     TEXT        NOT NULL    DEFAULT '',
    generation_current  INTEGER     NOT NULL    DEFAULT 0,
    generation_total    INTEGER     NOT NULL    DEFAULT 0,
    generation_label    TEXT        NOT NULL    DEFAULT '',
    source              TEXT        NOT NULL    DEFAULT 'manual',
    total_word_count    INTEGER     NOT NULL    DEFAULT 0,
    chapter_count       INTEGER     NOT NULL    DEFAULT 0,
    published_at        TEXT        NOT NULL    DEFAULT '',
    created_at          TEXT        NOT NULL,
    updated_at          TEXT        NOT NULL
);

CREATE TABLE IF NOT EXISTS novel_chapters (
    id          TEXT        PRIMARY KEY,
    project_id  TEXT        NOT NULL    REFERENCES novel_projects(id) ON DELETE CASCADE,
    order_num   INTEGER     NOT NULL,
    title       TEXT        NOT NULL,
    outline     TEXT        NOT NULL    DEFAULT '',
    content     TEXT        NOT NULL    DEFAULT '',
    summary     TEXT        NOT NULL    DEFAULT '',
    word_count  INTEGER     NOT NULL    DEFAULT 0,
    status      TEXT        NOT NULL    DEFAULT 'draft',
    created_at  TEXT        NOT NULL,
    updated_at  TEXT        NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_sessions (
    id          TEXT        PRIMARY KEY,
    project_id  TEXT        NOT NULL    REFERENCES novel_projects(id) ON DELETE CASCADE,
    user_id     TEXT        NOT NULL    DEFAULT 'default',
    status      TEXT        NOT NULL    DEFAULT 'active',
    stage       TEXT        NOT NULL    DEFAULT 'init',
    generation_mode TEXT    NOT NULL    DEFAULT 'guided_first_chapter',
    created_at  TEXT        NOT NULL,
    updated_at  TEXT        NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_tasks (
    id                TEXT        PRIMARY KEY,
    session_id        TEXT        NOT NULL    REFERENCES agent_sessions(id) ON DELETE CASCADE,
    project_id        TEXT        NOT NULL    REFERENCES novel_projects(id) ON DELETE CASCADE,
    task_type         TEXT        NOT NULL    DEFAULT 'agent_chat',
    status            TEXT        NOT NULL    DEFAULT 'pending',
    user_message      TEXT        NOT NULL    DEFAULT '',
    assistant_content TEXT        NOT NULL    DEFAULT '',
    tool_events       TEXT        NOT NULL    DEFAULT '[]',
    error_message     TEXT        NOT NULL    DEFAULT '',
    created_at        TEXT        NOT NULL,
    updated_at        TEXT        NOT NULL,
    started_at        TEXT        NOT NULL    DEFAULT '',
    finished_at       TEXT        NOT NULL    DEFAULT ''
);

CREATE TABLE IF NOT EXISTS idea_sessions (
    id          TEXT        PRIMARY KEY,
    user_id     TEXT        NOT NULL    DEFAULT 'default',
    status      TEXT        NOT NULL    DEFAULT 'active',
    created_at  TEXT        NOT NULL,
    updated_at  TEXT        NOT NULL
);

CREATE TABLE IF NOT EXISTS idea_tasks (
    id                TEXT        PRIMARY KEY,
    session_id        TEXT        NOT NULL    REFERENCES idea_sessions(id) ON DELETE CASCADE,
    task_type         TEXT        NOT NULL    DEFAULT 'idea_chat',
    status            TEXT        NOT NULL    DEFAULT 'pending',
    user_message      TEXT        NOT NULL    DEFAULT '',
    assistant_content TEXT        NOT NULL    DEFAULT '',
    tool_events       TEXT        NOT NULL    DEFAULT '[]',
    error_message     TEXT        NOT NULL    DEFAULT '',
    created_at        TEXT        NOT NULL,
    updated_at        TEXT        NOT NULL,
    started_at        TEXT        NOT NULL    DEFAULT '',
    finished_at       TEXT        NOT NULL    DEFAULT ''
);
"""


def _now() -> str:
    return datetime.utcnow().isoformat()


# ══════════════════════════════════════════════════════════════════════════════
#  PostgreSQL implementation (asyncpg)
# ══════════════════════════════════════════════════════════════════════════════

async def _pg_init() -> None:
    from .pg_manager import get_pool
    pool = get_pool()
    async with pool.acquire() as conn:
        # Run each CREATE TABLE separately (asyncpg doesn't support multi-stmt)
        for stmt in _DDL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                await conn.execute(stmt)
        # Migrate existing tables: add new columns if not present
        await conn.execute(
            "ALTER TABLE novel_chapters ADD COLUMN IF NOT EXISTS "
            "summary TEXT NOT NULL DEFAULT ''"
        )
        for col_ddl in [
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS protagonist_name TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS total_word_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS chapter_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS published_at TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS target_chapter_count INTEGER NOT NULL DEFAULT 10",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS min_chapter_word_count INTEGER NOT NULL DEFAULT 2000",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS generation_status TEXT NOT NULL DEFAULT 'idle'",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS generation_error TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS generation_started_at TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS generation_finished_at TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS generation_step TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS generation_current INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS generation_total INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE novel_projects ADD COLUMN IF NOT EXISTS generation_label TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS generation_mode TEXT NOT NULL DEFAULT 'guided_first_chapter'",
        ]:
            await conn.execute(col_ddl)
    logger.info("pg: novel tables ensured")


def _rec(record) -> Optional[dict]:
    return dict(record) if record is not None else None


# ── Project CRUD (PG) ──────────────────────────────────────────────────────────

async def _pg_create_project(data: dict) -> dict:
    from .pg_manager import get_pool
    pid, now = str(uuid.uuid4()), _now()
    row = await get_pool().fetchrow(
        """
        INSERT INTO novel_projects
          (id,title,genre,protagonist_name,background,characters,relationships,plot,
           style,knowledge_base,outline,outline_prompt,chapter_prompt,
           content_prompt,target_chapter_count,min_chapter_word_count,
           model,temperature,status,generation_status,generation_error,
           generation_started_at,generation_finished_at,generation_step,
           generation_current,generation_total,generation_label,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
        RETURNING *
        """,
        pid,
        data["title"],
        data.get("genre", "urbanReborn"),
        data.get("protagonist_name", ""),
        data.get("background", ""),
        data.get("characters", ""),
        data.get("relationships", ""),
        data.get("plot", ""),
        data.get("style", ""),
        data.get("knowledge_base", ""),
        "",
        data.get("outline_prompt", ""),
        data.get("chapter_prompt", ""),
        data.get("content_prompt", ""),
        int(data.get("target_chapter_count", 10)),
        int(data.get("min_chapter_word_count", 2000)),
        data.get("model", "gpt-5-nano"),
        float(data.get("temperature", 0.8)),
        "draft",
        "idle",
        "",
        "",
        "",
        "",
        0,
        0,
        "",
        now,
        now,
    )
    return _rec(row)  # type: ignore[return-value]


async def _pg_list_projects() -> list[dict]:
    from .pg_manager import get_pool
    rows = await get_pool().fetch(
        "SELECT * FROM novel_projects ORDER BY updated_at DESC"
    )
    return [_rec(r) for r in rows]  # type: ignore[misc]


async def _pg_get_project(pid: str) -> Optional[dict]:
    from .pg_manager import get_pool
    return _rec(await get_pool().fetchrow(
        "SELECT * FROM novel_projects WHERE id=$1", pid
    ))


async def _pg_update_project(pid: str, updates: dict) -> Optional[dict]:
    from .pg_manager import get_pool
    updates = {**updates, "updated_at": _now()}
    keys = list(updates.keys())
    vals = list(updates.values())
    set_clause = ", ".join(f"{k}=${i+1}" for i, k in enumerate(keys))
    return _rec(await get_pool().fetchrow(
        f"UPDATE novel_projects SET {set_clause} WHERE id=${len(keys)+1} RETURNING *",
        *vals, pid,
    ))


async def _pg_delete_project(pid: str) -> None:
    from .pg_manager import get_pool
    await get_pool().execute("DELETE FROM novel_projects WHERE id=$1", pid)


# ── Chapter CRUD (PG) ──────────────────────────────────────────────────────────

async def _pg_get_chapters(pid: str) -> list[dict]:
    from .pg_manager import get_pool
    rows = await get_pool().fetch(
        "SELECT * FROM novel_chapters WHERE project_id=$1 ORDER BY order_num", pid
    )
    return [_rec(r) for r in rows]  # type: ignore[misc]


async def _pg_get_chapter(cid: str) -> Optional[dict]:
    from .pg_manager import get_pool
    return _rec(await get_pool().fetchrow(
        "SELECT * FROM novel_chapters WHERE id=$1", cid
    ))


async def _pg_create_chapter(data: dict) -> dict:
    from .pg_manager import get_pool
    cid, now = str(uuid.uuid4()), _now()
    async with get_pool().acquire() as conn:
        max_order = await conn.fetchval(
            "SELECT COALESCE(MAX(order_num), 0) FROM novel_chapters WHERE project_id=$1",
            data["project_id"],
        )
        requested_order = int(data.get("order_num", 1) or 1)
        order_num = max(1, min(requested_order, int(max_order or 0) + 1))
        await conn.execute(
            """
            UPDATE novel_chapters
            SET order_num = order_num + 1, updated_at = $1
            WHERE project_id = $2 AND order_num >= $3
            """,
            now,
            data["project_id"],
            order_num,
        )
        row = await conn.fetchrow(
            """
            INSERT INTO novel_chapters
              (id,project_id,order_num,title,outline,content,summary,word_count,status,created_at,updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING *
            """,
            cid,
            data["project_id"],
            order_num,
            data["title"],
            data.get("outline", ""),
            data.get("content", ""),
            data.get("summary", ""),
            len(data.get("content", "")),
            data.get("status", "draft"),
            now,
            now,
        )
    return _rec(row)  # type: ignore[return-value]


async def _pg_update_chapter(cid: str, updates: dict) -> Optional[dict]:
    from .pg_manager import get_pool
    if "content" in updates:
        updates = {**updates, "word_count": len(updates["content"])}
    updates = {**updates, "updated_at": _now()}
    keys = list(updates.keys())
    vals = list(updates.values())
    set_clause = ", ".join(f"{k}=${i+1}" for i, k in enumerate(keys))
    return _rec(await get_pool().fetchrow(
        f"UPDATE novel_chapters SET {set_clause} WHERE id=${len(keys)+1} RETURNING *",
        *vals, cid,
    ))


async def _pg_delete_chapter(cid: str) -> None:
    from .pg_manager import get_pool
    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT project_id, order_num FROM novel_chapters WHERE id=$1",
            cid,
        )
        if not row:
            return
        now = _now()
        await conn.execute("DELETE FROM novel_chapters WHERE id=$1", cid)
        await conn.execute(
            """
            UPDATE novel_chapters
            SET order_num = order_num - 1, updated_at = $1
            WHERE project_id = $2 AND order_num > $3
            """,
            now,
            row["project_id"],
            row["order_num"],
        )


async def _pg_replace_chapters(pid: str, chapters_data: list[dict]) -> list[dict]:
    from .pg_manager import get_pool
    async with get_pool().acquire() as conn:
        await conn.execute("DELETE FROM novel_chapters WHERE project_id=$1", pid)
        result = []
        for ch in chapters_data:
            cid, now = str(uuid.uuid4()), _now()
            row = await conn.fetchrow(
                """
                INSERT INTO novel_chapters
                  (id,project_id,order_num,title,outline,content,summary,word_count,status,created_at,updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                RETURNING *
                """,
                cid, pid, ch["order_num"], ch["title"],
                ch.get("outline", ""), ch.get("content", ""),
                ch.get("summary", ""), 0, "draft", now, now,
            )
            result.append(_rec(row))
    return result  # type: ignore[return-value]


async def _pg_replace_future_chapters(pid: str, start_order: int, chapters_data: list[dict]) -> list[dict]:
    from .pg_manager import get_pool
    async with get_pool().acquire() as conn:
        await conn.execute(
            "DELETE FROM novel_chapters WHERE project_id=$1 AND order_num>=$2",
            pid,
            start_order,
        )
        for idx, ch in enumerate(chapters_data):
            cid, now = str(uuid.uuid4()), _now()
            await conn.execute(
                """
                INSERT INTO novel_chapters
                  (id,project_id,order_num,title,outline,content,summary,word_count,status,created_at,updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                """,
                cid,
                pid,
                start_order + idx,
                ch["title"],
                ch.get("outline", ""),
                ch.get("content", ""),
                ch.get("summary", ""),
                0,
                "draft",
                now,
                now,
            )
        rows = await conn.fetch(
            "SELECT * FROM novel_chapters WHERE project_id=$1 ORDER BY order_num",
            pid,
        )
    return [_rec(row) for row in rows]  # type: ignore[return-value]


# ══════════════════════════════════════════════════════════════════════════════
#  SQLite fallback (for local dev without PG)
# ══════════════════════════════════════════════════════════════════════════════

_SQLITE_PATH = Path("./novel_data/novels.db")
_sqlite_conn: Optional[sqlite3.Connection] = None


def _get_sqlite() -> sqlite3.Connection:
    global _sqlite_conn
    if _sqlite_conn is None:
        _SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _sqlite_conn = sqlite3.connect(str(_SQLITE_PATH), check_same_thread=False)
        _sqlite_conn.row_factory = sqlite3.Row
        _sqlite_conn.execute("PRAGMA journal_mode=WAL")
        _sqlite_conn.execute("PRAGMA foreign_keys=ON")
        for stmt in _DDL.replace("REFERENCES novel_projects(id) ON DELETE CASCADE",
                                 "REFERENCES novel_projects(id)").strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                _sqlite_conn.execute(stmt)
        # Migrate: add new columns if absent
        ch_cols = {row[1] for row in _sqlite_conn.execute("PRAGMA table_info(novel_chapters)")}
        if "summary" not in ch_cols:
            _sqlite_conn.execute("ALTER TABLE novel_chapters ADD COLUMN summary TEXT NOT NULL DEFAULT ''")
        proj_cols = {row[1] for row in _sqlite_conn.execute("PRAGMA table_info(novel_projects)")}
        for col, ddl in [
            ("protagonist_name", "ALTER TABLE novel_projects ADD COLUMN protagonist_name TEXT NOT NULL DEFAULT ''"),
            ("total_word_count", "ALTER TABLE novel_projects ADD COLUMN total_word_count INTEGER NOT NULL DEFAULT 0"),
            ("chapter_count",    "ALTER TABLE novel_projects ADD COLUMN chapter_count INTEGER NOT NULL DEFAULT 0"),
            ("published_at",     "ALTER TABLE novel_projects ADD COLUMN published_at TEXT NOT NULL DEFAULT ''"),
            ("source",           "ALTER TABLE novel_projects ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'"),
            ("target_chapter_count", "ALTER TABLE novel_projects ADD COLUMN target_chapter_count INTEGER NOT NULL DEFAULT 10"),
            ("min_chapter_word_count", "ALTER TABLE novel_projects ADD COLUMN min_chapter_word_count INTEGER NOT NULL DEFAULT 2000"),
            ("generation_status", "ALTER TABLE novel_projects ADD COLUMN generation_status TEXT NOT NULL DEFAULT 'idle'"),
            ("generation_error", "ALTER TABLE novel_projects ADD COLUMN generation_error TEXT NOT NULL DEFAULT ''"),
            ("generation_started_at", "ALTER TABLE novel_projects ADD COLUMN generation_started_at TEXT NOT NULL DEFAULT ''"),
            ("generation_finished_at", "ALTER TABLE novel_projects ADD COLUMN generation_finished_at TEXT NOT NULL DEFAULT ''"),
            ("generation_step", "ALTER TABLE novel_projects ADD COLUMN generation_step TEXT NOT NULL DEFAULT ''"),
            ("generation_current", "ALTER TABLE novel_projects ADD COLUMN generation_current INTEGER NOT NULL DEFAULT 0"),
            ("generation_total", "ALTER TABLE novel_projects ADD COLUMN generation_total INTEGER NOT NULL DEFAULT 0"),
            ("generation_label", "ALTER TABLE novel_projects ADD COLUMN generation_label TEXT NOT NULL DEFAULT ''"),
        ]:
            if col not in proj_cols:
                _sqlite_conn.execute(ddl)
        session_cols = {row[1] for row in _sqlite_conn.execute("PRAGMA table_info(agent_sessions)")}
        if "generation_mode" not in session_cols:
            _sqlite_conn.execute(
                "ALTER TABLE agent_sessions ADD COLUMN generation_mode TEXT NOT NULL DEFAULT 'guided_first_chapter'"
            )
        _sqlite_conn.execute(
            "CREATE TABLE IF NOT EXISTS idea_sessions ("
            "id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT 'default', "
            "status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        _sqlite_conn.execute(
            "CREATE TABLE IF NOT EXISTS idea_tasks ("
            "id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES idea_sessions(id), "
            "task_type TEXT NOT NULL DEFAULT 'idea_chat', status TEXT NOT NULL DEFAULT 'pending', "
            "user_message TEXT NOT NULL DEFAULT '', assistant_content TEXT NOT NULL DEFAULT '', "
            "tool_events TEXT NOT NULL DEFAULT '[]', error_message TEXT NOT NULL DEFAULT '', "
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, started_at TEXT NOT NULL DEFAULT '', "
            "finished_at TEXT NOT NULL DEFAULT '')"
        )
        _sqlite_conn.commit()
        logger.info(f"novel_db: SQLite fallback ready ({_SQLITE_PATH.resolve()})")
    return _sqlite_conn


def _sqlite_row(r) -> Optional[dict]:
    return dict(r) if r is not None else None


def _sq_create_project(data: dict) -> dict:
    c = _get_sqlite()
    pid, now = str(uuid.uuid4()), _now()
    c.execute(
        "INSERT INTO novel_projects "
        "(id,title,genre,protagonist_name,background,characters,relationships,plot,style,"
        "knowledge_base,outline,outline_prompt,chapter_prompt,content_prompt,"
        "target_chapter_count,min_chapter_word_count,model,temperature,status,generation_status,"
        "generation_error,generation_started_at,generation_finished_at,generation_step,"
        "generation_current,generation_total,generation_label,created_at,updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (pid, data["title"], data.get("genre","urbanReborn"),
         data.get("protagonist_name",""),
         data.get("background",""), data.get("characters",""),
         data.get("relationships",""), data.get("plot",""),
         data.get("style",""), data.get("knowledge_base",""),
         "", data.get("outline_prompt",""), data.get("chapter_prompt",""),
         data.get("content_prompt",""), int(data.get("target_chapter_count", 10)),
         int(data.get("min_chapter_word_count", 2000)), data.get("model","gpt-5-nano"),
         float(data.get("temperature",0.8)), "draft", "idle", "", "", "", "", 0, 0, "", now, now),
    )
    c.commit()
    return _sqlite_row(c.execute("SELECT * FROM novel_projects WHERE id=?", (pid,)).fetchone())  # type: ignore[return-value]

def _sq_list_projects() -> list[dict]:
    return [_sqlite_row(r) for r in _get_sqlite().execute("SELECT * FROM novel_projects ORDER BY updated_at DESC").fetchall()]  # type: ignore[misc]

def _sq_get_project(pid: str) -> Optional[dict]:
    return _sqlite_row(_get_sqlite().execute("SELECT * FROM novel_projects WHERE id=?", (pid,)).fetchone())

def _sq_update_project(pid: str, updates: dict) -> Optional[dict]:
    c = _get_sqlite()
    updates = {**updates, "updated_at": _now()}
    set_sql = ", ".join(f"{k}=?" for k in updates)
    c.execute(f"UPDATE novel_projects SET {set_sql} WHERE id=?", [*updates.values(), pid])
    c.commit()
    return _sqlite_row(c.execute("SELECT * FROM novel_projects WHERE id=?", (pid,)).fetchone())

def _sq_delete_project(pid: str) -> None:
    c = _get_sqlite()
    c.execute("DELETE FROM novel_chapters WHERE project_id=?", (pid,))
    c.execute("DELETE FROM novel_projects WHERE id=?", (pid,))
    c.commit()

def _sq_get_chapters(pid: str) -> list[dict]:
    return [_sqlite_row(r) for r in _get_sqlite().execute("SELECT * FROM novel_chapters WHERE project_id=? ORDER BY order_num", (pid,)).fetchall()]  # type: ignore[misc]

def _sq_get_chapter(cid: str) -> Optional[dict]:
    return _sqlite_row(_get_sqlite().execute("SELECT * FROM novel_chapters WHERE id=?", (cid,)).fetchone())

def _sq_create_chapter(data: dict) -> dict:
    c = _get_sqlite()
    cid, now = str(uuid.uuid4()), _now()
    max_order_row = c.execute(
        "SELECT COALESCE(MAX(order_num), 0) FROM novel_chapters WHERE project_id=?",
        (data["project_id"],),
    ).fetchone()
    max_order = int(max_order_row[0] if max_order_row else 0)
    requested_order = int(data.get("order_num", 1) or 1)
    order_num = max(1, min(requested_order, max_order + 1))
    c.execute(
        """
        UPDATE novel_chapters
        SET order_num = order_num + 1, updated_at=?
        WHERE project_id=? AND order_num>=?
        """,
        (now, data["project_id"], order_num),
    )
    c.execute(
        "INSERT INTO novel_chapters (id,project_id,order_num,title,outline,content,summary,word_count,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (
            cid,
            data["project_id"],
            order_num,
            data["title"],
            data.get("outline",""),
            data.get("content",""),
            data.get("summary",""),
            len(data.get("content","")),
            data.get("status", "draft"),
            now,
            now,
        ),
    )
    c.commit()
    return _sqlite_row(c.execute("SELECT * FROM novel_chapters WHERE id=?", (cid,)).fetchone())  # type: ignore[return-value]

def _sq_update_chapter(cid: str, updates: dict) -> Optional[dict]:
    c = _get_sqlite()
    if "content" in updates:
        updates = {**updates, "word_count": len(updates["content"])}
    updates = {**updates, "updated_at": _now()}
    set_sql = ", ".join(f"{k}=?" for k in updates)
    c.execute(f"UPDATE novel_chapters SET {set_sql} WHERE id=?", [*updates.values(), cid])
    c.commit()
    return _sqlite_row(c.execute("SELECT * FROM novel_chapters WHERE id=?", (cid,)).fetchone())

def _sq_delete_chapter(cid: str) -> None:
    c = _get_sqlite()
    row = c.execute(
        "SELECT project_id, order_num FROM novel_chapters WHERE id=?",
        (cid,),
    ).fetchone()
    if row is None:
        return
    now = _now()
    c.execute("DELETE FROM novel_chapters WHERE id=?", (cid,))
    c.execute(
        """
        UPDATE novel_chapters
        SET order_num = order_num - 1, updated_at=?
        WHERE project_id=? AND order_num>?
        """,
        (now, row["project_id"], row["order_num"]),
    )
    c.commit()

def _sq_replace_chapters(pid: str, chapters_data: list[dict]) -> list[dict]:
    c = _get_sqlite()
    c.execute("DELETE FROM novel_chapters WHERE project_id=?", (pid,))
    c.commit()
    result = []
    for ch in chapters_data:
        ch["project_id"] = pid
        result.append(_sq_create_chapter(ch))
    return result


def _sq_replace_future_chapters(pid: str, start_order: int, chapters_data: list[dict]) -> list[dict]:
    c = _get_sqlite()
    c.execute("DELETE FROM novel_chapters WHERE project_id=? AND order_num>=?", (pid, start_order))
    c.commit()
    for idx, ch in enumerate(chapters_data):
        _sq_create_chapter({
            "project_id": pid,
            "order_num": start_order + idx,
            "title": ch["title"],
            "outline": ch.get("outline", ""),
            "content": ch.get("content", ""),
            "summary": ch.get("summary", ""),
        })
    return _sq_get_chapters(pid)


# ══════════════════════════════════════════════════════════════════════════════
#  Public async API  (routes to PG or SQLite automatically)
# ══════════════════════════════════════════════════════════════════════════════

async def init_db() -> None:
    """Create tables. Call once at startup after the pool is ready."""
    if _use_pg():
        await _pg_init()
    else:
        await asyncio.to_thread(_get_sqlite)


async def create_project(data: dict) -> dict:
    if _use_pg():
        return await _pg_create_project(data)
    return await asyncio.to_thread(_sq_create_project, data)


async def list_projects() -> list[dict]:
    if _use_pg():
        return await _pg_list_projects()
    return await asyncio.to_thread(_sq_list_projects)


async def get_project(pid: str) -> Optional[dict]:
    if _use_pg():
        return await _pg_get_project(pid)
    return await asyncio.to_thread(_sq_get_project, pid)


async def update_project(pid: str, updates: dict) -> Optional[dict]:
    if _use_pg():
        return await _pg_update_project(pid, updates)
    return await asyncio.to_thread(_sq_update_project, pid, updates)


async def delete_project(pid: str) -> None:
    if _use_pg():
        await _pg_delete_project(pid)
    else:
        await asyncio.to_thread(_sq_delete_project, pid)


async def get_chapters(pid: str) -> list[dict]:
    if _use_pg():
        return await _pg_get_chapters(pid)
    return await asyncio.to_thread(_sq_get_chapters, pid)


async def get_chapter(cid: str) -> Optional[dict]:
    if _use_pg():
        return await _pg_get_chapter(cid)
    return await asyncio.to_thread(_sq_get_chapter, cid)


async def create_chapter(data: dict) -> dict:
    if _use_pg():
        return await _pg_create_chapter(data)
    return await asyncio.to_thread(_sq_create_chapter, data)


async def update_chapter(cid: str, updates: dict) -> Optional[dict]:
    if _use_pg():
        return await _pg_update_chapter(cid, updates)
    return await asyncio.to_thread(_sq_update_chapter, cid, updates)


async def delete_chapter(cid: str) -> None:
    if _use_pg():
        await _pg_delete_chapter(cid)
    else:
        await asyncio.to_thread(_sq_delete_chapter, cid)


async def replace_chapters(pid: str, chapters_data: list[dict]) -> list[dict]:
    if _use_pg():
        return await _pg_replace_chapters(pid, chapters_data)
    return await asyncio.to_thread(_sq_replace_chapters, pid, chapters_data)


async def replace_future_chapters(pid: str, start_order: int, chapters_data: list[dict]) -> list[dict]:
    if _use_pg():
        return await _pg_replace_future_chapters(pid, start_order, chapters_data)
    return await asyncio.to_thread(_sq_replace_future_chapters, pid, start_order, chapters_data)


async def finalize_project(pid: str) -> Optional[dict]:
    """Mark a project as published and persist aggregated stats.

    Computes total_word_count and chapter_count from the chapters table so the
    list page can display them without loading all chapter content.
    """
    chapters = await get_chapters(pid)
    total_words = sum(c.get("word_count", 0) for c in chapters)
    ch_count = len(chapters)
    updates = {
        "status": "published",
        "total_word_count": total_words,
        "chapter_count": ch_count,
        "published_at": _now(),
    }
    return await update_project(pid, updates)


# ══════════════════════════════════════════════════════════════════════════════
#  Agent Sessions
# ══════════════════════════════════════════════════════════════════════════════

async def _pg_create_session(
    sid: str,
    project_id: str,
    user_id: str,
    generation_mode: str = "guided_first_chapter",
) -> dict:
    from .pg_manager import get_pool
    now = _now()
    row = await get_pool().fetchrow(
        """
        INSERT INTO agent_sessions (id, project_id, user_id, status, stage, generation_mode, created_at, updated_at)
        VALUES ($1, $2, $3, 'active', 'init', $4, $5, $5)
        RETURNING *
        """,
        sid, project_id, user_id, generation_mode, now,
    )
    return _rec(row)  # type: ignore[return-value]


async def _pg_get_session(sid: str) -> Optional[dict]:
    from .pg_manager import get_pool
    return _rec(await get_pool().fetchrow(
        "SELECT * FROM agent_sessions WHERE id=$1", sid
    ))


async def _pg_update_session(sid: str, updates: dict) -> Optional[dict]:
    from .pg_manager import get_pool
    updates = {**updates, "updated_at": _now()}
    keys = list(updates.keys())
    vals = list(updates.values())
    set_clause = ", ".join(f"{k}=${i+1}" for i, k in enumerate(keys))
    return _rec(await get_pool().fetchrow(
        f"UPDATE agent_sessions SET {set_clause} WHERE id=${len(keys)+1} RETURNING *",
        *vals, sid,
    ))


async def _pg_delete_session(sid: str) -> None:
    from .pg_manager import get_pool
    await get_pool().execute("DELETE FROM agent_sessions WHERE id=$1", sid)


async def _pg_list_sessions_by_user(user_id: str) -> list[dict]:
    from .pg_manager import get_pool
    rows = await get_pool().fetch(
        "SELECT * FROM agent_sessions WHERE user_id=$1 ORDER BY updated_at DESC", user_id
    )
    return [_rec(r) for r in rows]  # type: ignore[misc]


async def _pg_get_latest_session_by_project(project_id: str) -> Optional[dict]:
    from .pg_manager import get_pool
    return _rec(await get_pool().fetchrow(
        "SELECT * FROM agent_sessions WHERE project_id=$1 ORDER BY updated_at DESC LIMIT 1",
        project_id,
    ))


def _sq_create_session(
    sid: str,
    project_id: str,
    user_id: str,
    generation_mode: str = "guided_first_chapter",
) -> dict:
    c = _get_sqlite()
    now = _now()
    c.execute(
        "INSERT INTO agent_sessions (id, project_id, user_id, status, stage, generation_mode, created_at, updated_at) "
        "VALUES (?,?,?,'active','init',?,?,?)",
        (sid, project_id, user_id, generation_mode, now, now),
    )
    c.commit()
    return _sqlite_row(c.execute("SELECT * FROM agent_sessions WHERE id=?", (sid,)).fetchone())  # type: ignore[return-value]


def _sq_get_session(sid: str) -> Optional[dict]:
    return _sqlite_row(_get_sqlite().execute("SELECT * FROM agent_sessions WHERE id=?", (sid,)).fetchone())


def _sq_update_session(sid: str, updates: dict) -> Optional[dict]:
    c = _get_sqlite()
    updates = {**updates, "updated_at": _now()}
    set_sql = ", ".join(f"{k}=?" for k in updates)
    c.execute(f"UPDATE agent_sessions SET {set_sql} WHERE id=?", [*updates.values(), sid])
    c.commit()
    return _sqlite_row(c.execute("SELECT * FROM agent_sessions WHERE id=?", (sid,)).fetchone())


def _sq_delete_session(sid: str) -> None:
    c = _get_sqlite()
    c.execute("DELETE FROM agent_sessions WHERE id=?", (sid,))
    c.commit()


def _sq_list_sessions_by_user(user_id: str) -> list[dict]:
    return [_sqlite_row(r) for r in _get_sqlite().execute(
        "SELECT * FROM agent_sessions WHERE user_id=? ORDER BY updated_at DESC", (user_id,)
    ).fetchall()]  # type: ignore[misc]


def _sq_get_latest_session_by_project(project_id: str) -> Optional[dict]:
    return _sqlite_row(_get_sqlite().execute(
        "SELECT * FROM agent_sessions WHERE project_id=? ORDER BY updated_at DESC LIMIT 1",
        (project_id,),
    ).fetchone())


# Public async API for agent sessions

async def create_session(
    sid: str,
    project_id: str,
    user_id: str,
    generation_mode: str = "guided_first_chapter",
) -> dict:
    if _use_pg():
        return await _pg_create_session(sid, project_id, user_id, generation_mode)
    return await asyncio.to_thread(_sq_create_session, sid, project_id, user_id, generation_mode)


async def get_session(sid: str) -> Optional[dict]:
    if _use_pg():
        return await _pg_get_session(sid)
    return await asyncio.to_thread(_sq_get_session, sid)


async def update_session(sid: str, updates: dict) -> Optional[dict]:
    if _use_pg():
        return await _pg_update_session(sid, updates)
    return await asyncio.to_thread(_sq_update_session, sid, updates)


async def delete_session(sid: str) -> None:
    if _use_pg():
        await _pg_delete_session(sid)
    else:
        await asyncio.to_thread(_sq_delete_session, sid)


async def list_sessions_by_user(user_id: str) -> list[dict]:
    if _use_pg():
        return await _pg_list_sessions_by_user(user_id)
    return await asyncio.to_thread(_sq_list_sessions_by_user, user_id)


async def get_latest_session_by_project(project_id: str) -> Optional[dict]:
    if _use_pg():
        return await _pg_get_latest_session_by_project(project_id)
    return await asyncio.to_thread(_sq_get_latest_session_by_project, project_id)


# ══════════════════════════════════════════════════════════════════════════════
#  Agent Tasks
# ══════════════════════════════════════════════════════════════════════════════

async def _pg_create_agent_task(session_id: str, project_id: str, user_message: str, task_type: str = "agent_chat") -> dict:
    from .pg_manager import get_pool
    task_id, now = str(uuid.uuid4()), _now()
    row = await get_pool().fetchrow(
        """
        INSERT INTO agent_tasks
          (id, session_id, project_id, task_type, status, user_message, assistant_content,
           tool_events, error_message, created_at, updated_at, started_at, finished_at)
        VALUES ($1, $2, $3, $4, 'pending', $5, '', '[]', '', $6, $6, '', '')
        RETURNING *
        """,
        task_id, session_id, project_id, task_type, user_message, now,
    )
    return _rec(row)  # type: ignore[return-value]


async def _pg_get_agent_task(task_id: str) -> Optional[dict]:
    from .pg_manager import get_pool
    return _rec(await get_pool().fetchrow(
        "SELECT * FROM agent_tasks WHERE id=$1", task_id
    ))


async def _pg_get_latest_agent_task(session_id: str) -> Optional[dict]:
    from .pg_manager import get_pool
    return _rec(await get_pool().fetchrow(
        "SELECT * FROM agent_tasks WHERE session_id=$1 ORDER BY created_at DESC LIMIT 1", session_id
    ))


async def _pg_update_agent_task(task_id: str, updates: dict) -> Optional[dict]:
    from .pg_manager import get_pool
    updates = {**updates, "updated_at": _now()}
    keys = list(updates.keys())
    vals = list(updates.values())
    set_clause = ", ".join(f"{k}=${i+1}" for i, k in enumerate(keys))
    return _rec(await get_pool().fetchrow(
        f"UPDATE agent_tasks SET {set_clause} WHERE id=${len(keys)+1} RETURNING *",
        *vals, task_id,
    ))


def _sq_create_agent_task(session_id: str, project_id: str, user_message: str, task_type: str = "agent_chat") -> dict:
    c = _get_sqlite()
    task_id, now = str(uuid.uuid4()), _now()
    c.execute(
        "INSERT INTO agent_tasks "
        "(id,session_id,project_id,task_type,status,user_message,assistant_content,tool_events,error_message,created_at,updated_at,started_at,finished_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (task_id, session_id, project_id, task_type, "pending", user_message, "", "[]", "", now, now, "", ""),
    )
    c.commit()
    return _sqlite_row(c.execute("SELECT * FROM agent_tasks WHERE id=?", (task_id,)).fetchone())  # type: ignore[return-value]


def _sq_get_agent_task(task_id: str) -> Optional[dict]:
    return _sqlite_row(_get_sqlite().execute("SELECT * FROM agent_tasks WHERE id=?", (task_id,)).fetchone())


def _sq_get_latest_agent_task(session_id: str) -> Optional[dict]:
    return _sqlite_row(_get_sqlite().execute(
        "SELECT * FROM agent_tasks WHERE session_id=? ORDER BY created_at DESC LIMIT 1", (session_id,)
    ).fetchone())


def _sq_update_agent_task(task_id: str, updates: dict) -> Optional[dict]:
    c = _get_sqlite()
    updates = {**updates, "updated_at": _now()}
    set_sql = ", ".join(f"{k}=?" for k in updates)
    c.execute(f"UPDATE agent_tasks SET {set_sql} WHERE id=?", [*updates.values(), task_id])
    c.commit()
    return _sqlite_row(c.execute("SELECT * FROM agent_tasks WHERE id=?", (task_id,)).fetchone())


async def create_agent_task(session_id: str, project_id: str, user_message: str, task_type: str = "agent_chat") -> dict:
    if _use_pg():
        return await _pg_create_agent_task(session_id, project_id, user_message, task_type)
    return await asyncio.to_thread(_sq_create_agent_task, session_id, project_id, user_message, task_type)


async def get_agent_task(task_id: str) -> Optional[dict]:
    if _use_pg():
        return await _pg_get_agent_task(task_id)
    return await asyncio.to_thread(_sq_get_agent_task, task_id)


async def get_latest_agent_task(session_id: str) -> Optional[dict]:
    if _use_pg():
        return await _pg_get_latest_agent_task(session_id)
    return await asyncio.to_thread(_sq_get_latest_agent_task, session_id)


async def update_agent_task(task_id: str, updates: dict) -> Optional[dict]:
    if _use_pg():
        return await _pg_update_agent_task(task_id, updates)
    return await asyncio.to_thread(_sq_update_agent_task, task_id, updates)


# ══════════════════════════════════════════════════════════════════════════════
#  Idea Sessions
# ══════════════════════════════════════════════════════════════════════════════

async def _pg_create_idea_session(sid: str, user_id: str) -> dict:
    from .pg_manager import get_pool
    now = _now()
    row = await get_pool().fetchrow(
        """
        INSERT INTO idea_sessions (id, user_id, status, created_at, updated_at)
        VALUES ($1, $2, 'active', $3, $3)
        RETURNING *
        """,
        sid, user_id, now,
    )
    return _rec(row)  # type: ignore[return-value]


async def _pg_get_idea_session(sid: str) -> Optional[dict]:
    from .pg_manager import get_pool
    return _rec(await get_pool().fetchrow(
        "SELECT * FROM idea_sessions WHERE id=$1", sid
    ))


async def _pg_update_idea_session(sid: str, updates: dict) -> Optional[dict]:
    from .pg_manager import get_pool
    updates = {**updates, "updated_at": _now()}
    keys = list(updates.keys())
    vals = list(updates.values())
    set_clause = ", ".join(f"{k}=${i+1}" for i, k in enumerate(keys))
    return _rec(await get_pool().fetchrow(
        f"UPDATE idea_sessions SET {set_clause} WHERE id=${len(keys)+1} RETURNING *",
        *vals, sid,
    ))


async def _pg_delete_idea_session(sid: str) -> None:
    from .pg_manager import get_pool
    await get_pool().execute("DELETE FROM idea_sessions WHERE id=$1", sid)


def _sq_create_idea_session(sid: str, user_id: str) -> dict:
    c = _get_sqlite()
    now = _now()
    c.execute(
        "INSERT INTO idea_sessions (id, user_id, status, created_at, updated_at) VALUES (?,?, 'active', ?, ?)",
        (sid, user_id, now, now),
    )
    c.commit()
    return _sqlite_row(c.execute("SELECT * FROM idea_sessions WHERE id=?", (sid,)).fetchone())  # type: ignore[return-value]


def _sq_get_idea_session(sid: str) -> Optional[dict]:
    return _sqlite_row(_get_sqlite().execute("SELECT * FROM idea_sessions WHERE id=?", (sid,)).fetchone())


def _sq_update_idea_session(sid: str, updates: dict) -> Optional[dict]:
    c = _get_sqlite()
    updates = {**updates, "updated_at": _now()}
    set_sql = ", ".join(f"{k}=?" for k in updates)
    c.execute(f"UPDATE idea_sessions SET {set_sql} WHERE id=?", [*updates.values(), sid])
    c.commit()
    return _sqlite_row(c.execute("SELECT * FROM idea_sessions WHERE id=?", (sid,)).fetchone())


def _sq_delete_idea_session(sid: str) -> None:
    c = _get_sqlite()
    c.execute("DELETE FROM idea_sessions WHERE id=?", (sid,))
    c.commit()


async def create_idea_session(sid: str, user_id: str) -> dict:
    if _use_pg():
        return await _pg_create_idea_session(sid, user_id)
    return await asyncio.to_thread(_sq_create_idea_session, sid, user_id)


async def get_idea_session(sid: str) -> Optional[dict]:
    if _use_pg():
        return await _pg_get_idea_session(sid)
    return await asyncio.to_thread(_sq_get_idea_session, sid)


async def update_idea_session(sid: str, updates: dict) -> Optional[dict]:
    if _use_pg():
        return await _pg_update_idea_session(sid, updates)
    return await asyncio.to_thread(_sq_update_idea_session, sid, updates)


async def delete_idea_session(sid: str) -> None:
    if _use_pg():
        await _pg_delete_idea_session(sid)
    else:
        await asyncio.to_thread(_sq_delete_idea_session, sid)


# ══════════════════════════════════════════════════════════════════════════════
#  Idea Tasks
# ══════════════════════════════════════════════════════════════════════════════

async def _pg_create_idea_task(session_id: str, user_message: str, task_type: str = "idea_chat") -> dict:
    from .pg_manager import get_pool
    task_id, now = str(uuid.uuid4()), _now()
    row = await get_pool().fetchrow(
        """
        INSERT INTO idea_tasks
          (id, session_id, task_type, status, user_message, assistant_content,
           tool_events, error_message, created_at, updated_at, started_at, finished_at)
        VALUES ($1, $2, $3, 'pending', $4, '', '[]', '', $5, $5, '', '')
        RETURNING *
        """,
        task_id, session_id, task_type, user_message, now,
    )
    return _rec(row)  # type: ignore[return-value]


async def _pg_get_idea_task(task_id: str) -> Optional[dict]:
    from .pg_manager import get_pool
    return _rec(await get_pool().fetchrow(
        "SELECT * FROM idea_tasks WHERE id=$1", task_id
    ))


async def _pg_get_latest_idea_task(session_id: str) -> Optional[dict]:
    from .pg_manager import get_pool
    return _rec(await get_pool().fetchrow(
        "SELECT * FROM idea_tasks WHERE session_id=$1 ORDER BY created_at DESC LIMIT 1", session_id
    ))


async def _pg_update_idea_task(task_id: str, updates: dict) -> Optional[dict]:
    from .pg_manager import get_pool
    updates = {**updates, "updated_at": _now()}
    keys = list(updates.keys())
    vals = list(updates.values())
    set_clause = ", ".join(f"{k}=${i+1}" for i, k in enumerate(keys))
    return _rec(await get_pool().fetchrow(
        f"UPDATE idea_tasks SET {set_clause} WHERE id=${len(keys)+1} RETURNING *",
        *vals, task_id,
    ))


def _sq_create_idea_task(session_id: str, user_message: str, task_type: str = "idea_chat") -> dict:
    c = _get_sqlite()
    task_id, now = str(uuid.uuid4()), _now()
    c.execute(
        "INSERT INTO idea_tasks "
        "(id,session_id,task_type,status,user_message,assistant_content,tool_events,error_message,created_at,updated_at,started_at,finished_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (task_id, session_id, task_type, "pending", user_message, "", "[]", "", now, now, "", ""),
    )
    c.commit()
    return _sqlite_row(c.execute("SELECT * FROM idea_tasks WHERE id=?", (task_id,)).fetchone())  # type: ignore[return-value]


def _sq_get_idea_task(task_id: str) -> Optional[dict]:
    return _sqlite_row(_get_sqlite().execute("SELECT * FROM idea_tasks WHERE id=?", (task_id,)).fetchone())


def _sq_get_latest_idea_task(session_id: str) -> Optional[dict]:
    return _sqlite_row(_get_sqlite().execute(
        "SELECT * FROM idea_tasks WHERE session_id=? ORDER BY created_at DESC LIMIT 1", (session_id,)
    ).fetchone())


def _sq_update_idea_task(task_id: str, updates: dict) -> Optional[dict]:
    c = _get_sqlite()
    updates = {**updates, "updated_at": _now()}
    set_sql = ", ".join(f"{k}=?" for k in updates)
    c.execute(f"UPDATE idea_tasks SET {set_sql} WHERE id=?", [*updates.values(), task_id])
    c.commit()
    return _sqlite_row(c.execute("SELECT * FROM idea_tasks WHERE id=?", (task_id,)).fetchone())


async def create_idea_task(session_id: str, user_message: str, task_type: str = "idea_chat") -> dict:
    if _use_pg():
        return await _pg_create_idea_task(session_id, user_message, task_type)
    return await asyncio.to_thread(_sq_create_idea_task, session_id, user_message, task_type)


async def get_idea_task(task_id: str) -> Optional[dict]:
    if _use_pg():
        return await _pg_get_idea_task(task_id)
    return await asyncio.to_thread(_sq_get_idea_task, task_id)


async def get_latest_idea_task(session_id: str) -> Optional[dict]:
    if _use_pg():
        return await _pg_get_latest_idea_task(session_id)
    return await asyncio.to_thread(_sq_get_latest_idea_task, session_id)


async def update_idea_task(task_id: str, updates: dict) -> Optional[dict]:
    if _use_pg():
        return await _pg_update_idea_task(task_id, updates)
    return await asyncio.to_thread(_sq_update_idea_task, task_id, updates)
