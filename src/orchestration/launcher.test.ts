import test from "node:test";
import assert from "node:assert/strict";
import { buildDefaultConfig, writeConfig } from "../config.js";
import { listArtifactsForRun, listTasksForRun, getOrchestrationRunById } from "./store.js";
import { getLatestRunForSession } from "../runs/store.js";
import { getSessionById, listSessions } from "../sessions/store.js";
import { bootstrapSwitchyardLayout } from "../storage/bootstrap.js";
import { createTempGitRepo, removeTempDir } from "../test-helpers/git.js";
import { launchOrchestrationRun } from "./launcher.js";

test("launchOrchestrationRun bootstraps one planning run, one lead task, one lead session, and deterministic artifacts", async () => {
  const repoDir = await createTempGitRepo("switchyard-launcher-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);
    await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));

    const launched = await launchOrchestrationRun({
      startDir: repoDir,
      objective: "Replace the detached worker launch path with a lead-owned orchestration bootstrap.",
      runtimeArgs: ["--model", "gpt-5"],
      spawnRuntime: async ({ runtimeArgs, onSpawned }) => {
        const prompt = runtimeArgs.at(-1);

        assert.ok(typeof prompt === "string");
        assert.match(prompt, /You are the Switchyard lead/);
        assert.match(prompt, /manual-ready/);
        assert.match(prompt, /\.switchyard\/objectives\/run-/);
        assert.match(prompt, /\.switchyard\/agent-results\/run-.*-lead\.json/);

        const runtime = {
          pid: 4242,
          command: {
            command: "codex",
            args: runtimeArgs
          }
        };

        await onSpawned?.(runtime);

        return {
          ...runtime,
          readyAfterMs: 500
        };
      }
    });

    const run = launched.run;
    const task = launched.task;
    const session = await getSessionById(repoDir, launched.session.id);
    const tasks = await listTasksForRun(repoDir, run.id);
    const artifacts = await listArtifactsForRun(repoDir, run.id);
    const latestRun = await getLatestRunForSession(repoDir, launched.session.id);

    assert.equal(run.state, "dispatching");
    assert.equal(session?.role, "lead");
    assert.equal(session?.runId, run.id);
    assert.equal(session?.objectiveTaskId, task.id);
    assert.equal(task.role, "lead");
    assert.equal(task.state, "in_progress");
    assert.match(launched.resultEnvelopePath, /\.switchyard\/agent-results\/run-.*-lead\.json$/);
    assert.deepEqual(tasks.map((record) => record.id), [task.id]);
    assert.deepEqual(
      artifacts.map((artifact) => artifact.kind),
      ["objective_spec", "agent_handoff_spec", "session_log", "branch", "integration_worktree", "result_envelope"]
    );
    assert.equal(latestRun?.taskSummary, launched.objectiveSpec.objectiveSummary);
    assert.equal(latestRun?.taskSpecPath, launched.handoffSpec.relativePath);
    assert.equal(latestRun?.state, "active");
  } finally {
    await removeTempDir(repoDir);
  }
});

test("launchOrchestrationRun marks orchestration state failed when runtime spawn fails", async () => {
  const repoDir = await createTempGitRepo("switchyard-launcher-test-");

  try {
    await bootstrapSwitchyardLayout(repoDir);
    await writeConfig(buildDefaultConfig(repoDir, "switchyard-test", "main"));

    await assert.rejects(
      () =>
        launchOrchestrationRun({
          startDir: repoDir,
          objective: "Fail the lead launch after orchestration bootstrap.",
          spawnRuntime: async () => {
            throw new Error("boom");
          }
        }),
      /boom/
    );

    const sessions = await listSessions(repoDir);
    assert.equal(sessions.length, 1);
    assert.ok(sessions[0]?.runId);
    const run = await getOrchestrationRunById(repoDir, sessions[0]!.runId!);
    const tasks = await listTasksForRun(repoDir, sessions[0]!.runId!);

    assert.equal(sessions[0]?.state, "failed");
    assert.equal(run?.state, "failed");
    assert.equal(run?.outcome, "failed");
    assert.equal(tasks[0]?.state, "blocked");
  } finally {
    await removeTempDir(repoDir);
  }
});
