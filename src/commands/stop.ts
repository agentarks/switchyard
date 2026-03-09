import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { relative } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { recordEventBestEffort, recordEventWithFallback, type EventRecorder } from "../events/store.js";
import { StopError } from "../errors.js";
import { resolveSessionByIdOrAgent } from "./session-selector.js";
import { stopProcess, isProcessAlive } from "../runtimes/process.js";
import { updateSessionState } from "../sessions/store.js";
import { isActiveSessionState, type SessionRecord } from "../sessions/types.js";
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

  if (!isActiveSessionState(session.state)) {
    if (options.cleanup) {
      const cleanup = await resolveCleanupRequest({
        projectRoot: config.project.root,
        canonicalBranch: config.project.canonicalBranch,
        session,
        cleanupRequested: options.cleanup,
        abandon: options.abandon,
        failOnBlocked: true,
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
          cleanupPerformed: cleanup.performed,
          ...(cleanup.cleanupMode ? { cleanupMode: cleanup.cleanupMode } : {}),
          ...(cleanup.cleanupReason ? { cleanupReason: cleanup.cleanupReason } : {})
        }
      });
      process.stdout.write(`Session ${session.agentName} is already ${session.state}.\n`);
      process.stdout.write(`${cleanup.message}\n`);
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
    const cleanup = await resolveCleanupRequest({
      projectRoot: config.project.root,
      canonicalBranch: config.project.canonicalBranch,
      session,
      cleanupRequested: options.cleanup,
      abandon: options.abandon,
      failOnBlocked: false,
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
        cleanupPerformed: cleanup.performed,
        ...(cleanup.cleanupMode ? { cleanupMode: cleanup.cleanupMode } : {}),
        ...(cleanup.cleanupReason ? { cleanupReason: cleanup.cleanupReason } : {})
      }
    });
    process.stdout.write(`Session ${session.agentName} has no recorded runtime pid. Marked failed.\n`);
    if (cleanup.message) {
      process.stdout.write(`${cleanup.message}\n`);
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

  const cleanup = await resolveCleanupRequest({
    projectRoot: config.project.root,
    canonicalBranch: config.project.canonicalBranch,
    session,
    cleanupRequested: options.cleanup,
    abandon: options.abandon,
    failOnBlocked: false,
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
      cleanupPerformed: cleanup.performed,
      ...(cleanup.cleanupMode ? { cleanupMode: cleanup.cleanupMode } : {}),
      ...(cleanup.cleanupReason ? { cleanupReason: cleanup.cleanupReason } : {})
    }
  });

  if (nextState === "failed") {
    process.stdout.write(`Session ${session.agentName} was already not running. Marked failed.\n`);
  } else {
    process.stdout.write(`Stopped ${session.agentName}\n`);
  }

  if (cleanup.message) {
    process.stdout.write(`${cleanup.message}\n`);
  } else {
    process.stdout.write(`Worktree preserved: ${formatRelativePath(config.project.root, session.worktreePath)}\n`);
  }
}

async function resolveSession(projectRoot: string, selector: string): Promise<SessionRecord | undefined> {
  return await resolveSessionByIdOrAgent(projectRoot, selector, (byId, byAgent) => {
    return new StopError(
      `Selector '${selector}' is ambiguous: it matches session '${byId.id}' by id and session '${byAgent.id}' by agent name.`
    );
  });
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

async function resolveCleanupRequest(options: {
  projectRoot: string;
  canonicalBranch: string;
  session: SessionRecord;
  cleanupRequested?: boolean;
  abandon?: boolean;
  failOnBlocked: boolean;
  removeSessionWorktree: typeof removeWorktree;
}): Promise<{
  performed: boolean;
  message?: string;
  cleanupMode?: CleanupMode;
  cleanupReason?: CleanupReason;
}> {
  if (!options.cleanupRequested) {
    return { performed: false };
  }

  const decision = await determineCleanupDecision(options);

  if (decision.kind === "blocked") {
    if (options.failOnBlocked) {
      throw new StopError(decision.message);
    }

    return {
      performed: false,
      message: `Cleanup skipped: ${decision.message}`,
      cleanupReason: decision.reason
    };
  }

  if (decision.kind === "already_absent") {
    return {
      performed: false,
      message: "Cleanup: preserved worktree and branch were already absent.",
      cleanupReason: "artifacts_missing"
    };
  }

  await cleanupSessionArtifacts({
    ...options,
    canonicalBranch: decision.canonicalBranch
  });

  return {
    performed: true,
    message: formatCleanupMessage(decision.mode, decision.canonicalBranch),
    cleanupMode: decision.mode
  };
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

type CleanupMode = "abandoned" | "merged";

type CleanupReason =
  | "artifacts_missing"
  | "branch_missing"
  | "missing_base_branch_metadata"
  | "missing_branch_metadata"
  | "not_merged";

async function determineCleanupDecision(options: {
  projectRoot: string;
  canonicalBranch: string;
  session: SessionRecord;
  abandon?: boolean;
}): Promise<
  | { kind: "perform"; mode: CleanupMode; canonicalBranch: string }
  | { kind: "blocked"; reason: CleanupReason; message: string; canonicalBranch: string }
  | { kind: "already_absent" }
> {
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
