export type RunState = "starting" | "active" | "finished";

export type RunOutcome = "launch_failed" | "stopped" | "failed" | "merged" | "abandoned";

export interface RunRecord {
  id: string;
  sessionId: string;
  agentName: string;
  taskSummary: string;
  taskSpecPath: string | null;
  state: RunState;
  outcome: RunOutcome | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface CreateRunInput {
  id?: string;
  sessionId: string;
  agentName: string;
  taskSummary: string;
  taskSpecPath?: string | null;
  state: RunState;
  outcome?: RunOutcome | null;
  createdAt?: string;
  updatedAt?: string;
  finishedAt?: string | null;
}

export interface UpdateRunInput {
  id: string;
  state: RunState;
  outcome?: RunOutcome | null;
  updatedAt?: string;
  finishedAt?: string | null;
}
