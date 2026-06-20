import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dramaService } from "@/services/drama-service";
import type {
  DramaAssetCreate,
  DramaAssetUpdate,
  DramaBatchFrameGenerateRequest,
  DramaBatchRenderRequest,
  DramaBlueprintRequest,
  DramaProjectCreate,
  DramaProjectUpdate,
  DramaQualityCheckRequest,
  DramaReworkRequest,
  DramaRenderRequest,
  DramaShotFrameGenerateRequest,
  DramaShotCreate,
  DramaShotUpdate,
} from "@/types/drama";

export const dramaKeys = {
  all: ["drama"] as const,
  catalog: () => [...dramaKeys.all, "catalog"] as const,
  projects: () => [...dramaKeys.all, "projects"] as const,
  project: (pid: string) => [...dramaKeys.projects(), pid] as const,
  agentSession: (pid: string) => [...dramaKeys.project(pid), "agent-session"] as const,
  assets: (pid: string) => [...dramaKeys.project(pid), "assets"] as const,
  shots: (pid: string) => [...dramaKeys.project(pid), "shots"] as const,
  tasks: (pid: string) => [...dramaKeys.project(pid), "tasks"] as const,
  copilot: (pid: string, focus: string) => [...dramaKeys.project(pid), "copilot", focus] as const,
};

export function useDramaProviderCatalog() {
  return useQuery({
    queryKey: dramaKeys.catalog(),
    queryFn: () => dramaService.getProviderCatalog(),
    staleTime: 1000 * 60 * 5,
    retry: 0,
  });
}

export function useDramaProjects(userId?: string) {
  return useQuery({
    queryKey: [...dramaKeys.projects(), userId ?? "all"] as const,
    queryFn: () => dramaService.listProjects(userId),
    retry: 0,
    refetchInterval: 4000,
  });
}

export function useDramaProject(pid: string) {
  return useQuery({
    queryKey: dramaKeys.project(pid),
    queryFn: () => dramaService.getProject(pid),
    enabled: !!pid,
    retry: 0,
    refetchInterval: 4000,
  });
}

export function useCreateOrReuseDramaAgentSession(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId }: { userId?: string }) => dramaService.createOrReuseAgentSession(pid, userId ?? "default"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.agentSession(pid) });
    },
  });
}

export function useDramaCopilot(pid: string, focus: string, enabled = true) {
  return useQuery({
    queryKey: dramaKeys.copilot(pid, focus),
    queryFn: () => dramaService.analyzeProject(pid, focus),
    enabled: !!pid && enabled,
    staleTime: 1000 * 20,
    retry: 0,
  });
}

export function useCreateDramaProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DramaProjectCreate) => dramaService.createProject(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.projects() });
    },
  });
}

export function useUpdateDramaProject(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DramaProjectUpdate) => dramaService.updateProject(pid, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.projects() });
    },
  });
}

export function useDeleteDramaProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pid: string) => dramaService.deleteProject(pid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.projects() });
    },
  });
}

export function useGenerateDramaBlueprint(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DramaBlueprintRequest) => dramaService.generateBlueprint(pid, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.projects() });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.shots(pid) });
    },
  });
}

export function useCreateDramaAsset(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DramaAssetCreate) => dramaService.createAsset(pid, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useUploadDramaAsset(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => dramaService.uploadAsset(pid, formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useUploadDramaAssetReference(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, file }: { assetId: string; file: File }) => dramaService.uploadAssetReference(assetId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useGenerateDramaAssetImage(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, body }: { assetId: string; body: { provider?: string; model?: string; extra_prompt?: string } }) =>
      dramaService.generateAssetImage(assetId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useGenerateDramaCharacterTurnaround(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      assetId,
      body,
    }: {
      assetId: string;
      body?: { provider?: string; model?: string; extra_prompt?: string; prompt_override?: string };
    }) => dramaService.generateCharacterTurnaround(assetId, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useDeleteDramaCharacterTurnaround(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => dramaService.deleteCharacterTurnaround(assetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useBatchGenerateDramaCharacterTurnarounds(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { onlyMissing?: boolean } = {}) =>
      dramaService.batchGenerateCharacterTurnarounds(pid, { onlyMissing: params.onlyMissing }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useReenrichDramaCharacterAssets(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { onlyMissing?: boolean; assetIds?: string[] } = {}) =>
      dramaService.reenrichCharacterAssets(pid, params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useDedupeDramaSceneAssets(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => dramaService.dedupeSceneAssets(pid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useRegenerateDramaStyleProfile(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => dramaService.regenerateStyleProfile(pid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useUpdateDramaAsset(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, body }: { assetId: string; body: DramaAssetUpdate }) =>
      dramaService.updateAsset(assetId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useDeleteDramaAsset(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => dramaService.deleteAsset(assetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useGenerateDramaAssetCards(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => dramaService.generateAssetCards(pid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.assets(pid) });
    },
  });
}

export function useCreateDramaShot(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DramaShotCreate) => dramaService.createShot(pid, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.shots(pid) });
    },
  });
}

export function useUpdateDramaShot(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shotId, body }: { shotId: string; body: DramaShotUpdate }) =>
      dramaService.updateShot(shotId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.shots(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.tasks(pid) });
    },
  });
}

export function useGenerateDramaShotFrames(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shotId, body }: { shotId: string; body: DramaShotFrameGenerateRequest }) =>
      dramaService.generateShotFrames(shotId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.shots(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.tasks(pid) });
    },
  });
}

export function useRegenerateDramaShotFramePrompts(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shotId, extra_prompt }: { shotId: string; extra_prompt?: string }) =>
      dramaService.regenerateShotFramePrompts(shotId, { extra_prompt }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.shots(pid) });
    },
  });
}

export function useBatchGenerateDramaShotFrames(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DramaBatchFrameGenerateRequest) => dramaService.batchGenerateShotFrames(pid, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.shots(pid) });
    },
  });
}

export function useDramaShotQualityCheck(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shotId, body }: { shotId: string; body: DramaQualityCheckRequest }) =>
      dramaService.qualityCheckShot(shotId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.shots(pid) });
    },
  });
}

export function useDramaBatchQualityCheck(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DramaQualityCheckRequest) => dramaService.batchQualityCheckShots(pid, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.shots(pid) });
    },
  });
}

export function useDramaShotRework(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shotId, body }: { shotId: string; body: DramaReworkRequest }) =>
      dramaService.reworkShot(shotId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.shots(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.tasks(pid) });
    },
  });
}

export function useDeleteDramaShot(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shotId: string) => dramaService.deleteShot(shotId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.shots(pid) });
    },
  });
}

export function useRenderDramaShot(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shotId, body }: { shotId: string; body: DramaRenderRequest }) =>
      dramaService.renderShot(pid, shotId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.tasks(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.shots(pid) });
    },
  });
}

export function useBatchRenderDramaShots(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DramaBatchRenderRequest) => dramaService.batchRenderShots(pid, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dramaKeys.project(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.tasks(pid) });
      qc.invalidateQueries({ queryKey: dramaKeys.shots(pid) });
    },
  });
}
