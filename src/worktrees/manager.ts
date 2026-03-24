import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { resolveBranchStartPoint } from "../config.js";
import type { SwitchyardConfig } from "../types.js";
import { WorktreeError } from "../errors.js";
import {
  buildIntegrationBranchName,
  buildLeadAgentName,
  buildWorktreeBranchName,
  normalizeAgentName,
  resolveIntegrationWorktreePath,
  resolveWorktreePath
} from "./naming.js";

const execFileAsync = promisify(execFile);

export interface ManagedWorktree {
  agentName: string;
  branch: string;
  path: string;
  baseBranch: string;
}

export async function createWorktree(config: SwitchyardConfig, requestedAgentName: string): Promise<ManagedWorktree> {
  const agentName = normalizeAgentName(requestedAgentName);
  const branch = buildWorktreeBranchName(agentName);
  const path = resolveWorktreePath(config, agentName);
  const startPoint = await resolveCanonicalStartPoint(config.project.root, config.project.canonicalBranch);

  await ensureWorktreeTargetAvailable(config.project.root, branch, path);
  await mkdir(dirname(path), { recursive: true });

  try {
    await runGit(config.project.root, ["worktree", "add", "-b", branch, path, startPoint]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WorktreeError(`Failed to create worktree for ${agentName}: ${message}`);
  }

  return {
    agentName,
    branch,
    path,
    baseBranch: config.project.canonicalBranch
  };
}

export async function createLeadWorktree(config: SwitchyardConfig, runId: string): Promise<ManagedWorktree> {
  const agentName = buildLeadAgentName(runId);
  const branch = buildIntegrationBranchName(runId);
  const path = resolveIntegrationWorktreePath(config, runId);
  const startPoint = await resolveCanonicalStartPoint(config.project.root, config.project.canonicalBranch);

  await ensureWorktreeTargetAvailable(config.project.root, branch, path);
  await mkdir(dirname(path), { recursive: true });

  try {
    await runGit(config.project.root, ["worktree", "add", "-b", branch, path, startPoint]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WorktreeError(`Failed to create lead worktree for ${runId}: ${message}`);
  }

  return {
    agentName,
    branch,
    path,
    baseBranch: config.project.canonicalBranch
  };
}

export async function removeWorktree(projectRoot: string, worktree: ManagedWorktree): Promise<void> {
  try {
    if (await pathExists(worktree.path)) {
      await runGit(projectRoot, ["worktree", "remove", "--force", worktree.path]);
    }

    if (await localBranchExists(projectRoot, worktree.branch)) {
      await runGit(projectRoot, ["branch", "--delete", "--force", worktree.branch]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WorktreeError(`Failed to remove worktree for ${worktree.agentName}: ${message}`);
  }
}

async function ensureWorktreeTargetAvailable(projectRoot: string, branch: string, path: string): Promise<void> {
  if (await pathExists(path)) {
    throw new WorktreeError(`Worktree path already exists: ${path}`);
  }

  if (await localBranchExists(projectRoot, branch)) {
    throw new WorktreeError(`Worktree branch already exists: ${branch}`);
  }
}

async function resolveCanonicalStartPoint(projectRoot: string, canonicalBranch: string): Promise<string> {
  const startPoint = await resolveBranchStartPoint(projectRoot, canonicalBranch);

  if (!startPoint) {
    throw new WorktreeError(
      `Configured canonical branch '${canonicalBranch}' does not point to a commit yet. `
      + "Make an initial commit on that branch before running 'sy sling'."
    );
  }

  return startPoint;
}

async function localBranchExists(projectRoot: string, branch: string): Promise<boolean> {
  try {
    await runGit(projectRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
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
