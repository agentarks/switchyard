import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join, relative } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import {
  listEvents,
  listLatestEventsBySession,
  listLatestEventsBySessionForTypes,
  recordEventBestEffort,
  type EventRecorder
} from "../events/store.js";
import type { EventPayloadValue, EventRecord } from "../events/types.js";
import { StatusError } from "../errors.js";
import {
  listLatestInboundMailBySession,
  listLatestUnreadMailBySession,
  listUnreadMailCountsBySession
} from "../mail/store.js";
import { getSessionLogPath } from "../logs/path.js";
import type { MailRecord, UnreadMailSummary } from "../mail/types.js";
import { readCodexTerminalState } from "../runtimes/codex/log.js";
import { inspectProcessLiveness, isProcessAlive, type ProcessLiveness } from "../runtimes/process.js";
import { listLatestRunsBySession, updateLatestRunForSession } from "../runs/store.js";
import type { RunOutcome, RunRecord, UpdateRunInput } from "../runs/types.js";
import { getCleanupReadinessLabel } from "../sessions/cleanup.js";
import { isActiveSessionState, type SessionRecord, type SessionState } from "../sessions/types.js";
import { getSessionById, listSessions, updateSessionState } from "../sessions/store.js";
import { readTaskInstruction, readTaskSpecHandoff } from "../specs/task.js";
import { formatSessionSelectorAmbiguousMessage, resolveSessionByIdOrAgent } from "./session-selector.js";
import { syncOrchestrationSessionStateBestEffort } from "../orchestration/lifecycle.js";

interface StatusOptions {
  selector?: string;
  showTask?: boolean;
  startDir?: string;
  isRuntimeAlive?: (pid: number) => boolean;
  inspectRuntimeLiveness?: (pid: number) => ProcessLiveness;
  listUnreadMailCounts?: (projectRoot: string, sessionIds: string[]) => Promise<Map<string, number>>;
  listUnreadOperatorMailCounts?: (projectRoot: string, sessionIds: string[]) => Promise<Map<string, number>>;
  listLatestUnreadOperatorMail?: (projectRoot: string, sessionIds: string[]) => Promise<Map<string, UnreadMailSummary>>;
  listLatestRuntimeProgressEvents?: (
    projectRoot: string,
    sessionIds: string[],
    eventTypes: string[]
  ) => Promise<Map<string, EventRecord>>;
  listLatestMergeStatusEvents?: (
    projectRoot: string,
    sessionIds: string[],
    eventTypes: string[]
  ) => Promise<Map<string, EventRecord>>;
  listLatestInboundMail?: (
    projectRoot: string,
    sessionIds: string[],
    options?: { excludeSender?: string }
  ) => Promise<Map<string, MailRecord>>;
  listLatestRuns?: (projectRoot: string, sessionIds: string[]) => Promise<Map<string, RunRecord>>;
  updateLatestRun?: (projectRoot: string, sessionId: string, input: Omit<UpdateRunInput, "id">) => Promise<unknown>;
  recordEvent?: EventRecorder;
  getCleanupReadiness?: (options: {
    projectRoot: string;
    canonicalBranch: string;
    session: SessionRecord;
  }) => Promise<string>;
  now?: () => string;
}

interface DerivedStalledHint {
  kind: "stalled";
  idleSince: string;
  idleForMs: number;
}

interface DerivedNoVisibleProgressHint {
  kind: "no_visible_progress";
  sessionAgeMs: number;
}

type DerivedInspectHint = DerivedNoVisibleProgressHint | DerivedStalledHint;
type ReintegrationAssessmentLabel = "ready" | "needs-review" | "blocked" | "risky";

interface ReintegrationAssessment {
  label: ReintegrationAssessmentLabel;
  reason: string;
}

interface StatusRowContext {
  session: SessionRecord;
  unreadCount: string;
  cleanup: string;
  latestRun?: RunRecord;
  review?: ReintegrationAssessment;
  followUp: string;
  recentEvent?: EventRecord;
  unreadOperatorMailSummary?: UnreadMailSummary;
  inspectHint?: DerivedInspectHint;
  activityAt: string;
}

interface SelectedSessionArtifacts {
  branch: "present" | "absent";
  worktree: "present" | "absent";
  log: "present" | "absent";
  spec: "present" | "absent" | "unknown";
}

const execFileAsync = promisify(execFile);
const NO_VISIBLE_PROGRESS_THRESHOLD_MS = 5 * 60 * 1000;
const NO_VISIBLE_PROGRESS_READY_EVENT_TYPES = [
  "sling.completed",
  "runtime.ready"
] as const;
const STALLED_SESSION_THRESHOLD_MS = 30 * 60 * 1000;
const RUNTIME_PROGRESS_EVENT_TYPES = [
  "sling.spawned",
  "sling.completed",
  "sling.failed",
  "runtime.ready",
  "runtime.completed",
  "runtime.failed",
  "runtime.exited",
  "runtime.exited_early"
] as const;
const MERGE_STATUS_EVENT_TYPES = [
  "merge.failed",
  "merge.completed"
] as const;
const RUNTIME_PROGRESS_EVENT_TYPE_SET = new Set<string>(RUNTIME_PROGRESS_EVENT_TYPES);
const MERGE_STATUS_EVENT_TYPE_SET = new Set<string>(MERGE_STATUS_EVENT_TYPES);

export function createStatusCommand(): Command {
  return new Command("status")
    .description("Show active and recent agent sessions")
    .argument("[session]", "Optional session id or agent name")
    .option("--task", "Show the full stored launch task for one selected session")
    .action(async (selector: string | undefined, commandOptions: { task?: boolean }) => {
      await statusCommand({ selector, showTask: commandOptions.task === true });
    });
}

export async function statusCommand(options: StatusOptions = {}): Promise<void> {
  if (options.showTask && !options.selector) {
    throw new StatusError("Full task inspection requires an exact session selector. Use 'sy status <session> --task'.");
  }

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

  const latestEventsBeforeReconcile = await listLatestEventsBySession(
    config.project.root,
    initialSessions.map((session) => session.id)
  );
  const reconciledEventsBySession = await reconcileSessionLifecycles(
    config.project.root,
    initialSessions,
    options.inspectRuntimeLiveness ?? createRuntimeLivenessInspector(options.isRuntimeAlive ?? isProcessAlive),
    options.updateLatestRun ?? updateLatestRunForSession,
    options.recordEvent ?? recordEventBestEffort,
    options.now ?? (() => new Date().toISOString())
  );
  const sessions = selectedSession
    ? [await reloadSession(config.project.root, selectedSession.id)]
    : await listSessions(config.project.root);

  const sessionIds = sessions.map((session) => session.id);
  const latestEventsBySession = await listLatestEventsBySession(config.project.root, sessionIds);
  const latestRuntimeProgressEvents = await loadLatestEventsBestEffort(
    config.project.root,
    sessionIds,
    options.listLatestRuntimeProgressEvents ?? listLatestEventsBySessionForTypes,
    [...RUNTIME_PROGRESS_EVENT_TYPES],
    "latest runtime progress events"
  );
  const latestMergeStatusEvents = await loadLatestMergeStatusEventsBestEffort(
    config.project.root,
    sessionIds,
    options.listLatestMergeStatusEvents ?? listLatestEventsBySessionForTypes
  );
  const latestInboundMail = await loadLatestInboundMailBestEffort(
    config.project.root,
    sessionIds,
    options.listLatestInboundMail ?? listLatestInboundMailBySession,
    "latest inbound mail"
  );
  const noVisibleProgressHints = latestInboundMail.available
    ? await loadNoVisibleProgressHints(
      config.project.root,
      sessions,
      latestInboundMail.mailBySession,
      (options.now ?? (() => new Date().toISOString()))()
    )
    : new Map<string, DerivedNoVisibleProgressHint>();
  const latestRuns = await loadLatestRunsBestEffort(
    config.project.root,
    sessionIds,
    options.listLatestRuns ?? listLatestRunsBySession
  );
  const unreadOperatorMailCounts = await loadUnreadMailCountsBestEffort(
    config.project.root,
    sessionIds,
    options.listUnreadOperatorMailCounts ?? ((projectRoot, mailSessionIds) => {
      return listUnreadMailCountsBySession(projectRoot, mailSessionIds, { recipient: "operator" });
    }),
    "operator unread mail counts"
  );
  const unreadOperatorMailSummaries = await loadUnreadMailSummariesBestEffort(
    config.project.root,
    sessionIds,
    options.listLatestUnreadOperatorMail ?? ((projectRoot, mailSessionIds) => {
      return listLatestUnreadMailBySession(projectRoot, mailSessionIds, { recipient: "operator" });
    }),
    "operator unread mail summaries"
  );
  const unreadMailCounts = await loadUnreadMailCountsBestEffort(
    config.project.root,
    sessionIds,
    options.listUnreadMailCounts ?? listUnreadMailCountsBySession,
    "unread mail counts"
  );
  const effectiveUnreadOperatorMailSummaries = unreadMailCounts.available
    && unreadOperatorMailCounts.available
    && unreadOperatorMailSummaries.available
    ? unreadOperatorMailSummaries.summariesBySession
    : new Map<string, UnreadMailSummary>();
  const cleanupReadiness = await loadCleanupReadinessBestEffort(
    config.project.root,
    config.project.canonicalBranch,
    sessions,
    options.getCleanupReadiness ?? getCleanupReadinessLabel
  );
  const selectedSessionDetails = await loadSelectedSessionDetails(
    config.project.root,
    selectedSession ? sessions[0] : undefined,
    options.showTask === true
  );
  const rowContexts = buildStatusRowContexts({
    sessions,
    unreadMailCounts: unreadMailCounts.available ? unreadMailCounts.countsBySession : undefined,
    cleanupReadiness,
    latestRuns: latestRuns.available ? latestRuns.runsBySession : undefined,
    unreadOperatorMailCounts: unreadMailCounts.available && unreadOperatorMailCounts.available
      ? unreadOperatorMailCounts.countsBySession
      : undefined,
    latestEventsBeforeReconcile,
    latestEventsBySession,
    reconciledEventsBySession,
    unreadOperatorMailSummaries: effectiveUnreadOperatorMailSummaries,
    latestRuntimeProgressEvents: latestRuntimeProgressEvents.available ? latestRuntimeProgressEvents.eventsBySession : undefined,
    latestMergeStatusEvents,
    latestInboundMail: latestInboundMail.available ? latestInboundMail.mailBySession : undefined,
    noVisibleProgressHints,
    now: (options.now ?? (() => new Date().toISOString()))()
  });

  process.stdout.write(`${formatStatusHeading(config.project.name, sessions.length === 1 ? sessions[0] : undefined, selectedSession !== undefined)}\n`);

  if (selectedSession) {
    const session = sessions[0];
    const rowContext = session ? rowContexts.get(session.id) : undefined;

    if (session && rowContext) {
      const summary = formatSelectedSessionSummary(rowContext);
      const artifacts = await inspectSelectedSessionArtifacts(
        config.project.root,
        session,
        selectedSessionDetails?.taskHandoff?.taskSpecPath
      );

      process.stdout.write(`Base: ${formatOptionalField(session.baseBranch)}\n`);
      process.stdout.write(`Runtime pid: ${formatOptionalField(session.runtimePid)}\n`);
      process.stdout.write(`Runtime: ${selectedSessionDetails?.taskHandoff?.runtimeCommand ?? "-"}\n`);
      process.stdout.write(`Created: ${session.createdAt}\n`);
      process.stdout.write(`Task: ${selectedSessionDetails?.taskHandoff?.taskSummary ?? "-"}\n`);
      process.stdout.write(`Spec: ${selectedSessionDetails?.taskHandoff?.taskSpecPath ?? "-"}\n`);
      process.stdout.write(`Log: ${getSessionLogPath(config.project.root, session.agentName, session.id).relativePath}\n`);
      process.stdout.write(`Unread: ${rowContext.unreadCount}\n`);
      process.stdout.write(`Cleanup: ${rowContext.cleanup}\n`);
      process.stdout.write(`Run: ${formatRunSummary(rowContext.latestRun, latestRuns.available)}\n`);
      process.stdout.write(`Summary: ${summary}\n`);
      process.stdout.write(`Artifacts: ${formatSelectedSessionArtifacts(artifacts)}\n`);
      if (rowContext.review) {
        process.stdout.write(`Review: ${rowContext.review.label}\n`);
        process.stdout.write(`Why: ${rowContext.review.reason}\n`);
      }
      process.stdout.write(`Next: ${rowContext.followUp}\n`);
      process.stdout.write(
        `Recent: ${formatRelevantRecentSummary(
          rowContext.recentEvent,
          rowContext.unreadOperatorMailSummary,
          rowContext.inspectHint,
          { truncate: false }
        )}\n`
      );

      if (options.showTask) {
        process.stdout.write("\nInstruction:\n");
        process.stdout.write(`${selectedSessionDetails?.taskInstruction}\n`);
      }
    }
  }

  if (selectedSession && options.showTask) {
    process.stdout.write("\n");
  }

  const orderedRowContexts = [...rowContexts.values()].sort(compareStatusRowContexts);

  process.stdout.write("STATE\tSESSION\tAGENT\tBRANCH\tWORKTREE\tUPDATED\tUNREAD\tCLEANUP\tTASK\tRUN\tREVIEW\tNEXT\tRECENT\n");

  for (const rowContext of orderedRowContexts) {
    const session = rowContext.session;
    const worktree = formatWorktreePath(config.project.root, session.worktreePath);
    process.stdout.write(
        `${session.state}\t${session.id}\t${session.agentName}\t${session.branch}\t${worktree}\t${rowContext.activityAt}\t${rowContext.unreadCount}\t${rowContext.cleanup}\t${formatTaskSummary(rowContext.latestRun, latestRuns.available)}\t${formatRunSummary(rowContext.latestRun, latestRuns.available)}\t${rowContext.review?.label ?? "-"}\t${rowContext.followUp}\t${formatRelevantRecentSummary(
        rowContext.recentEvent,
        rowContext.unreadOperatorMailSummary,
        rowContext.inspectHint
      )}\n`
    );
  }
}

function buildStatusRowContexts(options: {
  sessions: SessionRecord[];
  unreadMailCounts?: Map<string, number>;
  cleanupReadiness: Map<string, string>;
  latestRuns?: Map<string, RunRecord>;
  unreadOperatorMailCounts?: Map<string, number>;
  latestEventsBeforeReconcile: Map<string, EventRecord>;
  latestEventsBySession: Map<string, EventRecord>;
  reconciledEventsBySession: Map<string, EventRecord>;
  unreadOperatorMailSummaries: Map<string, UnreadMailSummary>;
  latestRuntimeProgressEvents?: Map<string, EventRecord>;
  latestMergeStatusEvents?: Map<string, EventRecord>;
  latestInboundMail?: Map<string, MailRecord>;
  noVisibleProgressHints: Map<string, DerivedNoVisibleProgressHint>;
  now: string;
}): Map<string, StatusRowContext> {
  const rowContexts = new Map<string, StatusRowContext>();

  for (const session of options.sessions) {
    const latestRun = options.latestRuns?.get(session.id);
    const unreadOperatorCount = options.unreadOperatorMailCounts?.get(session.id);
    const recentEvent = selectRecentEventForStatus({
      latestEventBeforeReconcile: options.latestEventsBeforeReconcile.get(session.id),
      latestStoredEvent: options.latestEventsBySession.get(session.id),
      reconciledEvent: options.reconciledEventsBySession.get(session.id)
    });
    const latestRuntimeProgressEvent = selectLatestRuntimeProgressEvent({
      latestStoredRuntimeProgressEvent: options.latestRuntimeProgressEvents?.get(session.id),
      reconciledEvent: options.reconciledEventsBySession.get(session.id)
    });
    const latestMergeStatusEvent = options.latestMergeStatusEvents?.get(session.id);
    const stalledHint = deriveStalledHint({
      session,
      latestRuntimeProgressEvent,
      latestInboundMail: options.latestInboundMail?.get(session.id),
      now: options.now
    });
    const inspectHint = selectInspectHint(options.noVisibleProgressHints.get(session.id), stalledHint);
    const unreadOperatorMailSummary = options.unreadOperatorMailSummaries.get(session.id);
    const cleanup = options.cleanupReadiness.get(session.id) ?? "?";
    const followUp = formatFollowUpAction(session, latestRun, cleanup, unreadOperatorCount, inspectHint);
    const review = deriveReintegrationAssessment({
      session,
      latestRun,
      cleanup,
      followUp,
      recentEvent,
      latestMergeStatusEvent
    });

    rowContexts.set(session.id, {
      session,
      unreadCount: typeof options.unreadMailCounts === "undefined"
        ? "?"
        : String(options.unreadMailCounts.get(session.id) ?? 0),
      cleanup,
      latestRun,
      review,
      followUp,
      recentEvent,
      unreadOperatorMailSummary,
      inspectHint,
      activityAt: deriveStatusActivityTimestamp(session, recentEvent, unreadOperatorMailSummary)
    });
  }

  return rowContexts;
}

async function loadNoVisibleProgressHints(
  projectRoot: string,
  sessions: SessionRecord[],
  latestInboundMailBySession: Map<string, MailRecord>,
  now: string
): Promise<Map<string, DerivedNoVisibleProgressHint>> {
  const hints = new Map<string, DerivedNoVisibleProgressHint>();

  for (const session of sessions) {
    const hint = await deriveNoVisibleProgressHint({
      projectRoot,
      session,
      latestInboundMail: latestInboundMailBySession.get(session.id),
      now
    });

    if (hint) {
      hints.set(session.id, hint);
    }
  }

  return hints;
}

async function loadUnreadMailCountsBestEffort(
  projectRoot: string,
  sessionIds: string[],
  listUnreadMailCounts: (projectRoot: string, sessionIds: string[]) => Promise<Map<string, number>>,
  label = "unread mail counts"
): Promise<{ countsBySession: Map<string, number>; available: boolean }> {
  try {
    return {
      countsBySession: await listUnreadMailCounts(projectRoot, sessionIds),
      available: true
    };
  } catch (error) {
    process.stderr.write(`WARN: failed to load ${label}: ${formatErrorMessage(error)}\n`);
    return {
      countsBySession: new Map(),
      available: false
    };
  }
}

async function loadLatestRunsBestEffort(
  projectRoot: string,
  sessionIds: string[],
  listLatestRuns: (projectRoot: string, sessionIds: string[]) => Promise<Map<string, RunRecord>>
): Promise<{ runsBySession: Map<string, RunRecord>; available: boolean }> {
  try {
    return {
      runsBySession: await listLatestRuns(projectRoot, sessionIds),
      available: true
    };
  } catch (error) {
    process.stderr.write(`WARN: failed to load latest runs: ${formatErrorMessage(error)}\n`);
    return {
      runsBySession: new Map(),
      available: false
    };
  }
}

async function loadLatestEventsBestEffort(
  projectRoot: string,
  sessionIds: string[],
  listLatestEvents: (
    projectRoot: string,
    sessionIds: string[],
    eventTypes: string[]
  ) => Promise<Map<string, EventRecord>>,
  eventTypes: string[],
  label = "latest events"
): Promise<{ eventsBySession: Map<string, EventRecord>; available: boolean }> {
  try {
    return {
      eventsBySession: await listLatestEvents(projectRoot, sessionIds, eventTypes),
      available: true
    };
  } catch (error) {
    process.stderr.write(`WARN: failed to load ${label}: ${formatErrorMessage(error)}\n`);
    return {
      eventsBySession: new Map(),
      available: false
    };
  }
}

async function loadLatestMergeStatusEventsBestEffort(
  projectRoot: string,
  sessionIds: string[],
  listLatestMergeStatusEvents: (
    projectRoot: string,
    sessionIds: string[],
    eventTypes: string[]
  ) => Promise<Map<string, EventRecord>>
): Promise<Map<string, EventRecord>> {
  try {
    return await listLatestMergeStatusEvents(projectRoot, sessionIds, [...MERGE_STATUS_EVENT_TYPES]);
  } catch (error) {
    process.stderr.write(`WARN: failed to load latest merge status events: ${formatErrorMessage(error)}\n`);
    return await loadLatestMergeStatusEventsFromHistoryBestEffort(projectRoot, sessionIds);
  }
}

async function loadLatestMergeStatusEventsFromHistoryBestEffort(
  projectRoot: string,
  sessionIds: string[]
): Promise<Map<string, EventRecord>> {
  const eventsBySession = new Map<string, EventRecord>();

  for (const sessionId of sessionIds) {
    try {
      const sessionEvents = await listEvents(projectRoot, { sessionId });
      const latestMergeStatusEvent = findLatestMergeStatusEvent(sessionEvents);

      if (latestMergeStatusEvent) {
        eventsBySession.set(sessionId, latestMergeStatusEvent);
      }
    } catch (error) {
      process.stderr.write(
        `WARN: failed to load merge status history for session '${sessionId}': ${formatErrorMessage(error)}\n`
      );
    }
  }

  return eventsBySession;
}

function findLatestMergeStatusEvent(events: EventRecord[]): EventRecord | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event && MERGE_STATUS_EVENT_TYPE_SET.has(event.eventType)) {
      return event;
    }
  }

  return undefined;
}

async function loadLatestInboundMailBestEffort(
  projectRoot: string,
  sessionIds: string[],
  listLatestInboundMail: (
    projectRoot: string,
    sessionIds: string[],
    options?: { excludeSender?: string }
  ) => Promise<Map<string, MailRecord>>,
  label = "latest inbound mail"
): Promise<{ mailBySession: Map<string, MailRecord>; available: boolean }> {
  try {
    return {
      mailBySession: await listLatestInboundMail(projectRoot, sessionIds, { excludeSender: "operator" }),
      available: true
    };
  } catch (error) {
    process.stderr.write(`WARN: failed to load ${label}: ${formatErrorMessage(error)}\n`);
    return {
      mailBySession: new Map(),
      available: false
    };
  }
}

async function loadUnreadMailSummariesBestEffort(
  projectRoot: string,
  sessionIds: string[],
  listLatestUnreadMail: (projectRoot: string, sessionIds: string[]) => Promise<Map<string, UnreadMailSummary>>,
  label = "unread mail summaries"
): Promise<{ summariesBySession: Map<string, UnreadMailSummary>; available: boolean }> {
  try {
    return {
      summariesBySession: await listLatestUnreadMail(projectRoot, sessionIds),
      available: true
    };
  } catch (error) {
    process.stderr.write(`WARN: failed to load ${label}: ${formatErrorMessage(error)}\n`);
    return {
      summariesBySession: new Map(),
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
  inspectRuntimeLiveness: (pid: number) => ProcessLiveness,
  updateLatestRun: (projectRoot: string, sessionId: string, input: Omit<UpdateRunInput, "id">) => Promise<unknown>,
  recordEvent: EventRecorder,
  now: () => string
): Promise<Map<string, EventRecord>> {
  const reconciledEventsBySession = new Map<string, EventRecord>();

  for (const session of sessions) {
    if (!isActiveSessionState(session.state)) {
      continue;
    }

    const createdAt = now();
    const nextState = await determineNextLifecycleState(projectRoot, session, inspectRuntimeLiveness);

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
    await syncRunStateAfterReconcile(
      projectRoot,
      nextSession,
      nextState.state,
      nextState.runOutcome,
      createdAt,
      updateLatestRun
    );

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

function formatRunSummary(run: RunRecord | undefined, available = true): string {
  if (!available) {
    return "?";
  }

  if (!run) {
    return "-";
  }

  if (run.state === "finished") {
    return `finished:${run.outcome ?? "unknown"}`;
  }

  return run.state;
}

function formatTaskSummary(run: RunRecord | undefined, available = true): string {
  if (!available) {
    return "?";
  }

  if (!run) {
    return "-";
  }

  return run.taskSummary;
}

function deriveReintegrationAssessment(options: {
  session: SessionRecord;
  latestRun?: RunRecord;
  cleanup: string;
  followUp: string;
  recentEvent?: EventRecord;
  latestMergeStatusEvent?: EventRecord;
}): ReintegrationAssessment | undefined {
  if (isActiveSessionState(options.session.state)) {
    return undefined;
  }

  if (options.cleanup === "ready:absent" || options.followUp === "done") {
    return undefined;
  }

  if (options.cleanup === "?") {
    return undefined;
  }

  const relevantMergeStatusEvent = options.latestMergeStatusEvent ?? options.recentEvent;

  if (relevantMergeStatusEvent?.eventType === "merge.failed") {
    return {
      label: "blocked",
      reason: "previous merge attempt failed and reintegration is currently blocked"
    };
  }

  switch (options.cleanup) {
    case "abandon-only:branch-missing":
      return {
        label: "blocked",
        reason: "preserved branch is missing and reintegration is currently blocked"
      };
    case "abandon-only:legacy":
      return {
        label: "blocked",
        reason: "legacy session metadata is incomplete, so reintegration is currently blocked"
      };
    case "abandon-only:no-branch":
      return {
        label: "blocked",
        reason: "preserved branch is unavailable and reintegration is currently blocked"
      };
    case "abandon-only:worktree-inspection-failed":
      return {
        label: "blocked",
        reason: "preserved worktree could not be inspected, so reintegration is currently blocked"
      };
    case "abandon-only:worktree-missing":
      return {
        label: "blocked",
        reason: "preserved worktree is missing and reintegration is currently blocked"
      };
    case "ready:merged":
      return {
        label: "ready",
        reason: "merge is already integrated and cleanup is the next valid action"
      };
    case "abandon-only:worktree-dirty":
      return {
        label: "risky",
        reason: "preserved worktree has uncommitted changes and should be inspected before reintegration"
      };
    default:
      break;
  }

  if (options.latestRun?.outcome === "failed") {
    return {
      label: "risky",
      reason: "latest run failed, so preserved work should be inspected before reintegration"
    };
  }

  if (options.latestRun?.outcome === "launch_failed") {
    return {
      label: "risky",
      reason: "latest launch failed, so preserved work should be inspected before reintegration"
    };
  }

  if (options.cleanup === "abandon-only:not-merged" && options.latestRun) {
    return {
      label: "needs-review",
      reason: "run finished successfully and preserved work still needs operator review"
    };
  }

  return undefined;
}

function formatSelectedSessionSummary(rowContext: StatusRowContext): string {
  if (isActiveSessionState(rowContext.session.state)) {
    return "session still active; wait for completion or inspect logs and mail as needed.";
  }

  if (rowContext.review?.label === "blocked") {
    if (rowContext.review.reason === "previous merge attempt failed and reintegration is currently blocked") {
      return "reintegration is blocked by the previous merge failure.";
    }

    return "reintegration is currently blocked; inspect the recorded failure context before proceeding.";
  }

  if (rowContext.cleanup === "ready:absent" || rowContext.followUp === "done") {
    if (rowContext.latestRun?.outcome === "abandoned") {
      return "session closed after abandon cleanup; preserved runtime artifacts are already gone.";
    }

    if (rowContext.latestRun?.outcome === "merged") {
      return "session closed after merge cleanup; preserved runtime artifacts are already gone.";
    }

    return "session closed; preserved runtime artifacts are already gone.";
  }

  if (rowContext.cleanup === "ready:merged") {
    return "merge integrated; preserved artifacts can be cleaned up when ready.";
  }

  if (rowContext.latestRun?.outcome === "failed") {
    return "run failed; inspect preserved artifacts before reintegration.";
  }

  if (rowContext.latestRun?.outcome === "launch_failed") {
    return "launch failed; inspect preserved artifacts before retrying reintegration.";
  }

  if (rowContext.cleanup === "abandon-only:not-merged" && rowContext.latestRun?.outcome === "completed") {
    return "completed run preserved for operator review before merge.";
  }

  if (rowContext.cleanup.startsWith("abandon-only:")) {
    return "preserved artifacts need operator inspection before reintegration.";
  }

  return "session state is recorded, but no more specific reintegration summary is available yet.";
}

async function inspectSelectedSessionArtifacts(
  projectRoot: string,
  session: SessionRecord,
  taskSpecPath: string | undefined
): Promise<SelectedSessionArtifacts> {
  const [branchExists, worktreeExists, logExists, specExists] = await Promise.all([
    doesLocalBranchExist(projectRoot, session.branch),
    pathExists(session.worktreePath),
    pathExists(getSessionLogPath(projectRoot, session.agentName, session.id).path),
    typeof taskSpecPath === "string"
      ? pathExists(join(projectRoot, taskSpecPath))
      : Promise.resolve(undefined)
  ]);

  return {
    branch: branchExists ? "present" : "absent",
    worktree: worktreeExists ? "present" : "absent",
    log: logExists ? "present" : "absent",
    spec: typeof specExists === "boolean"
      ? (specExists ? "present" : "absent")
      : "unknown"
  };
}

function formatSelectedSessionArtifacts(artifacts: SelectedSessionArtifacts): string {
  return `branch=${artifacts.branch}, worktree=${artifacts.worktree}, log=${artifacts.log}, spec=${artifacts.spec}`;
}

const FOLLOW_UP_PRIORITY = {
  mail: 0,
  inspect: 1,
  "review-merge": 2,
  cleanup: 3,
  wait: 4,
  done: 5,
  "-": 6
} as const;

function formatFollowUpAction(
  session: SessionRecord,
  run: RunRecord | undefined,
  cleanup: string,
  unreadCount?: number,
  inspectHint?: DerivedInspectHint
): string {
  if ((unreadCount ?? 0) > 0) {
    return "mail";
  }

  if (inspectHint) {
    return "inspect";
  }

  if (isActiveSessionState(session.state)) {
    return "wait";
  }

  if (cleanup === "ready:absent") {
    return "done";
  }

  if (cleanup === "ready:merged") {
    return "cleanup";
  }

  if (run?.outcome === "launch_failed" || run?.outcome === "failed") {
    return "inspect";
  }

  if (cleanup === "abandon-only:not-merged") {
    return "review-merge";
  }

  if (cleanup.startsWith("abandon-only:")) {
    return "inspect";
  }

  return "-";
}

function compareStatusRowContexts(
  left: StatusRowContext,
  right: StatusRowContext
): number {
  const leftPriority = getFollowUpPriority(left.followUp);
  const rightPriority = getFollowUpPriority(right.followUp);

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  if (leftPriority === FOLLOW_UP_PRIORITY.mail) {
    const unreadMailComparison = compareUnreadMailFreshness(
      left.unreadOperatorMailSummary,
      right.unreadOperatorMailSummary
    );

    if (unreadMailComparison !== 0) {
      return unreadMailComparison;
    }
  }

  if (left.activityAt !== right.activityAt) {
    return right.activityAt.localeCompare(left.activityAt);
  }

  if (left.session.updatedAt !== right.session.updatedAt) {
    return right.session.updatedAt.localeCompare(left.session.updatedAt);
  }

  if (left.session.createdAt !== right.session.createdAt) {
    return right.session.createdAt.localeCompare(left.session.createdAt);
  }

  return left.session.id.localeCompare(right.session.id);
}

function getFollowUpPriority(followUp: string | undefined): number {
  switch (followUp) {
    case "mail":
    case "inspect":
    case "review-merge":
    case "cleanup":
    case "wait":
    case "done":
      return FOLLOW_UP_PRIORITY[followUp];
    default:
      return FOLLOW_UP_PRIORITY["-"];
  }
}

function compareUnreadMailFreshness(
  left: UnreadMailSummary | undefined,
  right: UnreadMailSummary | undefined
): number {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  if (left.message.createdAt !== right.message.createdAt) {
    return right.message.createdAt.localeCompare(left.message.createdAt);
  }

  if (left.unreadCount !== right.unreadCount) {
    return right.unreadCount - left.unreadCount;
  }

  return right.message.id.localeCompare(left.message.id);
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

function formatRelevantRecentSummary(
  event: EventRecord | undefined,
  unreadMailSummary: UnreadMailSummary | undefined,
  inspectHint: DerivedInspectHint | undefined,
  options: {
    truncate?: boolean;
  } = {}
): string {
  const baseSummary = unreadMailSummary && shouldPreferUnreadMailSummary(event, unreadMailSummary)
    ? formatUnreadMailSummary(unreadMailSummary, { truncate: false })
    : formatRecentEventSummary(event, { truncate: false });

  if (!inspectHint) {
    return formatStatusSummaryText(baseSummary, options);
  }

  const inspectHintSummary = formatInspectHintSummary(inspectHint);

  if (baseSummary === "-") {
    return formatStatusSummaryText(inspectHintSummary, options);
  }

  return formatStatusSummaryTextWithTrailingSuffix(baseSummary, inspectHintSummary, options);
}

function shouldPreferUnreadMailSummary(
  event: EventRecord | undefined,
  unreadMailSummary: UnreadMailSummary
): boolean {
  if (!event) {
    return true;
  }

  return unreadMailSummary.message.createdAt > event.createdAt;
}

function formatUnreadMailSummary(
  summary: UnreadMailSummary,
  options: {
    truncate?: boolean;
  } = {}
): string {
  const details = [
    `unreadCount=${summary.unreadCount}`,
    `sender=${formatPayloadValue(summary.message.sender)}`
  ];
  const bodyPreview = summarizeMailBody(summary.message.body);

  if (bodyPreview.length > 0) {
    details.push(`bodyPreview=${formatPayloadValue(bodyPreview)}`);
  }

  return formatStatusSummaryText(`${summary.message.createdAt} mail.unread ${details.join(", ")}`, options);
}

function formatStatusSummaryText(
  summary: string,
  options: {
    truncate?: boolean;
  } = {}
): string {
  if (options.truncate === false || summary.length <= 120) {
    return summary;
  }

  return `${summary.slice(0, 117)}...`;
}

function formatStatusSummaryTextWithTrailingSuffix(
  summary: string,
  trailingSuffix: string,
  options: {
    truncate?: boolean;
  } = {}
): string {
  const separator = "; ";
  const combinedSummary = `${summary}${separator}${trailingSuffix}`;

  if (options.truncate === false || combinedSummary.length <= 120) {
    return combinedSummary;
  }

  const maxSummaryLength = 120 - separator.length - trailingSuffix.length;
  const truncatedSummary = maxSummaryLength <= 3
    ? "..."
    : `${summary.slice(0, maxSummaryLength - 3)}...`;

  return `${truncatedSummary}${separator}${trailingSuffix}`;
}

function formatInspectHintSummary(inspectHint: DerivedInspectHint): string {
  if (inspectHint.kind === "no_visible_progress") {
    return `runtime.no_visible_progress age=${formatIdleDuration(inspectHint.sessionAgeMs)}`;
  }

  return `runtime.stalled idleFor=${formatIdleDuration(inspectHint.idleForMs)}`;
}

function formatIdleDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h${minutes}m`;
}

function deriveStatusActivityTimestamp(
  session: SessionRecord,
  event: EventRecord | undefined,
  unreadMailSummary: UnreadMailSummary | undefined
): string {
  let activityAt = session.updatedAt;

  if (event && event.createdAt > activityAt) {
    activityAt = event.createdAt;
  }

  if (unreadMailSummary && unreadMailSummary.message.createdAt > activityAt) {
    activityAt = unreadMailSummary.message.createdAt;
  }

  return activityAt;
}

function deriveAgentActivityTimestamp(
  session: SessionRecord,
  latestRuntimeProgressEvent: EventRecord | undefined,
  latestInboundMail: MailRecord | undefined
): string {
  let activityAt = session.createdAt;

  if (latestRuntimeProgressEvent && latestRuntimeProgressEvent.createdAt > activityAt) {
    activityAt = latestRuntimeProgressEvent.createdAt;
  }

  if (latestInboundMail && latestInboundMail.createdAt > activityAt) {
    activityAt = latestInboundMail.createdAt;
  }

  return activityAt;
}

function deriveStalledHint(options: {
  session: SessionRecord;
  latestRuntimeProgressEvent?: EventRecord;
  latestInboundMail?: MailRecord;
  now: string;
}): DerivedStalledHint | undefined {
  if (!isActiveSessionState(options.session.state)) {
    return undefined;
  }

  const idleSince = deriveAgentActivityTimestamp(
    options.session,
    options.latestRuntimeProgressEvent,
    options.latestInboundMail
  );
  const idleForMs = Date.parse(options.now) - Date.parse(idleSince);

  if (!Number.isFinite(idleForMs) || idleForMs < STALLED_SESSION_THRESHOLD_MS) {
    return undefined;
  }

  return {
    kind: "stalled",
    idleSince,
    idleForMs
  };
}

function selectInspectHint(
  noVisibleProgressHint: DerivedNoVisibleProgressHint | undefined,
  stalledHint: DerivedStalledHint | undefined
): DerivedInspectHint | undefined {
  return noVisibleProgressHint ?? stalledHint;
}

async function deriveNoVisibleProgressHint(options: {
  projectRoot: string;
  session: SessionRecord;
  latestInboundMail?: MailRecord;
  now: string;
}): Promise<DerivedNoVisibleProgressHint | undefined> {
  if (!isActiveSessionState(options.session.state)) {
    return undefined;
  }

  if (options.latestInboundMail) {
    return undefined;
  }

  const firstReadyProgressAt = await findFirstReadyProgressAt(options.projectRoot, options.session.id);

  if (!firstReadyProgressAt) {
    return undefined;
  }

  const sessionAgeMs = Date.parse(options.now) - Date.parse(firstReadyProgressAt);

  if (!Number.isFinite(sessionAgeMs) || sessionAgeMs <= NO_VISIBLE_PROGRESS_THRESHOLD_MS) {
    return undefined;
  }

  const branch = options.session.branch.trim();
  const baseBranch = options.session.baseBranch?.trim() ?? "";

  if (branch.length === 0 || baseBranch.length === 0) {
    return undefined;
  }

  if (!(await pathExists(options.session.worktreePath))) {
    return undefined;
  }

  try {
    if (!await isGitWorktreeClean(options.session.worktreePath)) {
      return undefined;
    }

    if (await isBranchAheadOfBase(options.session.worktreePath, baseBranch, branch)) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return {
    kind: "no_visible_progress",
    sessionAgeMs
  };
}

async function findFirstReadyProgressAt(projectRoot: string, sessionId: string): Promise<string | undefined> {
  try {
    const events = await listEvents(projectRoot, { sessionId });
    return events.find((event) => {
      return NO_VISIBLE_PROGRESS_READY_EVENT_TYPES.includes(
        event.eventType as typeof NO_VISIBLE_PROGRESS_READY_EVENT_TYPES[number]
      );
    })?.createdAt;
  } catch {
    return undefined;
  }
}

async function isGitWorktreeClean(worktreePath: string): Promise<boolean> {
  const statusOutput = await runGit(worktreePath, ["status", "--porcelain", "--untracked-files=all"]);
  return statusOutput.length === 0;
}

async function isBranchAheadOfBase(worktreePath: string, baseBranch: string, branch: string): Promise<boolean> {
  const revListOutput = await runGit(worktreePath, ["rev-list", "--count", `${baseBranch}..${branch}`]);
  const aheadCount = Number.parseInt(revListOutput, 10);

  if (!Number.isFinite(aheadCount)) {
    throw new Error(`Invalid ahead count '${revListOutput}'.`);
  }

  return aheadCount > 0;
}

async function doesLocalBranchExist(projectRoot: string, branch: string): Promise<boolean> {
  const normalizedBranch = branch.trim();

  if (normalizedBranch.length === 0) {
    return false;
  }

  try {
    await runGit(projectRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${normalizedBranch}`]);
    return true;
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

function formatRecentEventDetails(event: EventRecord): string {
  const selectedKeys = selectRecentEventDetailKeys(event);

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

function summarizeMailBody(body: string): string {
  const normalized = body.replace(/\s+/g, " ").trim();

  if (normalized.length <= 60) {
    return normalized;
  }

  return `${normalized.slice(0, 57)}...`;
}

async function determineNextLifecycleState(
  projectRoot: string,
  session: SessionRecord,
  inspectRuntimeLiveness: (pid: number) => ProcessLiveness
): Promise<{
  state: SessionState;
  runtimePid: number | null;
  eventType: string;
  runOutcome?: RunOutcome;
  payload: Record<string, EventPayloadValue>;
} | undefined> {
  if (typeof session.runtimePid !== "number") {
    return {
      state: "failed",
      runtimePid: null,
      eventType: session.state === "starting" ? "runtime.exited_early" : "runtime.exited",
      runOutcome: "failed",
      payload: {
        previousState: session.state,
        reason: "missing_runtime_pid"
      }
    };
  }

  const runtimeLiveness = inspectRuntimeLiveness(session.runtimePid);

  if (session.state === "starting") {
    if (runtimeLiveness.alive) {
      return {
        state: "running",
        runtimePid: session.runtimePid,
        eventType: "runtime.ready",
        payload: {
          previousState: session.state,
          runtimePid: session.runtimePid,
          signal: runtimeLiveness.reason
        }
      };
    }
  }

  if (runtimeLiveness.alive) {
    return undefined;
  }

  const terminalState = await readCodexTerminalState(getSessionLogPath(projectRoot, session.agentName, session.id).path);

  if (terminalState?.outcome === "completed") {
    return {
      state: "stopped",
      runtimePid: null,
      eventType: "runtime.completed",
      runOutcome: "completed",
      payload: {
        previousState: session.state,
        runtimePid: session.runtimePid
      }
    };
  }

  if (terminalState?.outcome === "failed") {
    return {
      state: "failed",
      runtimePid: null,
      eventType: "runtime.failed",
      runOutcome: "failed",
      payload: {
        previousState: session.state,
        runtimePid: session.runtimePid,
        ...(terminalState.errorMessage ? { errorMessage: terminalState.errorMessage } : {})
      }
    };
  }

  if (session.state === "starting") {
    return {
      state: "failed",
      runtimePid: null,
      eventType: "runtime.exited_early",
      runOutcome: "failed",
      payload: {
        previousState: session.state,
        runtimePid: session.runtimePid,
        reason: runtimeLiveness.reason
      }
    };
  }

  return {
    state: "failed",
    runtimePid: null,
    eventType: "runtime.exited",
    runOutcome: "failed",
    payload: {
      previousState: session.state,
      runtimePid: session.runtimePid,
      reason: runtimeLiveness.reason
    }
  };
}

function createRuntimeLivenessInspector(isRuntimeAlive: (pid: number) => boolean): (pid: number) => ProcessLiveness {
  if (isRuntimeAlive === isProcessAlive) {
    return inspectProcessLiveness;
  }

  return (pid: number) => {
    return isRuntimeAlive(pid)
      ? {
          alive: true,
          reason: "pid_alive"
        }
      : {
          alive: false,
          reason: "pid_not_alive"
        };
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

function selectRecentEventForStatus(options: {
  latestEventBeforeReconcile?: EventRecord;
  latestStoredEvent?: EventRecord;
  reconciledEvent?: EventRecord;
}): EventRecord | undefined {
  if (!options.reconciledEvent) {
    return options.latestStoredEvent ?? options.latestEventBeforeReconcile;
  }

  if (shouldPreservePreReconcileRecentEvent(options.latestEventBeforeReconcile, options.reconciledEvent)) {
    return options.latestEventBeforeReconcile;
  }

  return options.reconciledEvent;
}

function selectLatestRuntimeProgressEvent(options: {
  latestStoredRuntimeProgressEvent?: EventRecord;
  reconciledEvent?: EventRecord;
}): EventRecord | undefined {
  if (!options.reconciledEvent || !RUNTIME_PROGRESS_EVENT_TYPE_SET.has(options.reconciledEvent.eventType)) {
    return options.latestStoredRuntimeProgressEvent;
  }

  if (!options.latestStoredRuntimeProgressEvent) {
    return options.reconciledEvent;
  }

  if (options.reconciledEvent.createdAt > options.latestStoredRuntimeProgressEvent.createdAt) {
    return options.reconciledEvent;
  }

  return options.latestStoredRuntimeProgressEvent;
}

function shouldPreservePreReconcileRecentEvent(
  latestEventBeforeReconcile: EventRecord | undefined,
  reconciledEvent: EventRecord
): boolean {
  if (!latestEventBeforeReconcile || latestEventBeforeReconcile.eventType !== "stop.failed") {
    return false;
  }

  return RECONCILED_RUNTIME_EVENT_TYPES.has(reconciledEvent.eventType);
}

async function loadLatestLaunchTaskHandoff(
  projectRoot: string,
  session: SessionRecord
): Promise<{ taskSummary?: string; taskSpecPath?: string; runtimeCommand?: string } | undefined> {
  const events = await listEvents(projectRoot, { sessionId: session.id });
  const taskHandoff: { taskSummary?: string; taskSpecPath?: string; runtimeCommand?: string } = {};

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (!event || !SLING_LAUNCH_EVENT_TYPES.has(event.eventType)) {
      continue;
    }

    if (typeof event.payload.taskSummary === "string" && typeof taskHandoff.taskSummary === "undefined") {
      taskHandoff.taskSummary = event.payload.taskSummary;
    }

    if (typeof event.payload.taskSpecPath === "string" && typeof taskHandoff.taskSpecPath === "undefined") {
      taskHandoff.taskSpecPath = event.payload.taskSpecPath;
    }

    if (typeof event.payload.runtimeCommand === "string" && typeof taskHandoff.runtimeCommand === "undefined") {
      taskHandoff.runtimeCommand = event.payload.runtimeCommand;
    }

    if (typeof taskHandoff.taskSummary === "string"
      && typeof taskHandoff.taskSpecPath === "string"
      && typeof taskHandoff.runtimeCommand === "string") {
      return taskHandoff;
    }
  }

  const fallbackTaskHandoff = await readTaskSpecHandoff(projectRoot, session.agentName, session.id);

  if (!fallbackTaskHandoff && typeof taskHandoff.runtimeCommand === "undefined") {
    return undefined;
  }

  return {
    taskSummary: taskHandoff.taskSummary ?? fallbackTaskHandoff?.taskSummary,
    taskSpecPath: taskHandoff.taskSpecPath ?? fallbackTaskHandoff?.taskSpecPath,
    runtimeCommand: taskHandoff.runtimeCommand
  };
}

async function loadLatestLaunchTaskInstruction(projectRoot: string, session: SessionRecord): Promise<string | undefined> {
  return await readTaskInstruction(projectRoot, session.agentName, session.id);
}

async function syncRunStateAfterReconcile(
  projectRoot: string,
  session: SessionRecord,
  nextState: SessionState,
  runOutcome: RunOutcome | undefined,
  updatedAt: string,
  updateLatestRun: (projectRoot: string, sessionId: string, input: Omit<UpdateRunInput, "id">) => Promise<unknown>
): Promise<void> {
  let legacyWarning: string | undefined;

  try {
    if (nextState === "running") {
      await updateLatestRun(projectRoot, session.id, {
        state: "active",
        updatedAt,
        finishedAt: null
      });
    } else if (nextState === "failed" || nextState === "stopped") {
      await updateLatestRun(projectRoot, session.id, {
        state: "finished",
        outcome: runOutcome ?? "failed",
        updatedAt,
        finishedAt: updatedAt
      });
    }
  } catch (error) {
    legacyWarning = `WARN: failed to persist run state for session '${session.id}': ${formatErrorMessage(error)}\n`;
  }

  await syncOrchestrationSessionStateBestEffort(
    projectRoot,
    session,
    nextState,
    updatedAt,
    nextState === "running" ? undefined : runOutcome ?? "failed"
  );

  if (legacyWarning) {
    process.stderr.write(legacyWarning);
  }
}

async function loadSelectedSessionDetails(
  projectRoot: string,
  session: SessionRecord | undefined,
  showTask: boolean
): Promise<{
  taskHandoff?: { taskSummary?: string; taskSpecPath?: string; runtimeCommand?: string };
  taskInstruction?: string;
} | undefined> {
  if (!session) {
    return undefined;
  }

  const taskHandoff = await loadLatestLaunchTaskHandoff(projectRoot, session);
  const taskInstruction = showTask
    ? await loadLatestLaunchTaskInstruction(projectRoot, session)
    : undefined;

  if (showTask && !taskInstruction) {
    throw new StatusError(`Stored task text is unavailable for session '${session.id}'.`);
  }

  return {
    taskHandoff,
    taskInstruction
  };
}

function selectRecentEventDetailKeys(event: EventRecord): string[] {
  if (event.eventType === "merge.failed") {
    return selectMergeFailedDetailKeys(event);
  }

  return RECENT_EVENT_DETAIL_KEYS[event.eventType] ?? [];
}

function selectMergeFailedDetailKeys(event: EventRecord): string[] {
  const reason = typeof event.payload.reason === "string" ? event.payload.reason : "";
  const orderedKeys = getMergeFailedDetailKeyOrder(reason);

  return orderedKeys.filter((key) => key in event.payload);
}

function getMergeFailedDetailKeyOrder(reason: string): string[] {
  switch (reason) {
    case "canonical_branch_drift":
      return ["reason", "configuredCanonicalBranch", "canonicalBranch", "branch"];
    case "repo_root_dirty":
      return ["reason", "target", "firstDirtyEntry", "dirtyCount", "branch"];
    case "worktree_dirty":
      return ["reason", "target", "worktreePath", "firstDirtyEntry", "dirtyCount", "branch"];
    case "merge_in_progress":
      return ["reason", "target", "firstConflictPath", "conflictCount", "branch"];
    case "merge_conflict":
      return ["reason", "conflictCount", "firstConflictPath", "branch", "canonicalBranch"];
    case "worktree_missing":
    case "worktree_root_mismatch":
    case "worktree_unusable":
      return ["reason", "target", "worktreePath", "branch"];
    case "canonical_branch_switch_failed":
    case "git_error":
      return ["reason", "canonicalBranch", "errorMessage", "branch"];
    case "session_active":
      return ["reason", "state", "branch"];
    case "branch_missing":
    case "branch_matches_canonical":
      return ["reason", "canonicalBranch", "branch"];
    case "missing_branch_metadata":
    case "missing_base_branch_metadata":
    case "missing_canonical_branch_config":
      return ["reason", "branch"];
    default:
      return [
        "reason",
        "configuredCanonicalBranch",
        "canonicalBranch",
        "target",
        "worktreePath",
        "state",
        "firstDirtyEntry",
        "dirtyCount",
        "firstConflictPath",
        "conflictCount",
        "errorMessage",
        "branch"
      ];
  }
}

const RECENT_EVENT_DETAIL_KEYS: Record<string, string[]> = {
  "mail.checked": ["unreadCount"],
  "mail.listed": ["view", "messageCount", "unreadCount"],
  "mail.sent": ["sender", "bodyLength"],
  "merge.completed": ["canonicalBranch", "branch"],
  "merge.skipped": ["reason", "branch"],
  "runtime.completed": ["runtimePid"],
  "runtime.exited": ["reason", "runtimePid"],
  "runtime.exited_early": ["reason", "runtimePid"],
  "runtime.failed": ["runtimePid", "errorMessage"],
  "runtime.ready": ["signal", "runtimePid"],
  "sling.completed": ["runtimePid", "baseBranch", "taskSummary", "taskSpecPath", "readyAfterMs"],
  "sling.failed": ["errorMessage", "taskSummary", "taskSpecPath", "cleanupSucceeded"],
  "sling.spawned": ["runtimePid", "baseBranch", "taskSummary", "taskSpecPath"],
  "stop.completed": ["outcome", "cleanupPerformed", "cleanupMode", "cleanupReason", "worktreePath", "cleanupError"],
  "stop.failed": ["reason", "runtimePid", "errorMessage"]
};

const RECONCILED_RUNTIME_EVENT_TYPES = new Set([
  "runtime.ready",
  "runtime.completed",
  "runtime.failed",
  "runtime.exited",
  "runtime.exited_early"
]);
const SLING_LAUNCH_EVENT_TYPES = new Set(["sling.spawned", "sling.completed", "sling.failed"]);
