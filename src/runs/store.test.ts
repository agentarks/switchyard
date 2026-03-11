import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { createRun, getLatestRunForSession, initializeRunStore, listLatestRunsBySession, updateRun } from "./store.js";

test("initializeRunStore creates the runs schema without records", async () => {
  const repoDir = await createTempGitRepo("switchyard-run-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);
    await initializeRunStore(repoDir);

    const run = await getLatestRunForSession(repoDir, "missing-session");
    assert.equal(run, undefined);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("getLatestRunForSession returns the newest run for one session", async () => {
  const repoDir = await createTempGitRepo("switchyard-run-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createRun(repoDir, {
      id: "run-earlier",
      sessionId: "session-1",
      agentName: "agent-one",
      taskSummary: "Earlier task",
      state: "finished",
      outcome: "failed",
      createdAt: "2026-03-11T09:00:00.000Z",
      updatedAt: "2026-03-11T09:05:00.000Z",
      finishedAt: "2026-03-11T09:05:00.000Z"
    });
    await createRun(repoDir, {
      id: "run-latest",
      sessionId: "session-1",
      agentName: "agent-one",
      taskSummary: "Latest task",
      taskSpecPath: ".switchyard/specs/agent-one-run-latest.md",
      state: "active",
      createdAt: "2026-03-11T10:00:00.000Z",
      updatedAt: "2026-03-11T10:01:00.000Z"
    });

    const latestRun = await getLatestRunForSession(repoDir, "session-1");

    assert.equal(latestRun?.id, "run-latest");
    assert.equal(latestRun?.taskSummary, "Latest task");
    assert.equal(latestRun?.taskSpecPath, ".switchyard/specs/agent-one-run-latest.md");
    assert.equal(latestRun?.state, "active");
    assert.equal(latestRun?.outcome, null);
  } finally {
    await removeTempDir(repoDir);
  }
});

test("updateRun stores terminal outcome metadata", async () => {
  const repoDir = await createTempGitRepo("switchyard-run-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createRun(repoDir, {
      id: "run-1",
      sessionId: "session-1",
      agentName: "agent-one",
      taskSummary: "Investigate the merge path",
      state: "starting",
      createdAt: "2026-03-11T09:00:00.000Z",
      updatedAt: "2026-03-11T09:00:00.000Z"
    });

    const updatedRun = await updateRun(repoDir, {
      id: "run-1",
      state: "finished",
      outcome: "merged",
      updatedAt: "2026-03-11T09:15:00.000Z",
      finishedAt: "2026-03-11T09:15:00.000Z"
    });

    assert.equal(updatedRun.state, "finished");
    assert.equal(updatedRun.outcome, "merged");
    assert.equal(updatedRun.finishedAt, "2026-03-11T09:15:00.000Z");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("listLatestRunsBySession returns only the newest run per requested session", async () => {
  const repoDir = await createTempGitRepo("switchyard-run-store-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);

    await createRun(repoDir, {
      id: "run-1a",
      sessionId: "session-1",
      agentName: "agent-one",
      taskSummary: "Earlier one",
      state: "finished",
      outcome: "failed",
      createdAt: "2026-03-11T09:00:00.000Z",
      updatedAt: "2026-03-11T09:01:00.000Z",
      finishedAt: "2026-03-11T09:01:00.000Z"
    });
    await createRun(repoDir, {
      id: "run-1b",
      sessionId: "session-1",
      agentName: "agent-one",
      taskSummary: "Latest one",
      state: "active",
      createdAt: "2026-03-11T10:00:00.000Z",
      updatedAt: "2026-03-11T10:01:00.000Z"
    });
    await createRun(repoDir, {
      id: "run-2a",
      sessionId: "session-2",
      agentName: "agent-two",
      taskSummary: "Second session",
      state: "finished",
      outcome: "stopped",
      createdAt: "2026-03-11T11:00:00.000Z",
      updatedAt: "2026-03-11T11:05:00.000Z",
      finishedAt: "2026-03-11T11:05:00.000Z"
    });

    const latestRuns = await listLatestRunsBySession(repoDir, ["session-1", "session-2", "session-3"]);

    assert.equal(latestRuns.get("session-1")?.id, "run-1b");
    assert.equal(latestRuns.get("session-2")?.id, "run-2a");
    assert.equal(latestRuns.get("session-3"), undefined);
  } finally {
    await removeTempDir(repoDir);
  }
});
