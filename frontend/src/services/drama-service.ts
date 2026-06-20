import apiClient from "@/services/api-client";
import type {
  DramaAsset,
  DramaAssetCardsResponse,
  DramaAssetCreate,
  DramaAssetGenerateRequest,
  DramaAssetUpdate,
  DramaCharacterReenrichResponse,
  DramaCharacterTurnaroundBatchResponse,
  DramaSceneDedupeResponse,
  DramaStyleRegenerateResponse,
  DramaCharacterTurnaroundRequest,
  DramaAgentSession,
  DramaAgentTask,
  DramaBatchActionResponse,
  DramaBatchFrameGenerateRequest,
  DramaBatchQualityCheckResponse,
  DramaBatchRenderRequest,
  DramaBlueprintRequest,
  DramaBlueprintResponse,
  DramaCopilotAdvice,
  DramaProject,
  DramaProjectCreate,
  DramaProjectDetail,
  DramaProviderCatalog,
  DramaQualityCheckRequest,
  DramaQualityCheckResult,
  DramaReworkRequest,
  DramaReworkResponse,
  DramaProjectUpdate,
  DramaRenderRequest,
  DramaShot,
  DramaShotFrameGenerateRequest,
  DramaShotCreate,
  DramaShotUpdate,
  DramaTask,
} from "@/types/drama";

// ─── Per-call timeouts (axios default is 15s; LLM / image / video gen need much more) ─────
const LLM_TIMEOUT_MS = 180_000; // 3 min · LLM 生成 / 文生图
const BATCH_TIMEOUT_MS = 600_000; // 10 min · 批量图片/视频/质检

export const dramaService = {
  async getProviderCatalog() {
    const { data } = await apiClient.get<DramaProviderCatalog>("/drama/providers/catalog");
    return data;
  },

  async listProjects(userId?: string) {
    const { data } = await apiClient.get<DramaProject[]>("/drama/projects", {
      params: userId ? { user_id: userId } : undefined,
    });
    return data;
  },

  async createProject(body: DramaProjectCreate) {
    const { data } = await apiClient.post<DramaProject>("/drama/projects", body);
    return data;
  },

  async getProject(projectId: string) {
    const { data } = await apiClient.get<DramaProjectDetail>(`/drama/projects/${projectId}`);
    return data;
  },

  async updateProject(projectId: string, body: DramaProjectUpdate) {
    const { data } = await apiClient.put<DramaProject>(`/drama/projects/${projectId}`, body);
    return data;
  },

  async deleteProject(projectId: string) {
    await apiClient.delete(`/drama/projects/${projectId}`);
  },

  async generateBlueprint(projectId: string, body: DramaBlueprintRequest) {
    const { data } = await apiClient.post<DramaBlueprintResponse>(
      `/drama/projects/${projectId}/blueprint`,
      body,
      { timeout: LLM_TIMEOUT_MS },
    );
    return data;
  },

  async analyzeProject(projectId: string, focus: string) {
    const { data } = await apiClient.post<DramaCopilotAdvice>(
      `/drama/projects/${projectId}/copilot/analyze`,
      { focus },
      { timeout: LLM_TIMEOUT_MS },
    );
    return data;
  },

  async listAssets(projectId: string) {
    const { data } = await apiClient.get<DramaAsset[]>(`/drama/projects/${projectId}/assets`);
    return data;
  },

  async createAsset(projectId: string, body: DramaAssetCreate) {
    const { data } = await apiClient.post<DramaAsset>(`/drama/projects/${projectId}/assets`, body);
    return data;
  },

  async generateAssetCards(projectId: string) {
    const { data } = await apiClient.post<DramaAssetCardsResponse>(
      `/drama/projects/${projectId}/assets/generate-cards`,
      undefined,
      { timeout: BATCH_TIMEOUT_MS },
    );
    return data;
  },

  async uploadAsset(projectId: string, formData: FormData) {
    const { data } = await apiClient.post<DramaAsset>(`/drama/projects/${projectId}/assets/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: LLM_TIMEOUT_MS,
    });
    return data;
  },

  async uploadAssetReference(assetId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await apiClient.post<DramaAsset>(`/drama/assets/${assetId}/upload-reference`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: LLM_TIMEOUT_MS,
    });
    return data;
  },

  async generateAssetImage(assetId: string, body: DramaAssetGenerateRequest) {
    const { data } = await apiClient.post<DramaAsset>(
      `/drama/assets/${assetId}/generate-image`,
      body,
      { timeout: LLM_TIMEOUT_MS },
    );
    return data;
  },

  async generateCharacterTurnaround(
    assetId: string,
    body: DramaCharacterTurnaroundRequest = {},
  ) {
    const { data } = await apiClient.post<DramaAsset>(
      `/drama/assets/${assetId}/turnaround`,
      body,
      { timeout: LLM_TIMEOUT_MS },
    );
    return data;
  },

  async deleteCharacterTurnaround(assetId: string) {
    const { data } = await apiClient.delete<DramaAsset>(`/drama/assets/${assetId}/turnaround`);
    return data;
  },

  async batchGenerateCharacterTurnarounds(
    projectId: string,
    options: { onlyMissing?: boolean } = {},
  ) {
    const { data } = await apiClient.post<DramaCharacterTurnaroundBatchResponse>(
      `/drama/projects/${projectId}/assets/character-turnaround/batch`,
      undefined,
      {
        timeout: BATCH_TIMEOUT_MS,
        params: options.onlyMissing ? { only_missing: true } : undefined,
      },
    );
    return data;
  },

  async reenrichCharacterAssets(
    projectId: string,
    options: { onlyMissing?: boolean; assetIds?: string[] } = {},
  ) {
    const { data } = await apiClient.post<DramaCharacterReenrichResponse>(
      `/drama/projects/${projectId}/assets/character-reenrich`,
      {
        only_missing: options.onlyMissing ?? true,
        asset_ids: options.assetIds ?? [],
      },
      { timeout: BATCH_TIMEOUT_MS },
    );
    return data;
  },

  async dedupeSceneAssets(projectId: string) {
    const { data } = await apiClient.post<DramaSceneDedupeResponse>(
      `/drama/projects/${projectId}/assets/scene-dedupe`,
      undefined,
      { timeout: BATCH_TIMEOUT_MS },
    );
    return data;
  },

  async regenerateStyleProfile(projectId: string) {
    const { data } = await apiClient.post<DramaStyleRegenerateResponse>(
      `/drama/projects/${projectId}/assets/style-regenerate`,
      undefined,
      { timeout: LLM_TIMEOUT_MS },
    );
    return data;
  },

  async updateAsset(assetId: string, body: DramaAssetUpdate) {
    const { data } = await apiClient.put<DramaAsset>(`/drama/assets/${assetId}`, body);
    return data;
  },

  async deleteAsset(assetId: string) {
    await apiClient.delete(`/drama/assets/${assetId}`);
  },

  async listShots(projectId: string) {
    const { data } = await apiClient.get<DramaShot[]>(`/drama/projects/${projectId}/shots`);
    return data;
  },

  async createShot(projectId: string, body: DramaShotCreate) {
    const { data } = await apiClient.post<DramaShot>(`/drama/projects/${projectId}/shots`, body);
    return data;
  },

  async updateShot(shotId: string, body: DramaShotUpdate) {
    const { data } = await apiClient.put<DramaShot>(`/drama/shots/${shotId}`, body);
    return data;
  },

  async generateShotFrames(shotId: string, body: DramaShotFrameGenerateRequest) {
    const { data } = await apiClient.post<DramaShot>(
      `/drama/shots/${shotId}/generate-frames`,
      body,
      { timeout: LLM_TIMEOUT_MS },
    );
    return data;
  },

  async regenerateShotFramePrompts(shotId: string, body: { extra_prompt?: string } = {}) {
    const { data } = await apiClient.post<DramaShot>(
      `/drama/shots/${shotId}/regenerate-frame-prompts`,
      body,
      { timeout: LLM_TIMEOUT_MS },
    );
    return data;
  },

  async batchGenerateShotFrames(projectId: string, body: DramaBatchFrameGenerateRequest) {
    const { data } = await apiClient.post<DramaBatchActionResponse>(
      `/drama/projects/${projectId}/frames/batch-generate`,
      body,
      { timeout: BATCH_TIMEOUT_MS },
    );
    return data;
  },

  async qualityCheckShot(shotId: string, body: DramaQualityCheckRequest) {
    const { data } = await apiClient.post<DramaQualityCheckResult>(
      `/drama/shots/${shotId}/quality-check`,
      body,
      { timeout: LLM_TIMEOUT_MS },
    );
    return data;
  },

  async batchQualityCheckShots(projectId: string, body: DramaQualityCheckRequest) {
    const { data } = await apiClient.post<DramaBatchQualityCheckResponse>(
      `/drama/projects/${projectId}/quality-check/batch`,
      body,
      { timeout: BATCH_TIMEOUT_MS },
    );
    return data;
  },

  async reworkShot(shotId: string, body: DramaReworkRequest) {
    const { data } = await apiClient.post<DramaReworkResponse>(
      `/drama/shots/${shotId}/rework`,
      body,
      { timeout: LLM_TIMEOUT_MS },
    );
    return data;
  },

  async deleteShot(shotId: string) {
    await apiClient.delete(`/drama/shots/${shotId}`);
  },

  async listTasks(projectId: string) {
    const { data } = await apiClient.get<DramaTask[]>(`/drama/projects/${projectId}/tasks`);
    return data;
  },

  async renderShot(projectId: string, shotId: string, body: DramaRenderRequest) {
    const { data } = await apiClient.post<DramaTask>(
      `/drama/projects/${projectId}/shots/${shotId}/render`,
      body,
      { timeout: BATCH_TIMEOUT_MS },
    );
    return data;
  },

  async batchRenderShots(projectId: string, body: DramaBatchRenderRequest) {
    const { data } = await apiClient.post<DramaBatchActionResponse>(
      `/drama/projects/${projectId}/renders/batch`,
      body,
      { timeout: BATCH_TIMEOUT_MS },
    );
    return data;
  },

  async createOrReuseAgentSession(projectId: string, userId = "default") {
    const { data } = await apiClient.post<DramaAgentSession>(`/drama/agent/projects/${projectId}/session`, {
      user_id: userId,
    });
    return data;
  },

  async getAgentSession(sessionId: string) {
    const { data } = await apiClient.get<DramaAgentSession>(`/drama/agent/sessions/${sessionId}`);
    return data;
  },

  async deleteAgentSession(sessionId: string) {
    await apiClient.delete(`/drama/agent/sessions/${sessionId}`);
  },

  agentChatUrl(sessionId: string) {
    return `${apiClient.defaults.baseURL}/drama/agent/sessions/${sessionId}/chat`;
  },

  async createAgentTask(sessionId: string, message: string) {
    const { data } = await apiClient.post<DramaAgentTask>(`/drama/agent/sessions/${sessionId}/tasks`, { message });
    return data;
  },

  async getLatestAgentTask(sessionId: string) {
    const { data } = await apiClient.get<DramaAgentTask>(`/drama/agent/sessions/${sessionId}/tasks/latest`);
    return data;
  },

  async getAgentTask(taskId: string) {
    const { data } = await apiClient.get<DramaAgentTask>(`/drama/agent/tasks/${taskId}`);
    return data;
  },

  async cancelAgentTask(taskId: string) {
    const { data } = await apiClient.post<DramaAgentTask>(`/drama/agent/tasks/${taskId}/cancel`, {});
    return data;
  },
};
