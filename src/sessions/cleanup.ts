import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { relative } from "node:path";
import { promisify } from "node:util";
import { listMeaningfulDirtyEntries } from "../git/status.js";
import { isActiveSessionState, type SessionRecord } from "./types.js";

const execFileAsync = promisify(execFile);

export type CleanupMode = "abandoned" | "merged";

export type CleanupReason =
  | "artifacts_missing"
  | "branch_missing"
  | "missing_base_branch_metadata"
  | "missing_branch_metadata"
  | "not_merged"
  | "worktree_dirty"
  | "worktree_missing";

export type CleanupDecision =
  | { kind: "perform"; mode: CleanupMode; canonicalBranch: string }
  | {
    kind: "blocked";
    reason: CleanupReason;
    message: string;
    canonicalBranch: string;
    details?: Record<string, string | number | boolean>;
  }
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
  const worktreePath = formatRelativePath(options.projectRoot, options.session.worktreePath);
  const worktreeExists = await pathExists(options.session.worktreePath);

  if (options.abandon) {
    if (branch.length === 0) {
      if (!worktreeExists) {
        return { kind: "already_absent" };
      }
    } else {
      const branchExists = await localBranchExists(options.projectRoot, branch);

      if (!branchExists && !worktreeExists) {
        return { kind: "already_absent" };
      }
    }

    return {
      kind: "perform",
      mode: "abandoned",
      canonicalBranch: sessionBaseBranch || options.canonicalBranch
    };
  }

  if (branch.length === 0) {
    return {
      kind: "blocked",
      reason: "missing_branch_metadata",
      canonicalBranch,
      message: `Refusing cleanup for ${options.session.agentName}: no preserved branch metadata is available. Rerun with '--cleanup --abandon' to discard the remaining artifacts explicitly.`
    };
  }

  const branchExists = await localBranchExists(options.projectRoot, branch);
  if (!worktreeExists && branchExists) {
    return {
      kind: "blocked",
      reason: "worktree_missing",
      canonicalBranch,
      message: `Refusing cleanup for ${options.session.agentName}: preserved worktree '${worktreePath}' is already missing while branch '${branch}' still exists. Restore it manually if you still need a preserved checkout, rerun without '--cleanup' to preserve the remaining branch, or pass '--cleanup --abandon' to discard it explicitly.`,
      details: {
        worktreePath
      }
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

  const mergedIntoCanonical = branch === canonicalBranch || await isBranchMergedIntoCanonical(options.projectRoot, branch, canonicalBranch);

  if (mergedIntoCanonical) {
    if (!isActiveSessionState(options.session.state) && worktreeExists) {
      const dirtyWorktreeDecision = await getDirtyPreservedWorktreeDecision(options.projectRoot, options.session);
      if (dirtyWorktreeDecision) {
        return dirtyWorktreeDecision;
      }
    }

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
  const decision = await determineCleanupDecision({
    ...options,
    abandon: false
  });

  const outcomeLabel = formatCleanupOutcomeLabel(decision);

  if (isActiveSessionState(options.session.state)) {
    return `stop-then:${outcomeLabel}`;
  }

  return outcomeLabel === "merged" || outcomeLabel === "absent"
    ? `ready:${outcomeLabel}`
    : outcomeLabel;
}

function formatCleanupOutcomeLabel(decision: CleanupDecision): string {
  if (decision.kind === "perform") {
    return "merged";
  }

  if (decision.kind === "already_absent") {
    return "absent";
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
    case "worktree_dirty":
      return "abandon-only:worktree-dirty";
    case "worktree_missing":
      return "abandon-only:worktree-missing";
    case "artifacts_missing":
      return "abandon-only:artifacts-missing";
  }
}

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
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

async function getDirtyPreservedWorktreeDecision(
  projectRoot: string,
  session: SessionRecord
): Promise<CleanupDecision | undefined> {
  try {
    const dirtyEntries = await listMeaningfulDirtyEntries(session.worktreePath);

    if (dirtyEntries.length === 0) {
      return undefined;
    }

    return {
      kind: "blocked",
      reason: "worktree_dirty",
      canonicalBranch: session.baseBranch?.trim() ?? "",
      message: `Refusing cleanup for ${session.agentName}: preserved worktree '${formatRelativePath(projectRoot, session.worktreePath)}' still has uncommitted entries. Commit, merge, or discard those entries there first, or pass '--cleanup --abandon' to remove them explicitly.`,
      details: {
        worktreePath: formatRelativePath(projectRoot, session.worktreePath),
        dirtyCount: dirtyEntries.length,
        ...(dirtyEntries[0] ? { firstDirtyEntry: dirtyEntries[0] } : {})
      }
    };
  } catch {
    return undefined;
  }
}
