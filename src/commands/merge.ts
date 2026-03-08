import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { relative } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { recordEventBestEffort, recordEventWithFallback, type EventRecorder } from "../events/store.js";
import { MergeError } from "../errors.js";
import { findLatestSessionByAgent, getSessionById } from "../sessions/store.js";
import { isActiveSessionState, type SessionRecord } from "../sessions/types.js";
import { normalizeAgentName } from "../worktrees/naming.js";

const execFileAsync = promisify(execFile);

interface MergeCommandOptions {
  selector: string;
  startDir?: string;
  recordEvent?: EventRecorder;
}

export function createMergeCommand(): Command {
  return new Command("merge")
    .description("Merge one preserved agent branch into the canonical branch")
    .argument("<session>", "Session id or agent name")
    .action(async (selector: string) => {
      await mergeCommand({ selector });
    });
}

export async function mergeCommand(options: MergeCommandOptions): Promise<void> {
  const config = await loadConfig(options.startDir);
  const recordEvent = options.recordEvent ?? recordEventBestEffort;
  const session = await resolveSession(config.project.root, options.selector);

  if (!session) {
    throw new MergeError(`No session found for '${options.selector}'.`);
  }

  if (isActiveSessionState(session.state)) {
    throw new MergeError(`Session '${options.selector}' is still ${session.state}. Stop it before merging.`);
  }

  const branch = session.branch.trim();
  const canonicalBranch = config.project.canonicalBranch.trim();

  if (branch.length === 0) {
    throw new MergeError(`Session ${session.id} has no preserved branch metadata.`);
  }

  if (canonicalBranch.length === 0) {
    throw new MergeError("Configured canonical branch is empty.");
  }

  if (branch === canonicalBranch) {
    throw new MergeError(`Session ${session.id} points at '${branch}', which matches the canonical branch.`);
  }

  await ensureLocalBranchExists(config.project.root, branch);
  await ensurePreservedWorktreeIsClean(config.project.root, session);
  await ensureProjectRootIsClean(config.project.root);

  const currentBranch = await getCurrentBranch(config.project.root);

  if (currentBranch !== canonicalBranch) {
    await switchToCanonicalBranch(config.project.root, canonicalBranch);
  }

  if (await isBranchAlreadyMerged(config.project.root, branch)) {
    await recordEventWithFallback(recordEvent, config.project.root, {
      sessionId: session.id,
      agentName: session.agentName,
      eventType: "merge.skipped",
      payload: {
        branch,
        canonicalBranch,
        reason: "already_up_to_date"
      }
    });

    process.stdout.write(`Session ${session.agentName} is already merged into ${canonicalBranch}\n`);
    process.stdout.write(`Session: ${session.id}\n`);
    process.stdout.write(`Branch: ${branch}\n`);
    process.stdout.write(`Next: if you no longer need the preserved worktree, run 'sy stop ${session.id} --cleanup'.\n`);
    return;
  }

  try {
    await runGit(config.project.root, ["merge", "--no-ff", branch]);
  } catch (error) {
    const reason = await mergeFailureReason(config.project.root);
    await recordEventWithFallback(recordEvent, config.project.root, {
      sessionId: session.id,
      agentName: session.agentName,
      eventType: "merge.failed",
      payload: {
        branch,
        canonicalBranch,
        reason
      }
    });

    if (reason === "merge_conflict") {
      throw new MergeError(
        `Merge stopped with conflicts between '${canonicalBranch}' and '${branch}'. Resolve them in the repo root or run 'git merge --abort'.`
      );
    }

    throw new MergeError(`Failed to merge '${branch}' into '${canonicalBranch}': ${formatGitError(error)}`);
  }

  await recordEventWithFallback(recordEvent, config.project.root, {
    sessionId: session.id,
    agentName: session.agentName,
    eventType: "merge.completed",
    payload: {
      branch,
      canonicalBranch
    }
  });

  process.stdout.write(`Merged ${session.agentName} into ${canonicalBranch}\n`);
  process.stdout.write(`Session: ${session.id}\n`);
  process.stdout.write(`Branch: ${branch}\n`);
  process.stdout.write(`Next: run your normal checks on ${canonicalBranch}, then 'sy stop ${session.id} --cleanup' when ready.\n`);
}

async function resolveSession(projectRoot: string, selector: string): Promise<SessionRecord | undefined> {
  const byId = await getSessionById(projectRoot, selector);

  if (byId) {
    return byId;
  }

  return await findLatestSessionByAgent(projectRoot, normalizeAgentName(selector));
}

async function ensureProjectRootIsClean(projectRoot: string): Promise<void> {
  const { stdout } = await runGit(projectRoot, ["status", "--porcelain", "--untracked-files=all"]);

  const dirtyEntries = stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .filter((line) => !isSwitchyardStateEntry(line));

  if (dirtyEntries.length > 0) {
    throw new MergeError("Canonical branch worktree is not clean. Commit, stash, or discard changes in the repo root before merging.");
  }
}

async function ensurePreservedWorktreeIsClean(projectRoot: string, session: SessionRecord): Promise<void> {
  if (!(await pathExists(session.worktreePath))) {
    return;
  }

  const { stdout } = await runGit(session.worktreePath, ["status", "--porcelain", "--untracked-files=all"]);
  const dirtyEntries = stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .filter((line) => !isSwitchyardStateEntry(line));

  if (dirtyEntries.length > 0) {
    throw new MergeError(
      `Preserved worktree for ${session.agentName} is not clean (${formatRelativePath(projectRoot, session.worktreePath)}). Commit, stash, or discard changes there before merging.`
    );
  }
}

async function ensureLocalBranchExists(projectRoot: string, branch: string): Promise<void> {
  try {
    await runGit(projectRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  } catch {
    throw new MergeError(`Preserved branch '${branch}' is missing. Cleanup may already have removed it.`);
  }
}

async function getCurrentBranch(projectRoot: string): Promise<string> {
  const { stdout } = await runGit(projectRoot, ["branch", "--show-current"]);
  return stdout.trim();
}

async function switchToCanonicalBranch(projectRoot: string, canonicalBranch: string): Promise<void> {
  try {
    await runGit(projectRoot, ["switch", canonicalBranch]);
  } catch (error) {
    throw new MergeError(`Failed to switch the repo root to '${canonicalBranch}': ${formatGitError(error)}`);
  }
}

async function isBranchAlreadyMerged(projectRoot: string, branch: string): Promise<boolean> {
  try {
    await runGit(projectRoot, ["merge-base", "--is-ancestor", branch, "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

async function mergeFailureReason(projectRoot: string): Promise<string> {
  try {
    await runGit(projectRoot, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
    return "merge_conflict";
  } catch {
    return "git_error";
  }
}

async function runGit(projectRoot: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync("git", args, { cwd: projectRoot });
  return {
    stdout: stdout.trim(),
    stderr: stderr.trim()
  };
}

function formatGitError(error: unknown): string {
  if (error && typeof error === "object") {
    const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout.trim() : "";
    const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
    const combined = stderr || stdout;

    if (combined.length > 0) {
      return combined;
    }
  }

  return error instanceof Error ? error.message : String(error);
}

function isSwitchyardStateEntry(entry: string): boolean {
  const pathField = entry.slice(3).trim();
  const normalizedPath = unquoteGitPath(pathField);

  if (normalizedPath.includes(" -> ")) {
    const [fromPath, toPath] = normalizedPath.split(" -> ", 2);
    return typeof fromPath === "string"
      && typeof toPath === "string"
      && isSwitchyardPath(fromPath)
      && isSwitchyardPath(toPath);
  }

  return isSwitchyardPath(normalizedPath);
}

function isSwitchyardPath(path: string): boolean {
  return path === ".switchyard" || path.startsWith(".switchyard/");
}

function unquoteGitPath(path: string): string {
  if (path.startsWith("\"") && path.endsWith("\"")) {
    return path.slice(1, -1);
  }

  return path;
}

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
