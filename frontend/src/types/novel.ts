// ── Chapter ────────────────────────────────────────────────────────────────────

export interface Chapter {
  id: string;
  project_id: string;
  order_num: number;
  title: string;
  outline: string;
  content: string;
  summary: string;
  word_count: number;
  status: "draft" | "generated";
  created_at: string;
  updated_at: string;
}

// ── Novel Project ──────────────────────────────────────────────────────────────

export type GenerationMode = "guided_first_chapter" | "full_book";

export interface NovelProject {
  id: string;
  title: string;
  genre: string;
  background: string;
  characters: string;
  relationships: string;
  plot: string;
  style: string;
  knowledge_base: string;
  outline: string;
  outline_prompt: string;
  chapter_prompt: string;
  content_prompt: string;
  target_chapter_count: number;
  min_chapter_word_count: number;
  model: string;
  temperature: number;
  source: "manual" | "agent";
  status: "draft" | "complete" | "published";
  generation_status: "idle" | "running" | "failed";
  generation_error: string;
  generation_started_at: string;
  generation_finished_at: string;
  generation_step: string;
  generation_current: number;
  generation_total: number;
  generation_label: string;
  total_word_count: number;
  chapter_count: number;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface NovelProjectDetail extends NovelProject {
  chapters: Chapter[];
}

// ── API Request Bodies ─────────────────────────────────────────────────────────

export interface NovelProjectCreate {
  title: string;
  genre?: string;
  background?: string;
  characters?: string;
  relationships?: string;
  plot?: string;
  style?: string;
  knowledge_base?: string;
  outline_prompt?: string;
  chapter_prompt?: string;
  content_prompt?: string;
  target_chapter_count?: number;
  min_chapter_word_count?: number;
  model?: string;
  temperature?: number;
}

export type NovelProjectUpdate = Partial<NovelProjectCreate> & {
  outline?: string;
  status?: string;
};

export interface StartProjectGenerationRequest {
  generation_mode?: GenerationMode;
}

export interface ChapterUpdate {
  title?: string;
  outline?: string;
  content?: string;
  summary?: string;
  status?: string;
}

export interface ChapterCreate {
  title: string;
  order_num: number;
  outline?: string;
}

// ── Genre Template ─────────────────────────────────────────────────────────────

export interface GenreTemplate {
  key: string;
  name: string;
  outline_prompt: string;
  chapter_prompt: string;
  content_prompt: string;
  optimize_operations: string[];
}

// ── Agent Session ───────────────────────────────────────────────────────────────

export interface AgentSession {
  id: string;
  project_id: string;
  user_id: string;
  status: "active" | "closed";
  stage: "init" | "outline" | "chapters" | "writing" | "done";
  generation_mode: GenerationMode;
  created_at: string;
  updated_at: string;
}

export interface AgentSessionCreate {
  user_id?: string;
  genre?: string;
  target_chapter_count?: number;
  first_chapter_min_word_count?: number;
  generation_mode?: GenerationMode;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolEvents?: AgentToolEvent[];
  taskId?: string;
}

export interface AgentToolEvent {
  type: "tool_start" | "tool_end";
  name: string;
  input?: string;
  result?: string;
}

export interface AgentTask {
  id: string;
  session_id: string;
  project_id: string;
  task_type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  user_message: string;
  assistant_content: string;
  tool_events: AgentToolEvent[];
  error_message: string;
  created_at: string;
  updated_at: string;
  started_at: string;
  finished_at: string;
}

export interface IdeaSession {
  id: string;
  user_id: string;
  status: "active" | "closed";
  created_at: string;
  updated_at: string;
}

export interface IdeaSessionCreate {
  user_id?: string;
}

export interface IdeaTask {
  id: string;
  session_id: string;
  task_type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  user_message: string;
  assistant_content: string;
  tool_events: AgentToolEvent[];
  error_message: string;
  created_at: string;
  updated_at: string;
  started_at: string;
  finished_at: string;
}

// ── SSE Events ─────────────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: "token"; content: string }
  | { type: "done"; data: Record<string, unknown> }
  | { type: "error"; message: string };

export type AgentSSEEvent =
  | { type: "token"; content: string }
  | { type: "tool_start"; name: string; input: string }
  | { type: "tool_end"; name: string; result: string }
  | { type: "done" }
  | { type: "error"; message: string };
