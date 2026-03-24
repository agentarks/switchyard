import process from "node:process";
import type { RunOutcome } from "../runs/types.js";
import type { SessionRecord, SessionState } from "../sessions/types.js";
import { updateOrchestrationRun, updateTaskRecord } from "./store.js";
import type { OrchestrationRunOutcome, OrchestrationRunState, TaskState } from "./types.js";

export async function syncOrchestrationSessionStateBestEffort(
  projectRoot: string,
  session: Pick<SessionRecord, "id" | "runId" | "objectiveTaskId">,
  sessionState: SessionState,
  updatedAt: string,
  legacyOutcome?: RunOutcome | null
): Promise<void> {
  if (!session.runId || !session.objectiveTaskId) {
    return;
  }

  const derived = deriveOrchestrationState(sessionState, legacyOutcome);

  try {
    await updateOrchestrationRun(projectRoot, {
      id: session.runId,
      state: derived.runState,
      outcome: derived.runOutcome,
      updatedAt
    });
    await updateTaskRecord(projectRoot, {
      runId: session.runId,
      id: session.objectiveTaskId,
      state: derived.taskState,
      updatedAt
    });
  } catch (error) {
    process.stderr.write(
      `WARN: failed to persist orchestration state for session '${session.id}': ${formatErrorMessage(error)}\n`
    );
  }
}

export async function syncOrchestrationLaunchFailureBestEffort(
  projectRoot: string,
  input: { sessionId: string; runId?: string; taskId?: string; updatedAt: string }
): Promise<void> {
  if (!input.runId || !input.taskId) {
    return;
  }

  try {
    await updateOrchestrationRun(projectRoot, {
      id: input.runId,
      state: "failed",
      outcome: "failed",
      updatedAt: input.updatedAt
    });
    await updateTaskRecord(projectRoot, {
      runId: input.runId,
      id: input.taskId,
      state: "blocked",
      updatedAt: input.updatedAt
    });
  } catch (error) {
    process.stderr.write(
      `WARN: failed to persist orchestration state for session '${input.sessionId}': ${formatErrorMessage(error)}\n`
    );
  }
}

function deriveOrchestrationState(
  sessionState: SessionState,
  legacyOutcome?: RunOutcome | null
): {
  runState: OrchestrationRunState;
  runOutcome: OrchestrationRunOutcome | null;
  taskState: TaskState;
} {
  if (sessionState === "starting" || sessionState === "running") {
    return {
      runState: "dispatching",
      runOutcome: null,
      taskState: "in_progress"
    };
  }

  if (legacyOutcome === "merged") {
    return {
      runState: "merged",
      runOutcome: "merged",
      taskState: "completed"
    };
  }

  if (sessionState === "failed" || legacyOutcome === "failed" || legacyOutcome === "launch_failed") {
    return {
      runState: "failed",
      runOutcome: "failed",
      taskState: "blocked"
    };
  }

  return {
    runState: "blocked",
    runOutcome: "blocked",
    taskState: "completed"
  };
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
