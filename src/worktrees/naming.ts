import { resolve } from "node:path";
import type { SwitchyardConfig } from "../types.js";
import { WorktreeError } from "../errors.js";

export function normalizeAgentName(agentName: string): string {
  const normalized = agentName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw new WorktreeError("Agent name must contain at least one letter or number.");
  }

  return normalized;
}

export function buildWorktreeBranchName(agentName: string): string {
  return `agents/${normalizeAgentName(agentName)}`;
}

export function resolveWorktreePath(config: SwitchyardConfig, agentName: string): string {
  return resolve(config.project.root, config.worktrees.baseDir, normalizeAgentName(agentName));
}

export function buildLeadAgentName(runId: string): string {
  return `${normalizeRunScopedName(runId)}-lead`;
}

export function buildIntegrationBranchName(runId: string): string {
  return `runs/${normalizeRunScopedName(runId)}/lead`;
}

export function resolveIntegrationWorktreePath(config: SwitchyardConfig, runId: string): string {
  return resolve(config.project.root, config.worktrees.baseDir, buildLeadAgentName(runId));
}

function normalizeRunScopedName(runId: string): string {
  const normalized = runId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw new WorktreeError("Run id must contain at least one letter or number.");
  }

  return normalized;
}
