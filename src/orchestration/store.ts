import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { importSqlite } from "../storage/sqlite.js";
import type {
  ArtifactRecord,
  CreateArtifactRecordInput,
  CreateOrchestrationRunInput,
  CreateTaskRecordInput,
  HostCheckpointRecord,
  OrchestrationRunRecord,
  TaskRecord,
  UpsertHostCheckpointInput
} from "./types.js";

const CREATE_RUNS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS orchestration_runs (
    id TEXT PRIMARY KEY,
    objective TEXT NOT NULL,
    target_branch TEXT NOT NULL,
    integration_branch TEXT NOT NULL,
    integration_worktree_path TEXT NOT NULL,
    merge_policy TEXT NOT NULL,
    state TEXT NOT NULL,
    outcome TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const CREATE_TASKS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS orchestration_tasks (
    run_id TEXT NOT NULL,
    id TEXT NOT NULL,
    parent_task_id TEXT,
    role TEXT NOT NULL,
    title TEXT NOT NULL,
    file_scope_json TEXT NOT NULL,
    state TEXT NOT NULL,
    assigned_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (run_id, id),
    FOREIGN KEY (run_id, parent_task_id) REFERENCES orchestration_tasks (run_id, id)
  )
`;

const CREATE_TASKS_RUN_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_orchestration_tasks_run_created_at
  ON orchestration_tasks (run_id, created_at ASC, id ASC)
`;

const CREATE_ARTIFACTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS orchestration_artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    task_id TEXT,
    session_id TEXT,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;

const CREATE_ARTIFACTS_RUN_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_orchestration_artifacts_run_created_at
  ON orchestration_artifacts (run_id, created_at ASC, id ASC)
`;

const CREATE_HOST_CHECKPOINTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS orchestration_host_checkpoints (
    run_id TEXT PRIMARY KEY,
    lease_owner TEXT,
    lease_expires_at TEXT,
    checkpoint_task_id TEXT,
    completed_session_ids_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id, checkpoint_task_id) REFERENCES orchestration_tasks (run_id, id)
  )
`;

interface OrchestrationRunRow {
  id: string;
  objective: string;
  target_branch: string;
  integration_branch: string;
  integration_worktree_path: string;
  merge_policy: OrchestrationRunRecord["mergePolicy"];
  state: OrchestrationRunRecord["state"];
  outcome: OrchestrationRunRecord["outcome"];
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  run_id: string;
  parent_task_id: string | null;
  role: TaskRecord["role"];
  title: string;
  file_scope_json: string;
  state: TaskRecord["state"];
  assigned_session_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ArtifactRow {
  id: string;
  run_id: string;
  task_id: string | null;
  session_id: string | null;
  kind: ArtifactRecord["kind"];
  path: string;
  created_at: string;
}

interface HostCheckpointRow {
  run_id: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  checkpoint_task_id: string | null;
  completed_session_ids_json: string;
  updated_at: string;
}

export async function initializeOrchestrationStore(projectRoot: string): Promise<void> {
  await withOrchestrationDatabase(projectRoot, () => {
    // Schema creation happens in the shared database helper.
  });
}

export async function createOrchestrationRun(
  projectRoot: string,
  input: CreateOrchestrationRunInput
): Promise<OrchestrationRunRecord> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const outcome = input.outcome ?? null;

  await withOrchestrationDatabase(projectRoot, (db) => {
    db.prepare(`
      INSERT INTO orchestration_runs (
        id, objective, target_branch, integration_branch, integration_worktree_path, merge_policy, state, outcome, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.objective,
      input.targetBranch,
      input.integrationBranch,
      input.integrationWorktreePath,
      input.mergePolicy,
      input.state,
      outcome,
      createdAt,
      updatedAt
    );
  });

  return {
    id: input.id,
    objective: input.objective,
    targetBranch: input.targetBranch,
    integrationBranch: input.integrationBranch,
    integrationWorktreePath: input.integrationWorktreePath,
    mergePolicy: input.mergePolicy,
    state: input.state,
    outcome,
    createdAt,
    updatedAt
  };
}

export async function getOrchestrationRunById(
  projectRoot: string,
  id: string
): Promise<OrchestrationRunRecord | undefined> {
  return await withOrchestrationDatabase(projectRoot, (db) => {
    const row = db.prepare(`
      SELECT id, objective, target_branch, integration_branch, integration_worktree_path, merge_policy, state, outcome, created_at, updated_at
      FROM orchestration_runs
      WHERE id = ?
    `).get(id) as unknown as OrchestrationRunRow | undefined;

    return row ? mapRunRow(row) : undefined;
  });
}

export async function createTaskRecord(projectRoot: string, input: CreateTaskRecordInput): Promise<TaskRecord> {
  const fileScope = input.fileScope ?? [];
  const parentTaskId = input.parentTaskId ?? null;
  const assignedSessionId = input.assignedSessionId ?? null;
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;

  await withOrchestrationDatabase(projectRoot, (db) => {
    db.prepare(`
      INSERT INTO orchestration_tasks (
        id, run_id, parent_task_id, role, title, file_scope_json, state, assigned_session_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.runId,
      parentTaskId,
      input.role,
      input.title,
      JSON.stringify(fileScope),
      input.state,
      assignedSessionId,
      createdAt,
      updatedAt
    );
  });

  return {
    id: input.id,
    runId: input.runId,
    parentTaskId,
    role: input.role,
    title: input.title,
    fileScope,
    state: input.state,
    assignedSessionId,
    createdAt,
    updatedAt
  };
}

export async function listTasksForRun(projectRoot: string, runId: string): Promise<TaskRecord[]> {
  return await withOrchestrationDatabase(projectRoot, (db) => {
    const rows = db.prepare(`
      SELECT id, run_id, parent_task_id, role, title, file_scope_json, state, assigned_session_id, created_at, updated_at
      FROM orchestration_tasks
      WHERE run_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(runId) as unknown as TaskRow[];

    return rows.map(mapTaskRow);
  });
}

export async function createArtifactRecord(
  projectRoot: string,
  input: CreateArtifactRecordInput
): Promise<ArtifactRecord> {
  const taskId = input.taskId ?? null;
  const sessionId = input.sessionId ?? null;
  const createdAt = input.createdAt ?? new Date().toISOString();

  await withOrchestrationDatabase(projectRoot, (db) => {
    db.prepare(`
      INSERT INTO orchestration_artifacts (id, run_id, task_id, session_id, kind, path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(input.id, input.runId, taskId, sessionId, input.kind, input.path, createdAt);
  });

  return {
    id: input.id,
    runId: input.runId,
    taskId,
    sessionId,
    kind: input.kind,
    path: input.path,
    createdAt
  };
}

export async function listArtifactsForRun(projectRoot: string, runId: string): Promise<ArtifactRecord[]> {
  return await withOrchestrationDatabase(projectRoot, (db) => {
    const rows = db.prepare(`
      SELECT id, run_id, task_id, session_id, kind, path, created_at
      FROM orchestration_artifacts
      WHERE run_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(runId) as unknown as ArtifactRow[];

    return rows.map(mapArtifactRow);
  });
}

export async function upsertHostCheckpoint(
  projectRoot: string,
  input: UpsertHostCheckpointInput
): Promise<HostCheckpointRecord> {
  const leaseOwner = input.leaseOwner ?? null;
  const leaseExpiresAt = input.leaseExpiresAt ?? null;
  const checkpointTaskId = input.checkpointTaskId ?? null;
  const updatedAt = input.updatedAt ?? new Date().toISOString();

  await withOrchestrationDatabase(projectRoot, (db) => {
    db.prepare(`
      INSERT INTO orchestration_host_checkpoints (
        run_id, lease_owner, lease_expires_at, checkpoint_task_id, completed_session_ids_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        lease_owner = excluded.lease_owner,
        lease_expires_at = excluded.lease_expires_at,
        checkpoint_task_id = excluded.checkpoint_task_id,
        completed_session_ids_json = excluded.completed_session_ids_json,
        updated_at = excluded.updated_at
    `).run(
      input.runId,
      leaseOwner,
      leaseExpiresAt,
      checkpointTaskId,
      JSON.stringify(input.completedSessionIds),
      updatedAt
    );
  });

  return {
    runId: input.runId,
    leaseOwner,
    leaseExpiresAt,
    checkpointTaskId,
    completedSessionIds: input.completedSessionIds,
    updatedAt
  };
}

export async function getHostCheckpoint(projectRoot: string, runId: string): Promise<HostCheckpointRecord | undefined> {
  return await withOrchestrationDatabase(projectRoot, (db) => {
    const row = db.prepare(`
      SELECT run_id, lease_owner, lease_expires_at, checkpoint_task_id, completed_session_ids_json, updated_at
      FROM orchestration_host_checkpoints
      WHERE run_id = ?
    `).get(runId) as unknown as HostCheckpointRow | undefined;

    return row ? mapHostCheckpointRow(row) : undefined;
  });
}

async function withOrchestrationDatabase<T>(projectRoot: string, operation: (db: DatabaseSync) => T): Promise<T> {
  const { DatabaseSync } = await importSqlite();
  const dbPath = join(projectRoot, ".switchyard", "orchestration.db");
  const db = new DatabaseSync(dbPath);

  try {
    db.exec("PRAGMA foreign_keys = ON");
    ensureOrchestrationSchema(db);
    return operation(db);
  } finally {
    db.close();
  }
}

function ensureOrchestrationSchema(db: DatabaseSync): void {
  db.exec(CREATE_RUNS_TABLE_SQL);
  ensureTasksTableSchema(db);
  db.exec(CREATE_TASKS_RUN_INDEX_SQL);
  db.exec(CREATE_ARTIFACTS_TABLE_SQL);
  db.exec(CREATE_ARTIFACTS_RUN_INDEX_SQL);
  ensureHostCheckpointsTableSchema(db);
}

function ensureTasksTableSchema(db: DatabaseSync): void {
  if (!tableExists(db, "orchestration_tasks")) {
    db.exec(CREATE_TASKS_TABLE_SQL);
    return;
  }

  if (hasRunScopedTaskSchema(db)) {
    return;
  }

  db.exec("ALTER TABLE orchestration_tasks RENAME TO orchestration_tasks_legacy");
  db.exec(CREATE_TASKS_TABLE_SQL);
  db.exec(`
    INSERT INTO orchestration_tasks (
      run_id, id, parent_task_id, role, title, file_scope_json, state, assigned_session_id, created_at, updated_at
    )
    SELECT run_id, id, parent_task_id, role, title, file_scope_json, state, assigned_session_id, created_at, updated_at
    FROM orchestration_tasks_legacy
  `);
  db.exec("DROP TABLE orchestration_tasks_legacy");
}

function ensureHostCheckpointsTableSchema(db: DatabaseSync): void {
  if (!tableExists(db, "orchestration_host_checkpoints")) {
    db.exec(CREATE_HOST_CHECKPOINTS_TABLE_SQL);
    return;
  }

  if (hasRunScopedCheckpointSchema(db)) {
    return;
  }

  db.exec("ALTER TABLE orchestration_host_checkpoints RENAME TO orchestration_host_checkpoints_legacy");
  db.exec(CREATE_HOST_CHECKPOINTS_TABLE_SQL);
  db.exec(`
    INSERT INTO orchestration_host_checkpoints (
      run_id, lease_owner, lease_expires_at, checkpoint_task_id, completed_session_ids_json, updated_at
    )
    SELECT run_id, lease_owner, lease_expires_at, checkpoint_task_id, completed_session_ids_json, updated_at
    FROM orchestration_host_checkpoints_legacy
  `);
  db.exec("DROP TABLE orchestration_host_checkpoints_legacy");
}

function tableExists(db: DatabaseSync, tableName: string): boolean {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName) as { name: string } | undefined;

  return row !== undefined;
}

function hasRunScopedTaskSchema(db: DatabaseSync): boolean {
  const columns = db.prepare("PRAGMA table_info(orchestration_tasks)").all() as Array<{
    name: string;
    pk: number;
  }>;
  const primaryKeyOrder = new Map(columns.map((column) => [column.name, column.pk]));
  const foreignKeys = db.prepare("PRAGMA foreign_key_list(orchestration_tasks)").all() as Array<{
    from: string;
    to: string;
    table: string;
  }>;

  const hasCompositePrimaryKey =
    primaryKeyOrder.get("run_id") === 1 &&
    primaryKeyOrder.get("id") === 2;
  const hasRunScopedParentForeignKey =
    foreignKeys.some(
      (foreignKey) =>
        foreignKey.table === "orchestration_tasks" &&
        foreignKey.from === "run_id" &&
        foreignKey.to === "run_id"
    ) &&
    foreignKeys.some(
      (foreignKey) =>
        foreignKey.table === "orchestration_tasks" &&
        foreignKey.from === "parent_task_id" &&
        foreignKey.to === "id"
    );

  return hasCompositePrimaryKey && hasRunScopedParentForeignKey;
}

function hasRunScopedCheckpointSchema(db: DatabaseSync): boolean {
  const foreignKeys = db.prepare("PRAGMA foreign_key_list(orchestration_host_checkpoints)").all() as Array<{
    from: string;
    to: string;
    table: string;
  }>;

  return (
    foreignKeys.some(
      (foreignKey) =>
        foreignKey.table === "orchestration_tasks" &&
        foreignKey.from === "run_id" &&
        foreignKey.to === "run_id"
    ) &&
    foreignKeys.some(
      (foreignKey) =>
        foreignKey.table === "orchestration_tasks" &&
        foreignKey.from === "checkpoint_task_id" &&
        foreignKey.to === "id"
    )
  );
}

function mapRunRow(row: OrchestrationRunRow): OrchestrationRunRecord {
  return {
    id: row.id,
    objective: row.objective,
    targetBranch: row.target_branch,
    integrationBranch: row.integration_branch,
    integrationWorktreePath: row.integration_worktree_path,
    mergePolicy: row.merge_policy,
    state: row.state,
    outcome: row.outcome,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTaskRow(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    runId: row.run_id,
    parentTaskId: row.parent_task_id,
    role: row.role,
    title: row.title,
    fileScope: JSON.parse(row.file_scope_json) as string[],
    state: row.state,
    assignedSessionId: row.assigned_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapArtifactRow(row: ArtifactRow): ArtifactRecord {
  return {
    id: row.id,
    runId: row.run_id,
    taskId: row.task_id,
    sessionId: row.session_id,
    kind: row.kind,
    path: row.path,
    createdAt: row.created_at
  };
}

function mapHostCheckpointRow(row: HostCheckpointRow): HostCheckpointRecord {
  return {
    runId: row.run_id,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    checkpointTaskId: row.checkpoint_task_id,
    completedSessionIds: JSON.parse(row.completed_session_ids_json) as string[],
    updatedAt: row.updated_at
  };
}
