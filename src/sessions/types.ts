export type SessionState = "running" | "stopped" | "failed";

export interface SessionRecord {
  id: string;
  agentName: string;
  branch: string;
  worktreePath: string;
  state: SessionState;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionInput {
  id: string;
  agentName: string;
  branch: string;
  worktreePath: string;
  state: SessionState;
  createdAt?: string;
  updatedAt?: string;
}
