import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { novelService } from "@/services/novel-service";
import type {
  AgentSessionCreate,
  ChapterCreate,
  ChapterUpdate,
  IdeaSessionCreate,
  NovelProjectCreate,
  NovelProjectUpdate,
} from "@/types/novel";

// ── Query keys ─────────────────────────────────────────────────────────────────

export const novelKeys = {
  all: ["novel"] as const,
  genres: () => [...novelKeys.all, "genres"] as const,
  models: () => [...novelKeys.all, "models"] as const,
  projects: () => [...novelKeys.all, "projects"] as const,
  project: (pid: string) => [...novelKeys.projects(), pid] as const,
  agentSession: (sid: string) => [...novelKeys.all, "agent-session", sid] as const,
  latestProjectAgentSession: (pid: string) => [...novelKeys.all, "latest-project-agent-session", pid] as const,
  agentSessionProject: (sid: string) => [...novelKeys.all, "agent-session-project", sid] as const,
  ideaSession: (sid: string) => [...novelKeys.all, "idea-session", sid] as const,
};

// ── Genres ────────────────────────────────────────────────────────────────────

export function useGenres() {
  return useQuery({
    queryKey: novelKeys.genres(),
    queryFn: novelService.getGenres,
    staleTime: Infinity, // genre templates never change
  });
}

// ── Models (live from OpenAI) ─────────────────────────────────────────────────

/** Fetch the available GPT model list from the backend's /novel/models proxy. */
export function useModels() {
  return useQuery({
    queryKey: novelKeys.models(),
    queryFn: novelService.getModels,
    staleTime: 1000 * 60 * 10, // refresh every 10 min
    retry: 1,
  });
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function useProjects() {
  return useQuery({
    queryKey: novelKeys.projects(),
    queryFn: novelService.listProjects,
    retry: 0,
    refetchInterval: (query) => (
      query.state.data?.some((project) => project.generation_status === "running") ? 3000 : false
    ),
  });
}

export function useProject(pid: string) {
  return useQuery({
    queryKey: novelKeys.project(pid),
    queryFn: () => novelService.getProject(pid),
    enabled: !!pid,
    retry: 0,
    refetchInterval: (query) => (
      query.state.data?.generation_status === "running" ? 3000 : false
    ),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NovelProjectCreate) => novelService.createProject(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: novelKeys.projects() });
    },
  });
}

export function useUpdateProject(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NovelProjectUpdate) => novelService.updateProject(pid, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: novelKeys.project(pid) });
      qc.invalidateQueries({ queryKey: novelKeys.projects() });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pid: string) => novelService.deleteProject(pid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: novelKeys.projects() });
    },
  });
}

export function useFinalizeProject(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => novelService.finalizeProject(pid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: novelKeys.project(pid) });
      qc.invalidateQueries({ queryKey: novelKeys.projects() });
    },
  });
}

// ── Chapters ──────────────────────────────────────────────────────────────────

export function useCreateChapter(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChapterCreate) => novelService.createChapter(pid, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: novelKeys.project(pid) });
    },
  });
}

export function useUpdateChapter(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cid, body }: { cid: string; body: ChapterUpdate }) =>
      novelService.updateChapter(pid, cid, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: novelKeys.project(pid) });
    },
  });
}

export function useDeleteChapter(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cid: string) => novelService.deleteChapter(pid, cid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: novelKeys.project(pid) });
    },
  });
}

// ── Agent Sessions ─────────────────────────────────────────────────────────────

export function useCreateAgentSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentSessionCreate) => novelService.createAgentSession(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: novelKeys.projects() });
    },
  });
}

export function useCreateOrReuseProjectAgentSession(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => novelService.createOrReuseProjectAgentSession(pid, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: novelKeys.project(pid) });
      qc.invalidateQueries({ queryKey: novelKeys.projects() });
      qc.invalidateQueries({ queryKey: novelKeys.latestProjectAgentSession(pid) });
    },
  });
}

export function useAgentSession(sid: string) {
  return useQuery({
    queryKey: novelKeys.agentSession(sid),
    queryFn: () => novelService.getAgentSession(sid),
    enabled: !!sid,
    refetchInterval: 5000,
  });
}

export function useLatestProjectAgentSession(pid: string, enabled = true) {
  return useQuery({
    queryKey: novelKeys.latestProjectAgentSession(pid),
    queryFn: () => novelService.getLatestProjectAgentSession(pid),
    enabled: !!pid && enabled,
    retry: 0,
  });
}

export function useAgentSessionProject(sid: string) {
  return useQuery({
    queryKey: novelKeys.agentSessionProject(sid),
    queryFn: () => novelService.getAgentSessionProject(sid),
    enabled: !!sid,
    refetchInterval: 3000,
  });
}

export function useDeleteAgentSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sid: string) => novelService.deleteAgentSession(sid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: novelKeys.projects() });
    },
  });
}

export function useCreateIdeaSession() {
  return useMutation({
    mutationFn: (body: IdeaSessionCreate) => novelService.createIdeaSession(body),
  });
}

export function useIdeaSession(sid: string) {
  return useQuery({
    queryKey: novelKeys.ideaSession(sid),
    queryFn: () => novelService.getIdeaSession(sid),
    enabled: !!sid,
    refetchInterval: 5000,
  });
}

export function useDeleteIdeaSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sid: string) => novelService.deleteIdeaSession(sid),
    onSuccess: (_data, sid) => {
      qc.removeQueries({ queryKey: novelKeys.ideaSession(sid) });
    },
  });
}
