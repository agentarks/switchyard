import { join, relative } from "node:path";
import type { AgentRole, OrchestrationRunOutcome, RunMergePolicy } from "./types.js";

export interface PlannedTaskEnvelope {
  role: Exclude<AgentRole, "lead">;
  title: string;
  fileScope: string[];
}

export type AgentResultEnvelope =
  | { kind: "lead_plan"; summary: string; tasks: PlannedTaskEnvelope[] }
  | { kind: "run_complete"; outcome: Exclude<OrchestrationRunOutcome, "merged">; summary: string };

export interface LeadLaunchContract {
  runId: string;
  role: "lead";
  sessionId: string;
  objectiveTaskId: string;
  targetBranch: string;
  integrationBranch: string;
  integrationWorktreePath: string;
  objectiveSpecPath: string;
  resultEnvelopePath: string;
  mergePolicy: RunMergePolicy;
  objective: string;
}

export function getResultEnvelopePath(projectRoot: string, runId: string, role: AgentRole = "lead"): string {
  return join(projectRoot, ".switchyard", "agent-results", `${runId}-${role}.json`);
}

export function getRelativeResultEnvelopePath(projectRoot: string, runId: string, role: AgentRole = "lead"): string {
  return formatRelativePath(projectRoot, getResultEnvelopePath(projectRoot, runId, role));
}

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}
