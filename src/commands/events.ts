import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { listEvents } from "../events/store.js";
import type { EventPayload, EventRecord } from "../events/types.js";
import { EventsError } from "../errors.js";
import { findLatestSessionByAgent, getSessionById } from "../sessions/store.js";
import type { SessionRecord } from "../sessions/types.js";
import { normalizeAgentName } from "../worktrees/naming.js";

const DEFAULT_EVENT_LIMIT = 10;

interface EventsCommandOptions {
  selector?: string;
  startDir?: string;
  limit?: number;
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
    .action(async (selector?: string) => {
      await eventsCommand({ selector });
    });
}

export async function eventsCommand(options: EventsCommandOptions = {}): Promise<void> {
  const config = await loadConfig(options.startDir);
  const limit = options.limit ?? DEFAULT_EVENT_LIMIT;
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

async function resolveSession(projectRoot: string, selector: string): Promise<SessionRecord | undefined> {
  const byId = await getSessionById(projectRoot, selector);

  if (byId) {
    return byId;
  }

  return await findLatestSessionByAgent(projectRoot, normalizeAgentName(selector));
}

async function resolveEventSelection(
  projectRoot: string,
  selector: string,
  limit: number
): Promise<ResolvedEventSelection | undefined> {
  const session = await resolveSessionById(projectRoot, selector);

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
    return {
      sessionId: selector,
      events: directSessionEvents
    };
  }

  const sessionByAgent = await findLatestSessionByAgent(projectRoot, normalizeAgentName(selector));

  if (!sessionByAgent) {
    return undefined;
  }

  const agentEvents = await listEvents(projectRoot, {
    sessionId: sessionByAgent.id,
    limit
  });

  return {
    session: sessionByAgent,
    sessionId: sessionByAgent.id,
    events: agentEvents
  };
}

async function resolveSessionById(projectRoot: string, selector: string): Promise<SessionRecord | undefined> {
  return await getSessionById(projectRoot, selector);
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
