import apiClient from "./api-client";
import type {
  AgentSession,
  AgentSessionCreate,
  AgentTask,
  IdeaSession,
  IdeaSessionCreate,
  IdeaTask,
  Chapter,
  ChapterCreate,
  ChapterUpdate,
  GenreTemplate,
  NovelProject,
  NovelProjectCreate,
  NovelProjectDetail,
  NovelProjectUpdate,
  StartProjectGenerationRequest,
} from "@/types/novel";

const BASE = "/novel";

export const novelService = {
  // ── Genre catalogue ──────────────────────────────────────────────────────────

  async getGenres(): Promise<GenreTemplate[]> {
    const { data } = await apiClient.get<GenreTemplate[]>(`${BASE}/genres`);
    return data;
  },

  // ── Model list (live from OpenAI) ─────────────────────────────────────────

  async getModels(): Promise<{ id: string; created: number }[]> {
    const { data } = await apiClient.get<{ id: string; created: number }[]>(`${BASE}/models`);
    return data;
  },

  // ── Project CRUD ─────────────────────────────────────────────────────────────

  async listProjects(): Promise<NovelProject[]> {
    const { data } = await apiClient.get<NovelProject[]>(`${BASE}/projects`);
    return data;
  },

  async createProject(body: NovelProjectCreate): Promise<NovelProject> {
    const { data } = await apiClient.post<NovelProject>(`${BASE}/projects`, body);
    return data;
  },

  async getProject(pid: string): Promise<NovelProjectDetail> {
    const { data } = await apiClient.get<NovelProjectDetail>(`${BASE}/projects/${pid}`);
    return data;
  },

  async updateProject(pid: string, body: NovelProjectUpdate): Promise<NovelProject> {
    const { data } = await apiClient.put<NovelProject>(`${BASE}/projects/${pid}`, body);
    return data;
  },

  async deleteProject(pid: string): Promise<void> {
    await apiClient.delete(`${BASE}/projects/${pid}`);
  },

  // ── Chapter CRUD ─────────────────────────────────────────────────────────────

  async listChapters(pid: string): Promise<Chapter[]> {
    const { data } = await apiClient.get<Chapter[]>(`${BASE}/projects/${pid}/chapters`);
    return data;
  },

  async createChapter(pid: string, body: ChapterCreate): Promise<Chapter> {
    const { data } = await apiClient.post<Chapter>(`${BASE}/projects/${pid}/chapters`, body);
    return data;
  },

  async updateChapter(pid: string, cid: string, body: ChapterUpdate): Promise<Chapter> {
    const { data } = await apiClient.put<Chapter>(
      `${BASE}/projects/${pid}/chapters/${cid}`,
      body,
    );
    return data;
  },

  async deleteChapter(pid: string, cid: string): Promise<void> {
    await apiClient.delete(`${BASE}/projects/${pid}/chapters/${cid}`);
  },

  // ── Generation SSE endpoints (return URL + body only; caller uses fetchSSE) ──

  outlineGenerateUrl(pid: string) {
    return `${apiClient.defaults.baseURL}${BASE}/projects/${pid}/outline/generate`;
  },

  chaptersGenerateUrl(pid: string) {
    return `${apiClient.defaults.baseURL}${BASE}/projects/${pid}/chapters/generate`;
  },

  contentGenerateUrl(pid: string, cid: string) {
    return `${apiClient.defaults.baseURL}${BASE}/projects/${pid}/chapters/${cid}/content/generate`;
  },

  optimizeUrl() {
    return `${apiClient.defaults.baseURL}${BASE}/optimize`;
  },

  generatePromptsUrl(pid: string) {
    return `${apiClient.defaults.baseURL}${BASE}/projects/${pid}/prompts/generate`;
  },

  generateSettingsUrl(pid: string) {
    return `${apiClient.defaults.baseURL}${BASE}/projects/${pid}/settings/generate`;
  },

  /** SSE: (re-)generate the structural summary for a single chapter. */
  summaryGenerateUrl(pid: string, cid: string) {
    return `${apiClient.defaults.baseURL}${BASE}/projects/${pid}/chapters/${cid}/summary/generate`;
  },

  /** Finalize a project: sets status=published and computes word/chapter stats. */
  async finalizeProject(pid: string): Promise<NovelProject> {
    const { data } = await apiClient.post<NovelProject>(
      `${BASE}/projects/${pid}/finalize`,
      {},
    );
    return data;
  },

  async startProjectGeneration(pid: string, body: StartProjectGenerationRequest): Promise<NovelProject> {
    const { data } = await apiClient.post<NovelProject>(`${BASE}/projects/${pid}/generation/start`, body);
    return data;
  },

  // ── Agent Session ───────────────────────────────────────────────────────────

  /** Create a new agent session (creates a linked novel project). */
  async createAgentSession(body: AgentSessionCreate = {}): Promise<AgentSession> {
    const { data } = await apiClient.post<AgentSession>(`${BASE}/agent/sessions`, body);
    return data;
  },

  async createOrReuseProjectAgentSession(pid: string, userId = "default"): Promise<AgentSession> {
    const { data } = await apiClient.post<AgentSession>(`${BASE}/agent/projects/${pid}/session`, {
      user_id: userId,
    });
    return data;
  },

  /** Get agent session info. */
  async getAgentSession(sid: string): Promise<AgentSession> {
    const { data } = await apiClient.get<AgentSession>(`${BASE}/agent/sessions/${sid}`);
    return data;
  },

  async getLatestProjectAgentSession(pid: string): Promise<AgentSession> {
    const { data } = await apiClient.get<AgentSession>(`${BASE}/agent/projects/${pid}/latest-session`);
    return data;
  },

  /** Get the novel project linked to an agent session. */
  async getAgentSessionProject(sid: string): Promise<NovelProject> {
    const { data } = await apiClient.get<NovelProject>(`${BASE}/agent/sessions/${sid}/project`);
    return data;
  },

  /** Delete an agent session (project remains). */
  async deleteAgentSession(sid: string): Promise<void> {
    await apiClient.delete(`${BASE}/agent/sessions/${sid}`);
  },

  /** Returns the SSE URL for sending a message to the agent. */
  agentChatUrl(sid: string): string {
    return `${apiClient.defaults.baseURL}${BASE}/agent/sessions/${sid}/chat`;
  },

  async createAgentTask(sid: string, message: string): Promise<AgentTask> {
    const { data } = await apiClient.post<AgentTask>(`${BASE}/agent/sessions/${sid}/tasks`, { message });
    return data;
  },

  async getLatestAgentTask(sid: string): Promise<AgentTask> {
    const { data } = await apiClient.get<AgentTask>(`${BASE}/agent/sessions/${sid}/tasks/latest`);
    return data;
  },

  async getAgentTask(taskId: string): Promise<AgentTask> {
    const { data } = await apiClient.get<AgentTask>(`${BASE}/agent/tasks/${taskId}`);
    return data;
  },

  async cancelAgentTask(taskId: string): Promise<AgentTask> {
    const { data } = await apiClient.post<AgentTask>(`${BASE}/agent/tasks/${taskId}/cancel`, {});
    return data;
  },

  // ── AI Idea Session ─────────────────────────────────────────────────────────

  async createIdeaSession(body: IdeaSessionCreate = {}): Promise<IdeaSession> {
    const { data } = await apiClient.post<IdeaSession>(`${BASE}/ideas/sessions`, body);
    return data;
  },

  async getIdeaSession(sid: string): Promise<IdeaSession> {
    const { data } = await apiClient.get<IdeaSession>(`${BASE}/ideas/sessions/${sid}`);
    return data;
  },

  async deleteIdeaSession(sid: string): Promise<void> {
    await apiClient.delete(`${BASE}/ideas/sessions/${sid}`);
  },

  async createIdeaTask(sid: string, message: string): Promise<IdeaTask> {
    const { data } = await apiClient.post<IdeaTask>(`${BASE}/ideas/sessions/${sid}/tasks`, { message });
    return data;
  },

  async getLatestIdeaTask(sid: string): Promise<IdeaTask> {
    const { data } = await apiClient.get<IdeaTask>(`${BASE}/ideas/sessions/${sid}/tasks/latest`);
    return data;
  },

  async getIdeaTask(taskId: string): Promise<IdeaTask> {
    const { data } = await apiClient.get<IdeaTask>(`${BASE}/ideas/tasks/${taskId}`);
    return data;
  },

  async cancelIdeaTask(taskId: string): Promise<IdeaTask> {
    const { data } = await apiClient.post<IdeaTask>(`${BASE}/ideas/tasks/${taskId}/cancel`, {});
    return data;
  },
};
