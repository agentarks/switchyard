import { relative } from "node:path";
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { listLatestEventsBySession, recordEventBestEffort, type EventRecorder } from "../events/store.js";
import type { EventPayloadValue, EventRecord } from "../events/types.js";
import { isProcessAlive } from "../runtimes/process.js";
import { isActiveSessionState, type SessionRecord, type SessionState } from "../sessions/types.js";
import { listSessions, updateSessionState } from "../sessions/store.js";

interface StatusOptions {
  startDir?: string;
  isRuntimeAlive?: (pid: number) => boolean;
  recordEvent?: EventRecorder;
  now?: () => string;
}

export function createStatusCommand(): Command {
  return new Command("status")
    .description("Show active and recent agent sessions")
    .argument("[args...]", "Arguments reserved for future filter support")
    .action(async () => {
      await statusCommand();
    });
}

export async function statusCommand(options: StatusOptions = {}): Promise<void> {
  const config = await loadConfig(options.startDir);
  const reconciledEventsBySession = await reconcileSessionLifecycles(
    config.project.root,
    options.isRuntimeAlive ?? isProcessAlive,
    options.recordEvent ?? recordEventBestEffort,
    options.now ?? (() => new Date().toISOString())
  );
  const sessions = await listSessions(config.project.root);

  if (sessions.length === 0) {
    process.stdout.write("No Switchyard sessions recorded yet.\n");
    return;
  }

  const latestEventsBySession = await listLatestEventsBySession(
    config.project.root,
    sessions.map((session) => session.id)
  );

  process.stdout.write(`Sessions for ${config.project.name}:\n`);
  process.stdout.write("STATE\tAGENT\tBRANCH\tWORKTREE\tUPDATED\tRECENT\n");

  for (const session of sessions) {
    const worktree = formatWorktreePath(config.project.root, session.worktreePath);
    const recentEvent = formatRecentEventSummary(
      reconciledEventsBySession.get(session.id) ?? latestEventsBySession.get(session.id)
    );
    process.stdout.write(
      `${session.state}\t${session.agentName}\t${session.branch}\t${worktree}\t${session.updatedAt}\t${recentEvent}\n`
    );
  }
}

async function reconcileSessionLifecycles(
  projectRoot: string,
  isRuntimeAlive: (pid: number) => boolean,
  recordEvent: EventRecorder,
  now: () => string
): Promise<Map<string, EventRecord>> {
  const sessions = await listSessions(projectRoot);
  const reconciledEventsBySession = new Map<string, EventRecord>();

  for (const session of sessions) {
    if (!isActiveSessionState(session.state)) {
      continue;
    }

    const createdAt = now();
    const nextState = determineNextLifecycleState(session, isRuntimeAlive);

    if (!nextState) {
      continue;
    }

    const nextSession = await updateSessionState(projectRoot, {
      id: session.id,
      state: nextState.state,
      runtimePid: nextState.runtimePid,
      updatedAt: createdAt
    });

    const reconciledEvent = buildReconciledEvent(nextSession, nextState.eventType, nextState.payload, createdAt);
    reconciledEventsBySession.set(nextSession.id, reconciledEvent);

    await recordEventBestEffortForStatus(recordEvent, projectRoot, {
      sessionId: nextSession.id,
      agentName: nextSession.agentName,
      eventType: nextState.eventType,
      createdAt,
      payload: nextState.payload
    });
  }

  return reconciledEventsBySession;
}

function formatWorktreePath(projectRoot: string, worktreePath: string): string {
  const relativePath = relative(projectRoot, worktreePath);
  return relativePath.length > 0 ? relativePath : ".";
}

function formatRecentEventSummary(event?: EventRecord): string {
  if (!event) {
    return "-";
  }

  const detailSummary = formatRecentEventDetails(event);
  const summary = detailSummary.length > 0
    ? `${event.createdAt} ${event.eventType} ${detailSummary}`
    : `${event.createdAt} ${event.eventType}`;

  return summary.length <= 120 ? summary : `${summary.slice(0, 117)}...`;
}

function formatRecentEventDetails(event: EventRecord): string {
  const selectedKeys = RECENT_EVENT_DETAIL_KEYS[event.eventType] ?? [];

  if (selectedKeys.length === 0) {
    return "";
  }

  return selectedKeys
    .filter((key) => key in event.payload)
    .map((key) => `${key}=${formatPayloadValue(event.payload[key])}`)
    .join(", ");
}

function formatPayloadValue(value: EventPayloadValue | undefined): string {
  if (typeof value === "string") {
    return /^[^,\s=]+$/.test(value) ? value : JSON.stringify(value);
  }

  return String(value);
}

function determineNextLifecycleState(
  session: SessionRecord,
  isRuntimeAlive: (pid: number) => boolean
): {
  state: SessionState;
  runtimePid: number | null;
  eventType: string;
  payload: Record<string, EventPayloadValue>;
} | undefined {
  if (typeof session.runtimePid !== "number") {
    return {
      state: "failed",
      runtimePid: null,
      eventType: session.state === "starting" ? "runtime.exited_early" : "runtime.exited",
      payload: {
        previousState: session.state,
        reason: "missing_runtime_pid"
      }
    };
  }

  if (session.state === "starting") {
    if (isRuntimeAlive(session.runtimePid)) {
      return {
        state: "running",
        runtimePid: session.runtimePid,
        eventType: "runtime.ready",
        payload: {
          previousState: session.state,
          runtimePid: session.runtimePid,
          signal: "pid_alive"
        }
      };
    }

    return {
      state: "failed",
      runtimePid: null,
      eventType: "runtime.exited_early",
      payload: {
        previousState: session.state,
        runtimePid: session.runtimePid,
        reason: "pid_not_alive"
      }
    };
  }

  if (isRuntimeAlive(session.runtimePid)) {
    return undefined;
  }

  return {
    state: "failed",
    runtimePid: null,
    eventType: "runtime.exited",
    payload: {
      previousState: session.state,
      runtimePid: session.runtimePid,
      reason: "pid_not_alive"
    }
  };
}

function buildReconciledEvent(
  session: SessionRecord,
  eventType: string,
  payload: Record<string, EventPayloadValue>,
  createdAt: string
): EventRecord {
  return {
    id: `status-reconciled:${session.id}:${createdAt}:${eventType}`,
    sessionId: session.id,
    agentName: session.agentName,
    eventType,
    payload,
    createdAt
  };
}

async function recordEventBestEffortForStatus(
  recordEvent: EventRecorder,
  projectRoot: string,
  event: Omit<EventRecord, "id">
): Promise<void> {
  try {
    await recordEvent(projectRoot, event);
  } catch (error) {
    process.stderr.write(`WARN: failed to persist event '${event.eventType}': ${formatErrorMessage(error)}\n`);
  }
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const RECENT_EVENT_DETAIL_KEYS: Record<string, string[]> = {
  "mail.checked": ["unreadCount"],
  "mail.sent": ["sender", "bodyLength"],
  "runtime.exited": ["reason", "runtimePid"],
  "runtime.exited_early": ["reason", "runtimePid"],
  "runtime.ready": ["signal", "runtimePid"],
  "sling.completed": ["runtimePid", "readyAfterMs"],
  "sling.failed": ["errorMessage", "cleanupSucceeded"],
  "sling.spawned": ["runtimePid"],
  "stop.completed": ["outcome", "cleanupPerformed"]
};
