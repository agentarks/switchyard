export type SessionState = "running" | "stopped" | "failed";

export interface SessionRecord {
  id: string;
  agentName: string;
  branch: string;
  worktreePath: string;
  state: SessionState;
  runtimePid: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionInput {
  id: string;
  agentName: string;
  branch: string;
  worktreePath: string;
  state: SessionState;
  runtimePid?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateSessionStateInput {
  id: string;
  state: SessionState;
  runtimePid?: number | null;
  updatedAt?: string;
}
