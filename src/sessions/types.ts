import type { AgentRole } from "../orchestration/types.js";

export type SessionState = "starting" | "running" | "stopped" | "failed";

export interface SessionRecord {
  id: string;
  runId?: string | null;
  role?: AgentRole | null;
  parentSessionId?: string | null;
  objectiveTaskId?: string | null;
  agentName: string;
  branch: string;
  baseBranch: string | null;
  worktreePath: string;
  state: SessionState;
  runtimePid: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionInput {
  id: string;
  runId?: string | null;
  role?: AgentRole | null;
  parentSessionId?: string | null;
  objectiveTaskId?: string | null;
  agentName: string;
  branch: string;
  baseBranch?: string | null;
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

export function isActiveSessionState(state: SessionState): boolean {
  return state === "starting" || state === "running";
}
