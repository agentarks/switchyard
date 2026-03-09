import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { isActiveSessionState, type SessionRecord } from "./types.js";

const execFileAsync = promisify(execFile);

export type CleanupMode = "abandoned" | "merged";

export type CleanupReason =
  | "artifacts_missing"
  | "branch_missing"
  | "missing_base_branch_metadata"
  | "missing_branch_metadata"
  | "not_merged";

export type CleanupDecision =
  | { kind: "perform"; mode: CleanupMode; canonicalBranch: string }
  | { kind: "blocked"; reason: CleanupReason; message: string; canonicalBranch: string }
  | { kind: "already_absent" };

interface CleanupDecisionOptions {
  projectRoot: string;
  canonicalBranch: string;
  session: SessionRecord;
  abandon?: boolean;
}

export async function determineCleanupDecision(options: CleanupDecisionOptions): Promise<CleanupDecision> {
  const sessionBaseBranch = options.session.baseBranch?.trim() ?? "";
  const canonicalBranch = sessionBaseBranch;
  const branch = options.session.branch.trim();

  if (branch.length === 0) {
    return {
      kind: "blocked",
      reason: "missing_branch_metadata",
      canonicalBranch,
      message: `Refusing cleanup for ${options.session.agentName}: no preserved branch metadata is available. Rerun with '--cleanup --abandon' to discard the remaining artifacts explicitly.`
    };
  }

  if (options.abandon) {
    return {
      kind: "perform",
      mode: "abandoned",
      canonicalBranch: sessionBaseBranch || options.canonicalBranch
    };
  }

  if (sessionBaseBranch.length === 0) {
    return {
      kind: "blocked",
      reason: "missing_base_branch_metadata",
      canonicalBranch: options.canonicalBranch,
      message: `Refusing cleanup for ${options.session.agentName}: no stored base branch metadata is available for this legacy session, so Switchyard cannot safely confirm where '${branch}' should have been merged. Rerun without '--cleanup' to preserve it, or pass '--cleanup --abandon' to discard it explicitly.`
    };
  }

  const branchExists = await localBranchExists(options.projectRoot, branch);
  const worktreeExists = await pathExists(options.session.worktreePath);

  if (!branchExists && !worktreeExists) {
    return { kind: "already_absent" };
  }

  if (!branchExists) {
    return {
      kind: "blocked",
      reason: "branch_missing",
      canonicalBranch,
      message: `Refusing cleanup for ${options.session.agentName}: cannot confirm preserved branch '${branch}' is merged into '${canonicalBranch}'. Rerun without '--cleanup' to preserve the remaining artifacts, or pass '--cleanup --abandon' to discard them explicitly.`
    };
  }

  if (branch === canonicalBranch || await isBranchMergedIntoCanonical(options.projectRoot, branch, canonicalBranch)) {
    return { kind: "perform", mode: "merged", canonicalBranch };
  }

  return {
    kind: "blocked",
    reason: "not_merged",
    canonicalBranch,
    message: `Refusing cleanup for ${options.session.agentName}: preserved branch '${branch}' is not merged into '${canonicalBranch}'. Rerun without '--cleanup' to preserve it, or pass '--cleanup --abandon' to discard it explicitly.`
  };
}

export function formatCleanupMessage(cleanupMode: CleanupMode | undefined, canonicalBranch: string): string {
  if (cleanupMode === "abandoned") {
    return "Cleanup: removed worktree and branch after explicit abandon.";
  }

  if (cleanupMode === "merged") {
    return `Cleanup: removed worktree and branch after confirming merge into ${canonicalBranch}.`;
  }

  return "Cleanup: removed worktree and branch.";
}

export async function getCleanupReadinessLabel(options: CleanupDecisionOptions): Promise<string> {
  if (isActiveSessionState(options.session.state)) {
    return "stop-first";
  }

  const decision = await determineCleanupDecision({
    ...options,
    abandon: false
  });

  return formatCleanupReadinessLabel(decision);
}

function formatCleanupReadinessLabel(decision: CleanupDecision): string {
  if (decision.kind === "perform") {
    return "ready:merged";
  }

  if (decision.kind === "already_absent") {
    return "ready:absent";
  }

  switch (decision.reason) {
    case "branch_missing":
      return "abandon-only:branch-missing";
    case "missing_base_branch_metadata":
      return "abandon-only:legacy";
    case "missing_branch_metadata":
      return "abandon-only:no-branch";
    case "not_merged":
      return "abandon-only:not-merged";
    case "artifacts_missing":
      return "ready:absent";
  }
}

async function localBranchExists(projectRoot: string, branch: string): Promise<boolean> {
  try {
    await runGit(projectRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

async function isBranchMergedIntoCanonical(projectRoot: string, branch: string, canonicalBranch: string): Promise<boolean> {
  try {
    await runGit(projectRoot, ["merge-base", "--is-ancestor", branch, canonicalBranch]);
    return true;
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runGit(projectRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: projectRoot });
  return stdout.trim();
}
