import { relative } from "node:path";
import process from "node:process";
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
import type { SessionRecord } from "../sessions/types.js";
import { normalizeAgentName } from "../worktrees/naming.js";
import { removeWorktree } from "../worktrees/manager.js";

interface StopCommandCliOptions {
  cleanup?: boolean;
}

interface StopCommandOptions {
  selector: string;
  cleanup?: boolean;
  startDir?: string;
  isRuntimeAlive?: (pid: number) => boolean;
  stopRuntime?: (pid: number) => Promise<boolean>;
  removeSessionWorktree?: typeof removeWorktree;
  recordEvent?: EventRecorder;
}

export function createStopCommand(): Command {
  return new Command("stop")
    .description("Stop a running agent")
    .argument("<session>", "Session id or agent name")
    .option("--cleanup", "Remove the worktree and branch after the runtime stops")
    .action(async (selector: string, options: StopCommandCliOptions) => {
      await stopCommand({
        selector,
        cleanup: options.cleanup
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

  if (session.state !== "running") {
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
          cleanupPerformed: true
        }
      });
      process.stdout.write(`Session ${session.agentName} is already ${session.state}.\n`);
      process.stdout.write("Cleanup: removed worktree and branch.\n");
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
        cleanupPerformed
      }
    });
    process.stdout.write(`Session ${session.agentName} has no recorded runtime pid. Marked failed.\n`);
    if (cleanupPerformed) {
      process.stdout.write("Cleanup: removed worktree and branch.\n");
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
      cleanupPerformed
    }
  });

  if (nextState === "failed") {
    process.stdout.write(`Session ${session.agentName} was already not running. Marked failed.\n`);
  } else {
    process.stdout.write(`Stopped ${session.agentName}\n`);
  }

  if (cleanupPerformed) {
    process.stdout.write("Cleanup: removed worktree and branch.\n");
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
