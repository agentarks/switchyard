import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "../config.js";
import { listDistinctSessionIdsForAgentEvents, listEvents } from "../events/store.js";
import type { EventPayload, EventRecord } from "../events/types.js";
import { EventsError } from "../errors.js";
import type { SessionRecord } from "../sessions/types.js";
import {
  findSessionSelectorMatches,
  formatSessionIdList,
  formatSessionSelectorAmbiguousMessage
} from "./session-selector.js";

const DEFAULT_EVENT_LIMIT = 10;

interface EventsCommandOptions {
  selector?: string;
  startDir?: string;
  limit?: number | string | boolean;
}

interface ResolvedEventSelection {
  session?: SessionRecord;
  sessionId?: string;
  agentName?: string;
  events?: EventRecord[];
}

export function createEventsCommand(): Command {
  return new Command("events")
    .description("Show recent durable lifecycle events")
    .argument("[session]", "Optional session id or agent name")
    .option("--limit [count]", "Show up to <count> recent events")
    .action(async (selector: string | undefined, options: { limit?: string | boolean }) => {
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
      process.stdout.write(`Session: ${session.id}\n`);
      return;
    }

    process.stdout.write("No Switchyard events recorded yet.\n");
    return;
  }

  process.stdout.write(`${formatHeading(config.project.name, session, selection?.sessionId, selection?.agentName)}\n`);
  process.stdout.write("TIME\tEVENT\tAGENT\tSESSION\tDETAILS\n");

  for (const event of events) {
    process.stdout.write(formatEventRow(event));
  }
}

interface ResolvedSessionSelector {
  byId?: SessionRecord;
  byAgent: SessionRecord[];
  normalizedAgentName?: string;
}

async function resolveSessionSelector(projectRoot: string, selector: string): Promise<ResolvedSessionSelector> {
  const matches = await findSessionSelectorMatches(projectRoot, selector);
  const conflictingAgentMatches = matches.byId
    ? matches.byAgent.filter((session) => session.id !== matches.byId?.id)
    : matches.byAgent;

  if (matches.byId && conflictingAgentMatches.length > 0) {
    throw new EventsError(
      formatSessionSelectorAmbiguousMessage(selector, {
        byId: matches.byId,
        byAgent: conflictingAgentMatches
      })
    );
  }

  return {
    byId: matches.byId,
    byAgent: conflictingAgentMatches,
    normalizedAgentName: matches.normalizedAgentName
  };
}

async function resolveEventSelection(
  projectRoot: string,
  selector: string,
  limit: number
): Promise<ResolvedEventSelection | undefined> {
  const { byId, byAgent, normalizedAgentName } = await resolveSessionSelector(projectRoot, selector);

  if (byId) {
    const events = await listEvents(projectRoot, {
      sessionId: byId.id,
      limit
    });

    return {
      session: byId,
      sessionId: byId.id,
      events
    };
  }

  const directSessionEvents = await listEvents(projectRoot, {
    sessionId: selector,
    limit
  });

  if (directSessionEvents.length > 0) {
    if (byAgent.length === 1) {
      throw new EventsError(
        `Selector '${selector}' is ambiguous: it matches orphaned events for session '${selector}' and session '${byAgent[0]?.id}' by agent name.`
      );
    }

    if (byAgent.length > 1) {
      throw new EventsError(
        `Selector '${selector}' is ambiguous: it matches orphaned events for session '${selector}' and multiple sessions by agent name (${formatSessionIdList(byAgent)}). Use an exact session id from 'sy status'.`
      );
    }

    return {
      sessionId: selector,
      events: directSessionEvents
    };
  }

  if (byAgent.length === 0) {
    if (!normalizedAgentName) {
      return undefined;
    }

    return await resolveOrphanedAgentEventSelection(projectRoot, selector, normalizedAgentName, limit);
  }

  if (byAgent.length > 1) {
    throw new EventsError(
      formatSessionSelectorAmbiguousMessage(selector, {
        byAgent
      })
    );
  }

  const session = byAgent[0];

  if (!session) {
    return undefined;
  }

  const agentEvents = await listEvents(projectRoot, {
    sessionId: session.id,
    limit
  });

  return {
    session,
    sessionId: session.id,
    events: agentEvents
  };
}

async function resolveOrphanedAgentEventSelection(
  projectRoot: string,
  selector: string,
  agentName: string,
  limit: number
): Promise<ResolvedEventSelection | undefined> {
  const sessionIds = await listDistinctSessionIdsForAgentEvents(projectRoot, agentName);

  if (sessionIds.length > 1) {
    throw new EventsError(
      `Selector '${selector}' is ambiguous: it matches orphaned events for multiple sessions by agent name (${sessionIds.map((sessionId) => `'${sessionId}'`).join(", ")}). Use an exact session id.`
    );
  }

  const agentEvents = await listEvents(projectRoot, {
    agentName,
    limit
  });

  if (agentEvents.length === 0) {
    return undefined;
  }

  return {
    agentName,
    sessionId: sessionIds[0],
    events: agentEvents
  };
}

function formatHeading(projectName: string, session?: SessionRecord, sessionId?: string, agentName?: string): string {
  if (!session) {
    if (agentName) {
      if (sessionId) {
        return `Recent events for ${agentName} (${sessionId}):`;
      }

      return `Recent events for ${agentName}:`;
    }

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

function resolveEventLimit(limit: number | string | boolean | undefined): number {
  if (typeof limit === "undefined") {
    return DEFAULT_EVENT_LIMIT;
  }

  if (typeof limit === "boolean") {
    if (limit) {
      throw new EventsError("Missing value for '--limit'. Use '--limit <count>' with a positive integer.");
    }

    return DEFAULT_EVENT_LIMIT;
  }

  if (typeof limit === "number") {
    return validateEventLimit(limit);
  }

  const trimmedLimit = limit.trim();

  if (!/^\d+$/.test(trimmedLimit)) {
    throw new EventsError(`Invalid event limit '${limit}'. Use a positive integer.`);
  }

  const parsedLimit = BigInt(trimmedLimit);

  if (parsedLimit < 1n || parsedLimit > BigInt(Number.MAX_SAFE_INTEGER)) {
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
