import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
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
