import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { recordEventBestEffort, recordEventWithFallback, type EventRecorder } from "../events/store.js";
import { SlingError } from "../errors.js";
import { stopProcess } from "../runtimes/process.js";
import { createRun, updateRun } from "../runs/store.js";
import type { RunRecord, UpdateRunInput } from "../runs/types.js";
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
  taskFile?: string;
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
  updateRunRecord?: (projectRoot: string, input: UpdateRunInput) => Promise<unknown>;
  stopRuntime?: (pid: number) => Promise<boolean>;
}

export function createSlingCommand(): Command {
  return new Command("sling")
    .description("Spawn one Codex agent into an isolated worktree")
    .argument("<agent>", "Deterministic agent name")
    .option("--task <instruction>", "Operator task or instruction to hand off")
    .option("--task-file <path>", "Read the operator task or instruction from a file")
    .argument("[args...]", "Arguments reserved for future Codex/runtime inputs")
    .action(async (
      agentName: string,
      runtimeArgs: string[],
      commandOptions: { task?: string; taskFile?: string }
    ) => {
      await slingCommand({ agentName, task: commandOptions.task, taskFile: commandOptions.taskFile, runtimeArgs });
    });
}

export async function slingCommand(options: SlingOptions): Promise<void> {
  const task = await loadTask(options);
  const config = await loadConfig(options.startDir);
  const recordEvent = options.recordEvent ?? recordEventBestEffort;
  const createSessionRecord = options.createSessionRecord ?? createSession;
  const updateRunRecord = options.updateRunRecord ?? updateRun;
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
  let runRecord: RunRecord | undefined;

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
    runRecord = await createRun(config.project.root, {
      sessionId,
      agentName: managedWorktree.agentName,
      taskSummary,
      taskSpecPath: taskSpec.relativePath,
      state: "starting",
      createdAt,
      updatedAt: createdAt
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
            runtimeCommand: formatRuntimeCommandForOperator(spawnedRuntime, task)
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
    if (runRecord) {
      await persistRunUpdateBestEffort(config.project.root, sessionId, {
        id: runRecord.id,
        state: "finished",
        outcome: "launch_failed",
        updatedAt: failedAt,
        finishedAt: failedAt
      }, updateRunRecord);
    }

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
    if (runRecord) {
      await persistRunUpdateBestEffort(config.project.root, sessionId, {
        id: runRecord.id,
        state: "finished",
        outcome: "launch_failed",
        updatedAt: failedAt,
        finishedAt: failedAt
      }, updateRunRecord);
    }

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
      runtimeCommand: formatRuntimeCommandForOperator(runtimeSession, task),
      readyAfterMs: runtimeSession.readyAfterMs
    }
  });
  if (runRecord) {
    await persistRunUpdateBestEffort(config.project.root, sessionId, {
      id: runRecord.id,
      state: "active",
      updatedAt: completedAt,
      finishedAt: null
    }, updateRunRecord);
  }

  process.stdout.write(`Spawned ${managedWorktree.agentName}\n`);
  process.stdout.write(`Session: ${sessionId}\n`);
  process.stdout.write("State: starting\n");
  process.stdout.write(`Branch: ${managedWorktree.branch}\n`);
  process.stdout.write(`Base: ${managedWorktree.baseBranch}\n`);
  process.stdout.write(`Task: ${taskSummary}\n`);
  process.stdout.write(`Spec: ${taskSpec.relativePath}\n`);
  process.stdout.write(`Worktree: ${formatRelativePath(config.project.root, managedWorktree.path)}\n`);
  process.stdout.write(`Runtime: ${formatRuntimeCommandForOperator(runtimeSession, task)}\n`);
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

function formatRuntimeCommandForOperator(runtimeSession: SpawnedRuntimeProcess, task: string): string {
  const args = [...runtimeSession.command.args];

  if (args.at(-1) === task) {
    args.pop();
  }

  return [runtimeSession.command.command, ...args].join(" ");
}

async function loadTask(options: Pick<SlingOptions, "task" | "taskFile" | "startDir">): Promise<string> {
  if (typeof options.task === "string" && typeof options.taskFile === "string") {
    throw new SlingError("Choose exactly one task source: use either '--task <instruction>' or '--task-file <path>'.");
  }

  if (typeof options.taskFile === "string") {
    return validateTask(await readTaskFile(options.taskFile, options.startDir));
  }

  return validateTask(options.task);
}

async function readTaskFile(taskFile: string, startDir?: string): Promise<string> {
  const resolvedPath = resolve(startDir ?? process.cwd(), taskFile);

  try {
    return await readFile(resolvedPath, "utf8");
  } catch (error) {
    throw new SlingError(`Failed to read task file '${taskFile}': ${formatErrorMessage(error)}`);
  }
}

function validateTask(task: string | undefined): string {
  if (typeof task !== "string" || task.trim().length === 0) {
    throw new SlingError(
      "Missing task. Use exactly one of '--task <instruction>' or '--task-file <path>' to hand off one explicit task."
    );
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

async function persistRunUpdateBestEffort(
  projectRoot: string,
  sessionId: string,
  input: UpdateRunInput,
  updateRunRecord: (projectRoot: string, input: UpdateRunInput) => Promise<unknown>
): Promise<void> {
  try {
    await updateRunRecord(projectRoot, input);
  } catch (error) {
    process.stderr.write(`WARN: failed to persist run state for session '${sessionId}': ${formatErrorMessage(error)}\n`);
  }
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
