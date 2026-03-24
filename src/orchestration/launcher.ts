import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import process from "node:process";
import { loadConfig } from "../config.js";
import { recordEventBestEffort, recordEventWithFallback, type EventRecorder } from "../events/store.js";
import { SlingError } from "../errors.js";
import { getSessionLogPath } from "../logs/path.js";
import { createRun, updateRun } from "../runs/store.js";
import type { RunRecord, UpdateRunInput } from "../runs/types.js";
import {
  buildCodexCommand,
  spawnCodexSession,
  type SpawnedRuntimeProcess,
  type SpawnedRuntimeSession
} from "../runtimes/codex/index.js";
import { stopProcess } from "../runtimes/process.js";
import { createSession } from "../sessions/store.js";
import type { SessionRecord } from "../sessions/types.js";
import { getRelativeTaskSpecPath, summarizeTask, writeTaskSpec, type TaskSpecRecord } from "../specs/task.js";
import { writeObjectiveSpec, type ObjectiveSpecRecord } from "../specs/objective.js";
import { createLeadWorktree, removeWorktree, type ManagedWorktree } from "../worktrees/manager.js";
import {
  createArtifactRecord,
  createOrchestrationRun,
  createTaskRecord
} from "./store.js";
import {
  getRelativeResultEnvelopePath,
  type LeadLaunchContract
} from "./contracts.js";
import { buildLeadPrompt } from "./prompt.js";
import type { OrchestrationRunRecord, TaskRecord } from "./types.js";

interface LaunchOrchestrationRunOptions {
  objective: string;
  startDir?: string;
  runtimeArgs?: string[];
  spawnRuntime?: (options: {
    agentName: string;
    logPath: string;
    runtimeArgs: string[];
    worktreePath: string;
    onSpawned?: (runtime: SpawnedRuntimeProcess) => Promise<void>;
  }) => Promise<SpawnedRuntimeSession>;
  recordEvent?: EventRecorder;
  updateRunRecord?: (projectRoot: string, input: UpdateRunInput) => Promise<unknown>;
  stopRuntime?: (pid: number) => Promise<boolean>;
  now?: () => string;
}

export interface OrchestrationLaunchResult {
  projectRoot: string;
  run: OrchestrationRunRecord;
  task: TaskRecord;
  session: SessionRecord;
  worktree: ManagedWorktree;
  objectiveSpec: ObjectiveSpecRecord;
  handoffSpec: TaskSpecRecord;
  resultEnvelopePath: string;
  sessionLogPath: string;
  sessionLogRelativePath: string;
  runtime: SpawnedRuntimeSession;
}

export async function launchOrchestrationRun(options: LaunchOrchestrationRunOptions): Promise<OrchestrationLaunchResult> {
  const config = await loadConfig(options.startDir);
  const recordEvent = options.recordEvent ?? recordEventBestEffort;
  const updateRunRecord = options.updateRunRecord ?? updateRun;
  const stopRuntime = options.stopRuntime ?? stopProcess;

  if (config.runtime.default !== "codex") {
    throw new SlingError(`Unsupported runtime '${config.runtime.default}'. Only 'codex' is implemented.`);
  }

  const createdAt = options.now?.() ?? new Date().toISOString();
  let lastLifecycleTimestamp = createdAt;
  const runId = `run-${randomUUID()}`;
  const leadTaskId = randomUUID();
  const sessionId = randomUUID();
  const worktree = await createLeadWorktree(config, runId);
  const objectiveSummary = summarizeTask(options.objective);
  const handoffSpecPath = getRelativeTaskSpecPath(config.project.root, worktree.agentName, sessionId);
  const objectiveSpecPath = `.switchyard/objectives/${runId}.md`;
  const resultEnvelopePath = getRelativeResultEnvelopePath(config.project.root, runId, "lead");
  const sessionLog = getSessionLogPath(config.project.root, worktree.agentName, sessionId);

  const contract: LeadLaunchContract = {
    runId,
    role: "lead",
    sessionId,
    objectiveTaskId: leadTaskId,
    targetBranch: config.project.canonicalBranch,
    integrationBranch: worktree.branch,
    integrationWorktreePath: formatRelativePath(config.project.root, worktree.path),
    objectiveSpecPath,
    resultEnvelopePath,
    mergePolicy: config.orchestration.mergePolicy,
    objective: options.objective
  };
  const handoffInstruction = buildLeadPrompt(contract, handoffSpecPath);

  let run: OrchestrationRunRecord | undefined;
  let task: TaskRecord | undefined;
  let objectiveSpec: ObjectiveSpecRecord | undefined;
  let handoffSpec: TaskSpecRecord | undefined;
  let legacyRun: RunRecord | undefined;
  let runtime: SpawnedRuntimeSession | undefined;

  try {
    run = await createOrchestrationRun(config.project.root, {
      id: runId,
      objective: options.objective.trimEnd(),
      targetBranch: config.project.canonicalBranch,
      integrationBranch: worktree.branch,
      integrationWorktreePath: worktree.path,
      mergePolicy: config.orchestration.mergePolicy,
      state: "planning",
      createdAt,
      updatedAt: createdAt
    });
    task = await createTaskRecord(config.project.root, {
      id: leadTaskId,
      runId,
      role: "lead",
      title: objectiveSummary,
      fileScope: [],
      state: "in_progress",
      assignedSessionId: sessionId,
      createdAt,
      updatedAt: createdAt
    });
    objectiveSpec = await writeObjectiveSpec({
      projectRoot: config.project.root,
      runId,
      createdAt,
      objective: options.objective,
      targetBranch: config.project.canonicalBranch,
      integrationBranch: worktree.branch,
      mergePolicy: config.orchestration.mergePolicy
    });
    handoffSpec = await writeTaskSpec({
      projectRoot: config.project.root,
      sessionId,
      agentName: worktree.agentName,
      task: handoffInstruction,
      createdAt,
      runId,
      role: "lead",
      objectiveTaskId: leadTaskId,
      taskSummary: objectiveSummary,
      targetBranch: config.project.canonicalBranch,
      integrationBranch: worktree.branch,
      branch: worktree.branch,
      baseBranch: worktree.baseBranch,
      worktreePath: worktree.path,
      objectiveSpecPath: objectiveSpec.relativePath,
      resultEnvelopePath,
      mergePolicy: config.orchestration.mergePolicy
    });
    legacyRun = await createRun(config.project.root, {
      sessionId,
      agentName: worktree.agentName,
      taskSummary: objectiveSpec.objectiveSummary,
      taskSpecPath: handoffSpec.relativePath,
      state: "starting",
      createdAt,
      updatedAt: createdAt
    });
    await persistArtifacts(config.project.root, {
      runId,
      taskId: leadTaskId,
      sessionId,
      objectiveSpecPath: objectiveSpec.relativePath,
      handoffSpecPath: handoffSpec.relativePath,
      logPath: sessionLog.relativePath,
      branch: worktree.branch,
      integrationWorktreePath: formatRelativePath(config.project.root, worktree.path),
      resultEnvelopePath,
      createdAt
    });
    const spawnedObjectiveSpec = objectiveSpec;
    const spawnedHandoffSpec = handoffSpec;

    const runtimeArgs = [...buildCodexCommand(options.runtimeArgs ?? []).args, handoffInstruction];
    const spawnRuntime = options.spawnRuntime ?? (async ({ runtimeArgs: launchArgs, logPath, worktreePath }) => {
      return await spawnCodexSession({ runtimeArgs: launchArgs, logPath, worktreePath });
    });

    runtime = await spawnRuntime({
      agentName: worktree.agentName,
      logPath: sessionLog.path,
      runtimeArgs,
      worktreePath: worktree.path,
      onSpawned: async (spawnedRuntime) => {
        const spawnedAt = nextLifecycleTimestamp(lastLifecycleTimestamp);
        lastLifecycleTimestamp = spawnedAt;

        await recordEventWithFallback(recordEvent, config.project.root, {
          sessionId,
          agentName: worktree.agentName,
          eventType: "sling.spawned",
          createdAt: spawnedAt,
          payload: {
            runId,
            role: "lead",
            branch: worktree.branch,
            baseBranch: worktree.baseBranch,
            worktreePath: formatRelativePath(config.project.root, worktree.path),
            taskSummary: spawnedObjectiveSpec.objectiveSummary,
            taskSpecPath: spawnedHandoffSpec.relativePath,
            objectiveSpecPath: spawnedObjectiveSpec.relativePath,
            resultEnvelopePath,
            logPath: sessionLog.relativePath,
            runtimePid: spawnedRuntime.pid,
            runtimeCommand: formatRuntimeCommandForOperator(spawnedRuntime, handoffInstruction)
          }
        });
      }
    });
  } catch (error) {
    const cleanupError = await cleanupFailedLaunch(config.project.root, worktree);
    const failedAt = nextLifecycleTimestamp(lastLifecycleTimestamp);

    await createSession(config.project.root, {
      id: sessionId,
      runId,
      role: "lead",
      objectiveTaskId: leadTaskId,
      agentName: worktree.agentName,
      branch: worktree.branch,
      baseBranch: worktree.baseBranch,
      worktreePath: worktree.path,
      state: "failed",
      createdAt,
      updatedAt: failedAt
    });

    await recordEventWithFallback(recordEvent, config.project.root, {
      sessionId,
      agentName: worktree.agentName,
      eventType: "sling.failed",
      createdAt: failedAt,
      payload: {
        runId,
        role: "lead",
        branch: worktree.branch,
        worktreePath: formatRelativePath(config.project.root, worktree.path),
        taskSummary: objectiveSummary,
        taskSpecPath: handoffSpec?.relativePath ?? handoffSpecPath,
        objectiveSpecPath: objectiveSpec?.relativePath ?? objectiveSpecPath,
        resultEnvelopePath,
        logPath: sessionLog.relativePath,
        errorMessage: formatErrorMessage(error),
        cleanupSucceeded: cleanupError ? false : true
      }
    });

    if (legacyRun) {
      await persistRunUpdateBestEffort(config.project.root, sessionId, {
        id: legacyRun.id,
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

  if (!objectiveSpec || !handoffSpec || !task || !run || !runtime) {
    throw new SlingError("Lead launch bootstrap did not complete.");
  }

  const completedAt = nextLifecycleTimestamp(lastLifecycleTimestamp);

  let session: SessionRecord;
  try {
    session = await createSession(config.project.root, {
      id: sessionId,
      runId,
      role: "lead",
      objectiveTaskId: leadTaskId,
      agentName: worktree.agentName,
      branch: worktree.branch,
      baseBranch: worktree.baseBranch,
      worktreePath: worktree.path,
      state: "starting",
      runtimePid: runtime.pid,
      createdAt,
      updatedAt: completedAt
    });
  } catch (error) {
    const failedAt = nextLifecycleTimestamp(completedAt);
    const teardown = await cleanupPostSpawnPersistenceFailure({
      projectRoot: config.project.root,
      worktree,
      runtimePid: runtime.pid,
      stopRuntime
    });

    await recordEventWithFallback(recordEvent, config.project.root, {
      sessionId,
      agentName: worktree.agentName,
      eventType: "sling.failed",
      createdAt: failedAt,
      payload: {
        runId,
        role: "lead",
        branch: worktree.branch,
        worktreePath: formatRelativePath(config.project.root, worktree.path),
        taskSummary: objectiveSpec.objectiveSummary,
        taskSpecPath: handoffSpec.relativePath,
        objectiveSpecPath: objectiveSpec.relativePath,
        resultEnvelopePath,
        logPath: sessionLog.relativePath,
        errorMessage: formatErrorMessage(error),
        runtimePid: runtime.pid,
        runtimeStopped: teardown.stopError ? false : true,
        cleanupSucceeded: teardown.cleanupError ? false : true
      }
    });

    if (legacyRun) {
      await persistRunUpdateBestEffort(config.project.root, sessionId, {
        id: legacyRun.id,
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
    agentName: worktree.agentName,
    eventType: "sling.completed",
    createdAt: completedAt,
    payload: {
      runId,
      role: "lead",
      branch: worktree.branch,
      baseBranch: worktree.baseBranch,
      worktreePath: formatRelativePath(config.project.root, worktree.path),
      taskSummary: objectiveSpec.objectiveSummary,
      taskSpecPath: handoffSpec.relativePath,
      objectiveSpecPath: objectiveSpec.relativePath,
      resultEnvelopePath,
      logPath: sessionLog.relativePath,
      runtimePid: runtime.pid,
      runtimeCommand: formatRuntimeCommandForOperator(runtime, handoffInstruction),
      readyAfterMs: runtime.readyAfterMs
    }
  });

  if (legacyRun) {
    await persistRunUpdateBestEffort(config.project.root, sessionId, {
      id: legacyRun.id,
      state: "active",
      updatedAt: completedAt,
      finishedAt: null
    }, updateRunRecord);
  }

  return {
    projectRoot: config.project.root,
    run,
    task,
    session,
    worktree,
    objectiveSpec,
    handoffSpec,
    resultEnvelopePath,
    sessionLogPath: sessionLog.path,
    sessionLogRelativePath: sessionLog.relativePath,
    runtime
  };
}

async function persistArtifacts(projectRoot: string, input: {
  runId: string;
  taskId: string;
  sessionId: string;
  objectiveSpecPath: string;
  handoffSpecPath: string;
  logPath: string;
  branch: string;
  integrationWorktreePath: string;
  resultEnvelopePath: string;
  createdAt: string;
}): Promise<void> {
  let createdAt = input.createdAt;

  await createArtifactRecord(projectRoot, {
    id: randomUUID(),
    runId: input.runId,
    taskId: input.taskId,
    sessionId: input.sessionId,
    kind: "objective_spec",
    path: input.objectiveSpecPath,
    createdAt
  });
  createdAt = nextLifecycleTimestamp(createdAt);
  await createArtifactRecord(projectRoot, {
    id: randomUUID(),
    runId: input.runId,
    taskId: input.taskId,
    sessionId: input.sessionId,
    kind: "agent_handoff_spec",
    path: input.handoffSpecPath,
    createdAt
  });
  createdAt = nextLifecycleTimestamp(createdAt);
  await createArtifactRecord(projectRoot, {
    id: randomUUID(),
    runId: input.runId,
    taskId: input.taskId,
    sessionId: input.sessionId,
    kind: "session_log",
    path: input.logPath,
    createdAt
  });
  createdAt = nextLifecycleTimestamp(createdAt);
  await createArtifactRecord(projectRoot, {
    id: randomUUID(),
    runId: input.runId,
    taskId: input.taskId,
    sessionId: input.sessionId,
    kind: "branch",
    path: input.branch,
    createdAt
  });
  createdAt = nextLifecycleTimestamp(createdAt);
  await createArtifactRecord(projectRoot, {
    id: randomUUID(),
    runId: input.runId,
    taskId: input.taskId,
    sessionId: input.sessionId,
    kind: "integration_worktree",
    path: input.integrationWorktreePath,
    createdAt
  });
  createdAt = nextLifecycleTimestamp(createdAt);
  await createArtifactRecord(projectRoot, {
    id: randomUUID(),
    runId: input.runId,
    taskId: input.taskId,
    sessionId: input.sessionId,
    kind: "result_envelope",
    path: input.resultEnvelopePath,
    createdAt
  });
}

async function cleanupFailedLaunch(projectRoot: string, worktree: ManagedWorktree): Promise<Error | undefined> {
  try {
    await removeWorktree(projectRoot, worktree);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
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

function formatRelativePath(projectRoot: string, path: string): string {
  const relativePath = relative(projectRoot, path);
  return relativePath.length > 0 ? relativePath : ".";
}

function formatRuntimeCommandForOperator(runtimeSession: SpawnedRuntimeProcess, prompt: string): string {
  const args = [...runtimeSession.command.args];

  if (args.at(-1) === prompt) {
    args.pop();
  }

  return [runtimeSession.command.command, ...args].join(" ");
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
