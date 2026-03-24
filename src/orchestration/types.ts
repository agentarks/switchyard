export type AgentRole = "lead" | "scout" | "builder" | "reviewer";

export type RunMergePolicy = "manual-ready" | "auto-after-verify";

export type ReviewPolicy = "required" | "optional";

export type OrchestrationRunState =
  | "planning"
  | "dispatching"
  | "integrating"
  | "verifying"
  | "merge_ready"
  | "merged"
  | "blocked"
  | "failed";

export type OrchestrationRunOutcome = "merge_ready" | "merged" | "blocked" | "failed";

export type TaskState = "planned" | "ready" | "in_progress" | "completed" | "blocked";

export type ArtifactKind =
  | "objective_spec"
  | "agent_handoff_spec"
  | "session_log"
  | "branch"
  | "worktree"
  | "integration_worktree"
  | "result_envelope"
  | "verification_output";

export interface OrchestrationRunRecord {
  id: string;
  objective: string;
  targetBranch: string;
  integrationBranch: string;
  integrationWorktreePath: string;
  mergePolicy: RunMergePolicy;
  state: OrchestrationRunState;
  outcome: OrchestrationRunOutcome | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrchestrationRunInput {
  id: string;
  objective: string;
  targetBranch: string;
  integrationBranch: string;
  integrationWorktreePath: string;
  mergePolicy: RunMergePolicy;
  state: OrchestrationRunState;
  outcome?: OrchestrationRunOutcome | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateOrchestrationRunInput {
  id: string;
  state: OrchestrationRunState;
  outcome?: OrchestrationRunOutcome | null;
  updatedAt?: string;
}

export interface TaskRecord {
  id: string;
  runId: string;
  parentTaskId: string | null;
  role: AgentRole;
  title: string;
  fileScope: string[];
  state: TaskState;
  assignedSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRecordInput {
  id: string;
  runId: string;
  parentTaskId?: string | null;
  role: AgentRole;
  title: string;
  fileScope?: string[];
  state: TaskState;
  assignedSessionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateTaskRecordInput {
  runId: string;
  id: string;
  state: TaskState;
  assignedSessionId?: string | null;
  updatedAt?: string;
}

export interface ArtifactRecord {
  id: string;
  runId: string;
  taskId: string | null;
  sessionId: string | null;
  kind: ArtifactKind;
  path: string;
  createdAt: string;
}

export interface CreateArtifactRecordInput {
  id: string;
  runId: string;
  taskId?: string | null;
  sessionId?: string | null;
  kind: ArtifactKind;
  path: string;
  createdAt?: string;
}

export interface HostCheckpointRecord {
  runId: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  checkpointTaskId: string | null;
  completedSessionIds: string[];
  updatedAt: string;
}

export interface UpsertHostCheckpointInput {
  runId: string;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  checkpointTaskId?: string | null;
  completedSessionIds: string[];
  updatedAt?: string;
}
