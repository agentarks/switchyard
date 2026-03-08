import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import type { SwitchyardConfig } from "../types.js";
import { WorktreeError } from "../errors.js";
import { buildWorktreeBranchName, normalizeAgentName, resolveWorktreePath } from "./naming.js";

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

  await ensureWorktreeTargetAvailable(config.project.root, branch, path);
  await mkdir(dirname(path), { recursive: true });

  try {
    await runGit(config.project.root, ["worktree", "add", "-b", branch, path, config.project.canonicalBranch]);
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

async function ensureWorktreeTargetAvailable(projectRoot: string, branch: string, path: string): Promise<void> {
  if (await pathExists(path)) {
    throw new WorktreeError(`Worktree path already exists: ${path}`);
  }

  if (await localBranchExists(projectRoot, branch)) {
    throw new WorktreeError(`Worktree branch already exists: ${branch}`);
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
