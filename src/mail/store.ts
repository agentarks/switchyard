import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { importSqlite } from "../storage/sqlite.js";
import type { CreateMailInput, MailRecord } from "./types.js";

const CREATE_MAIL_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS mail_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
  )
`;

const CREATE_MAIL_SESSION_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_mail_messages_session_created_at
  ON mail_messages (session_id, created_at, id)
`;

const CREATE_MAIL_UNREAD_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_mail_messages_session_unread
  ON mail_messages (session_id, read_at, created_at, id)
`;

interface MailRow {
  id: string;
  session_id: string;
  sender: string;
  recipient: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export async function initializeMailStore(projectRoot: string): Promise<void> {
  await withMailDatabase(projectRoot, () => {
    // Schema creation happens in the shared database helper.
  });
}

export async function createMail(projectRoot: string, input: CreateMailInput): Promise<MailRecord> {
  const id = randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();

  await withMailDatabase(projectRoot, (db) => {
    db.prepare(`
      INSERT INTO mail_messages (id, session_id, sender, recipient, body, created_at, read_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `).run(id, input.sessionId, input.sender, input.recipient, input.body, createdAt);
  });

  return {
    id,
    sessionId: input.sessionId,
    sender: input.sender,
    recipient: input.recipient,
    body: input.body,
    createdAt,
    readAt: null
  };
}

export async function listMailForSession(
  projectRoot: string,
  sessionId: string,
  options: { unreadOnly?: boolean } = {}
): Promise<MailRecord[]> {
  return await withMailDatabase(projectRoot, (db) => {
    const filters = ["session_id = ?"];
    if (options.unreadOnly) {
      filters.push("read_at IS NULL");
    }

    const rows = db.prepare(`
      SELECT id, session_id, sender, recipient, body, created_at, read_at
      FROM mail_messages
      WHERE ${filters.join(" AND ")}
      ORDER BY created_at ASC, id ASC
    `).all(sessionId) as unknown as MailRow[];

    return rows.map(mapMailRow);
  });
}

export async function readUnreadMailForSession(projectRoot: string, sessionId: string): Promise<MailRecord[]> {
  const readAt = new Date().toISOString();

  return await withMailDatabase(projectRoot, (db) => {
    // Claim unread rows in one statement so concurrent readers cannot receive the same message twice.
    const rows = db.prepare(`
      UPDATE mail_messages
      SET read_at = ?
      WHERE session_id = ? AND read_at IS NULL
      RETURNING id, session_id, sender, recipient, body, created_at, read_at
    `).all(readAt, sessionId) as unknown as MailRow[];

    return rows
      .map(mapMailRow)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  });
}

async function withMailDatabase<T>(projectRoot: string, operation: (db: DatabaseSync) => T): Promise<T> {
  const { DatabaseSync } = await importSqlite();
  const dbPath = join(projectRoot, ".switchyard", "mail.db");
  const db = new DatabaseSync(dbPath);

  try {
    ensureMailSchema(db);
    return operation(db);
  } finally {
    db.close();
  }
}

function ensureMailSchema(db: DatabaseSync): void {
  db.exec(CREATE_MAIL_TABLE_SQL);
  db.exec(CREATE_MAIL_SESSION_INDEX_SQL);
  db.exec(CREATE_MAIL_UNREAD_INDEX_SQL);
}

function mapMailRow(row: MailRow): MailRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    sender: row.sender,
    recipient: row.recipient,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at
  };
}
