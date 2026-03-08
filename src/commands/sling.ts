import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { recordEventBestEffort, recordEventWithFallback, type EventRecorder } from "../events/store.js";
import { SlingError } from "../errors.js";
import { createSession } from "../sessions/store.js";
import {
  type SpawnedRuntimeProcess,
  type SpawnedRuntimeSession,
  spawnCodexSession
} from "../runtimes/codex/index.js";
import { createWorktree, type ManagedWorktree, removeWorktree } from "../worktrees/manager.js";

interface SlingOptions {
  agentName: string;
  runtimeArgs?: string[];
  startDir?: string;
  spawnRuntime?: (options: {
    agentName: string;
    runtimeArgs: string[];
    worktreePath: string;
    onSpawned?: (runtime: SpawnedRuntimeProcess) => Promise<void>;
  }) => Promise<SpawnedRuntimeSession>;
  recordEvent?: EventRecorder;
}

export function createSlingCommand(): Command {
  return new Command("sling")
    .description("Spawn one Codex agent into an isolated worktree")
    .argument("<agent>", "Deterministic agent name")
    .argument("[args...]", "Arguments reserved for future Codex/runtime inputs")
    .action(async (agentName: string, runtimeArgs: string[]) => {
      await slingCommand({ agentName, runtimeArgs });
    });
}

export async function slingCommand(options: SlingOptions): Promise<void> {
  const config = await loadConfig(options.startDir);
  const recordEvent = options.recordEvent ?? recordEventBestEffort;

  if (config.runtime.default !== "codex") {
    throw new SlingError(`Unsupported runtime '${config.runtime.default}'. Only 'codex' is implemented.`);
  }

  const managedWorktree = await createWorktree(config, options.agentName);
  const spawnRuntime = options.spawnRuntime ?? (async ({ runtimeArgs, worktreePath }) => {
    return await spawnCodexSession({ runtimeArgs, worktreePath });
  });
  const runtimeArgs = options.runtimeArgs ?? [];
  const createdAt = new Date().toISOString();
  let lastLifecycleTimestamp = createdAt;
  const sessionId = randomUUID();
  let runtimeSession: SpawnedRuntimeSession;

  try {
    runtimeSession = await spawnRuntime({
      agentName: managedWorktree.agentName,
      runtimeArgs,
      worktreePath: managedWorktree.path,
      onSpawned: async (spawnedRuntime) => {
        const spawnedAt = nextLifecycleTimestamp(lastLifecycleTimestamp);
        lastLifecycleTimestamp = spawnedAt;

        await recordEventWithFallback(recordEvent, config.project.root, {
          sessionId,
          agentName: managedWorktree.agentName,
          eventType: "sling.spawned",
          createdAt: spawnedAt,
          payload: {
            branch: managedWorktree.branch,
            worktreePath: formatRelativePath(config.project.root, managedWorktree.path),
            runtimePid: spawnedRuntime.pid,
            runtimeCommand: formatRuntimeCommand(spawnedRuntime)
          }
        });
      }
    });
  } catch (error) {
    const cleanupError = await cleanupFailedLaunch(config.project.root, managedWorktree);
    const failedAt = nextLifecycleTimestamp(lastLifecycleTimestamp);

    await createSession(config.project.root, {
      id: sessionId,
      agentName: managedWorktree.agentName,
      branch: managedWorktree.branch,
      worktreePath: managedWorktree.path,
      state: "failed",
      createdAt,
      updatedAt: failedAt
    });

    await recordEventWithFallback(recordEvent, config.project.root, {
      sessionId,
      agentName: managedWorktree.agentName,
      eventType: "sling.failed",
      createdAt: failedAt,
      payload: {
        branch: managedWorktree.branch,
        worktreePath: formatRelativePath(config.project.root, managedWorktree.path),
        errorMessage: formatErrorMessage(error),
        cleanupSucceeded: cleanupError ? false : true
      }
    });

    if (cleanupError) {
      throw new SlingError(`${formatErrorMessage(error)} Cleanup also failed: ${cleanupError.message}`);
    }

    throw error;
  }

  const completedAt = nextLifecycleTimestamp(lastLifecycleTimestamp);

  await createSession(config.project.root, {
    id: sessionId,
    agentName: managedWorktree.agentName,
    branch: managedWorktree.branch,
    worktreePath: managedWorktree.path,
    state: "starting",
    runtimePid: runtimeSession.pid,
    createdAt,
    updatedAt: completedAt
  });

  await recordEventWithFallback(recordEvent, config.project.root, {
    sessionId,
    agentName: managedWorktree.agentName,
    eventType: "sling.completed",
    createdAt: completedAt,
    payload: {
      branch: managedWorktree.branch,
      worktreePath: formatRelativePath(config.project.root, managedWorktree.path),
      runtimePid: runtimeSession.pid,
      runtimeCommand: formatRuntimeCommand(runtimeSession),
      readyAfterMs: runtimeSession.readyAfterMs
    }
  });

  process.stdout.write(`Spawned ${managedWorktree.agentName}\n`);
  process.stdout.write("State: starting\n");
  process.stdout.write(`Branch: ${managedWorktree.branch}\n`);
  process.stdout.write(`Worktree: ${formatRelativePath(config.project.root, managedWorktree.path)}\n`);
  process.stdout.write(`Runtime: ${formatRuntimeCommand(runtimeSession)}\n`);
  process.stdout.write(`Ready: initial launch check passed after ${runtimeSession.readyAfterMs}ms\n`);
}

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}

function formatRuntimeCommand(runtimeSession: SpawnedRuntimeProcess): string {
  const parts = [runtimeSession.command.command, ...runtimeSession.command.args];
  return parts.join(" ");
}

async function cleanupFailedLaunch(projectRoot: string, worktree: ManagedWorktree): Promise<Error | undefined> {
  try {
    await removeWorktree(projectRoot, worktree);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nextLifecycleTimestamp(previousTimestamp: string): string {
  const currentTimestamp = new Date().toISOString();

  if (currentTimestamp > previousTimestamp) {
    return currentTimestamp;
  }

  return new Date(Date.parse(previousTimestamp) + 1).toISOString();
}
