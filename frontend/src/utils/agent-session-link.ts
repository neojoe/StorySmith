const STORAGE_KEY = "novel-agent-project-links";

type ProjectSessionMap = Record<string, string>;

function readMap(): ProjectSessionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as ProjectSessionMap : {};
  } catch {
    return {};
  }
}

function writeMap(value: ProjectSessionMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

export function linkProjectToAgentSession(projectId: string, sessionId: string) {
  if (!projectId || !sessionId) return;
  const current = readMap();
  if (current[projectId] === sessionId) return;
  writeMap({ ...current, [projectId]: sessionId });
}

export function getLinkedAgentSessionId(projectId: string): string | null {
  return readMap()[projectId] ?? null;
}

export function unlinkProjectAgentSession(projectId: string) {
  const current = readMap();
  if (!(projectId in current)) return;
  delete current[projectId];
  writeMap(current);
}
