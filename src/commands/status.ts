import { relative } from "node:path";
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { listLatestEventsBySession, recordEventBestEffort, type EventRecorder } from "../events/store.js";
import type { EventPayloadValue, EventRecord } from "../events/types.js";
import { StatusError } from "../errors.js";
import { listUnreadMailCountsBySession } from "../mail/store.js";
import { isProcessAlive } from "../runtimes/process.js";
import { getCleanupReadinessLabel } from "../sessions/cleanup.js";
import { isActiveSessionState, type SessionRecord, type SessionState } from "../sessions/types.js";
import { getSessionById, listSessions, updateSessionState } from "../sessions/store.js";
import { formatSessionSelectorAmbiguousMessage, resolveSessionByIdOrAgent } from "./session-selector.js";

interface StatusOptions {
  selector?: string;
  startDir?: string;
  isRuntimeAlive?: (pid: number) => boolean;
  listUnreadMailCounts?: (projectRoot: string, sessionIds: string[]) => Promise<Map<string, number>>;
  recordEvent?: EventRecorder;
  getCleanupReadiness?: (options: {
    projectRoot: string;
    canonicalBranch: string;
    session: SessionRecord;
  }) => Promise<string>;
  now?: () => string;
}

export function createStatusCommand(): Command {
  return new Command("status")
    .description("Show active and recent agent sessions")
    .argument("[session]", "Optional session id or agent name")
    .action(async (selector: string | undefined) => {
      await statusCommand({ selector });
    });
}

export async function statusCommand(options: StatusOptions = {}): Promise<void> {
  const config = await loadConfig(options.startDir);
  const selectedSession = options.selector
    ? await resolveSession(config.project.root, options.selector)
    : undefined;

  if (options.selector && !selectedSession) {
    throw new StatusError(`No session found for '${options.selector}'.`);
  }

  const initialSessions = selectedSession
    ? [selectedSession]
    : await listSessions(config.project.root);

  if (initialSessions.length === 0) {
    process.stdout.write("No Switchyard sessions recorded yet.\n");
    return;
  }

  const reconciledEventsBySession = await reconcileSessionLifecycles(
    config.project.root,
    initialSessions,
    options.isRuntimeAlive ?? isProcessAlive,
    options.recordEvent ?? recordEventBestEffort,
    options.now ?? (() => new Date().toISOString())
  );
  const sessions = selectedSession
    ? [await reloadSession(config.project.root, selectedSession.id)]
    : await listSessions(config.project.root);

  const sessionIds = sessions.map((session) => session.id);
  const latestEventsBySession = await listLatestEventsBySession(config.project.root, sessionIds);
  const unreadMailCounts = await loadUnreadMailCountsBestEffort(
    config.project.root,
    sessionIds,
    options.listUnreadMailCounts ?? listUnreadMailCountsBySession
  );
  const cleanupReadiness = await loadCleanupReadinessBestEffort(
    config.project.root,
    config.project.canonicalBranch,
    sessions,
    options.getCleanupReadiness ?? getCleanupReadinessLabel
  );

  process.stdout.write(`${formatStatusHeading(config.project.name, sessions.length === 1 ? sessions[0] : undefined, selectedSession !== undefined)}\n`);

  if (selectedSession) {
    const session = sessions[0];

    if (session) {
      const unreadCount = unreadMailCounts.available
        ? String(unreadMailCounts.countsBySession.get(session.id) ?? 0)
        : "?";
      const cleanup = cleanupReadiness.get(session.id) ?? "?";
      const recentEvent = reconciledEventsBySession.get(session.id) ?? latestEventsBySession.get(session.id);

      process.stdout.write(`Base: ${formatOptionalField(session.baseBranch)}\n`);
      process.stdout.write(`Runtime pid: ${formatOptionalField(session.runtimePid)}\n`);
      process.stdout.write(`Created: ${session.createdAt}\n`);
      process.stdout.write(`Unread: ${unreadCount}\n`);
      process.stdout.write(`Cleanup: ${cleanup}\n`);
      process.stdout.write(`Recent: ${formatRecentEventSummary(recentEvent, { truncate: false })}\n`);
    }
  }

  process.stdout.write("STATE\tSESSION\tAGENT\tBRANCH\tWORKTREE\tUPDATED\tUNREAD\tCLEANUP\tRECENT\n");

  for (const session of sessions) {
    const worktree = formatWorktreePath(config.project.root, session.worktreePath);
    const unreadCount = unreadMailCounts.available
      ? String(unreadMailCounts.countsBySession.get(session.id) ?? 0)
      : "?";
    const cleanup = cleanupReadiness.get(session.id) ?? "?";
    const recentEvent = formatRecentEventSummary(
      reconciledEventsBySession.get(session.id) ?? latestEventsBySession.get(session.id)
    );
    process.stdout.write(
      `${session.state}\t${session.id}\t${session.agentName}\t${session.branch}\t${worktree}\t${session.updatedAt}\t${unreadCount}\t${cleanup}\t${recentEvent}\n`
    );
  }
}

async function loadUnreadMailCountsBestEffort(
  projectRoot: string,
  sessionIds: string[],
  listUnreadMailCounts: (projectRoot: string, sessionIds: string[]) => Promise<Map<string, number>>
): Promise<{ countsBySession: Map<string, number>; available: boolean }> {
  try {
    return {
      countsBySession: await listUnreadMailCounts(projectRoot, sessionIds),
      available: true
    };
  } catch (error) {
    process.stderr.write(`WARN: failed to load unread mail counts: ${formatErrorMessage(error)}\n`);
    return {
      countsBySession: new Map(),
      available: false
    };
  }
}

async function loadCleanupReadinessBestEffort(
  projectRoot: string,
  canonicalBranch: string,
  sessions: SessionRecord[],
  getCleanupReadiness: (options: {
    projectRoot: string;
    canonicalBranch: string;
    session: SessionRecord;
  }) => Promise<string>
): Promise<Map<string, string>> {
  const cleanupReadinessBySession = new Map<string, string>();

  for (const session of sessions) {
    try {
      cleanupReadinessBySession.set(session.id, await getCleanupReadiness({
        projectRoot,
        canonicalBranch,
        session
      }));
    } catch (error) {
      process.stderr.write(
        `WARN: failed to evaluate cleanup readiness for session '${session.id}': ${formatErrorMessage(error)}\n`
      );
      cleanupReadinessBySession.set(session.id, "?");
    }
  }

  return cleanupReadinessBySession;
}

async function reconcileSessionLifecycles(
  projectRoot: string,
  sessions: SessionRecord[],
  isRuntimeAlive: (pid: number) => boolean,
  recordEvent: EventRecorder,
  now: () => string
): Promise<Map<string, EventRecord>> {
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

async function resolveSession(projectRoot: string, selector: string): Promise<SessionRecord | undefined> {
  return await resolveSessionByIdOrAgent(projectRoot, selector, (ambiguity) => {
    return new StatusError(formatSessionSelectorAmbiguousMessage(selector, ambiguity));
  });
}

async function reloadSession(projectRoot: string, sessionId: string): Promise<SessionRecord> {
  const session = await getSessionById(projectRoot, sessionId);

  if (!session) {
    throw new StatusError(`Session '${sessionId}' disappeared while rendering status.`);
  }

  return session;
}

function formatStatusHeading(projectName: string, session: SessionRecord | undefined, selected: boolean): string {
  if (selected && session) {
    return `Status for ${session.agentName} (${session.id}):`;
  }

  return `Sessions for ${projectName}:`;
}

function formatOptionalField(value: number | string | null | undefined): string {
  if (typeof value === "undefined" || value === null) {
    return "-";
  }

  return String(value);
}

function formatWorktreePath(projectRoot: string, worktreePath: string): string {
  const relativePath = relative(projectRoot, worktreePath);
  return relativePath.length > 0 ? relativePath : ".";
}

function formatRecentEventSummary(
  event?: EventRecord,
  options: {
    truncate?: boolean;
  } = {}
): string {
  if (!event) {
    return "-";
  }

  const detailSummary = formatRecentEventDetails(event);
  const summary = detailSummary.length > 0
    ? `${event.createdAt} ${event.eventType} ${detailSummary}`
    : `${event.createdAt} ${event.eventType}`;

  if (options.truncate === false || summary.length <= 120) {
    return summary;
  }

  return `${summary.slice(0, 117)}...`;
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
  "mail.listed": ["view", "messageCount", "unreadCount"],
  "mail.sent": ["sender", "bodyLength"],
  "merge.completed": ["canonicalBranch", "branch"],
  "merge.failed": ["reason", "conflictCount", "firstConflictPath", "branch"],
  "merge.skipped": ["reason", "branch"],
  "runtime.exited": ["reason", "runtimePid"],
  "runtime.exited_early": ["reason", "runtimePid"],
  "runtime.ready": ["signal", "runtimePid"],
  "sling.completed": ["runtimePid", "baseBranch", "readyAfterMs"],
  "sling.failed": ["errorMessage", "cleanupSucceeded"],
  "sling.spawned": ["runtimePid", "baseBranch"],
  "stop.completed": ["outcome", "cleanupPerformed", "cleanupReason", "cleanupError"]
};
