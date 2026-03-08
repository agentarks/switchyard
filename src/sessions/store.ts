import { join } from "node:path";
import process from "node:process";
import type { DatabaseSync } from "node:sqlite";
import type { CreateSessionInput, SessionRecord, UpdateSessionStateInput } from "./types.js";

const CREATE_SESSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    branch TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    state TEXT NOT NULL,
    runtime_pid INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

interface SessionRow {
  id: string;
  agent_name: string;
  branch: string;
  worktree_path: string;
  state: SessionRecord["state"];
  runtime_pid: number | null;
  created_at: string;
  updated_at: string;
}

let sqliteModulePromise: Promise<typeof import("node:sqlite")> | undefined;

export async function initializeSessionStore(projectRoot: string): Promise<void> {
  await withSessionDatabase(projectRoot, () => {
    // Schema creation happens in the shared database helper.
  });
}

export async function listSessions(projectRoot: string): Promise<SessionRecord[]> {
  return await withSessionDatabase(projectRoot, (db) => {
    const rows = db.prepare(`
      SELECT id, agent_name, branch, worktree_path, state, runtime_pid, created_at, updated_at
      FROM sessions
      ORDER BY updated_at DESC, created_at DESC, id ASC
    `).all() as unknown as SessionRow[];

    return rows.map(mapSessionRow);
  });
}

export async function createSession(projectRoot: string, input: CreateSessionInput): Promise<SessionRecord> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const runtimePid = input.runtimePid ?? null;

  await withSessionDatabase(projectRoot, (db) => {
    db.prepare(`
      INSERT INTO sessions (id, agent_name, branch, worktree_path, state, runtime_pid, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.id, input.agentName, input.branch, input.worktreePath, input.state, runtimePid, createdAt, updatedAt);
  });

  return {
    id: input.id,
    agentName: input.agentName,
    branch: input.branch,
    worktreePath: input.worktreePath,
    state: input.state,
    runtimePid,
    createdAt,
    updatedAt
  };
}

export async function getSessionById(projectRoot: string, id: string): Promise<SessionRecord | undefined> {
  return await withSessionDatabase(projectRoot, (db) => {
    const row = db.prepare(`
      SELECT id, agent_name, branch, worktree_path, state, runtime_pid, created_at, updated_at
      FROM sessions
      WHERE id = ?
    `).get(id) as unknown as SessionRow | undefined;

    return row ? mapSessionRow(row) : undefined;
  });
}

export async function findLatestSessionByAgent(projectRoot: string, agentName: string): Promise<SessionRecord | undefined> {
  return await withSessionDatabase(projectRoot, (db) => {
    const row = db.prepare(`
      SELECT id, agent_name, branch, worktree_path, state, runtime_pid, created_at, updated_at
      FROM sessions
      WHERE agent_name = ?
      ORDER BY updated_at DESC, created_at DESC, id ASC
      LIMIT 1
    `).get(agentName) as unknown as SessionRow | undefined;

    return row ? mapSessionRow(row) : undefined;
  });
}

export async function updateSessionState(projectRoot: string, input: UpdateSessionStateInput): Promise<SessionRecord> {
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const runtimePid = input.runtimePid ?? null;

  await withSessionDatabase(projectRoot, (db) => {
    const result = db.prepare(`
      UPDATE sessions
      SET state = ?, runtime_pid = ?, updated_at = ?
      WHERE id = ?
    `).run(input.state, runtimePid, updatedAt, input.id);

    if (result.changes === 0) {
      throw new Error(`Session not found: ${input.id}`);
    }
  });

  const session = await getSessionById(projectRoot, input.id);

  if (!session) {
    throw new Error(`Session not found after update: ${input.id}`);
  }

  return session;
}

async function withSessionDatabase<T>(projectRoot: string, operation: (db: DatabaseSync) => T): Promise<T> {
  const { DatabaseSync } = await importSqlite();
  const dbPath = join(projectRoot, ".switchyard", "sessions.db");
  const db = new DatabaseSync(dbPath);

  try {
    ensureSessionsSchema(db);
    return operation(db);
  } finally {
    db.close();
  }
}

function ensureSessionsSchema(db: DatabaseSync): void {
  db.exec(CREATE_SESSIONS_TABLE_SQL);

  const columns = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("runtime_pid")) {
    db.exec("ALTER TABLE sessions ADD COLUMN runtime_pid INTEGER");
  }
}

async function importSqlite(): Promise<typeof import("node:sqlite")> {
  if (!sqliteModulePromise) {
    sqliteModulePromise = importSqliteOnce().catch((error: unknown) => {
      sqliteModulePromise = undefined;
      throw error;
    });
  }

  return await sqliteModulePromise;
}

async function importSqliteOnce(): Promise<typeof import("node:sqlite")> {
  const originalEmitWarning = process.emitWarning;

  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const warningName = typeof warning === "string" ? args[0] : warning.name;
    const warningCode = typeof warning === "string" ? args[1] : ("code" in warning ? warning.code : undefined);

    if (warningName === "ExperimentalWarning" || warningCode === "ExperimentalWarning") {
      return;
    }

    return originalEmitWarning.call(process, warning as never, ...(args as []));
  }) as typeof process.emitWarning;

  try {
    return await import("node:sqlite");
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

function mapSessionRow(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    agentName: row.agent_name,
    branch: row.branch,
    worktreePath: row.worktree_path,
    state: row.state,
    runtimePid: row.runtime_pid,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
