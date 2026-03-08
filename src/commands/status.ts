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
  const reconciledSessionIds = await reconcileRunningSessions(config.project.root, options.isRuntimeAlive ?? isProcessAlive);
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
    const recentEvent = reconciledSessionIds.has(session.id)
      ? "-"
      : formatRecentEventSummary(latestEventsBySession.get(session.id));
    process.stdout.write(
      `${session.state}\t${session.agentName}\t${session.branch}\t${worktree}\t${session.updatedAt}\t${recentEvent}\n`
    );
  }
}

async function reconcileRunningSessions(
  projectRoot: string,
  isRuntimeAlive: (pid: number) => boolean
): Promise<Set<string>> {
  const sessions = await listSessions(projectRoot);
  const reconciledSessionIds = new Set<string>();

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
      reconciledSessionIds.add(session.id);
    }
  }

  return reconciledSessionIds;
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

const RECENT_EVENT_DETAIL_KEYS: Record<string, string[]> = {
  "mail.checked": ["unreadCount"],
  "mail.sent": ["sender", "bodyLength"],
  "sling.completed": ["runtimePid", "readyAfterMs"],
  "sling.spawned": ["runtimePid"],
  "sling.failed": ["errorMessage", "cleanupSucceeded"],
  "stop.completed": ["outcome", "cleanupPerformed"]
};
