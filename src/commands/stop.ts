import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { relative } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { recordEventBestEffort, recordEventWithFallback, type EventRecorder } from "../events/store.js";
import { StopError } from "../errors.js";
import { stopProcess, isProcessAlive } from "../runtimes/process.js";
import {
  findLatestSessionByAgent,
  getSessionById,
  updateSessionState
} from "../sessions/store.js";
import { isActiveSessionState, type SessionRecord } from "../sessions/types.js";
import { normalizeAgentName } from "../worktrees/naming.js";
import { removeWorktree } from "../worktrees/manager.js";

const execFileAsync = promisify(execFile);

interface StopCommandCliOptions {
  cleanup?: boolean;
  abandon?: boolean;
}

interface StopCommandOptions {
  selector: string;
  cleanup?: boolean;
  abandon?: boolean;
  startDir?: string;
  isRuntimeAlive?: (pid: number) => boolean;
  stopRuntime?: (pid: number) => Promise<boolean>;
  removeSessionWorktree?: typeof removeWorktree;
  recordEvent?: EventRecorder;
}

export function createStopCommand(): Command {
  return new Command("stop")
    .description("Stop an active agent")
    .argument("<session>", "Session id or agent name")
    .option("--cleanup", "Remove the worktree and branch after the runtime stops")
    .option("--abandon", "Allow --cleanup to discard work that is not confirmed merged")
    .action(async (selector: string, options: StopCommandCliOptions) => {
      await stopCommand({
        selector,
        cleanup: options.cleanup,
        abandon: options.abandon
      });
    });
}

export async function stopCommand(options: StopCommandOptions): Promise<void> {
  const config = await loadConfig(options.startDir);
  const session = await resolveSession(config.project.root, options.selector);
  const removeSessionWorktree = options.removeSessionWorktree ?? removeWorktree;
  const recordEvent = options.recordEvent ?? recordEventBestEffort;

  if (!session) {
    throw new StopError(`No session found for '${options.selector}'.`);
  }

  if (options.abandon && !options.cleanup) {
    throw new StopError("The '--abandon' flag requires '--cleanup'.");
  }

  const cleanupMode = options.cleanup
    ? await determineCleanupMode({
      projectRoot: config.project.root,
      canonicalBranch: config.project.canonicalBranch,
      session,
      abandon: options.abandon
    })
    : undefined;

  if (!isActiveSessionState(session.state)) {
    if (options.cleanup) {
      await cleanupSessionArtifacts({
        projectRoot: config.project.root,
        canonicalBranch: config.project.canonicalBranch,
        session,
        removeSessionWorktree
      });
      await recordEventWithFallback(recordEvent, config.project.root, {
        sessionId: session.id,
        agentName: session.agentName,
        eventType: "stop.completed",
        payload: {
          previousState: session.state,
          nextState: session.state,
          outcome: "already_not_running",
          cleanupRequested: true,
          cleanupPerformed: true,
          ...(cleanupMode ? { cleanupMode } : {})
        }
      });
      process.stdout.write(`Session ${session.agentName} is already ${session.state}.\n`);
      process.stdout.write(`${formatCleanupMessage(cleanupMode, config.project.canonicalBranch)}\n`);
      return;
    }

    throw new StopError(`Session '${options.selector}' is already ${session.state}.`);
  }

  if (typeof session.runtimePid !== "number") {
    const nextSession = await updateSessionState(config.project.root, {
      id: session.id,
      state: "failed",
      runtimePid: null
    });
    const cleanupPerformed = await maybeCleanupSessionArtifacts({
      projectRoot: config.project.root,
      canonicalBranch: config.project.canonicalBranch,
      session,
      cleanupRequested: options.cleanup,
      cleanupMode,
      removeSessionWorktree
    });
    await recordEventWithFallback(recordEvent, config.project.root, {
      sessionId: nextSession.id,
      agentName: nextSession.agentName,
      eventType: "stop.completed",
      payload: {
        previousState: session.state,
        nextState: nextSession.state,
        outcome: "missing_runtime_pid",
        cleanupRequested: options.cleanup ? true : false,
        cleanupPerformed,
        ...(cleanupPerformed && cleanupMode ? { cleanupMode } : {})
      }
    });
    process.stdout.write(`Session ${session.agentName} has no recorded runtime pid. Marked failed.\n`);
    if (cleanupPerformed) {
      process.stdout.write(`${formatCleanupMessage(cleanupMode, config.project.canonicalBranch)}\n`);
    } else {
      process.stdout.write(`Worktree preserved: ${formatRelativePath(config.project.root, session.worktreePath)}\n`);
    }
    return;
  }

  const isRuntimeAlive = options.isRuntimeAlive ?? isProcessAlive;
  const stopRuntime = options.stopRuntime ?? stopProcess;
  let nextState: SessionRecord["state"] = "stopped";

  const wasAlive = isRuntimeAlive(session.runtimePid);
  const stopped = await stopRuntime(session.runtimePid);

  if (!wasAlive) {
    nextState = "failed";
  } else if (!stopped) {
    nextState = "stopped";
  }

  const nextSession = await updateSessionState(config.project.root, {
    id: session.id,
    state: nextState,
    runtimePid: null
  });

  const cleanupPerformed = await maybeCleanupSessionArtifacts({
    projectRoot: config.project.root,
    canonicalBranch: config.project.canonicalBranch,
    session,
    cleanupRequested: options.cleanup,
    cleanupMode,
    removeSessionWorktree
  });

  await recordEventWithFallback(recordEvent, config.project.root, {
    sessionId: nextSession.id,
    agentName: nextSession.agentName,
    eventType: "stop.completed",
    payload: {
      previousState: session.state,
      nextState: nextSession.state,
      outcome: determineStopOutcome(wasAlive, stopped, nextState),
      cleanupRequested: options.cleanup ? true : false,
      cleanupPerformed,
      ...(cleanupPerformed && cleanupMode ? { cleanupMode } : {})
    }
  });

  if (nextState === "failed") {
    process.stdout.write(`Session ${session.agentName} was already not running. Marked failed.\n`);
  } else {
    process.stdout.write(`Stopped ${session.agentName}\n`);
  }

  if (cleanupPerformed) {
    process.stdout.write(`${formatCleanupMessage(cleanupMode, config.project.canonicalBranch)}\n`);
  } else {
    process.stdout.write(`Worktree preserved: ${formatRelativePath(config.project.root, session.worktreePath)}\n`);
  }
}

async function resolveSession(projectRoot: string, selector: string): Promise<SessionRecord | undefined> {
  const byId = await getSessionById(projectRoot, selector);

  if (byId) {
    return byId;
  }

  return await findLatestSessionByAgent(projectRoot, normalizeAgentName(selector));
}

async function cleanupSessionArtifacts(options: {
  projectRoot: string;
  canonicalBranch: string;
  session: SessionRecord;
  removeSessionWorktree: typeof removeWorktree;
}): Promise<void> {
  try {
    await options.removeSessionWorktree(options.projectRoot, {
      agentName: options.session.agentName,
      branch: options.session.branch,
      path: options.session.worktreePath,
      baseBranch: options.canonicalBranch
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StopError(`Cleanup failed for ${options.session.agentName}: ${message}`);
  }
}

async function maybeCleanupSessionArtifacts(options: {
  projectRoot: string;
  canonicalBranch: string;
  session: SessionRecord;
  cleanupRequested?: boolean;
  cleanupMode?: CleanupMode;
  removeSessionWorktree: typeof removeWorktree;
}): Promise<boolean> {
  if (!options.cleanupRequested) {
    return false;
  }

  await cleanupSessionArtifacts(options);
  return true;
}

function determineStopOutcome(
  wasAlive: boolean,
  stopped: boolean,
  nextState: SessionRecord["state"]
): string {
  if (!wasAlive && nextState === "failed") {
    return "not_running";
  }

  if (!stopped && nextState === "stopped") {
    return "exited_during_shutdown";
  }

  return "stopped";
}

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}

type CleanupMode = "abandoned" | "artifacts_missing" | "merged";

async function determineCleanupMode(options: {
  projectRoot: string;
  canonicalBranch: string;
  session: SessionRecord;
  abandon?: boolean;
}): Promise<CleanupMode> {
  if (options.abandon) {
    return "abandoned";
  }

  const branch = options.session.branch.trim();

  if (branch.length === 0) {
    throw new StopError(
      `Refusing cleanup for ${options.session.agentName}: no preserved branch metadata is available. Rerun with '--cleanup --abandon' to discard the remaining artifacts explicitly.`
    );
  }

  const branchExists = await localBranchExists(options.projectRoot, branch);
  const worktreeExists = await pathExists(options.session.worktreePath);

  if (!branchExists && !worktreeExists) {
    return "artifacts_missing";
  }

  if (!branchExists) {
    throw new StopError(
      `Refusing cleanup for ${options.session.agentName}: cannot confirm preserved branch '${branch}' is merged into '${options.canonicalBranch}'. Rerun without '--cleanup' to preserve the remaining artifacts, or pass '--cleanup --abandon' to discard them explicitly.`
    );
  }

  if (branch === options.canonicalBranch || await isBranchMergedIntoCanonical(options.projectRoot, branch, options.canonicalBranch)) {
    return "merged";
  }

  throw new StopError(
    `Refusing cleanup for ${options.session.agentName}: preserved branch '${branch}' is not merged into '${options.canonicalBranch}'. Rerun without '--cleanup' to preserve it, or pass '--cleanup --abandon' to discard it explicitly.`
  );
}

function formatCleanupMessage(cleanupMode: CleanupMode | undefined, canonicalBranch: string): string {
  if (cleanupMode === "abandoned") {
    return "Cleanup: removed worktree and branch after explicit abandon.";
  }

  if (cleanupMode === "merged") {
    return `Cleanup: removed worktree and branch after confirming merge into ${canonicalBranch}.`;
  }

  return "Cleanup: removed worktree and branch.";
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

async function runGit(projectRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: projectRoot });
  return stdout.trim();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
