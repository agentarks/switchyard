import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { recordEventBestEffort, recordEventWithFallback, type EventRecorder } from "../events/store.js";
import { SlingError } from "../errors.js";
import { stopProcess } from "../runtimes/process.js";
import { createSession } from "../sessions/store.js";
import type { CreateSessionInput } from "../sessions/types.js";
import { summarizeTask, writeTaskSpec, type TaskSpecRecord } from "../specs/task.js";
import {
  type SpawnedRuntimeProcess,
  type SpawnedRuntimeSession,
  spawnCodexSession
} from "../runtimes/codex/index.js";
import { createWorktree, type ManagedWorktree, removeWorktree } from "../worktrees/manager.js";

interface SlingOptions {
  agentName: string;
  task?: string;
  runtimeArgs?: string[];
  startDir?: string;
  spawnRuntime?: (options: {
    agentName: string;
    runtimeArgs: string[];
    worktreePath: string;
    onSpawned?: (runtime: SpawnedRuntimeProcess) => Promise<void>;
  }) => Promise<SpawnedRuntimeSession>;
  recordEvent?: EventRecorder;
  createSessionRecord?: (projectRoot: string, input: CreateSessionInput) => Promise<unknown>;
  stopRuntime?: (pid: number) => Promise<boolean>;
}

export function createSlingCommand(): Command {
  return new Command("sling")
    .description("Spawn one Codex agent into an isolated worktree")
    .argument("<agent>", "Deterministic agent name")
    .requiredOption("--task <instruction>", "Operator task or instruction to hand off")
    .argument("[args...]", "Arguments reserved for future Codex/runtime inputs")
    .action(async (agentName: string, runtimeArgs: string[], commandOptions: { task: string }) => {
      await slingCommand({ agentName, task: commandOptions.task, runtimeArgs });
    });
}

export async function slingCommand(options: SlingOptions): Promise<void> {
  const task = validateTask(options.task);
  const config = await loadConfig(options.startDir);
  const recordEvent = options.recordEvent ?? recordEventBestEffort;
  const createSessionRecord = options.createSessionRecord ?? createSession;
  const stopRuntime = options.stopRuntime ?? stopProcess;

  if (config.runtime.default !== "codex") {
    throw new SlingError(`Unsupported runtime '${config.runtime.default}'. Only 'codex' is implemented.`);
  }

  const managedWorktree = await createWorktree(config, options.agentName);
  const spawnRuntime = options.spawnRuntime ?? (async ({ runtimeArgs, worktreePath }) => {
    return await spawnCodexSession({ runtimeArgs, worktreePath });
  });
  const runtimeArgs = options.runtimeArgs ?? [];
  const runtimeArgsWithTask = [...runtimeArgs, task];
  const createdAt = new Date().toISOString();
  let lastLifecycleTimestamp = createdAt;
  const sessionId = randomUUID();
  const taskSummary = summarizeTask(task);
  let runtimeSession: SpawnedRuntimeSession;
  let taskSpec: TaskSpecRecord | undefined;

  try {
    taskSpec = await writeTaskSpec({
      projectRoot: config.project.root,
      sessionId,
      agentName: managedWorktree.agentName,
      task,
      createdAt,
      branch: managedWorktree.branch,
      baseBranch: managedWorktree.baseBranch,
      worktreePath: managedWorktree.path
    });
    const taskSpecPath = taskSpec.relativePath;

    runtimeSession = await spawnRuntime({
      agentName: managedWorktree.agentName,
      runtimeArgs: runtimeArgsWithTask,
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
            baseBranch: managedWorktree.baseBranch,
            worktreePath: formatRelativePath(config.project.root, managedWorktree.path),
            taskSummary,
            taskSpecPath,
            runtimePid: spawnedRuntime.pid,
            runtimeCommand: formatRuntimeCommand(spawnedRuntime)
          }
        });
      }
    });
  } catch (error) {
    const cleanupError = await cleanupFailedLaunch(config.project.root, managedWorktree);
    const failedAt = nextLifecycleTimestamp(lastLifecycleTimestamp);

    await createSessionRecord(config.project.root, {
      id: sessionId,
      agentName: managedWorktree.agentName,
      branch: managedWorktree.branch,
      baseBranch: managedWorktree.baseBranch,
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
        taskSummary,
        taskSpecPath: taskSpec?.relativePath ?? null,
        cleanupSucceeded: cleanupError ? false : true
      }
    });

    if (cleanupError) {
      throw new SlingError(`${formatErrorMessage(error)} Cleanup also failed: ${cleanupError.message}`);
    }

    throw error;
  }

  if (!taskSpec) {
    throw new SlingError("Task spec was not created before launch completion.");
  }

  const completedAt = nextLifecycleTimestamp(lastLifecycleTimestamp);
  try {
    await createSessionRecord(config.project.root, {
      id: sessionId,
      agentName: managedWorktree.agentName,
      branch: managedWorktree.branch,
      baseBranch: managedWorktree.baseBranch,
      worktreePath: managedWorktree.path,
      state: "starting",
      runtimePid: runtimeSession.pid,
      createdAt,
      updatedAt: completedAt
    });
  } catch (error) {
    const failedAt = nextLifecycleTimestamp(completedAt);
    const teardown = await cleanupPostSpawnPersistenceFailure({
      projectRoot: config.project.root,
      worktree: managedWorktree,
      runtimePid: runtimeSession.pid,
      stopRuntime
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
        taskSummary,
        taskSpecPath: taskSpec?.relativePath ?? null,
        runtimePid: runtimeSession.pid,
        runtimeStopped: teardown.stopError ? false : true,
        cleanupSucceeded: teardown.cleanupError ? false : true
      }
    });

    throw buildPostSpawnPersistenceError(error, teardown);
  }

  await recordEventWithFallback(recordEvent, config.project.root, {
    sessionId,
    agentName: managedWorktree.agentName,
    eventType: "sling.completed",
    createdAt: completedAt,
    payload: {
      branch: managedWorktree.branch,
      baseBranch: managedWorktree.baseBranch,
      worktreePath: formatRelativePath(config.project.root, managedWorktree.path),
      taskSummary,
      taskSpecPath: taskSpec.relativePath,
      runtimePid: runtimeSession.pid,
      runtimeCommand: formatRuntimeCommand(runtimeSession),
      readyAfterMs: runtimeSession.readyAfterMs
    }
  });

  process.stdout.write(`Spawned ${managedWorktree.agentName}\n`);
  process.stdout.write(`Session: ${sessionId}\n`);
  process.stdout.write("State: starting\n");
  process.stdout.write(`Branch: ${managedWorktree.branch}\n`);
  process.stdout.write(`Base: ${managedWorktree.baseBranch}\n`);
  process.stdout.write(`Task: ${taskSummary}\n`);
  process.stdout.write(`Spec: ${taskSpec.relativePath}\n`);
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

function validateTask(task: string | undefined): string {
  if (typeof task !== "string" || task.trim().length === 0) {
    throw new SlingError("Missing task. Use '--task <instruction>' to hand off one explicit task.");
  }

  return task;
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

async function cleanupPostSpawnPersistenceFailure(options: {
  projectRoot: string;
  worktree: ManagedWorktree;
  runtimePid: number;
  stopRuntime: (pid: number) => Promise<boolean>;
}): Promise<{ stopError?: Error; cleanupError?: Error }> {
  let stopError: Error | undefined;

  try {
    await options.stopRuntime(options.runtimePid);
  } catch (error) {
    stopError = toError(error);
  }

  const cleanupError = await cleanupFailedLaunch(options.projectRoot, options.worktree);
  return { stopError, cleanupError };
}

function buildPostSpawnPersistenceError(
  error: unknown,
  teardown: { stopError?: Error; cleanupError?: Error }
): SlingError {
  const details = [`Failed to persist session after runtime launch: ${formatErrorMessage(error)}`];

  if (teardown.stopError) {
    details.push(`runtime cleanup failed: ${teardown.stopError.message}`);
  }

  if (teardown.cleanupError) {
    details.push(`worktree cleanup failed: ${teardown.cleanupError.message}`);
  }

  return new SlingError(details.join(" "));
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function nextLifecycleTimestamp(previousTimestamp: string): string {
  const currentTimestamp = new Date().toISOString();

  if (currentTimestamp > previousTimestamp) {
    return currentTimestamp;
  }

  return new Date(Date.parse(previousTimestamp) + 1).toISOString();
}
