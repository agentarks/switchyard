import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { importSqlite } from "../storage/sqlite.js";
import type { CreateRunInput, RunRecord, UpdateRunInput } from "./types.js";

const CREATE_RUNS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    task_summary TEXT NOT NULL,
    task_spec_path TEXT,
    state TEXT NOT NULL,
    outcome TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    finished_at TEXT
  )
`;

const CREATE_RUNS_SESSION_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_runs_session_created_at
  ON runs (session_id, created_at DESC, id DESC)
`;

interface RunRow {
  id: string;
  session_id: string;
  agent_name: string;
  task_summary: string;
  task_spec_path: string | null;
  state: RunRecord["state"];
  outcome: RunRecord["outcome"];
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export async function initializeRunStore(projectRoot: string): Promise<void> {
  await withRunDatabase(projectRoot, () => {
    // Schema creation happens in the shared database helper.
  });
}

export async function createRun(projectRoot: string, input: CreateRunInput): Promise<RunRecord> {
  const id = input.id ?? randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const taskSpecPath = input.taskSpecPath ?? null;
  const outcome = input.outcome ?? null;
  const finishedAt = input.finishedAt ?? null;

  await withRunDatabase(projectRoot, (db) => {
    db.prepare(`
      INSERT INTO runs (
        id, session_id, agent_name, task_summary, task_spec_path, state, outcome, created_at, updated_at, finished_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.sessionId,
      input.agentName,
      input.taskSummary,
      taskSpecPath,
      input.state,
      outcome,
      createdAt,
      updatedAt,
      finishedAt
    );
  });

  return {
    id,
    sessionId: input.sessionId,
    agentName: input.agentName,
    taskSummary: input.taskSummary,
    taskSpecPath,
    state: input.state,
    outcome,
    createdAt,
    updatedAt,
    finishedAt
  };
}

export async function getLatestRunForSession(
  projectRoot: string,
  sessionId: string
): Promise<RunRecord | undefined> {
  return await withRunDatabase(projectRoot, (db) => {
    const row = db.prepare(`
      SELECT id, session_id, agent_name, task_summary, task_spec_path, state, outcome, created_at, updated_at, finished_at
      FROM runs
      WHERE session_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).get(sessionId) as unknown as RunRow | undefined;

    return row ? mapRunRow(row) : undefined;
  });
}

export async function listLatestRunsBySession(
  projectRoot: string,
  sessionIds: string[]
): Promise<Map<string, RunRecord>> {
  if (sessionIds.length === 0) {
    return new Map();
  }

  return await withRunDatabase(projectRoot, (db) => {
    const placeholders = sessionIds.map(() => "?").join(", ");
    const rows = db.prepare(`
      SELECT id, session_id, agent_name, task_summary, task_spec_path, state, outcome, created_at, updated_at, finished_at
      FROM runs
      WHERE session_id IN (${placeholders})
      ORDER BY created_at DESC, id DESC
    `).all(...sessionIds) as unknown as RunRow[];

    const latestRuns = new Map<string, RunRecord>();

    for (const row of rows) {
      if (latestRuns.has(row.session_id)) {
        continue;
      }

      latestRuns.set(row.session_id, mapRunRow(row));
    }

    return latestRuns;
  });
}

export async function updateRun(projectRoot: string, input: UpdateRunInput): Promise<RunRecord> {
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const outcome = input.outcome ?? null;
  const finishedAt = input.finishedAt ?? null;

  await withRunDatabase(projectRoot, (db) => {
    const result = db.prepare(`
      UPDATE runs
      SET state = ?, outcome = ?, updated_at = ?, finished_at = ?
      WHERE id = ?
    `).run(input.state, outcome, updatedAt, finishedAt, input.id);

    if (result.changes === 0) {
      throw new Error(`Run not found: ${input.id}`);
    }
  });

  const run = await getRunById(projectRoot, input.id);

  if (!run) {
    throw new Error(`Run not found after update: ${input.id}`);
  }

  return run;
}

export async function updateLatestRunForSession(
  projectRoot: string,
  sessionId: string,
  input: Omit<UpdateRunInput, "id">
): Promise<RunRecord | undefined> {
  const latestRun = await getLatestRunForSession(projectRoot, sessionId);

  if (!latestRun) {
    return undefined;
  }

  return await updateRun(projectRoot, {
    id: latestRun.id,
    ...input
  });
}

async function getRunById(projectRoot: string, runId: string): Promise<RunRecord | undefined> {
  return await withRunDatabase(projectRoot, (db) => {
    const row = db.prepare(`
      SELECT id, session_id, agent_name, task_summary, task_spec_path, state, outcome, created_at, updated_at, finished_at
      FROM runs
      WHERE id = ?
    `).get(runId) as unknown as RunRow | undefined;

    return row ? mapRunRow(row) : undefined;
  });
}

async function withRunDatabase<T>(projectRoot: string, operation: (db: DatabaseSync) => T): Promise<T> {
  const { DatabaseSync } = await importSqlite();
  const dbPath = join(projectRoot, ".switchyard", "runs.db");
  const db = new DatabaseSync(dbPath);

  try {
    ensureRunSchema(db);
    return operation(db);
  } finally {
    db.close();
  }
}

function ensureRunSchema(db: DatabaseSync): void {
  db.exec(CREATE_RUNS_TABLE_SQL);
  db.exec(CREATE_RUNS_SESSION_INDEX_SQL);
}

function mapRunRow(row: RunRow): RunRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    agentName: row.agent_name,
    taskSummary: row.task_summary,
    taskSpecPath: row.task_spec_path,
    state: row.state,
    outcome: row.outcome,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at
  };
}
