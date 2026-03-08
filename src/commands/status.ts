import { relative } from "node:path";
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { listLatestEventsBySession } from "../events/store.js";
import type { EventPayloadValue, EventRecord } from "../events/types.js";
import { isProcessAlive } from "../runtimes/process.js";
import { listSessions, updateSessionState } from "../sessions/store.js";

interface StatusOptions {
  startDir?: string;
  isRuntimeAlive?: (pid: number) => boolean;
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
  await reconcileRunningSessions(config.project.root, options.isRuntimeAlive ?? isProcessAlive);
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
    const recentEvent = formatRecentEventSummary(latestEventsBySession.get(session.id));
    process.stdout.write(
      `${session.state}\t${session.agentName}\t${session.branch}\t${worktree}\t${session.updatedAt}\t${recentEvent}\n`
    );
  }
}

async function reconcileRunningSessions(
  projectRoot: string,
  isRuntimeAlive: (pid: number) => boolean
): Promise<void> {
  const sessions = await listSessions(projectRoot);

  for (const session of sessions) {
    if (session.state !== "running") {
      continue;
    }

    if (typeof session.runtimePid !== "number" || !isRuntimeAlive(session.runtimePid)) {
      await updateSessionState(projectRoot, {
        id: session.id,
        state: "failed",
        runtimePid: null
      });
    }
  }
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
  const selectedKeys = selectRecentDetailKeys(event);

  if (selectedKeys.length === 0) {
    return "";
  }

  return selectedKeys.map((key) => `${key}=${formatPayloadValue(event.payload[key])}`).join(", ");
}

function selectRecentDetailKeys(event: EventRecord): string[] {
  const keys = Object.keys(event.payload);

  if (keys.length === 0) {
    return [];
  }

  const priorityKeys = RECENT_EVENT_DETAIL_KEYS[event.eventType] ?? [];
  const selectedKeys: string[] = [];

  for (const key of priorityKeys) {
    if (key in event.payload) {
      selectedKeys.push(key);
    }
  }

  for (const key of keys.sort()) {
    if (selectedKeys.length >= 2) {
      break;
    }

    if (selectedKeys.includes(key) || IGNORED_RECENT_EVENT_DETAIL_KEYS.has(key)) {
      continue;
    }

    selectedKeys.push(key);
  }

  return selectedKeys.slice(0, 2);
}

function formatPayloadValue(value: EventPayloadValue | undefined): string {
  if (typeof value === "string") {
    return /^[^,\s=]+$/.test(value) ? value : JSON.stringify(value);
  }

  return String(value);
}

const IGNORED_RECENT_EVENT_DETAIL_KEYS = new Set([
  "branch",
  "cleanupRequested",
  "mailId",
  "previousState",
  "recipient",
  "runtimeCommand",
  "worktreePath"
]);

const RECENT_EVENT_DETAIL_KEYS: Record<string, string[]> = {
  "mail.checked": ["unreadCount"],
  "mail.sent": ["sender", "bodyLength"],
  "sling.completed": ["runtimePid"],
  "sling.failed": ["errorMessage", "cleanupSucceeded"],
  "stop.completed": ["outcome", "cleanupPerformed"]
};
