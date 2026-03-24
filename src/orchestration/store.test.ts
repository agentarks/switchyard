import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { importSqlite } from "../storage/sqlite.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import {
  createArtifactRecord,
  createOrchestrationRun,
  createTaskRecord,
  getHostCheckpoint,
  getOrchestrationRunById,
  initializeOrchestrationStore,
  listArtifactsForRun,
  listTasksForRun,
  updateOrchestrationRun,
  updateTaskRecord,
  upsertHostCheckpoint
} from "./store.js";

test("initializeOrchestrationStore creates the orchestration schema without records", async () => {
  const repoDir = await createTempGitRepo("switchyard-orchestration-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);
    await initializeOrchestrationStore(repoDir);

    const run = await getOrchestrationRunById(repoDir, "missing-run");
    assert.equal(run, undefined);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("orchestration store persists runs, task graphs, artifacts, and host checkpoints", async () => {
  const repoDir = await createTempGitRepo("switchyard-orchestration-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    const run = await createOrchestrationRun(repoDir, {
      id: "run-001",
      objective: "Ship durable orchestration state",
      targetBranch: "main",
      integrationBranch: "runs/run-001/lead",
      integrationWorktreePath: join(repoDir, ".switchyard", "worktrees", "run-001-lead"),
      mergePolicy: "manual-ready",
      state: "planning",
      createdAt: "2026-03-19T14:00:00.000Z",
      updatedAt: "2026-03-19T14:00:00.000Z"
    });

    const parentTask = await createTaskRecord(repoDir, {
      id: "task-root",
      runId: run.id,
      parentTaskId: null,
      role: "lead",
      title: "Plan the bounded run",
      fileScope: ["docs/current-state.md"],
      state: "planned",
      createdAt: "2026-03-19T14:01:00.000Z",
      updatedAt: "2026-03-19T14:01:00.000Z"
    });

    await createTaskRecord(repoDir, {
      id: "task-build-store",
      runId: run.id,
      parentTaskId: parentTask.id,
      role: "builder",
      title: "Add the orchestration store",
      fileScope: ["src/orchestration/store.ts", "src/sessions/store.ts"],
      state: "planned",
      assignedSessionId: "session-lead",
      createdAt: "2026-03-19T14:02:00.000Z",
      updatedAt: "2026-03-19T14:02:00.000Z"
    });

    await createArtifactRecord(repoDir, {
      id: "artifact-objective",
      runId: run.id,
      taskId: parentTask.id,
      sessionId: "session-lead",
      kind: "objective_spec",
      path: ".switchyard/objectives/run-001.md",
      createdAt: "2026-03-19T14:03:00.000Z"
    });
    await createArtifactRecord(repoDir, {
      id: "artifact-log",
      runId: run.id,
      taskId: "task-build-store",
      sessionId: "session-lead",
      kind: "session_log",
      path: ".switchyard/logs/session-lead.log",
      createdAt: "2026-03-19T14:03:15.000Z"
    });
    await createArtifactRecord(repoDir, {
      id: "artifact-branch",
      runId: run.id,
      taskId: "task-build-store",
      sessionId: "session-lead",
      kind: "branch",
      path: "runs/run-001/lead",
      createdAt: "2026-03-19T14:03:20.000Z"
    });
    await createArtifactRecord(repoDir, {
      id: "artifact-worktree",
      runId: run.id,
      kind: "integration_worktree",
      path: join(repoDir, ".switchyard", "worktrees", "run-001-lead"),
      createdAt: "2026-03-19T14:03:30.000Z"
    });
    await createArtifactRecord(repoDir, {
      id: "artifact-verification",
      runId: run.id,
      taskId: "task-build-store",
      sessionId: "session-lead",
      kind: "verification_output",
      path: ".switchyard/agent-results/task-build-store.json",
      createdAt: "2026-03-19T14:04:00.000Z"
    });

    await upsertHostCheckpoint(repoDir, {
      runId: run.id,
      leaseOwner: "host-1",
      leaseExpiresAt: "2026-03-19T14:10:00.000Z",
      checkpointTaskId: "task-build-store",
      completedSessionIds: ["session-lead", "session-builder-1"],
      updatedAt: "2026-03-19T14:05:00.000Z"
    });

    const storedRun = await getOrchestrationRunById(repoDir, run.id);
    const tasks = await listTasksForRun(repoDir, run.id);
    const artifacts = await listArtifactsForRun(repoDir, run.id);
    const checkpoint = await getHostCheckpoint(repoDir, run.id);

    assert.equal(storedRun?.objective, "Ship durable orchestration state");
    assert.equal(storedRun?.targetBranch, "main");
    assert.equal(storedRun?.integrationBranch, "runs/run-001/lead");
    assert.equal(storedRun?.integrationWorktreePath, join(repoDir, ".switchyard", "worktrees", "run-001-lead"));
    assert.equal(storedRun?.mergePolicy, "manual-ready");
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0]?.id, "task-root");
    assert.equal(tasks[1]?.parentTaskId, "task-root");
    assert.deepEqual(tasks[1]?.fileScope, ["src/orchestration/store.ts", "src/sessions/store.ts"]);
    assert.equal(artifacts.length, 5);
    assert.equal(artifacts[0]?.kind, "objective_spec");
    assert.equal(artifacts[1]?.kind, "session_log");
    assert.equal(artifacts[2]?.kind, "branch");
    assert.equal(artifacts[3]?.kind, "integration_worktree");
    assert.equal(artifacts[4]?.kind, "verification_output");
    assert.equal(checkpoint?.leaseOwner, "host-1");
    assert.equal(checkpoint?.checkpointTaskId, "task-build-store");
    assert.deepEqual(checkpoint?.completedSessionIds, ["session-lead", "session-builder-1"]);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("orchestration store updates durable run and task state", async () => {
  const repoDir = await createTempGitRepo("switchyard-orchestration-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createOrchestrationRun(repoDir, {
      id: "run-001",
      objective: "Update orchestration lifecycle state",
      targetBranch: "main",
      integrationBranch: "runs/run-001/lead",
      integrationWorktreePath: join(repoDir, ".switchyard", "worktrees", "run-001-lead"),
      mergePolicy: "manual-ready",
      state: "planning",
      createdAt: "2026-03-24T14:00:00.000Z",
      updatedAt: "2026-03-24T14:00:00.000Z"
    });
    await createTaskRecord(repoDir, {
      id: "task-001",
      runId: "run-001",
      role: "lead",
      title: "Launch the lead",
      state: "in_progress",
      assignedSessionId: "session-001",
      createdAt: "2026-03-24T14:00:00.000Z",
      updatedAt: "2026-03-24T14:00:00.000Z"
    });

    const updatedRun = await updateOrchestrationRun(repoDir, {
      id: "run-001",
      state: "failed",
      outcome: "failed",
      updatedAt: "2026-03-24T14:05:00.000Z"
    });
    const updatedTask = await updateTaskRecord(repoDir, {
      runId: "run-001",
      id: "task-001",
      state: "blocked",
      updatedAt: "2026-03-24T14:05:00.000Z"
    });

    const storedRun = await getOrchestrationRunById(repoDir, "run-001");
    const tasks = await listTasksForRun(repoDir, "run-001");

    assert.equal(updatedRun.state, "failed");
    assert.equal(updatedRun.outcome, "failed");
    assert.equal(updatedTask.state, "blocked");
    assert.equal(storedRun?.state, "failed");
    assert.equal(storedRun?.outcome, "failed");
    assert.equal(tasks[0]?.state, "blocked");
    assert.equal(tasks[0]?.updatedAt, "2026-03-24T14:05:00.000Z");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("orchestration tasks are scoped per run and reject cross-run parent references", async () => {
  const repoDir = await createTempGitRepo("switchyard-orchestration-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createOrchestrationRun(repoDir, {
      id: "run-001",
      objective: "First run",
      targetBranch: "main",
      integrationBranch: "runs/run-001/lead",
      integrationWorktreePath: join(repoDir, ".switchyard", "worktrees", "run-001-lead"),
      mergePolicy: "manual-ready",
      state: "planning"
    });
    await createOrchestrationRun(repoDir, {
      id: "run-002",
      objective: "Second run",
      targetBranch: "main",
      integrationBranch: "runs/run-002/lead",
      integrationWorktreePath: join(repoDir, ".switchyard", "worktrees", "run-002-lead"),
      mergePolicy: "manual-ready",
      state: "planning"
    });

    await createTaskRecord(repoDir, {
      id: "task-root",
      runId: "run-001",
      role: "lead",
      title: "Plan run one",
      state: "planned"
    });
    await createTaskRecord(repoDir, {
      id: "task-root",
      runId: "run-002",
      role: "lead",
      title: "Plan run two",
      state: "planned"
    });

    await createTaskRecord(repoDir, {
      id: "task-run-1-only",
      runId: "run-001",
      parentTaskId: "task-root",
      role: "builder",
      title: "Run one child",
      state: "planned"
    });

    await assert.rejects(
      () =>
        createTaskRecord(repoDir, {
          id: "task-cross-run-child",
          runId: "run-002",
          parentTaskId: "task-run-1-only",
          role: "builder",
          title: "Should fail",
          state: "planned"
        }),
      /constraint/i
    );

    const runOneTasks = await listTasksForRun(repoDir, "run-001");
    const runTwoTasks = await listTasksForRun(repoDir, "run-002");

    assert.equal(runOneTasks[0]?.id, "task-root");
    assert.equal(runTwoTasks[0]?.id, "task-root");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("host checkpoints reject checkpoint task ids that are not owned by the same run", async () => {
  const repoDir = await createTempGitRepo("switchyard-orchestration-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createOrchestrationRun(repoDir, {
      id: "run-001",
      objective: "First run",
      targetBranch: "main",
      integrationBranch: "runs/run-001/lead",
      integrationWorktreePath: join(repoDir, ".switchyard", "worktrees", "run-001-lead"),
      mergePolicy: "manual-ready",
      state: "planning"
    });
    await createOrchestrationRun(repoDir, {
      id: "run-002",
      objective: "Second run",
      targetBranch: "main",
      integrationBranch: "runs/run-002/lead",
      integrationWorktreePath: join(repoDir, ".switchyard", "worktrees", "run-002-lead"),
      mergePolicy: "manual-ready",
      state: "planning"
    });

    await createTaskRecord(repoDir, {
      id: "task-run-1-only",
      runId: "run-001",
      role: "lead",
      title: "Run one root",
      state: "planned"
    });

    await assert.rejects(
      () =>
        upsertHostCheckpoint(repoDir, {
          runId: "run-002",
          checkpointTaskId: "task-run-1-only",
          completedSessionIds: []
        }),
      /constraint/i
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("artifacts reject task ids that are missing or owned by another run", async () => {
  const repoDir = await createTempGitRepo("switchyard-orchestration-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createOrchestrationRun(repoDir, {
      id: "run-001",
      objective: "First run",
      targetBranch: "main",
      integrationBranch: "runs/run-001/lead",
      integrationWorktreePath: join(repoDir, ".switchyard", "worktrees", "run-001-lead"),
      mergePolicy: "manual-ready",
      state: "planning"
    });
    await createOrchestrationRun(repoDir, {
      id: "run-002",
      objective: "Second run",
      targetBranch: "main",
      integrationBranch: "runs/run-002/lead",
      integrationWorktreePath: join(repoDir, ".switchyard", "worktrees", "run-002-lead"),
      mergePolicy: "manual-ready",
      state: "planning"
    });

    await createTaskRecord(repoDir, {
      id: "task-run-1-only",
      runId: "run-001",
      role: "lead",
      title: "Run one root",
      state: "planned"
    });

    await assert.rejects(
      () =>
        createArtifactRecord(repoDir, {
          id: "artifact-missing-task",
          runId: "run-001",
          taskId: "missing-task",
          kind: "objective_spec",
          path: ".switchyard/objectives/missing.md"
        }),
      /constraint/i
    );

    await assert.rejects(
      () =>
        createArtifactRecord(repoDir, {
          id: "artifact-cross-run-task",
          runId: "run-002",
          taskId: "task-run-1-only",
          kind: "verification_output",
          path: ".switchyard/agent-results/cross-run.json"
        }),
      /constraint/i
    );
  } finally {
    await removeTempDir(repoDir);
  }
});

test("task migration fails closed and preserves legacy data when invalid rows cannot be upgraded", async () => {
  const repoDir = await createTempGitRepo("switchyard-orchestration-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);
    const { DatabaseSync } = await importSqlite();
    const db = new DatabaseSync(join(repoDir, ".switchyard", "orchestration.db"));

    try {
      db.exec(`
        CREATE TABLE orchestration_tasks (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          parent_task_id TEXT,
          role TEXT NOT NULL,
          title TEXT NOT NULL,
          file_scope_json TEXT NOT NULL,
          state TEXT NOT NULL,
          assigned_session_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.exec(`
        CREATE TABLE orchestration_host_checkpoints (
          run_id TEXT PRIMARY KEY,
          lease_owner TEXT,
          lease_expires_at TEXT,
          checkpoint_task_id TEXT,
          completed_session_ids_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.prepare(`
        INSERT INTO orchestration_tasks (
          id, run_id, parent_task_id, role, title, file_scope_json, state, assigned_session_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "task-root",
        "run-001",
        null,
        "lead",
        "Run one root",
        "[]",
        "planned",
        null,
        "2026-03-19T14:00:00.000Z",
        "2026-03-19T14:00:00.000Z"
      );
      db.prepare(`
        INSERT INTO orchestration_tasks (
          id, run_id, parent_task_id, role, title, file_scope_json, state, assigned_session_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "task-cross-run-child",
        "run-002",
        "task-root",
        "builder",
        "Invalid cross-run child",
        "[]",
        "planned",
        null,
        "2026-03-19T14:01:00.000Z",
        "2026-03-19T14:01:00.000Z"
      );
    } finally {
      db.close();
    }

    await assert.rejects(() => initializeOrchestrationStore(repoDir), /constraint/i);

    const reopened = new (await importSqlite()).DatabaseSync(join(repoDir, ".switchyard", "orchestration.db"));

    try {
      const taskCount = reopened.prepare("SELECT COUNT(*) AS count FROM orchestration_tasks").get() as { count: number };
      const legacyTable = reopened
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orchestration_tasks_legacy'")
        .get() as { name: string } | undefined;

      assert.equal(taskCount.count, 2);
      assert.equal(legacyTable, undefined);
    } finally {
      reopened.close();
    }
  } finally {
    await removeTempDir(repoDir);
  }
});

test("task migration does not ignore stranded legacy rows from an interrupted prior upgrade", async () => {
  const repoDir = await createTempGitRepo("switchyard-orchestration-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);
    const { DatabaseSync } = await importSqlite();
    const db = new DatabaseSync(join(repoDir, ".switchyard", "orchestration.db"));

    try {
      db.exec(`
        CREATE TABLE orchestration_tasks (
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
      `);
      db.exec(`
        CREATE TABLE orchestration_tasks_legacy (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          parent_task_id TEXT,
          role TEXT NOT NULL,
          title TEXT NOT NULL,
          file_scope_json TEXT NOT NULL,
          state TEXT NOT NULL,
          assigned_session_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.prepare(`
        INSERT INTO orchestration_tasks_legacy (
          id, run_id, parent_task_id, role, title, file_scope_json, state, assigned_session_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "task-root",
        "run-001",
        null,
        "lead",
        "Run one root",
        "[]",
        "planned",
        null,
        "2026-03-19T14:00:00.000Z",
        "2026-03-19T14:00:00.000Z"
      );
      db.prepare(`
        INSERT INTO orchestration_tasks_legacy (
          id, run_id, parent_task_id, role, title, file_scope_json, state, assigned_session_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "task-cross-run-child",
        "run-002",
        "task-root",
        "builder",
        "Invalid cross-run child",
        "[]",
        "planned",
        null,
        "2026-03-19T14:01:00.000Z",
        "2026-03-19T14:01:00.000Z"
      );
    } finally {
      db.close();
    }

    await assert.rejects(() => initializeOrchestrationStore(repoDir), /constraint/i);

    const reopened = new (await importSqlite()).DatabaseSync(join(repoDir, ".switchyard", "orchestration.db"));

    try {
      const taskCount = reopened.prepare("SELECT COUNT(*) AS count FROM orchestration_tasks").get() as { count: number };
      const legacyTable = reopened
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orchestration_tasks_legacy'")
        .get() as { name: string } | undefined;

      assert.equal(taskCount.count, 2);
      assert.equal(legacyTable, undefined);
    } finally {
      reopened.close();
    }
  } finally {
    await removeTempDir(repoDir);
  }
});
