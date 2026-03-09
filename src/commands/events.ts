import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { listEvents } from "../events/store.js";
import type { EventPayload, EventRecord } from "../events/types.js";
import { EventsError, WorktreeError } from "../errors.js";
import { findLatestSessionByAgent, getSessionById } from "../sessions/store.js";
import type { SessionRecord } from "../sessions/types.js";
import { normalizeAgentName } from "../worktrees/naming.js";

const DEFAULT_EVENT_LIMIT = 10;

interface EventsCommandOptions {
  selector?: string;
  startDir?: string;
  limit?: number | string;
}

interface ResolvedEventSelection {
  session?: SessionRecord;
  sessionId?: string;
  events?: EventRecord[];
}

export function createEventsCommand(): Command {
  return new Command("events")
    .description("Show recent durable lifecycle events")
    .argument("[session]", "Optional session id or agent name")
    .option("--limit <count>", "Show up to <count> recent events")
    .action(async (selector: string | undefined, options: { limit?: string }) => {
      await eventsCommand({ selector, limit: options.limit });
    });
}

export async function eventsCommand(options: EventsCommandOptions = {}): Promise<void> {
  const config = await loadConfig(options.startDir);
  const limit = resolveEventLimit(options.limit);
  const selection = options.selector
    ? await resolveEventSelection(config.project.root, options.selector, limit)
    : undefined;
  const session = selection?.session;

  if (options.selector && !selection) {
    throw new EventsError(`No session found for '${options.selector}'.`);
  }

  const events = selection?.events ?? await listEvents(config.project.root, { limit });

  if (events.length === 0) {
    if (session) {
      process.stdout.write(`No events recorded yet for ${session.agentName}.\n`);
      return;
    }

    process.stdout.write("No Switchyard events recorded yet.\n");
    return;
  }

  process.stdout.write(`${formatHeading(config.project.name, session, selection?.sessionId)}\n`);
  process.stdout.write("TIME\tEVENT\tAGENT\tSESSION\tDETAILS\n");

  for (const event of events) {
    process.stdout.write(formatEventRow(event));
  }
}

interface ResolvedSessionSelector {
  byId?: SessionRecord;
  byAgent?: SessionRecord;
}

async function resolveSessionSelector(projectRoot: string, selector: string): Promise<ResolvedSessionSelector> {
  const byId = await getSessionById(projectRoot, selector);
  const normalizedSelector = normalizeSelectorAsAgentName(selector);
  const byAgent = normalizedSelector
    ? await findLatestSessionByAgent(projectRoot, normalizedSelector)
    : undefined;

  if (byId && byAgent && byId.id !== byAgent.id) {
    throw new EventsError(
      `Selector '${selector}' is ambiguous: it matches session '${byId.id}' by id and session '${byAgent.id}' by agent name.`
    );
  }

  return { byId, byAgent };
}

function normalizeSelectorAsAgentName(selector: string): string | undefined {
  try {
    return normalizeAgentName(selector);
  } catch (error) {
    if (error instanceof WorktreeError) {
      return undefined;
    }

    throw error;
  }
}

async function resolveEventSelection(
  projectRoot: string,
  selector: string,
  limit: number
): Promise<ResolvedEventSelection | undefined> {
  const { byId, byAgent } = await resolveSessionSelector(projectRoot, selector);
  const session = byId;

  if (session) {
    const events = await listEvents(projectRoot, {
      sessionId: session.id,
      limit
    });

    return {
      session,
      sessionId: session.id,
      events
    };
  }

  const directSessionEvents = await listEvents(projectRoot, {
    sessionId: selector,
    limit
  });

  if (directSessionEvents.length > 0) {
    if (byAgent) {
      throw new EventsError(
        `Selector '${selector}' is ambiguous: it matches orphaned events for session '${selector}' and session '${byAgent.id}' by agent name.`
      );
    }

    return {
      sessionId: selector,
      events: directSessionEvents
    };
  }

  if (!byAgent) {
    return undefined;
  }

  const agentEvents = await listEvents(projectRoot, {
    sessionId: byAgent.id,
    limit
  });

  return {
    session: byAgent,
    sessionId: byAgent.id,
    events: agentEvents
  };
}

function formatHeading(projectName: string, session?: SessionRecord, sessionId?: string): string {
  if (!session) {
    if (sessionId) {
      return `Recent events for session ${sessionId}:`;
    }

    return `Recent events for ${projectName}:`;
  }

  return `Recent events for ${session.agentName} (${session.id}):`;
}

function formatEventRow(event: EventRecord): string {
  return [
    event.createdAt,
    event.eventType,
    event.agentName ?? "-",
    event.sessionId ?? "-",
    formatEventDetails(event.payload)
  ].join("\t") + "\n";
}

function formatEventDetails(payload: EventPayload): string {
  const entries = Object.entries(payload).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  if (entries.length === 0) {
    return "-";
  }

  return entries.map(([key, value]) => `${key}=${formatPayloadValue(value)}`).join(", ");
}

function formatPayloadValue(value: string | number | boolean | null): string {
  if (typeof value === "string") {
    return /^[^,\s=]+$/.test(value) ? value : JSON.stringify(value);
  }

  return String(value);
}

function resolveEventLimit(limit: number | string | undefined): number {
  if (typeof limit === "undefined") {
    return DEFAULT_EVENT_LIMIT;
  }

  if (typeof limit === "number") {
    return validateEventLimit(limit);
  }

  const trimmedLimit = limit.trim();

  if (!/^\d+$/.test(trimmedLimit)) {
    throw new EventsError(`Invalid event limit '${limit}'. Use a positive integer.`);
  }

  return validateEventLimit(Number.parseInt(trimmedLimit, 10));
}

function validateEventLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new EventsError(`Invalid event limit '${limit}'. Use a positive integer.`);
  }

  return limit;
}
