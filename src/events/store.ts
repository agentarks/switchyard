import process from "node:process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { importSqlite } from "../storage/sqlite.js";
import type { CreateEventInput, EventPayload, EventRecord } from "./types.js";

export type EventRecorder = (projectRoot: string, input: CreateEventInput) => Promise<unknown>;

const CREATE_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    agent_name TEXT,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;

const CREATE_EVENTS_SESSION_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_events_session_created_at
  ON events (session_id, created_at, id)
`;

const CREATE_EVENTS_AGENT_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_events_agent_created_at
  ON events (agent_name, created_at, id)
`;

const CREATE_EVENTS_CREATED_AT_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_events_created_at
  ON events (created_at, id)
`;

interface EventRow {
  id: string;
  session_id: string | null;
  agent_name: string | null;
  event_type: string;
  payload_json: string;
  created_at: string;
}

interface ListEventsOptions {
  sessionId?: string;
  agentName?: string;
  limit?: number;
}

interface DistinctAgentSessionIdRow {
  session_id: string;
}

export async function initializeEventStore(projectRoot: string): Promise<void> {
  await withEventDatabase(projectRoot, () => {
    // Schema creation happens in the shared database helper.
  });
}

export async function createEvent(projectRoot: string, input: CreateEventInput): Promise<EventRecord> {
  const id = randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const sessionId = input.sessionId ?? null;
  const agentName = input.agentName ?? null;
  const payload = input.payload ?? {};

  await withEventDatabase(projectRoot, (db) => {
    db.prepare(`
      INSERT INTO events (id, session_id, agent_name, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, agentName, input.eventType, JSON.stringify(payload), createdAt);
  });

  return {
    id,
    sessionId,
    agentName,
    eventType: input.eventType,
    payload,
    createdAt
  };
}

export async function recordEventBestEffort(projectRoot: string, input: CreateEventInput): Promise<void> {
  await recordEventWithFallback(createEvent, projectRoot, input);
}

export async function recordEventWithFallback(
  recordEvent: EventRecorder,
  projectRoot: string,
  input: CreateEventInput
): Promise<void> {
  try {
    await recordEvent(projectRoot, input);
  } catch (error) {
    process.stderr.write(
      `WARN: failed to persist event '${input.eventType}': ${formatErrorMessage(error)}\n`
    );
  }
}

export async function listEvents(projectRoot: string, options: ListEventsOptions = {}): Promise<EventRecord[]> {
  return await withEventDatabase(projectRoot, (db) => {
    const clauses: string[] = [];
    const values: Array<string | number> = [];

    if (options.sessionId) {
      clauses.push("session_id = ?");
      values.push(options.sessionId);
    }

    if (options.agentName) {
      clauses.push("agent_name = ?");
      values.push(options.agentName);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limitClause = typeof options.limit === "number" ? "LIMIT ?" : "";

    if (typeof options.limit === "number") {
      values.push(options.limit);
    }

    const orderByClause = typeof options.limit === "number"
      ? "ORDER BY created_at DESC, id DESC"
      : "ORDER BY created_at ASC, id ASC";

    const rows = db.prepare(`
      SELECT id, session_id, agent_name, event_type, payload_json, created_at
      FROM events
      ${whereClause}
      ${orderByClause}
      ${limitClause}
    `).all(...values) as unknown as EventRow[];

    const mappedRows = rows.map(mapEventRow);
    return typeof options.limit === "number" ? mappedRows.reverse() : mappedRows;
  });
}

export async function listLatestEventsBySession(
  projectRoot: string,
  sessionIds: string[]
): Promise<Map<string, EventRecord>> {
  if (sessionIds.length === 0) {
    return new Map();
  }

  return await withEventDatabase(projectRoot, (db) => {
    const placeholders = sessionIds.map(() => "?").join(", ");
    const rows = db.prepare(`
      SELECT id, session_id, agent_name, event_type, payload_json, created_at
      FROM events
      WHERE session_id IN (${placeholders})
      ORDER BY created_at DESC, id DESC
    `).all(...sessionIds) as unknown as EventRow[];

    const latestEvents = new Map<string, EventRecord>();

    for (const row of rows) {
      if (!row.session_id || latestEvents.has(row.session_id)) {
        continue;
      }

      latestEvents.set(row.session_id, mapEventRow(row));
    }

    return latestEvents;
  });
}

export async function listDistinctSessionIdsForAgentEvents(
  projectRoot: string,
  agentName: string
): Promise<string[]> {
  return await withEventDatabase(projectRoot, (db) => {
    const rows = db.prepare(`
      SELECT DISTINCT session_id
      FROM events
      WHERE agent_name = ? AND session_id IS NOT NULL
      ORDER BY session_id ASC
    `).all(agentName) as unknown as DistinctAgentSessionIdRow[];

    return rows.map((row) => row.session_id);
  });
}

async function withEventDatabase<T>(projectRoot: string, operation: (db: DatabaseSync) => T): Promise<T> {
  const { DatabaseSync } = await importSqlite();
  const dbPath = join(projectRoot, ".switchyard", "events.db");
  const db = new DatabaseSync(dbPath);

  try {
    ensureEventSchema(db);
    return operation(db);
  } finally {
    db.close();
  }
}

function ensureEventSchema(db: DatabaseSync): void {
  db.exec(CREATE_EVENTS_TABLE_SQL);
  db.exec(CREATE_EVENTS_SESSION_INDEX_SQL);
  db.exec(CREATE_EVENTS_AGENT_INDEX_SQL);
  db.exec(CREATE_EVENTS_CREATED_AT_INDEX_SQL);
}

function mapEventRow(row: EventRow): EventRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    agentName: row.agent_name,
    eventType: row.event_type,
    payload: parsePayload(row.payload_json),
    createdAt: row.created_at
  };
}

function parsePayload(value: string): EventPayload {
  const parsed = JSON.parse(value) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return parsed as EventPayload;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
